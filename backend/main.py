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
from fastapi.responses import StreamingResponse, RedirectResponse
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

from services.llm_service import local_llm_generate
from services.publisher import publish_to_platforms
from services import settings_service as cfg
from services.scheduler_service import start_scheduler, stop_scheduler
from crm.models import CRM_DB, VALID_STATUSES, SETTINGS_KEYS as BASE_SETTINGS_KEYS
# Extend allowed keys to include Facebook OAuth App credentials
SETTINGS_KEYS = list(BASE_SETTINGS_KEYS)
for _k in ["FB_APP_ID", "FB_APP_SECRET", "META_APP_ID", "META_APP_SECRET"]:
    if _k not in SETTINGS_KEYS:
        SETTINGS_KEYS.append(_k)

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
    short_caption: Optional[str] = ""
    hashtags: Optional[str] = ""
    location: Optional[str] = ""
    labels: Optional[List[str]] = []
    media_urls: Optional[List[str]] = []
    platforms: List[str]


class SchedulePostRequest(BaseModel):
    caption: str
    title: Optional[str] = ""
    short_caption: Optional[str] = ""
    hashtags: Optional[str] = ""
    location: Optional[str] = ""
    labels: Optional[List[str]] = []
    media_urls: Optional[List[str]] = []
    platforms: List[str]
    scheduled_at: str


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
        url = f"{custom_base}/uploads/{safe_name}"
        return {"url": url, "filename": safe_name, "type": media_type, "hosted_on": "self"}

    public_url, hosted_on = await _upload_to_free_public_host(dest_path, safe_name)
    if public_url:
        return {"url": public_url, "filename": safe_name, "type": media_type, "hosted_on": hosted_on}

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
    posts = db.get_scheduled_posts(workspace_id=cfg.current_workspace())

    def in_period(p):
        if not p.get("scheduled_at"):
            return False
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


# ---------- Settings ----------
@app.get("/api/settings/keys")
def get_settings_keys():
    ws = cfg.current_workspace()
    saved = db.get_all_settings(workspace_id=ws)
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


# ---------- Facebook Login / OAuth Callback - ADDED, NO OLD CODE DELETED ----------
@app.get("/api/auth/facebook")
def get_facebook_login_url():
    FB_APP_ID = cfg.get("FB_APP_ID") or os.getenv("FB_APP_ID") or os.getenv("META_APP_ID")
    REDIRECT_URI = "https://nextgen-analytics-social-media-tool.fastapicloud.dev/api/auth/callback"
    SCOPE = "pages_show_list,pages_read_engagement,pages_manage_posts,read_insights,instagram_basic,instagram_manage_insights"
    if not FB_APP_ID:
        raise HTTPException(status_code=400, detail="FB_APP_ID Settings me save karo pehle")
    login_url = f"https://www.facebook.com/v20.0/dialog/oauth?client_id={FB_APP_ID}&redirect_uri={REDIRECT_URI}&scope={SCOPE}&response_type=code"
    return {"login_url": login_url}


@app.get("/api/auth/callback")
async def facebook_auth_callback(code: str = Query(...), state: Optional[str] = Query(None)):
    FB_APP_ID = cfg.get("FB_APP_ID") or os.getenv("FB_APP_ID") or os.getenv("META_APP_ID")
    FB_APP_SECRET = cfg.get("FB_APP_SECRET") or os.getenv("FB_APP_SECRET") or os.getenv("META_APP_SECRET")
    REDIRECT_URI = "https://nextgen-analytics-social-media-tool.fastapicloud.dev/api/auth/callback"
    if not FB_APP_ID or not FB_APP_SECRET:
        raise HTTPException(status_code=400, detail="FB_APP_ID / FB_APP_SECRET Settings me save nahi hai")
    async with httpx.AsyncClient(timeout=30) as client:
        token_res = await client.get(
            "https://graph.facebook.com/v20.0/oauth/access_token",
            params={
                "client_id": FB_APP_ID,
                "client_secret": FB_APP_SECRET,
                "redirect_uri": REDIRECT_URI,
                "code": code,
            }
        )
    data = token_res.json()
    if "access_token" not in data:
        raise HTTPException(status_code=400, detail=f"Token exchange fail: {data}")
    long_token = data["access_token"]
    db.save_settings({"META_ACCESS_TOKEN": long_token}, workspace_id=cfg.current_workspace())
    frontend_url = os.getenv("FRONTEND_URL", "https://nextgenanalytics.cloud-ip.cc/nextgen-analytics-social-media-tool/settings")
    return RedirectResponse(url=frontend_url + "?connected=facebook")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
