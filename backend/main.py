import os
import uuid
import shutil
import httpx
import csv
import io
from datetime import datetime
from typing import List, Optional

from fastapi import FastAPI, HTTPException, UploadFile, File, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

from services.llm_service import local_llm_generate
from services.publisher import publish_to_platforms
from services import settings_service as cfg
from services.scheduler_service import start_scheduler, stop_scheduler
from crm.models import CRM_DB, VALID_STATUSES, SETTINGS_KEYS

app = FastAPI(title="NextGen Analytics - Social Media Tool")

ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


# Har browser apna khud ka random workspace ID banata hai (localStorage mein, koi
# login/password nahi) aur X-Workspace-Id header mein bhejta hai. Isse har user ki
# API keys, leads, aur scheduled posts sirf unke apne workspace se linked rehte hain —
# koi shared/global key nahi, aur app banane wale ki apni key kabhi kisi aur session
# mein use nahi hoti.
@app.middleware("http")
async def workspace_middleware(request, call_next):
    workspace_id = request.headers.get("X-Workspace-Id", "default").strip() or "default"
    cfg.set_workspace(workspace_id)
    request.state.workspace_id = workspace_id
    return await call_next(request)

db = CRM_DB()
cfg.bind_db(db)

ALLOWED_MEDIA_EXT = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp4", ".mov", ".m4v", ".webm"}


@app.on_event("startup")
def _on_startup():
    start_scheduler(db)


@app.on_event("shutdown")
def _on_shutdown():
    stop_scheduler()


# ---------- Schemas ----------
class GenerateRequest(BaseModel):
    prompt: str
    platforms: List[str]
    tone: Optional[str] = "professional"
    language: Optional[str] = "roman_urdu"


class PublishRequest(BaseModel):
    caption: str
    title: Optional[str] = ""
    short_caption: Optional[str] = ""  # agar khaali ho to caption hi use hoga
    hashtags: Optional[str] = ""
    location: Optional[str] = ""  # FB/IG location-tag + Blogger location.name
    labels: Optional[List[str]] = []  # Blogger ke labels/categories
    media_urls: Optional[List[str]] = []
    platforms: List[str]


class SchedulePostRequest(BaseModel):
    caption: str
    title: Optional[str] = ""
    short_caption: Optional[str] = ""  # agar khaali ho to caption hi use hoga
    hashtags: Optional[str] = ""
    location: Optional[str] = ""
    labels: Optional[List[str]] = []
    media_urls: Optional[List[str]] = []
    platforms: List[str]
    scheduled_at: str  # ISO datetime string, treated as UTC


class LeadCreate(BaseModel):
    name: str
    source_post: str
    platform: str
    status: str = "New"
    ai_score: Optional[int] = 50


class LeadUpdate(BaseModel):
    name: Optional[str] = None
    source_post: Optional[str] = None
    platform: Optional[str] = None
    status: Optional[str] = None
    ai_score: Optional[int] = None


class SettingsPayload(BaseModel):
    values: dict


# ---------- Basic ----------
@app.get("/")
def root():
    return {"status": "NextGen Analytics Social Media Tool Running", "mode": "Python+React"}


# ---------- Content generation ----------
@app.post("/api/generate")
async def generate_content(req: GenerateRequest):
    if not req.prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt khaali nahi ho sakta")
    if not req.platforms:
        raise HTTPException(status_code=400, detail="Kam az kam ek platform select karo")
    try:
        return await local_llm_generate(req.prompt, req.platforms, req.tone, req.language)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------- Media upload ----------
async def _try_catbox(client: httpx.AsyncClient, dest_path: str, filename: str) -> str | None:
    try:
        with open(dest_path, "rb") as f:
            files = {"fileToUpload": (filename, f)}
            data = {"reqtype": "fileupload"}
            r = await client.post("https://catbox.moe/user/api.php", data=data, files=files)
        if r.status_code == 200 and r.text.strip().startswith("http"):
            return r.text.strip()
    except httpx.HTTPError:
        pass
    return None


async def _try_0x0(client: httpx.AsyncClient, dest_path: str, filename: str) -> str | None:
    try:
        with open(dest_path, "rb") as f:
            files = {"file": (filename, f)}
            r = await client.post("https://0x0.st", files=files, headers={"User-Agent": "affaf-crm/1.0"})
        if r.status_code == 200 and r.text.strip().startswith("http"):
            return r.text.strip()
    except httpx.HTTPError:
        pass
    return None


