import os
import uuid
import shutil
import httpx
import csv
import io
from datetime import datetime
from typing import List, Optional

from fastapi import FastAPI, HTTPException, UploadFile, File, Query, Request
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

# Extend allowed keys to include Facebook OAuth App credentials + page tokens
SETTINGS_KEYS = list(BASE_SETTINGS_KEYS)
for _k in ["FB_APP_ID", "FB_APP_SECRET", "META_APP_ID", "META_APP_SECRET", "FB_PAGE_ACCESS_TOKEN", "FACEBOOK_APP_ID", "FACEBOOK_APP_SECRET"]:
    if _k not in SETTINGS_KEYS:
        SETTINGS_KEYS.append(_k)

app = FastAPI(title="NextGen Analytics - Social Media Tool")

# --- FIX 1: CORS + ALLOWED_ORIGINS proper parsing ---
_raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,https://affaf12.github.io,https://nextgenanalytics.cloud-ip.cc")
ALLOWED_ORIGINS = [o.strip().rstrip("/") for o in _raw_origins.split(",") if o.strip()]
# Always ensure our production domains are allowed
for must in ["https://nextgenanalytics.cloud-ip.cc", "https://affaf12.github.io"]:
    if must not in ALLOWED_ORIGINS:
        ALLOWED_ORIGINS.append(must)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- FIX 2: CSP fix for 'eval' blocking ---
@app.middleware("http")
async def csp_fix_middleware(request: Request, call_next):
    response = await call_next(request)
    # Allow eval for React build, remove restrictive CSP
    # Frontend ke CSP error ko backend se override karne ke liye permissive header
    response.headers["Content-Security-Policy"] = "default-src * 'self' data: blob: https: 'unsafe-inline' 'unsafe-eval'; script-src * 'self' 'unsafe-inline' 'unsafe-eval'; connect-src * 'self' https: wss:;"
    return response

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


@app.middleware("http")
async def workspace_middleware(request: Request, call_next):
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


# ---------- Helpers ----------
def get_public_base():
    # FIX: Use env PUBLIC_BASE_URL, not hardcoded fastapicloud.dev
    base = os.getenv("PUBLIC_BASE_URL") or cfg.get("PUBLIC_BASE_URL") or "https://nextgenanalytics.cloud-ip.cc"
    return base.rstrip("/")

def get_frontend_settings_url():
    # Frontend settings page
    return os.getenv("FRONTEND_URL", "https://nextgenanalytics.cloud-ip.cc/nextgen-analytics-social-media-tool/settings")

def get_fb_credentials():
    # Support both naming conventions
    app_id = cfg.get("FB_APP_ID") or cfg.get("META_APP_ID") or cfg.get("FACEBOOK_APP_ID") or os.getenv("FB_APP_ID") or os.getenv("META_APP_ID") or os.getenv("FACEBOOK_APP_ID") or os.getenv("FB_APP_ID") or "583036911532091"
    # try also FACEBOOK_APP_ID env you set in coolify
    if not app_id or app_id == "":
        app_id = os.getenv("FACEBOOK_APP_ID")
    app_secret = cfg.get("FB_APP_SECRET") or cfg.get("META_APP_SECRET") or cfg.get("FACEBOOK_APP_SECRET") or os.getenv("FB_APP_SECRET") or os.getenv("META_APP_SECRET") or os.getenv("FACEBOOK_APP_SECRET")
    return app_id, app_secret


# ---------- Basic ----------
@app.get("/")
def root():
    return {"status": "NextGen Analytics Social Media Tool Running", "mode": "Python+React", "allowed_origins": ALLOWED_ORIGINS, "public_base": get_public_base()}


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

    custom_base = cfg.get("PUBLIC_BASE_URL", "").rstrip("/") or get_public_base()
    if custom_base:
        url = f"{custom_base}/uploads/{safe_name}"
        return {"url": url, "filename": safe_name, "type": media_type, "hosted_on": "self"}

    return {"url": f"/uploads/{safe_name}", "filename": safe_name, "type": media_type, "hosted_on": "self"}