async def _upload_to_free_public_host(dest_path: str, filename: str) -> tuple[str | None, str | None]:
    """
    Facebook/Instagram ko media ka public URL chahiye hota hai (wo apne server se khud
    file fetch karte hain, tumhari machine se nahi). Agar Settings mein koi apna
    "Public Base URL" (tunnel) nahi diya, to yahan khud file ko free public hosting
    (pehle catbox.moe, wo fail ho to 0x0.st) par upload kar dete hain, taake tumhe koi
    link manually manage na karni pade.
    Return: (url, hosted_on) — hosted_on batata hai kaunsi service kaam aayi.
    """
    async with httpx.AsyncClient(timeout=120) as client:
        url = await _try_catbox(client, dest_path, filename)
        if url:
            return url, "catbox.moe"
        url = await _try_0x0(client, dest_path, filename)
        if url:
            return url, "0x0.st"
    return None, None


@app.post("/api/upload")
async def upload_media(file: UploadFile = File(...)):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_MEDIA_EXT:
        raise HTTPException(status_code=400, detail=f"File type {ext} allowed nahi. Sirf images/videos.")

    safe_name = f"{uuid.uuid4().hex}{ext}"
    dest_path = os.path.join(UPLOAD_DIR, safe_name)
    with open(dest_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    media_type = "video" if ext in {".mp4", ".mov", ".m4v", ".webm"} else "image"

    custom_base = cfg.get("PUBLIC_BASE_URL", "").rstrip("/")
    if custom_base:
        # User ne apna tunnel/domain diya hai — usi se serve karo (zyada tez, apne control mein)
        url = f"{custom_base}/uploads/{safe_name}"
        return {"url": url, "filename": safe_name, "type": media_type, "hosted_on": "self"}

    # Koi Public Base URL nahi diya — auto free hosting try karo (2 services try hoti hain)
    public_url, hosted_on = await _upload_to_free_public_host(dest_path, safe_name)
    if public_url:
        return {"url": public_url, "filename": safe_name, "type": media_type, "hosted_on": hosted_on}

    # Dono free hosting fail ho gayi (internet/firewall issue) — local URL de dete hain lekin
    # ye FB/IG ke liye kaam nahi karega jab tak khud koi Public Base URL na set karo
    fallback_url = f"http://localhost:8000/uploads/{safe_name}"
    return {
        "url": fallback_url, "filename": safe_name, "type": media_type, "hosted_on": "local",
        "warning": "Free public hosting (catbox.moe + 0x0.st) dono fail hui — shayad internet/firewall block kar raha hai. Cloudflare tunnel chala kar Settings mein Public Base URL set karo.",
    }


# ---------- Publish now ----------
@app.post("/api/post/publish")
async def publish_post(req: PublishRequest):
    if not req.caption.strip():
        raise HTTPException(status_code=400, detail="Caption khaali nahi ho sakta")
    if not req.platforms:
        raise HTTPException(status_code=400, detail="Kam az kam ek platform select karo")
    results = await publish_to_platforms(
        req.caption, req.title, req.media_urls, req.platforms,
        req.short_caption, req.hashtags, req.location, req.labels,
    )
    return {"published": results}


# ---------- Scheduling / Calendar ----------
@app.post("/api/schedule")
def schedule_post(req: SchedulePostRequest):
    if not req.caption.strip():
        raise HTTPException(status_code=400, detail="Caption khaali nahi ho sakta")
    if not req.platforms:
        raise HTTPException(status_code=400, detail="Kam az kam ek platform select karo")
    try:
        when = datetime.fromisoformat(req.scheduled_at.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        raise HTTPException(status_code=400, detail="scheduled_at format ghalat hai, ISO datetime bhejo")
    return db.add_scheduled_post(
        req.caption, req.title, req.media_urls, req.platforms, when,
        req.short_caption, req.hashtags, req.location, req.labels,
        workspace_id=cfg.current_workspace(),
    )


@app.get("/api/schedule")
def list_scheduled():
    return db.get_scheduled_posts(workspace_id=cfg.current_workspace())


@app.get("/api/schedule/export")
def export_scheduled_csv(
    year: Optional[int] = Query(None),
    month: Optional[int] = Query(None, ge=1, le=12),
    day: Optional[int] = Query(None, ge=1, le=31),
):
    """
    CSV export — koi filter na do to sab records, ya year, year+month, ya
    year+month+day de kar sirf usi period ke records download karo.
    """
    posts = db.get_scheduled_posts(workspace_id=cfg.current_workspace())

    def in_period(p):
        if not p.get("scheduled_at"):
            return False
        # scheduled_at "...Z" suffix ke sath UTC mein store hota hai
        dt = datetime.fromisoformat(p["scheduled_at"].replace("Z", "+00:00"))
        if year is not None and dt.year != year:
            return False
        if month is not None and dt.month != month:
            return False
        if day is not None and dt.day != day:
            return False
        return True

    filtered = [p for p in posts if in_period(p)] if (year or month or day) else posts

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow([
        "id", "scheduled_at", "status", "caption", "short_caption", "hashtags",
        "location", "labels", "platforms", "title", "result_summary",
    ])
    for p in filtered:
        result_summary = "; ".join(
            f"{plat}:{(r or {}).get('status', 'unknown')}" for plat, r in (p.get("result") or {}).items()
        )
        writer.writerow([
            p.get("id"), p.get("scheduled_at"), p.get("status"), p.get("caption"),
            p.get("short_caption"), p.get("hashtags"), p.get("location"),
            "|".join(p.get("labels") or []), "|".join(p.get("platforms") or []),
            p.get("title"), result_summary,
        ])
    buffer.seek(0)

    name_parts = [str(x) for x in [year, month, day] if x is not None]
    filename = f"posts_report_{'-'.join(name_parts)}.csv" if name_parts else "posts_report_all.csv"

    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.delete("/api/schedule/{post_id}")
def cancel_scheduled(post_id: int):
    ok = db.delete_scheduled_post(post_id, workspace_id=cfg.current_workspace())
    if not ok:
        raise HTTPException(status_code=404, detail="Scheduled post nahi mila")
    return {"message": "Deleted"}


# ---------- CRM ----------
@app.get("/api/crm/leads")
def get_leads():
    return db.get_all_leads(workspace_id=cfg.current_workspace())


@app.get("/api/crm/stats")
def get_stats():
    return db.get_stats(workspace_id=cfg.current_workspace())


@app.post("/api/crm/leads")
def create_lead(lead: LeadCreate):
    if lead.status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"Status must be one of {VALID_STATUSES}")
    return db.add_lead(lead.dict(), workspace_id=cfg.current_workspace())


@app.patch("/api/crm/leads/{lead_id}")
def update_lead(lead_id: int, lead: LeadUpdate):
    if lead.status and lead.status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"Status must be one of {VALID_STATUSES}")
    updated = db.update_lead(lead_id, lead.dict(exclude_unset=True), workspace_id=cfg.current_workspace())
    if not updated:
        raise HTTPException(status_code=404, detail="Lead nahi mila")
    return updated


@app.delete("/api/crm/leads/{lead_id}")
def delete_lead(lead_id: int):
    ok = db.delete_lead(lead_id, workspace_id=cfg.current_workspace())
    if not ok:
        raise HTTPException(status_code=404, detail="Lead nahi mila")
    return {"message": "Lead deleted"}


# ---------- Settings (API keys, saved to DB PER WORKSPACE so each browser/user has its own) ----------
@app.get("/api/settings/keys")
def get_settings_keys():
    ws = cfg.current_workspace()
    saved = db.get_all_settings(workspace_id=ws)
    # .env/HF-secret fallback only applies to the owner's own "default" workspace —
    # see settings_service.get() for why. Keeps this "is a key set" check consistent
    # with what publishing will actually use.
    env_fallback_allowed = ws == "default"
    return {k: bool(saved.get(k) or (env_fallback_allowed and os.getenv(k))) for k in SETTINGS_KEYS}


@app.post("/api/settings/keys")
def save_settings_keys(payload: SettingsPayload):
    unknown = [k for k in payload.values if k not in SETTINGS_KEYS]
    if unknown:
        raise HTTPException(status_code=400, detail=f"Unknown settings keys: {unknown}")
    db.save_settings(payload.values, workspace_id=cfg.current_workspace())
    return {"message": "Settings saved", "keys_updated": list(payload.values.keys())}


@app.post("/api/settings/substack/refresh")
async def refresh_substack_cookie_endpoint():
    """Substack ka koi refresh-token system nahi hai, is liye khud email+password se
    dobara login karke naya session cookie le kar save kar dete hain."""
    from services.substack_service import refresh_substack_cookie
    new_cookie, err = await refresh_substack_cookie()
    if err:
        raise HTTPException(status_code=400, detail=err.get("detail", "Substack refresh fail hui"))
    return {"message": "Substack cookie refresh ho gayi"}


@app.get("/api/settings/check")
def check_apis():
    return {
        "meta_token": bool(cfg.get("META_ACCESS_TOKEN")),
        "fb_page": bool(cfg.get("FB_PAGE_ID")),
        "instagram": bool(cfg.get("IG_USER_ID")),
        "threads": bool(cfg.get("THREADS_USER_ID")),
        "linkedin_token": bool(cfg.get("LINKEDIN_ACCESS_TOKEN")),
        "linkedin_org": bool(cfg.get("LINKEDIN_ORG_ID")),
        "blogger": bool(cfg.get("BLOGGER_ACCESS_TOKEN")) and bool(cfg.get("BLOGGER_BLOG_ID")),
        "medium": bool(cfg.get("MEDIUM_ACCESS_TOKEN")),
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