@app.post("/api/publish")
async def publish_post(req: PublishRequest):
    if not req.caption.strip():
        raise HTTPException(status_code=400, detail="Caption khaali nahi ho sakta")
    try:
        result = await publish_to_platforms(
            caption=req.caption,
            title=req.title,
            short_caption=req.short_caption,
            hashtags=req.hashtags,
            location=req.location,
            labels=req.labels,
            media_urls=req.media_urls,
            platforms=req.platforms,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------- Scheduler ----------
@app.get("/api/schedule")
def list_scheduled():
    return db.get_scheduled_posts(workspace_id=cfg.current_workspace())


@app.post("/api/schedule")
def schedule_post(req: SchedulePostRequest):
    try:
        dt = datetime.fromisoformat(req.scheduled_at.replace("Z", "+00:00"))
    except Exception:
        raise HTTPException(status_code=400, detail="scheduled_at ka format galat hai")
    post = db.add_scheduled_post(req.dict(), workspace_id=cfg.current_workspace())
    return post


@app.get("/api/reports/csv")
def export_csv(year: Optional[int] = None, month: Optional[int] = None, day: Optional[int] = None):
    posts = db.get_scheduled_posts(workspace_id=cfg.current_workspace())
    filtered = posts
    if year is not None:
        filtered = [p for p in filtered if datetime.fromisoformat(p.get("scheduled_at", "").replace("Z", "+00:00")).year == year]
    if month is not None:
        filtered = [p for p in filtered if datetime.fromisoformat(p.get("scheduled_at", "").replace("Z", "+00:00")).month == month]
    if day is not None:
        filtered = [p for p in filtered if datetime.fromisoformat(p.get("scheduled_at", "").replace("Z", "+00:00")).day == day]

    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=[
        "id", "scheduled_at", "status", "caption",
        "short_caption", "hashtags", "location", "labels", "platforms", "title", "result_summary",
    ])
    writer.writeheader()
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
    env_fallback_allowed = True  # FIX: allow env for all workspaces, not only default
    result = {}
    for k in SETTINGS_KEYS:
        result[k] = bool(saved.get(k) or (env_fallback_allowed and os.getenv(k)))
    # Also include FACEBOOK_APP_ID etc which UI checks
    for k in ["FACEBOOK_APP_ID", "FACEBOOK_APP_SECRET", "FB_APP_ID", "FB_APP_SECRET", "META_APP_ID", "META_APP_SECRET"]:
        if k not in result:
            result[k] = bool(saved.get(k) or os.getenv(k) or os.getenv("FACEBOOK_APP_ID") if "APP_ID" in k else os.getenv("FACEBOOK_APP_SECRET"))
    return result


@app.post("/api/settings/keys")
def save_settings_keys(payload: SettingsPayload):
    unknown = [k for k in payload.values if k not in SETTINGS_KEYS]
    if unknown:
        # Allow FB keys even if not in base list
        allowed_extra = ["FACEBOOK_APP_ID", "FACEBOOK_APP_SECRET"]
        unknown = [k for k in unknown if k not in allowed_extra]
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
    # FIX: Include FB App ID check for green dot
    fb_app_id, fb_app_secret = get_fb_credentials()
    return {
        "meta_token": bool(cfg.get("META_ACCESS_TOKEN") or os.getenv("META_ACCESS_TOKEN")),
        "fb_page": bool(cfg.get("FB_PAGE_ID") or os.getenv("FB_PAGE_ID")),
        "instagram": bool(cfg.get("IG_USER_ID") or os.getenv("IG_USER_ID")),
        "threads": bool(cfg.get("THREADS_USER_ID") or os.getenv("THREADS_USER_ID")),
        "linkedin_token": bool(cfg.get("LINKEDIN_ACCESS_TOKEN") or os.getenv("LINKEDIN_ACCESS_TOKEN")),
        "linkedin_org": bool(cfg.get("LINKEDIN_ORG_ID") or os.getenv("LINKEDIN_ORG_ID")),
        "blogger": bool((cfg.get("BLOGGER_ACCESS_TOKEN") or os.getenv("BLOGGER_ACCESS_TOKEN")) and (cfg.get("BLOGGER_BLOG_ID") or os.getenv("BLOGGER_BLOG_ID"))),
        "medium": bool(cfg.get("MEDIUM_ACCESS_TOKEN") or os.getenv("MEDIUM_ACCESS_TOKEN")),
        "facebook_app": bool(fb_app_id and fb_app_secret),  # For green dot
        "fb_app_id_set": bool(fb_app_id),
    }


# ---------- Facebook Login / OAuth Callback - FULLY FIXED ----------
@app.get("/api/auth/facebook")
def get_facebook_login_url():
    FB_APP_ID, FB_APP_SECRET = get_fb_credentials()
    PUBLIC_BASE = get_public_base()
    REDIRECT_URI = f"{PUBLIC_BASE}/api/auth/callback"
    # Full scope for Page + Instagram + Threads
    SCOPE = "pages_show_list,pages_read_engagement,pages_manage_posts,pages_manage_engagement,read_insights,instagram_basic,instagram_content_publish,instagram_manage_insights,instagram_manage_comments"
    if not FB_APP_ID:
        raise HTTPException(status_code=400, detail="FB_APP_ID Settings me save karo pehle. Env me FACEBOOK_APP_ID=583036911532091 set karo")
    login_url = f"https://www.facebook.com/v20.0/dialog/oauth?client_id={FB_APP_ID}&redirect_uri={REDIRECT_URI}&scope={SCOPE}&response_type=code&state=default"
    return {"login_url": login_url, "redirect_uri": REDIRECT_URI, "app_id": FB_APP_ID}


@app.get("/api/auth/callback")
async def facebook_auth_callback(code: str = Query(...), state: Optional[str] = Query(None)):
    FB_APP_ID, FB_APP_SECRET = get_fb_credentials()
    PUBLIC_BASE = get_public_base()
    REDIRECT_URI = f"{PUBLIC_BASE}/api/auth/callback"

    if not FB_APP_ID or not FB_APP_SECRET:
        raise HTTPException(status_code=400, detail="FB_APP_ID / FB_APP_SECRET Settings me save nahi hai. Env check karo")

    async with httpx.AsyncClient(timeout=30) as client:
        # Step 1: Exchange code for short-lived token
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

        short_token = data["access_token"]

        # Step 2: Exchange for long-lived token (60 days)
        long_res = await client.get(
            "https://graph.facebook.com/v20.0/oauth/access_token",
            params={
                "grant_type": "fb_exchange_token",
                "client_id": FB_APP_ID,
                "client_secret": FB_APP_SECRET,
                "fb_exchange_token": short_token,
            }
        )
        long_data = long_res.json()
        long_token = long_data.get("access_token", short_token)

        # Step 3: Get user's pages
        pages_res = await client.get(
            "https://graph.facebook.com/v20.0/me/accounts",
            params={"access_token": long_token}
        )
        pages_data = pages_res.json()

        save_dict = {"META_ACCESS_TOKEN": long_token}

        if "data" in pages_data and len(pages_data["data"]) > 0:
            first_page = pages_data["data"][0]
            save_dict["FB_PAGE_ID"] = first_page.get("id")
            save_dict["FB_PAGE_ACCESS_TOKEN"] = first_page.get("access_token")

            # Step 4: Get Instagram Business Account linked to page
            try:
                ig_res = await client.get(
                    f"https://graph.facebook.com/v20.0/{first_page.get('id')}",
                    params={
                        "fields": "instagram_business_account",
                        "access_token": first_page.get("access_token") or long_token
                    }
                )
                ig_data = ig_res.json()
                if "instagram_business_account" in ig_data:
                    save_dict["IG_USER_ID"] = ig_data["instagram_business_account"].get("id")
            except Exception:
                pass

        # Save to current workspace (per-user)
        target_ws = state.strip() if state and state.strip() else cfg.current_workspace()
        # Security: if state is default, use current workspace
        if target_ws == "default":
            target_ws = cfg.current_workspace()
        
        db.save_settings(save_dict, workspace_id=target_ws)

    frontend_url = get_frontend_settings_url()
    # Add success flag
    return RedirectResponse(url=frontend_url + "?connected=facebook&success=1")


# Extra: Get connected pages list for UI
@app.get("/api/auth/pages")
async def get_my_pages():
    long_token = cfg.get("META_ACCESS_TOKEN") or os.getenv("META_ACCESS_TOKEN")
    if not long_token:
        raise HTTPException(status_code=400, detail="Pehle Facebook Connect karo")
    async with httpx.AsyncClient(timeout=20) as client:
        res = await client.get("https://graph.facebook.com/v20.0/me/accounts", params={"access_token": long_token})
        return res.json()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
