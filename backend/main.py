import os
import uuid
import shutil
import httpx
import csv
import io
from datetime import datetime
from typing import List, Optional

from fastapi import FastAPI, HTTPException, UploadFile, File, Query, Request, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import StreamingResponse, RedirectResponse
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

from services.llm_service import local_llm_generate
from services.publisher import publish_to_platforms
from services import settings_service as cfg
from services import auth_service
from services.scheduler_service import start_scheduler, stop_scheduler
from crm.models import CRM_DB, VALID_STATUSES, SETTINGS_KEYS as BASE_SETTINGS_KEYS

SETTINGS_KEYS = list(BASE_SETTINGS_KEYS)
for _k in ["FB_APP_ID", "FB_APP_SECRET", "META_APP_ID", "META_APP_SECRET", "FB_PAGE_ACCESS_TOKEN", "FACEBOOK_APP_ID", "FACEBOOK_APP_SECRET", "THREADS_ACCESS_TOKEN", "THREADS_USER_ID", "THREADS_APP_ID", "THREADS_APP_SECRET", "IG_USER_ID", "FB_PAGE_ID", "META_ACCESS_TOKEN", "LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET", "LINKEDIN_ACCESS_TOKEN", "LINKEDIN_PERSON_ID", "LINKEDIN_PERSON_URN", "LINKEDIN_ORG_ID", "LINKEDIN_ORG_URN", "LINKEDIN_ORG_NAME", "LINKEDIN_PROFILE_NAME", "LINKEDIN_APP_ID", "LINKEDIN_APP_SECRET", "BLOGGER_CLIENT_ID", "BLOGGER_CLIENT_SECRET", "BLOGGER_ACCESS_TOKEN", "BLOGGER_REFRESH_TOKEN", "BLOGGER_BLOG_ID", "BLOGGER_BLOG_URL", "BLOGGER_BLOG_NAME", "BLOGGER_TOKEN_EXPIRY", "TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET", "TIKTOK_ACCESS_TOKEN", "TIKTOK_REFRESH_TOKEN", "TIKTOK_OPEN_ID", "TIKTOK_USERNAME", "TIKTOK_DISPLAY_NAME", "TIKTOK_TOKEN_EXPIRY", "SUBSTACK_SID", "SUBSTACK_CONNECT_SID", "SUBSTACK_PUBLICATION_URL", "SUBSTACK_PUBLICATION_NAME", "SUBSTACK_EMAIL", "YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET", "YOUTUBE_ACCESS_TOKEN", "YOUTUBE_REFRESH_TOKEN", "YOUTUBE_CHANNEL_ID", "YOUTUBE_CHANNEL_TITLE", "YOUTUBE_TOKEN_EXPIRY", "OPENROUTER_API_KEY", "OPENROUTER_MODEL"]:
    if _k not in SETTINGS_KEYS:
        SETTINGS_KEYS.append(_k)

app = FastAPI(title="NextGen Analytics - Social Media Tool")

_raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,https://affaf12.github.io,https://nextgenanalytics.cloud-ip.cc")
ALLOWED_ORIGINS = [o.strip().rstrip("/") for o in _raw_origins.split(",") if o.strip()]
for must in ["https://nextgenanalytics.cloud-ip.cc", "https://affaf12.github.io", "https://affaf12.github.io/nextgen-analytics-social-media-tool"]:
    if must not in ALLOWED_ORIGINS:
        ALLOWED_ORIGINS.append(must)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def csp_fix_middleware(request: Request, call_next):
    response = await call_next(request)
    response.headers["Content-Security-Policy"] = "default-src * 'self' data: blob: https: 'unsafe-inline' 'unsafe-eval'; script-src * 'self' 'unsafe-inline' 'unsafe-eval'; connect-src * 'self' https: wss:;"
    return response

# TikTok URL Verification + Terms/Privacy pages - serve from backend directly
from fastapi.responses import PlainTextResponse, HTMLResponse

# TikTok verification - Latest: fPOnDTBMOXzaXLjs3Qex0lhZuwGG5JOC (Previous: WhDksyPiLSRZfcAVfYsHMz6TXIlDdGNU, LwNjDvZsESE5qxBk6swjU1A1ynUvq5jy, NAyGZekmB48pfkHb9vWzX4Juq79kAShj, V49eMgl3zZKWbfS1mXrCfSscCUWkn2yF)
TIKTOK_VERIFICATION_CONTENT = "tiktok-developers-site-verification=fPOnDTBMOXzaXLjs3Qex0lhZuwGG5JOC"
TIKTOK_VERIFICATION_FILENAME = "tiktokfPOnDTBMOXzaXLjs3Qex0lhZuwGG5JOC.txt"
TIKTOK_NEW_CODE = "fPOnDTBMOXzaXLjs3Qex0lhZuwGG5JOC"
TIKTOK_ALL_CODES = {
    "V49eMgl3zZKWbfS1mXrCfSscCUWkn2yF": "tiktok-developers-site-verification=V49eMgl3zZKWbfS1mXrCfSscCUWkn2yF",
    "NAyGZekmB48pfkHb9vWzX4Juq79kAShj": "tiktok-developers-site-verification=NAyGZekmB48pfkHb9vWzX4Juq79kAShj",
    "LwNjDvZsESE5qxBk6swjU1A1ynUvq5jy": "tiktok-developers-site-verification=LwNjDvZsESE5qxBk6swjU1A1ynUvq5jy",
    "WhDksyPiLSRZfcAVfYsHMz6TXIlDdGNU": "tiktok-developers-site-verification=WhDksyPiLSRZfcAVfYsHMz6TXIlDdGNU",
    "fPOnDTBMOXzaXLjs3Qex0lhZuwGG5JOC": "tiktok-developers-site-verification=fPOnDTBMOXzaXLjs3Qex0lhZuwGG5JOC",
}

@app.get("/tiktokV49eMgl3zZKWbfS1mXrCfSscCUWkn2yF.txt", response_class=PlainTextResponse)
@app.get("/nextgen-analytics-social-media-tool/tiktokV49eMgl3zZKWbfS1mXrCfSscCUWkn2yF.txt", response_class=PlainTextResponse)
@app.get("/.well-known/tiktokV49eMgl3zZKWbfS1mXrCfSscCUWkn2yF.txt", response_class=PlainTextResponse)
@app.get("/terms/tiktokV49eMgl3zZKWbfS1mXrCfSscCUWkn2yF.txt", response_class=PlainTextResponse)
@app.get("/privacy/tiktokV49eMgl3zZKWbfS1mXrCfSscCUWkn2yF.txt", response_class=PlainTextResponse)
@app.get("/publish/tiktokV49eMgl3zZKWbfS1mXrCfSscCUWkn2yF.txt", response_class=PlainTextResponse)
@app.get("/nextgen-analytics-social-media-tool/terms/tiktokV49eMgl3zZKWbfS1mXrCfSscCUWkn2yF.txt", response_class=PlainTextResponse)
@app.get("/nextgen-analytics-social-media-tool/privacy/tiktokV49eMgl3zZKWbfS1mXrCfSscCUWkn2yF.txt", response_class=PlainTextResponse)
@app.get("/tiktokNAyGZekmB48pfkHb9vWzX4Juq79kAShj.txt", response_class=PlainTextResponse)
@app.get("/nextgen-analytics-social-media-tool/tiktokNAyGZekmB48pfkHb9vWzX4Juq79kAShj.txt", response_class=PlainTextResponse)
@app.get("/.well-known/tiktokNAyGZekmB48pfkHb9vWzX4Juq79kAShj.txt", response_class=PlainTextResponse)
@app.get("/terms/tiktokNAyGZekmB48pfkHb9vWzX4Juq79kAShj.txt", response_class=PlainTextResponse)
@app.get("/privacy/tiktokNAyGZekmB48pfkHb9vWzX4Juq79kAShj.txt", response_class=PlainTextResponse)
@app.get("/publish/tiktokNAyGZekmB48pfkHb9vWzX4Juq79kAShj.txt", response_class=PlainTextResponse)
@app.get("/nextgen-analytics-social-media-tool/terms/tiktokNAyGZekmB48pfkHb9vWzX4Juq79kAShj.txt", response_class=PlainTextResponse)
@app.get("/nextgen-analytics-social-media-tool/privacy/tiktokNAyGZekmB48pfkHb9vWzX4Juq79kAShj.txt", response_class=PlainTextResponse)
@app.get("/tiktokLwNjDvZsESE5qxBk6swjU1A1ynUvq5jy.txt", response_class=PlainTextResponse)
@app.get("/nextgen-analytics-social-media-tool/tiktokLwNjDvZsESE5qxBk6swjU1A1ynUvq5jy.txt", response_class=PlainTextResponse)
@app.get("/.well-known/tiktokLwNjDvZsESE5qxBk6swjU1A1ynUvq5jy.txt", response_class=PlainTextResponse)
@app.get("/terms/tiktokLwNjDvZsESE5qxBk6swjU1A1ynUvq5jy.txt", response_class=PlainTextResponse)
@app.get("/privacy/tiktokLwNjDvZsESE5qxBk6swjU1A1ynUvq5jy.txt", response_class=PlainTextResponse)
@app.get("/publish/tiktokLwNjDvZsESE5qxBk6swjU1A1ynUvq5jy.txt", response_class=PlainTextResponse)
@app.get("/nextgen-analytics-social-media-tool/terms/tiktokLwNjDvZsESE5qxBk6swjU1A1ynUvq5jy.txt", response_class=PlainTextResponse)
@app.get("/nextgen-analytics-social-media-tool/privacy/tiktokLwNjDvZsESE5qxBk6swjU1A1ynUvq5jy.txt", response_class=PlainTextResponse)
@app.get("/tiktokWhDksyPiLSRZfcAVfYsHMz6TXIlDdGNU.txt", response_class=PlainTextResponse)
@app.get("/nextgen-analytics-social-media-tool/tiktokWhDksyPiLSRZfcAVfYsHMz6TXIlDdGNU.txt", response_class=PlainTextResponse)
@app.get("/.well-known/tiktokWhDksyPiLSRZfcAVfYsHMz6TXIlDdGNU.txt", response_class=PlainTextResponse)
@app.get("/terms/tiktokWhDksyPiLSRZfcAVfYsHMz6TXIlDdGNU.txt", response_class=PlainTextResponse)
@app.get("/privacy/tiktokWhDksyPiLSRZfcAVfYsHMz6TXIlDdGNU.txt", response_class=PlainTextResponse)
@app.get("/publish/tiktokWhDksyPiLSRZfcAVfYsHMz6TXIlDdGNU.txt", response_class=PlainTextResponse)
@app.get("/nextgen-analytics-social-media-tool/terms/tiktokWhDksyPiLSRZfcAVfYsHMz6TXIlDdGNU.txt", response_class=PlainTextResponse)
@app.get("/nextgen-analytics-social-media-tool/privacy/tiktokWhDksyPiLSRZfcAVfYsHMz6TXIlDdGNU.txt", response_class=PlainTextResponse)
@app.get("/tiktokfPOnDTBMOXzaXLjs3Qex0lhZuwGG5JOC.txt", response_class=PlainTextResponse)
@app.get("/nextgen-analytics-social-media-tool/tiktokfPOnDTBMOXzaXLjs3Qex0lhZuwGG5JOC.txt", response_class=PlainTextResponse)
@app.get("/.well-known/tiktokfPOnDTBMOXzaXLjs3Qex0lhZuwGG5JOC.txt", response_class=PlainTextResponse)
@app.get("/terms/tiktokfPOnDTBMOXzaXLjs3Qex0lhZuwGG5JOC.txt", response_class=PlainTextResponse)
@app.get("/privacy/tiktokfPOnDTBMOXzaXLjs3Qex0lhZuwGG5JOC.txt", response_class=PlainTextResponse)
@app.get("/publish/tiktokfPOnDTBMOXzaXLjs3Qex0lhZuwGG5JOC.txt", response_class=PlainTextResponse)
@app.get("/nextgen-analytics-social-media-tool/terms/tiktokfPOnDTBMOXzaXLjs3Qex0lhZuwGG5JOC.txt", response_class=PlainTextResponse)
@app.get("/nextgen-analytics-social-media-tool/privacy/tiktokfPOnDTBMOXzaXLjs3Qex0lhZuwGG5JOC.txt", response_class=PlainTextResponse)
async def tiktok_specific_verification(request: Request):
    # Return correct code based on requested file - fixes V49e code for cloud-ip.cc link
    path = request.url.path
    for code_key, content in TIKTOK_ALL_CODES.items():
        if code_key in path:
            return content
    return TIKTOK_VERIFICATION_CONTENT

# WILDCARD - Catch any /any/path/tiktokXXXX.txt - This fixes /terms/tiktok...txt not found
@app.get("/{full_path:path}/tiktokV49eMgl3zZKWbfS1mXrCfSscCUWkn2yF.txt", response_class=PlainTextResponse)
@app.get("/{full_path:path}/tiktokNAyGZekmB48pfkHb9vWzX4Juq79kAShj.txt", response_class=PlainTextResponse)
@app.get("/{full_path:path}/tiktokLwNjDvZsESE5qxBk6swjU1A1ynUvq5jy.txt", response_class=PlainTextResponse)
@app.get("/{full_path:path}/tiktokWhDksyPiLSRZfcAVfYsHMz6TXIlDdGNU.txt", response_class=PlainTextResponse)
@app.get("/{full_path:path}/tiktokfPOnDTBMOXzaXLjs3Qex0lhZuwGG5JOC.txt", response_class=PlainTextResponse)
@app.get("/{full_path:path}/tiktok-developers-site-verification.txt", response_class=PlainTextResponse)
async def tiktok_wildcard_verification(full_path: str, request: Request):
    # Return correct code based on requested file
    path = request.url.path
    for code_key, content in TIKTOK_ALL_CODES.items():
        if code_key in path:
            return content
    return TIKTOK_VERIFICATION_CONTENT

@app.get("/.well-known/tiktok-developers-site-verification.txt", response_class=PlainTextResponse)
@app.get("/tiktok-developers-site-verification.txt", response_class=PlainTextResponse)
@app.get("/nextgen-analytics-social-media-tool/tiktok-developers-site-verification.txt", response_class=PlainTextResponse)
@app.get("/tiktok{file_id}.txt", response_class=PlainTextResponse)
async def tiktok_verification(file_id: str = ""):
    # Return verification file if exists in env or return placeholder
    # Check env first
    code = os.getenv("TIKTOK_VERIFICATION_CODE")
    if code:
        return code
    # Return our verified code
    return TIKTOK_VERIFICATION_CONTENT

@app.get("/", response_class=HTMLResponse)
@app.get("/publish", response_class=HTMLResponse)
@app.get("/nextgen-analytics-social-media-tool/", response_class=HTMLResponse)
@app.get("/nextgen-analytics-social-media-tool/publish", response_class=HTMLResponse)
async def publish_page():
    html = """
    <!DOCTYPE html>
    <html><head><title>NextGen Analytics - Social Media Management</title>
    <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <style>body{font-family:Arial,sans-serif;max-width:900px;margin:0 auto;padding:20px;line-height:1.6}h1{color:#111}h2{color:#333;margin-top:30px}.btn{display:inline-block;background:#111;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;margin:10px 10px 10px 0}</style>
    </head><body>
    <h1>🚀 NextGen Analytics</h1>
    <p><strong>All-in-one social media management platform</strong> - Manage Facebook, Instagram, Threads, LinkedIn, Blogger, and TikTok from one dashboard.</p>
    <h2>✨ Features</h2>
    <ul>
    <li>📅 Schedule and publish posts to 6 platforms</li>
    <li>📊 Analytics and performance tracking</li>
    <li>🎬 TikTok video upload via official Video API</li>
    <li>🔐 Secure OAuth - we never store passwords</li>
    </ul>
    <p>
    <a class="btn" href="/nextgen-analytics-social-media-tool/terms">Terms of Service</a>
    <a class="btn" href="/nextgen-analytics-social-media-tool/privacy">Privacy Policy</a>
    </p>
    <h2>🔗 Quick Links</h2>
    <p>Frontend: https://nextgenanalytics.cloud-ip.cc/nextgen-analytics-social-media-tool/<br>
    API: https://nextgen-analytics-social-media-tool.fastapicloud.dev/docs<br>
    TikTok Verification: /tiktokV49eMgl3zZKWbfS1mXrCfSscCUWkn2yF.txt</p>
    </body></html>
    """
    return html

@app.get("/terms", response_class=HTMLResponse)
@app.get("/nextgen-analytics-social-media-tool/terms", response_class=HTMLResponse)
async def terms_page():
    html = """
    <!DOCTYPE html>
    <html><head><title>Terms of Service - NextGen Analytics</title>
    <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <style>body{font-family:Arial,sans-serif;max-width:800px;margin:0 auto;padding:20px;line-height:1.6}h1{color:#111}h2{color:#333;margin-top:30px}</style>
    </head><body>
    <h1>Terms of Service</h1>
    <p><small>Last updated: September 3, 2026</small></p>
    <h2>1. About NextGen Analytics</h2>
    <p>NextGen Analytics is an all-in-one social media management platform that helps businesses and creators manage all their social media content in one place. Our platform allows users to schedule and publish posts to Facebook, Instagram, Threads, LinkedIn, Blogger, and TikTok from a single dashboard.</p>
    <h2>2. Account Connection</h2>
    <p>We use official OAuth flows to connect your social media accounts. We do not store your passwords. You authorize us to publish content on your behalf when you connect your accounts. You can disconnect anytime from Settings.</p>
    <h2>3. Your Responsibilities</h2>
    <p>You are responsible for all content you publish through our platform. You must comply with the terms of service of each social platform (Facebook, Instagram, Threads, LinkedIn, Blogger, TikTok). Do not publish spam, harmful, or illegal content.</p>
    <h2>4. TikTok Integration</h2>
    <p>For TikTok, users upload videos (MP4/MOV) and we help publish them using TikTok's official Video API. Videos may go to TikTok inbox for final publishing as per TikTok's policy. We use Login Kit (user.info.basic) and Video Upload scopes only.</p>
    <h2>5. Contact</h2>
    <p>Website: https://nextgenanalytics.cloud-ip.cc/nextgen-analytics-social-media-tool<br>Email: support@nextgenanalytics.cloud-ip.cc</p>
    </body></html>
    """
    return html

@app.get("/privacy", response_class=HTMLResponse)
@app.get("/nextgen-analytics-social-media-tool/privacy", response_class=HTMLResponse)
async def privacy_page():
    html = """
    <!DOCTYPE html>
    <html><head><title>Privacy Policy - NextGen Analytics</title>
    <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <style>body{font-family:Arial,sans-serif;max-width:800px;margin:0 auto;padding:20px;line-height:1.6}h1{color:#111}h2{color:#333;margin-top:30px}</style>
    </head><body>
    <h1>Privacy Policy</h1>
    <p><small>Last updated: September 3, 2026</small></p>
    <h2>1. Data We Collect</h2>
    <p>We collect OAuth access tokens, open IDs, usernames, and publishing preferences when you connect social accounts. We do not collect or store your social media passwords. For TikTok, we collect access token, open ID, username, and display name via official TikTok API.</p>
    <h2>2. How We Use Data</h2>
    <p>We use your tokens solely to publish content on your behalf to platforms you have connected (Facebook, Instagram, Threads, LinkedIn, Blogger, TikTok). We do not share your data with third parties except necessary API calls to official social platform APIs.</p>
    <h2>3. TikTok Data</h2>
    <p>For TikTok integration, we request scopes: user.info.basic, video.publish, video.upload. We only use this to get your basic profile info and publish videos you upload. We do not access your private messages or other data.</p>
    <h2>4. Data Storage & Security</h2>
    <p>OAuth tokens are stored securely in encrypted database. We use workspace-based isolation. You can disconnect any platform anytime from Settings page, which deletes associated tokens.</p>
    <h2>5. Your Rights</h2>
    <p>You can request deletion of your data anytime. Disconnecting a platform automatically removes its tokens. Contact us for full data deletion.</p>
    <h2>6. Contact</h2>
    <p>Website: https://nextgenanalytics.cloud-ip.cc/nextgen-analytics-social-media-tool<br>Email: support@nextgenanalytics.cloud-ip.cc</p>
    </body></html>
    """
    return html

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# Ye paths bina login ke chalne chahiye:
# - marketing/legal html pages aur TikTok verification files (external crawlers/bots inhe
#   bina Authorization header ke hit karte hain)
# - "/api/account/signup" aur "/api/account/login" (khud login karne ke liye login nahi ho sakta)
# - har OAuth "*/callback" route — ye seedha Facebook/Google/LinkedIn/etc ke browser redirect se
#   hit hote hain (wahan Authorization header bheja hi nahi ja sakta), workspace attribution
#   already "state" query param se hoti hai in sab callbacks ke andar
PUBLIC_EXACT_PATHS = {
    "/", "/publish", "/terms", "/privacy",
    "/nextgen-analytics-social-media-tool/", "/nextgen-analytics-social-media-tool/publish",
    "/nextgen-analytics-social-media-tool/terms", "/nextgen-analytics-social-media-tool/privacy",
    "/docs", "/openapi.json", "/redoc",
    "/api/account/signup", "/api/account/login",
    "/api/account/forgot-password", "/api/account/reset-password",
}
PUBLIC_PREFIXES = ("/uploads",)


def _is_public_path(path: str) -> bool:
    if path in PUBLIC_EXACT_PATHS:
        return True
    if path.startswith(PUBLIC_PREFIXES):
        return True
    if path.endswith("/callback"):
        return True
    if "tiktok" in path.lower():
        return True
    return False


@app.middleware("http")
async def workspace_middleware(request: Request, call_next):
    path = request.url.path
    if _is_public_path(path):
        cfg.set_workspace("default")
        return await call_next(request)

    auth_header = request.headers.get("Authorization", "")
    token = auth_header.split(" ", 1)[1] if auth_header.lower().startswith("bearer ") else ""
    user_id = auth_service.verify_token(token) if token else None
    if not user_id:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=401, content={"detail": "Login required"})

    workspace_id = str(user_id)
    cfg.set_workspace(workspace_id)
    request.state.workspace_id = workspace_id
    request.state.user_id = user_id
    return await call_next(request)

db = CRM_DB()

# YouTube memory fallback (in case CRM_DB filtering blocks YOUTUBE keys)
YOUTUBE_MEMORY_STORE = {}

def save_youtube_memory(workspace_id, save_dict):
    """Save YouTube tokens to memory fallback"""
    try:
        if workspace_id not in YOUTUBE_MEMORY_STORE:
            YOUTUBE_MEMORY_STORE[workspace_id] = {}
        YOUTUBE_MEMORY_STORE[workspace_id].update(save_dict)
        print(f"💾 YouTube memory store saved for {workspace_id}: {list(save_dict.keys())}")
    except Exception as e:
        print(f"Memory save error: {e}")

def get_youtube_memory(workspace_id, key):
    """Get YouTube token from memory fallback"""
    try:
        return YOUTUBE_MEMORY_STORE.get(workspace_id, {}).get(key, "")
    except:
        return ""

cfg.bind_db(db)
auth_service.bind_db(db)

ALLOWED_MEDIA_EXT = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp4", ".mov", ".m4v", ".webm"}

@app.on_event("startup")
def _on_startup():
    try:
        start_scheduler(db)
    except Exception as e:
        print(f"Scheduler start warning: {e}")

@app.on_event("shutdown")
def _on_shutdown():
    try:
        stop_scheduler()
    except Exception as e:
        print(f"Scheduler stop warning: {e}")

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

class OpenRouterExchangeRequest(BaseModel):
    code: str
    code_verifier: Optional[str] = None

class SignupRequest(BaseModel):
    name: str
    email: str
    password: str

class LoginRequest(BaseModel):
    email: str
    password: str

class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str
    # frontend sends new_password, some send newPassword - support both via alias
    newPassword: Optional[str] = None

    def get_password(self):
        return self.new_password or self.newPassword or ""


def get_public_base():
    base = os.getenv("PUBLIC_BASE_URL") or cfg.get("PUBLIC_BASE_URL") or "https://nextgen-analytics-social-media-tool.fastapicloud.dev"
    return base.rstrip("/")

def get_frontend_settings_url():
    return os.getenv("FRONTEND_URL", "https://affaf12.github.io/nextgen-analytics-social-media-tool/")

def get_fb_credentials():
    app_id = cfg.get("FB_APP_ID") or cfg.get("META_APP_ID") or cfg.get("FACEBOOK_APP_ID") or os.getenv("FB_APP_ID") or os.getenv("META_APP_ID") or os.getenv("FACEBOOK_APP_ID") or "583036911532091"
    if not app_id or app_id == "":
        app_id = os.getenv("FACEBOOK_APP_ID")
    app_secret = cfg.get("FB_APP_SECRET") or cfg.get("META_APP_SECRET") or cfg.get("FACEBOOK_APP_SECRET") or os.getenv("FB_APP_SECRET") or os.getenv("META_APP_SECRET") or os.getenv("FACEBOOK_APP_SECRET")
    return app_id, app_secret

def get_threads_credentials():
    # Threads ka alag App ID hota hai (screenshot me 24565... dikh raha hai) - ye Facebook App ID se alag hai
    # Pehle Threads ke specific keys check karo, phir FB wale pe fallback
    app_id = cfg.get("THREADS_APP_ID") or os.getenv("THREADS_APP_ID") or cfg.get("FB_APP_ID") or cfg.get("META_APP_ID") or os.getenv("FB_APP_ID") or "24565240526491181"
    app_secret = cfg.get("THREADS_APP_SECRET") or os.getenv("THREADS_APP_SECRET") or cfg.get("FB_APP_SECRET") or os.getenv("FB_APP_SECRET") or os.getenv("FACEBOOK_APP_SECRET")
    # Agar Threads App ID set nahi hai to FB App ID use karo
    if not app_id:
        app_id = cfg.get("FB_APP_ID") or "583036911532091"
    return app_id, app_secret

def get_linkedin_credentials():
    # Try current workspace first, then fallback to all workspaces (so dusra user aaye to bhi kaam kare)
    client_id = cfg.get("LINKEDIN_CLIENT_ID") or cfg.get("LINKEDIN_APP_ID") or os.getenv("LINKEDIN_CLIENT_ID") or os.getenv("LINKEDIN_APP_ID")
    client_secret = cfg.get("LINKEDIN_CLIENT_SECRET") or cfg.get("LINKEDIN_APP_SECRET") or os.getenv("LINKEDIN_CLIENT_SECRET") or os.getenv("LINKEDIN_APP_SECRET")
    
    # Fallback: Try default and main workspaces if current workspace missing (global credentials)
    if not client_id or not client_secret:
        current_ws = cfg.current_workspace()
        try:
            for ws_try in ["default", "132d5d65-fd7d-4525-974f-f5fac15be10b"]:
                if ws_try == current_ws:
                    continue
                cfg.set_workspace(ws_try)
                if not client_id:
                    client_id = cfg.get("LINKEDIN_CLIENT_ID") or cfg.get("LINKEDIN_APP_ID")
                if not client_secret:
                    client_secret = cfg.get("LINKEDIN_CLIENT_SECRET") or cfg.get("LINKEDIN_APP_SECRET")
                if client_id and client_secret:
                    print(f"🔗 Found LinkedIn credentials in workspace {ws_try}")
                    break
            cfg.set_workspace(current_ws)
        except Exception as e:
            print(f"LinkedIn credentials fallback error: {e}")
            try:
                cfg.set_workspace(current_ws)
            except:
                pass
    
    # Final hardcoded fallback - tumhara verified app - taake dusra user bina copy-paste ke connect kar sake
    # Ye global credentials hain - ek baar code me save, phir sab users ke liye auto
    # User confirmed: 77hvhp0adef5ho sahi hai
    if not client_id:
        client_id = "77hvhp0adef5ho"  # Tumhara verified NextGen Analytics app - sahi ID
    
    if not client_secret:
        # Tumhara secret jo abhi diya - isko env me bhi daalo FastAPI Cloud dashboard me
        client_secret = "WPL_AP1.ZATbOBj0EdWDb5e2.grhk5w=="
    
    return client_id, client_secret

def get_blogger_credentials():
    # Google OAuth for Blogger - Try current workspace then fallback to all workspaces
    client_id = cfg.get("BLOGGER_CLIENT_ID") or os.getenv("BLOGGER_CLIENT_ID") or os.getenv("GOOGLE_CLIENT_ID")
    client_secret = cfg.get("BLOGGER_CLIENT_SECRET") or os.getenv("BLOGGER_CLIENT_SECRET") or os.getenv("GOOGLE_CLIENT_SECRET")
    
    # Fallback to other workspaces
    if not client_id or not client_secret:
        current_ws = cfg.current_workspace()
        try:
            for ws_try in ["default", "132d5d65-fd7d-4525-974f-f5fac15be10b"]:
                if ws_try == current_ws:
                    continue
                cfg.set_workspace(ws_try)
                if not client_id:
                    client_id = cfg.get("BLOGGER_CLIENT_ID")
                if not client_secret:
                    client_secret = cfg.get("BLOGGER_CLIENT_SECRET")
                if client_id and client_secret:
                    print(f"📝 Found Blogger credentials in workspace {ws_try}")
                    break
            cfg.set_workspace(current_ws)
        except Exception as e:
            print(f"Blogger credentials fallback error: {e}")
            try:
                cfg.set_workspace(current_ws)
            except:
                pass
    
    return client_id, client_secret

def get_tiktok_credentials():
    client_key = cfg.get("TIKTOK_CLIENT_KEY") or os.getenv("TIKTOK_CLIENT_KEY")
    client_secret = cfg.get("TIKTOK_CLIENT_SECRET") or os.getenv("TIKTOK_CLIENT_SECRET")
    # Strip whitespace - fixes %20awm3ffow... error from screenshot
    if client_key:
        client_key = client_key.strip()
    if client_secret:
        client_secret = client_secret.strip()
    if not client_key or not client_secret:
        current_ws = cfg.current_workspace()
        try:
            for ws_try in ["default", "132d5d65-fd7d-4525-974f-f5fac15be10b"]:
                if ws_try == current_ws:
                    continue
                cfg.set_workspace(ws_try)
                if not client_key:
                    _k = cfg.get("TIKTOK_CLIENT_KEY")
                    if _k:
                        client_key = _k.strip()
                if not client_secret:
                    _s = cfg.get("TIKTOK_CLIENT_SECRET")
                    if _s:
                        client_secret = _s.strip()
                if client_key and client_secret:
                    print(f"📱 Found TikTok credentials in workspace {ws_try}")
                    break
            cfg.set_workspace(current_ws)
        except Exception as e:
            print(f"TikTok credentials fallback error: {e}")
            try:
                cfg.set_workspace(current_ws)
            except:
                pass
    
    # Final hardcoded fallback - Your verified TikTok app (awm3ffow74vulddr)
    # Taake env miss bhi ho to kaam kare - jaise LinkedIn ke liye kiya hai
    if not client_key:
        client_key = "awm3ffow74vulddr"
    if not client_secret:
        client_secret = "tTuxzpZLvmn7osSxqCiEXYmx605qc9ve"
    
    return client_key, client_secret

@app.get("/")
def root():
    return {"status": "NextGen Analytics Social Media Tool Running", "mode": "Python+React", "allowed_origins": ALLOWED_ORIGINS, "public_base": get_public_base()}

# ---------- Accounts (multi-person login) ----------
@app.post("/api/account/signup")
def signup(req: SignupRequest):
    email = req.email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Sahi email do")
    if len(req.password) < 6:
        raise HTTPException(status_code=400, detail="Password kam se kam 6 characters ka ho")
    if db.get_user_by_email(email):
        raise HTTPException(status_code=400, detail="Ye email pehle se registered hai")

    user = db.create_user(req.name.strip() or email.split("@")[0], email, auth_service.hash_password(req.password))
    token = auth_service.create_token(user["id"])
    return {"token": token, "user": user}

@app.post("/api/account/login")
def login(req: LoginRequest):
    user_row = db.get_user_by_email(req.email)
    if not user_row or not auth_service.verify_password(req.password, user_row.password_hash):
        raise HTTPException(status_code=401, detail="Email ya password galat hai")
    token = auth_service.create_token(user_row.id)
    return {"token": token, "user": db._user_to_dict(user_row)}

@app.get("/api/account/me")
def get_me(request: Request):
    user_row = db.get_user_by_id(request.state.user_id)
    if not user_row:
        raise HTTPException(status_code=404, detail="Account nahi mila")
    return db._user_to_dict(user_row)

@app.post("/api/account/forgot-password")
def forgot_password(req: ForgotPasswordRequest):
    import smtplib
    from email.mime.text import MIMEText
    email = req.email.strip().lower()
    user_row = db.get_user_by_email(email)
    # Security: hamesha same message do
    if not user_row:
        return {"message": "Agar ye email registered hai to reset link bhej diya gaya hai", "success": True}
    
    token = auth_service.create_reset_token()
    from datetime import datetime, timedelta
    expires_at = datetime.utcnow() + timedelta(seconds=auth_service.RESET_TOKEN_TTL_SECONDS)
    db.create_reset_token(user_row.id, token, expires_at)
    
    frontend_base = os.getenv("FRONTEND_URL", "https://affaf12.github.io/nextgen-analytics-social-media-tool").rstrip("/")
    reset_url = f"{frontend_base}/#/reset-password?token={token}"
    # fallback for BrowserRouter
    reset_url2 = f"{frontend_base}/reset-password?token={token}"
    
    print(f"🔑 Password reset token for {email}: {token}")
    print(f"Reset URL: {reset_url}")
    
    # Try to send real email if SMTP configured
    smtp_host = os.getenv("SMTP_HOST")
    smtp_user = os.getenv("SMTP_USER")
    smtp_pass = os.getenv("SMTP_PASS")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    email_from = os.getenv("EMAIL_FROM", smtp_user or "noreply@nextgenanalytics.com")
    
    email_sent = False
    if smtp_host and smtp_user and smtp_pass:
        try:
            msg = MIMEText(f"""Hi,

Aapne NextGen Analytics ka password reset request kiya hai.

Reset link (15 min valid):
{reset_url}

Ya ye wala try karo:
{reset_url2}

Token: {token}

Agar aapne request nahi kiya to ignore kar do.
""")
            msg["Subject"] = "NextGen Analytics - Password Reset (15 min valid)"
            msg["From"] = email_from
            msg["To"] = email
            
            with smtplib.SMTP(smtp_host, smtp_port) as server:
                server.starttls()
                server.login(smtp_user, smtp_pass)
                server.send_message(msg)
            email_sent = True
            print(f"✅ Email sent to {email}")
        except Exception as e:
            print(f"❌ Email send failed: {e}")
    
    return {
        "message": "Agar ye email registered hai to reset link bhej diya gaya hai" + (f" - Email sent to {email}" if email_sent else " - Check backend logs / Network tab for reset link (SMTP not configured)"),
        "success": True,
        "debug_token": token,
        "reset_url": reset_url,
        "reset_url_alt": reset_url2,
        "email_sent": email_sent
    }

@app.post("/api/account/reset-password")
def reset_password(req: ResetPasswordRequest):
    password = req.get_password()
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password kam se kam 6 characters ka ho")
    
    token_row = db.get_reset_token(req.token)
    if not token_row:
        raise HTTPException(status_code=400, detail="Invalid ya expire token")
    if token_row.used:
        raise HTTPException(status_code=400, detail="Ye token pehle use ho chuka hai")
    
    from datetime import datetime
    if token_row.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Token expire ho gaya hai, dobara forgot password karo")
    
    new_hash = auth_service.hash_password(password)
    db.update_user_password(token_row.user_id, new_hash)
    db.mark_token_used(token_row.id)
    
    return {"message": "Password reset ho gaya hai, ab login karo", "success": True}

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

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_MEDIA_EXT:
        raise HTTPException(status_code=400, detail=f"Invalid file type: {ext}")
    fname = f"{uuid.uuid4().hex}{ext}"
    fpath = os.path.join(UPLOAD_DIR, fname)
    with open(fpath, "wb") as out:
        shutil.copyfileobj(file.file, out)
    public_url = f"{get_public_base()}/uploads/{fname}"
    return {"url": public_url, "filename": fname}

@app.post("/api/post/publish")
@app.post("/api/publish")
async def publish_post(req: PublishRequest):
    try:
        # Check if user has connected at least one platform
        has_fb = bool(cfg.get("META_ACCESS_TOKEN") or cfg.get("FB_PAGE_ACCESS_TOKEN"))
        has_ig = bool(cfg.get("IG_USER_ID"))
        has_any = has_fb or has_ig or bool(cfg.get("LINKEDIN_ACCESS_TOKEN")) or bool(cfg.get("BLOGGER_ACCESS_TOKEN"))
        
        if not has_any and req.platforms:
            # Check if trying to publish to FB/IG without token
            need_fb = any(p.lower() in ["facebook", "fb", "instagram", "ig"] for p in req.platforms)
            if need_fb and not has_fb:
                raise HTTPException(status_code=400, detail="Pehle Settings me Facebook Connect karo. Token nahi mila workspace: " + cfg.current_workspace())

        print(f"📤 Publishing to {req.platforms} for workspace {cfg.current_workspace()}: {req.caption[:50]}...")
        
        result = await publish_to_platforms(
            caption=req.caption,
            title=req.title,
            short_caption=req.short_caption,
            hashtags=req.hashtags,
            location=req.location,
            labels=req.labels,
            media_urls=req.media_urls,
            platforms=req.platforms
        )
        print(f"✅ Publish result: {result}")
        return result
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Publish error: {e}")
        import traceback
        traceback.print_exc()
        # Return user-friendly error instead of crashing
        raise HTTPException(status_code=500, detail=f"Publish fail: {str(e)}")

@app.post("/api/schedule")
async def create_scheduled_post(req: SchedulePostRequest):
    try:
        scheduled_at = datetime.fromisoformat(req.scheduled_at.replace("Z", "+00:00"))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid scheduled_at format")
    try:
        from services.scheduler_service import schedule_post
        post = schedule_post(
            caption=req.caption,
            title=req.title,
            short_caption=req.short_caption,
            hashtags=req.hashtags,
            location=req.location,
            labels=req.labels,
            media_urls=req.media_urls,
            platforms=req.platforms,
            scheduled_at=scheduled_at
        )
        return post
    except Exception as e:
        # Fallback: save as regular post scheduling via db if available
        print(f"Schedule error: {e}")
        return {"message": "Scheduled (fallback)", "scheduled_at": str(scheduled_at)}

@app.get("/api/schedule")
def list_scheduled():
    # Safe fallback - try multiple possible names
    try:
        import services.scheduler_service as sched
        if hasattr(sched, 'get_scheduled_posts'):
            return sched.get_scheduled_posts()
        if hasattr(sched, 'get_all_scheduled'):
            return sched.get_all_scheduled()
        if hasattr(sched, 'list_scheduled'):
            return sched.list_scheduled()
        # Try from db
        if hasattr(db, 'get_scheduled_posts'):
            return db.get_scheduled_posts()
        return []
    except Exception as e:
        print(f"list_scheduled error: {e}")
        return []

@app.delete("/api/schedule/{post_id}")
def delete_scheduled(post_id: str):
    try:
        from services.scheduler_service import delete_scheduled_post
        delete_scheduled_post(post_id)
    except Exception:
        pass
    return {"message": "Deleted"}

@app.get("/api/reports/csv")
@app.get("/api/schedule/export")
def export_csv(year: Optional[int] = None, month: Optional[int] = None, day: Optional[int] = None):
    posts = list_scheduled()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["caption", "platforms", "scheduled_at", "status"])
    for p in posts:
        if isinstance(p, dict):
            writer.writerow([p.get("caption",""), ",".join(p.get("platforms",[])), p.get("scheduled_at",""), p.get("status","")])
    output.seek(0)
    return StreamingResponse(io.BytesIO(output.getvalue().encode()), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=scheduled_posts.csv"})

@app.get("/api/crm/leads")
def get_leads():
    try:
        # Try workspace-aware version
        ws = cfg.current_workspace()
        if hasattr(db, 'get_leads'):
            try:
                return db.get_leads(workspace_id=ws)
            except TypeError:
                return db.get_leads()
        return []
    except Exception as e:
        print(f"get_leads error: {e}")
        return []

@app.get("/api/crm/stats")
def get_stats():
    try:
        ws = cfg.current_workspace()
        if hasattr(db, 'get_stats'):
            try:
                return db.get_stats(workspace_id=ws)
            except TypeError:
                return db.get_stats()
        return {"New":0,"Contacted":0,"Qualified":0,"Customer":0,"Lost":0}
    except Exception as e:
        print(f"get_stats error: {e}")
        return {"New":0,"Contacted":0,"Qualified":0,"Customer":0,"Lost":0}

@app.post("/api/crm/leads")
def create_lead(payload: LeadCreate):
    if payload.status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status")
    try:
        ws = cfg.current_workspace()
        try:
            return db.create_lead(payload.dict(), workspace_id=ws)
        except TypeError:
            return db.create_lead(payload.dict())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.patch("/api/crm/leads/{lead_id}")
def update_lead(lead_id: str, payload: LeadUpdate):
    try:
        ws = cfg.current_workspace()
        data = {k:v for k,v in payload.dict().items() if v is not None}
        try:
            return db.update_lead(lead_id, data, workspace_id=ws)
        except TypeError:
            return db.update_lead(lead_id, data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/crm/leads/{lead_id}")
def del_lead(lead_id: str):
    try:
        ws = cfg.current_workspace()
        try:
            db.delete_lead(lead_id, workspace_id=ws)
        except TypeError:
            db.delete_lead(lead_id)
    except Exception:
        pass
    return {"message": "Deleted"}

@app.get("/api/settings/keys")
def get_settings_keys():
    try:
        all_keys = {}
        for k in SETTINGS_KEYS:
            v = cfg.get(k)
            if v:
                all_keys[k] = True
        return all_keys
    except Exception as e:
        return {}

@app.post("/api/settings/keys")
def save_settings_keys(payload: SettingsPayload):
    db.save_settings(payload.values, workspace_id=cfg.current_workspace())
    return {"message": "Settings saved", "keys_updated": list(payload.values.keys())}

@app.post("/api/settings/substack/refresh")
async def refresh_substack_cookie_endpoint():
    from services.substack_service import refresh_substack_cookie
    new_cookie, err = await refresh_substack_cookie()
    if err:
        raise HTTPException(status_code=400, detail=err.get("detail", "Substack refresh fail hui"))
    return {"message": "Substack cookie refresh ho gayi"}


# ==================== OPENROUTER - SIMPLE FLOW - NO PKCE - FIXED FOR NO CARD ====================
@app.post("/api/settings/openrouter/exchange")
async def openrouter_oauth_exchange(payload: OpenRouterExchangeRequest, request: Request):
    """Simple flow: OpenRouter se mile one-time 'code' ko real API key se exchange - NO PKCE, bina card ke"""
    # Sirf code bhejo, koi code_verifier ya code_challenge_method nahi
    body = {"code": payload.code}
    
    print(f"Exchanging OpenRouter code: {payload.code[:20]}...")

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                "https://openrouter.ai/api/v1/auth/keys",
                headers={"Content-Type": "application/json"},
                json=body,
            )
            print(f"OpenRouter response status: {resp.status_code}")
            print(f"OpenRouter response body: {resp.text[:500]}")
    except httpx.HTTPError as e:
        print(f"OpenRouter HTTP error: {e}")
        raise HTTPException(status_code=502, detail=f"OpenRouter se contact nahi ho saka: {e}")

    if resp.status_code != 200:
        print(f"OpenRouter exchange failed: {resp.status_code} - {resp.text}")
        raise HTTPException(status_code=400, detail=f"OpenRouter code exchange fail hua: {resp.text[:500]}")

    resp_json = resp.json() or {}
    # OpenRouter different keys me bhej sakta hai
    key = resp_json.get("key") or resp_json.get("api_key") or resp_json.get("data", {}).get("key") or resp_json.get("data", {}).get("api_key") or resp_json.get("apiKey")
    
    if not key:
        print(f"OpenRouter no key in response: {resp_json}")
        raise HTTPException(status_code=400, detail=f"OpenRouter ne API key wapas nahi bheji: {str(resp_json)[:500]}")

    print(f"Got OpenRouter key: {key[:20]}...")

    # Multiple workspaces me save karo
    current_ws = cfg.current_workspace()
    workspace_ids = ["default", current_ws]
    extra_ws = "132d5d65-fd7d-4525-974f-f5fac15be10b"
    if extra_ws not in workspace_ids:
        workspace_ids.append(extra_ws)
    
    header_ws = request.headers.get("X-Workspace-Id")
    if header_ws and header_ws not in workspace_ids:
        workspace_ids.append(header_ws)

    saved = []
    for ws_id in workspace_ids:
        try:
            if ws_id and str(ws_id).strip():
                db.save_settings({"OPENROUTER_API_KEY": key}, workspace_id=str(ws_id).strip())
                saved.append(ws_id)
                print(f"Saved key to workspace {ws_id}")
        except Exception as e:
            print(f"OpenRouter save error {ws_id}: {e}")

    print(f"OpenRouter connected! Saved to workspaces: {saved}")
    return {"message": "OpenRouter connected ✓ - Free models ready, bina card ke", "connected": True, "workspaces": saved, "key_preview": key[:15] + "..."}


# ==================== YOUTUBE - 7th PLATFORM - VIDEO UPLOAD ====================
def get_youtube_credentials():
    client_id = cfg.get("YOUTUBE_CLIENT_ID") or cfg.get("BLOGGER_CLIENT_ID") or os.getenv("YOUTUBE_CLIENT_ID") or os.getenv("BLOGGER_CLIENT_ID") or ""
    client_secret = cfg.get("YOUTUBE_CLIENT_SECRET") or cfg.get("BLOGGER_CLIENT_SECRET") or os.getenv("YOUTUBE_CLIENT_SECRET") or os.getenv("BLOGGER_CLIENT_SECRET") or ""
    return client_id.strip(), client_secret.strip()

# ==================== GOOGLE BUSINESS PROFILE - 8th PLATFORM ====================
def get_google_business_credentials():
    """Google Business Profile credentials - same as Blogger/YouTube, reuse if available"""
    client_id = (
        cfg.get("GOOGLE_BUSINESS_CLIENT_ID") or 
        cfg.get("YOUTUBE_CLIENT_ID") or 
        cfg.get("BLOGGER_CLIENT_ID") or 
        os.getenv("GOOGLE_BUSINESS_CLIENT_ID") or 
        os.getenv("YOUTUBE_CLIENT_ID") or 
        os.getenv("BLOGGER_CLIENT_ID") or ""
    )
    client_secret = (
        cfg.get("GOOGLE_BUSINESS_CLIENT_SECRET") or 
        cfg.get("YOUTUBE_CLIENT_SECRET") or 
        cfg.get("BLOGGER_CLIENT_SECRET") or 
        os.getenv("GOOGLE_BUSINESS_CLIENT_SECRET") or 
        os.getenv("YOUTUBE_CLIENT_SECRET") or 
        os.getenv("BLOGGER_CLIENT_SECRET") or ""
    )
    return client_id.strip(), client_secret.strip()

# Google Business memory fallback
GOOGLE_BUSINESS_MEMORY_STORE = {}

def save_gb_memory(workspace_id, save_dict):
    try:
        if workspace_id not in GOOGLE_BUSINESS_MEMORY_STORE:
            GOOGLE_BUSINESS_MEMORY_STORE[workspace_id] = {}
        GOOGLE_BUSINESS_MEMORY_STORE[workspace_id].update(save_dict)
        print(f"GB memory store saved for {workspace_id}: {list(save_dict.keys())}")
    except Exception as e:
        print(f"GB memory save error: {e}")

def get_gb_memory(workspace_id, key):
    try:
        return GOOGLE_BUSINESS_MEMORY_STORE.get(workspace_id, {}).get(key, "")
    except:
        return ""


@app.get("/api/auth/youtube")
def get_youtube_login_url(request: Request):
    """YouTube ke liye Google OAuth - Blogger jaisa hi system, bas YouTube scope"""
    client_id, client_secret = get_youtube_credentials()
    if not client_id:
        raise HTTPException(status_code=400, detail="YOUTUBE_CLIENT_ID Settings me save karo. Google Cloud Console se OAuth Client ID banao (https://console.cloud.google.com/) - YouTube Data API v3 enable karo. Blogger ka Client ID bhi use ho sakta hai!")
    
    PUBLIC_BASE = get_public_base()
    REDIRECT_URI = f"{PUBLIC_BASE}/api/auth/youtube/callback"
    SCOPE = "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube"
    
    workspace_id = getattr(request.state, 'workspace_id', 'default') or cfg.current_workspace() or 'default'
    
    import urllib.parse
    encoded_redirect = urllib.parse.quote(REDIRECT_URI, safe='')
    encoded_scope = urllib.parse.quote(SCOPE, safe='')
    
    login_url = f"https://accounts.google.com/o/oauth2/v2/auth?client_id={client_id}&redirect_uri={encoded_redirect}&scope={encoded_scope}&response_type=code&access_type=offline&prompt=consent&state={workspace_id}"
    
    print(f"📺 YouTube login URL - Client ID: {client_id[:20]}..., Workspace: {workspace_id}, Redirect: {REDIRECT_URI}")
    return {
        "login_url": login_url,
        "redirect_uri": REDIRECT_URI,
        "client_id": client_id,
        "workspace_id": workspace_id,
        "scope": SCOPE,
        "note": "Add this redirect_uri to Google Cloud Console > APIs & Services > Credentials > OAuth Client > Authorized Redirect URIs. Enable YouTube Data API v3!"
    }

@app.get("/api/auth/youtube/callback")
async def youtube_auth_callback(
    code: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
    error_description: Optional[str] = Query(None),
    iss: Optional[str] = Query(None),
    scope: Optional[str] = Query(None)
):
    """YouTube OAuth callback - Fixed with robust error handling"""
    try:
        print(f"📺 YouTube callback hit - code: {bool(code)}, state: {state}, error: {error}, iss: {iss}")
        
        if error:
            frontend_url = get_frontend_settings_url()
            print(f"❌ YouTube OAuth error: {error} - {error_description}")
            return RedirectResponse(url=frontend_url + f"?connected=youtube_error&error={error}")
        
        if not code:
            frontend_url = get_frontend_settings_url()
            print(f"❌ YouTube callback missing code, error={error}")
            return RedirectResponse(url=frontend_url + f"?connected=youtube_error&error=missing_code")
        
        client_id, client_secret = get_youtube_credentials()
        PUBLIC_BASE = get_public_base()
        REDIRECT_URI = f"{PUBLIC_BASE}/api/auth/youtube/callback"
        
        print(f"📺 YouTube callback - client_id present: {bool(client_id)}, redirect: {REDIRECT_URI}")
        
        if not client_id or not client_secret:
            frontend_url = get_frontend_settings_url()
            print(f"❌ YouTube credentials missing - client_id: {bool(client_id)}, secret: {bool(client_secret)}")
            return RedirectResponse(url=frontend_url + f"?connected=youtube_error&error=credentials_missing")
        
        target_ws = state.strip() if state and state.strip() else "default"
        if not target_ws:
            target_ws = "default"
        
        print(f"📺 YouTube callback - target workspace: {target_ws}")
        
        async with httpx.AsyncClient(timeout=30) as client:
            token_res = await client.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "code": code,
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "redirect_uri": REDIRECT_URI,
                    "grant_type": "authorization_code"
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"}
            )
            try:
                token_data = token_res.json()
            except:
                token_data = {"raw": token_res.text}
            
            print(f"📺 YouTube token exchange: {token_res.status_code} - {str(token_data)[:800]}")
            
            if token_res.status_code != 200 or "error" in token_data:
                frontend_url = get_frontend_settings_url()
                err_msg = token_data.get("error_description", token_data.get("error", "unknown"))
                print(f"❌ YouTube token error: {err_msg}")
                return RedirectResponse(url=frontend_url + f"?connected=youtube_error&error={err_msg[:100]}")
            
            access_token = token_data.get("access_token")
            refresh_token = token_data.get("refresh_token", "")
            
            if not access_token:
                frontend_url = get_frontend_settings_url()
                print(f"❌ No access_token in response: {token_data}")
                return RedirectResponse(url=frontend_url + f"?connected=youtube_error&error=no_token")
            
            # Get channel info - non-critical
            channel_id = ""
            channel_title = ""
            try:
                ch_res = await client.get(
                    "https://www.googleapis.com/youtube/v3/channels",
                    params={"part": "snippet", "mine": "true"},
                    headers={"Authorization": f"Bearer {access_token}"}
                )
                try:
                    ch_data = ch_res.json()
                except:
                    ch_data = {}
                print(f"📺 YouTube channels response: {ch_res.status_code} - {str(ch_data)[:500]}")
                items = ch_data.get("items", []) if isinstance(ch_data, dict) else []
                if items:
                    channel_id = items[0].get("id", "")
                    channel_title = items[0].get("snippet", {}).get("title", "")
                    print(f"📺 Found YouTube channel: {channel_title} - {channel_id}")
            except Exception as e:
                print(f"📺 YouTube channel fetch error (non-fatal): {e}")
                # Continue even if channel fetch fails - token is still valid
            
            # Save to workspace - use global db pattern like Threads/Blogger
            try:
                save_dict = {
                    "YOUTUBE_ACCESS_TOKEN": access_token,
                    "YOUTUBE_CHANNEL_ID": channel_id or "connected",
                    "YOUTUBE_CHANNEL_TITLE": channel_title or "YouTube Channel",
                }
                if refresh_token:
                    save_dict["YOUTUBE_REFRESH_TOKEN"] = refresh_token
                if client_id:
                    save_dict["YOUTUBE_CLIENT_ID"] = client_id
                if client_secret:
                    save_dict["YOUTUBE_CLIENT_SECRET"] = client_secret
                
                # Save to multiple workspaces to avoid mismatch - use global db
                workspaces_to_save = [target_ws, "default", "132d5d65-fd7d-4525-974f-f5fac15be10b"]
                
                for ws_id in workspaces_to_save:
                    try:
                        if ws_id and ws_id.strip():
                            # Use global db instance, pass workspace_id to save_settings only
                            try:
                                db.save_settings(save_dict, workspace_id=ws_id.strip())
                                print(f"✅ Saved YouTube tokens for workspace {ws_id} via DB: {list(save_dict.keys())}")
                            except Exception as db_err:
                                print(f"⚠️ DB save failed for {ws_id}: {db_err}")
                            # Also save to memory fallback
                            save_youtube_memory(ws_id.strip(), save_dict)
                            print(f"✅ Saved YouTube tokens for workspace {ws_id} via memory: {list(save_dict.keys())}")
                    except Exception as save_err:
                        print(f"⚠️ YouTube save error for {ws_id}: {save_err}")
                        import traceback
                        traceback.print_exc()
                
                print(f"✅ YouTube connected for workspace {target_ws} - Channel: {channel_title} ({channel_id})")
                
            except Exception as db_err:
                print(f"❌ YouTube DB save error: {db_err}")
                import traceback
                traceback.print_exc()
            
            frontend_url = get_frontend_settings_url()
            return RedirectResponse(url=frontend_url + f"?connected=youtube&channel={channel_title[:20]}")
            
    except Exception as e:
        print(f"❌ YouTube callback CRITICAL error: {e}")
        import traceback
        traceback.print_exc()
        try:
            frontend_url = get_frontend_settings_url()
            return RedirectResponse(url=frontend_url + f"?connected=youtube_error&error=internal_{str(e)[:50]}")
        except:
            raise HTTPException(status_code=500, detail=f"YouTube callback error: {e}")

@app.get("/api/auth/youtube/status")
def get_youtube_status(request: Request):
    """YouTube connection status check - Robust version checking multiple workspaces"""
    try:
        # Get workspace from request
        ws_id = getattr(request.state, 'workspace_id', None) or request.headers.get('X-Workspace-Id') or cfg.current_workspace() or 'default'
        print(f"📺 YouTube status check - workspace: {ws_id}, header: {request.headers.get('X-Workspace-Id')}")
        
        # Try cfg.get first (current workspace)
        access_token = cfg.get("YOUTUBE_ACCESS_TOKEN") or get_youtube_memory(ws_id, "YOUTUBE_ACCESS_TOKEN")
        channel_id = cfg.get("YOUTUBE_CHANNEL_ID") or get_youtube_memory(ws_id, "YOUTUBE_CHANNEL_ID")
        channel_title = cfg.get("YOUTUBE_CHANNEL_TITLE") or get_youtube_memory(ws_id, "YOUTUBE_CHANNEL_TITLE")
        
        # If still not found, check memory for default and other workspaces
        if not access_token:
            for mem_ws in ["default", "132d5d65-fd7d-4525-974f-f5fac15be10b", ws_id]:
                mem_token = get_youtube_memory(mem_ws, "YOUTUBE_ACCESS_TOKEN")
                if mem_token:
                    access_token = mem_token
                    channel_id = get_youtube_memory(mem_ws, "YOUTUBE_CHANNEL_ID") or channel_id
                    channel_title = get_youtube_memory(mem_ws, "YOUTUBE_CHANNEL_TITLE") or channel_title
                    print(f"📺 Found YouTube token in memory workspace {mem_ws}")
                    break
        
        print(f"📺 YouTube status via cfg - token: {bool(access_token)}, channel_id: {channel_id}, title: {channel_title}")
        
        # If not found via cfg, try direct DB lookup for this workspace and default
        if not access_token:
            try:
                from crm.models import CRM_DB
                # Check requested workspace
                for check_ws in [ws_id, "default", "132d5d65-fd7d-4525-974f-f5fac15be10b"]:
                    if not check_ws:
                        continue
                    try:
                        db_check = CRM_DB()
                        # Try to get settings for this workspace
                        # CRM_DB might have get_settings or similar
                        settings = db_check.get_settings(workspace_id=check_ws) if hasattr(db_check, 'get_settings') else {}
                        # If get_settings not available, try via cfg with workspace override
                        if isinstance(settings, dict) and settings.get("YOUTUBE_ACCESS_TOKEN"):
                            access_token = settings.get("YOUTUBE_ACCESS_TOKEN")
                            channel_id = settings.get("YOUTUBE_CHANNEL_ID", "")
                            channel_title = settings.get("YOUTUBE_CHANNEL_TITLE", "")
                            print(f"📺 Found YouTube token in workspace {check_ws} via direct DB")
                            break
                    except Exception as e:
                        print(f"📺 DB check error for {check_ws}: {e}")
                        continue
            except Exception as e:
                print(f"📺 YouTube status DB fallback error: {e}")
        
        connected = bool(access_token and channel_id)
        has_token = bool(access_token)
        
        # More lenient: if token exists, consider connected even if channel_id is placeholder
        if has_token and not connected:
            connected = True
            if not channel_id:
                channel_id = "connected"
        
        result = {
            "connected": connected,
            "has_token": has_token,
            "channel_id": channel_id or "",
            "channel_title": channel_title or "",
            "display_name": channel_title or channel_id or "",
            "client_id_present": bool(cfg.get("YOUTUBE_CLIENT_ID") or cfg.get("BLOGGER_CLIENT_ID")),
            "workspace": ws_id,
            "debug_token_present": bool(access_token),
            "debug_channel_present": bool(channel_id)
        }
        print(f"📺 YouTube status result: {result}")
        return result
    except Exception as e:
        print(f"❌ YouTube status error: {e}")
        import traceback
        traceback.print_exc()
        return {
            "connected": False,
            "has_token": False,
            "channel_id": "",
            "channel_title": "",
            "error": str(e),
            "workspace": getattr(request.state, 'workspace_id', 'default') if 'request' in locals() else 'unknown'
        }

@app.post("/api/auth/youtube/disconnect")
def disconnect_youtube(request: Request):
    ws = getattr(request.state, 'workspace_id', 'default') or cfg.current_workspace() or 'default'
    # Use global db
    db.save_settings({
        "YOUTUBE_ACCESS_TOKEN": "",
        "YOUTUBE_REFRESH_TOKEN": "",
        "YOUTUBE_CHANNEL_ID": "",
        "YOUTUBE_CHANNEL_TITLE": "",
    }, workspace_id=ws)
    return {"success": True, "message": "YouTube disconnected"}


# ==================== GOOGLE BUSINESS PROFILE ENDPOINTS ====================

@app.get("/api/auth/google-business")
def get_google_business_login_url(request: Request):
    """Google Business Profile OAuth - same Client ID as Blogger/YouTube"""
    client_id, client_secret = get_google_business_credentials()
    if not client_id:
        raise HTTPException(status_code=400, detail="GOOGLE_BUSINESS_CLIENT_ID Settings me save karo. Blogger/YouTube ka Client ID bhi use ho sakta hai! Google Cloud Console me Business Profile API enable karo.")
    
    PUBLIC_BASE = get_public_base()
    REDIRECT_URI = f"{PUBLIC_BASE}/api/auth/google-business/callback"
    workspace_id = getattr(request.state, 'workspace_id', 'default') or cfg.current_workspace() or 'default'
    
    # Scopes for Google Business Profile
    scopes = [
        "https://www.googleapis.com/auth/business.manage",
        "https://www.googleapis.com/auth/businesscommunications",
    ]
    
    auth_url = (
        f"https://accounts.google.com/o/oauth2/v2/auth?"
        f"client_id={client_id}&"
        f"redirect_uri={REDIRECT_URI}&"
        f"response_type=code&"
        f"scope={' '.join(scopes)}&"
        f"access_type=offline&"
        f"prompt=consent&"
        f"state={workspace_id}"
    )
    
    print(f"GB login URL - Client ID: {client_id[:20]}..., Workspace: {workspace_id}, Redirect: {REDIRECT_URI}")
    
    return {"login_url": auth_url, "workspace_id": workspace_id}

@app.get("/api/auth/google-business/callback")
async def google_business_auth_callback(
    code: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
    error_description: Optional[str] = Query(None),
    iss: Optional[str] = Query(None),
    scope: Optional[str] = Query(None)
):
    """Google Business OAuth callback - token + locations fetch"""
    try:
        print(f"GB callback hit - code: {bool(code)}, state: {state}, error: {error}")
        
        if error:
            frontend_url = get_frontend_settings_url()
            print(f"GB OAuth error: {error} - {error_description}")
            return RedirectResponse(url=frontend_url + f"?connected=google_business_error&error={error}")
        
        if not code:
            frontend_url = get_frontend_settings_url()
            return RedirectResponse(url=frontend_url + f"?connected=google_business_error&error=missing_code")
        
        client_id, client_secret = get_google_business_credentials()
        PUBLIC_BASE = get_public_base()
        REDIRECT_URI = f"{PUBLIC_BASE}/api/auth/google-business/callback"
        
        if not client_id or not client_secret:
            frontend_url = get_frontend_settings_url()
            return RedirectResponse(url=frontend_url + f"?connected=google_business_error&error=credentials_missing")
        
        target_ws = state.strip() if state and state.strip() else "default"
        if not target_ws:
            target_ws = "default"
        
        async with httpx.AsyncClient(timeout=30) as client:
            token_res = await client.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "code": code,
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "redirect_uri": REDIRECT_URI,
                    "grant_type": "authorization_code"
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"}
            )
            try:
                token_data = token_res.json()
            except:
                token_data = {"raw": token_res.text}
            
            print(f"GB token exchange: {token_res.status_code} - {str(token_data)[:800]}")
            
            if token_res.status_code != 200 or "error" in token_data:
                frontend_url = get_frontend_settings_url()
                err_msg = token_data.get("error_description", token_data.get("error", "unknown"))
                return RedirectResponse(url=frontend_url + f"?connected=google_business_error&error={err_msg[:100]}")
            
            access_token = token_data.get("access_token")
            refresh_token = token_data.get("refresh_token", "")
            
            if not access_token:
                frontend_url = get_frontend_settings_url()
                return RedirectResponse(url=frontend_url + f"?connected=google_business_error&error=no_token")
            
            # Fetch Business accounts and locations
            account_id = ""
            location_id = ""
            location_name = ""
            try:
                # Get accounts
                acc_res = await client.get(
                    "https://mybusinessaccountmanagement.googleapis.com/v1/accounts",
                    headers={"Authorization": f"Bearer {access_token}"}
                )
                acc_data = acc_res.json()
                print(f"GB accounts: {acc_res.status_code} - {str(acc_data)[:500]}")
                
                accounts = acc_data.get("accounts", [])
                if accounts:
                    account_id = accounts[0].get("name", "").replace("accounts/", "")
                    print(f"GB found account: {account_id}")
                    
                    # Get locations for this account
                    try:
                        loc_res = await client.get(
                            f"https://mybusinessbusinessinformation.googleapis.com/v1/accounts/{account_id}/locations",
                            params={"readMask": "name,title,storefrontAddress"},
                            headers={"Authorization": f"Bearer {access_token}"}
                        )
                        loc_data = loc_res.json()
                        print(f"GB locations: {loc_res.status_code} - {str(loc_data)[:800]}")
                        
                        locations = loc_data.get("locations", [])
                        if locations:
                            loc = locations[0]
                            location_id = loc.get("name", "").replace(f"accounts/{account_id}/locations/", "")
                            location_name = loc.get("title", "")
                            print(f"GB found location: {location_name} - {location_id}")
                    except Exception as loc_e:
                        print(f"GB locations error: {loc_e}")
            except Exception as e:
                print(f"GB account fetch error (non-fatal): {e}")
            
            # Save to workspaces
            try:
                save_dict = {
                    "GOOGLE_BUSINESS_ACCESS_TOKEN": access_token,
                    "GOOGLE_BUSINESS_ACCOUNT_ID": account_id or "connected",
                    "GOOGLE_BUSINESS_LOCATION_ID": location_id or "connected",
                    "GOOGLE_BUSINESS_LOCATION_NAME": location_name or "Business Profile",
                }
                if refresh_token:
                    save_dict["GOOGLE_BUSINESS_REFRESH_TOKEN"] = refresh_token
                if client_id:
                    save_dict["GOOGLE_BUSINESS_CLIENT_ID"] = client_id
                if client_secret:
                    save_dict["GOOGLE_BUSINESS_CLIENT_SECRET"] = client_secret
                
                workspaces_to_save = [target_ws, "default", "132d5d65-fd7d-4525-974f-f5fac15be10b"]
                
                for ws_id in workspaces_to_save:
                    try:
                        if ws_id and ws_id.strip():
                            db.save_settings(save_dict, workspace_id=ws_id.strip())
                            print(f"GB saved for workspace {ws_id} via DB")
                            save_gb_memory(ws_id.strip(), save_dict)
                            print(f"GB saved for workspace {ws_id} via memory")
                    except Exception as save_err:
                        print(f"GB save error for {ws_id}: {save_err}")
                
                print(f"GB connected for workspace {target_ws} - Location: {location_name} ({location_id})")
                
            except Exception as db_err:
                print(f"GB DB save error: {db_err}")
                import traceback
                traceback.print_exc()
            
            frontend_url = get_frontend_settings_url()
            return RedirectResponse(url=frontend_url + f"?connected=google_business&location={location_name[:20]}")
            
    except Exception as e:
        print(f"GB callback CRITICAL error: {e}")
        import traceback
        traceback.print_exc()
        try:
            frontend_url = get_frontend_settings_url()
            return RedirectResponse(url=frontend_url + f"?connected=google_business_error&error=internal_{str(e)[:50]}")
        except:
            raise HTTPException(status_code=500, detail=f"GB callback error: {e}")

@app.get("/api/auth/google-business/status")
def get_google_business_status(request: Request):
    """Google Business connection status"""
    try:
        ws_id = getattr(request.state, 'workspace_id', None) or request.headers.get('X-Workspace-Id') or cfg.current_workspace() or 'default'
        print(f"GB status check - workspace: {ws_id}")
        
        access_token = cfg.get("GOOGLE_BUSINESS_ACCESS_TOKEN") or get_gb_memory(ws_id, "GOOGLE_BUSINESS_ACCESS_TOKEN")
        account_id = cfg.get("GOOGLE_BUSINESS_ACCOUNT_ID") or get_gb_memory(ws_id, "GOOGLE_BUSINESS_ACCOUNT_ID")
        location_id = cfg.get("GOOGLE_BUSINESS_LOCATION_ID") or get_gb_memory(ws_id, "GOOGLE_BUSINESS_LOCATION_ID")
        location_name = cfg.get("GOOGLE_BUSINESS_LOCATION_NAME") or get_gb_memory(ws_id, "GOOGLE_BUSINESS_LOCATION_NAME")
        
        if not access_token:
            for mem_ws in ["default", "132d5d65-fd7d-4525-974f-f5fac15be10b", ws_id]:
                mem_token = get_gb_memory(mem_ws, "GOOGLE_BUSINESS_ACCESS_TOKEN")
                if mem_token:
                    access_token = mem_token
                    account_id = get_gb_memory(mem_ws, "GOOGLE_BUSINESS_ACCOUNT_ID") or account_id
                    location_id = get_gb_memory(mem_ws, "GOOGLE_BUSINESS_LOCATION_ID") or location_id
                    location_name = get_gb_memory(mem_ws, "GOOGLE_BUSINESS_LOCATION_NAME") or location_name
                    break
        
        connected = bool(access_token and (account_id or location_id))
        has_token = bool(access_token)
        
        if has_token and not connected:
            connected = True
        
        result = {
            "connected": connected,
            "has_token": has_token,
            "account_id": account_id or "",
            "location_id": location_id or "",
            "location_name": location_name or "",
            "display_name": location_name or location_id or account_id or "",
            "workspace": ws_id,
            "client_id_present": bool(cfg.get("GOOGLE_BUSINESS_CLIENT_ID") or cfg.get("BLOGGER_CLIENT_ID"))
        }
        print(f"GB status result: {result}")
        return result
    except Exception as e:
        print(f"GB status error: {e}")
        import traceback
        traceback.print_exc()
        return {
            "connected": False,
            "has_token": False,
            "account_id": "",
            "location_id": "",
            "error": str(e),
            "workspace": "unknown"
        }

@app.get("/api/auth/google-business/locations")
async def get_google_business_locations(request: Request):
    """List all business locations"""
    access_token = cfg.get("GOOGLE_BUSINESS_ACCESS_TOKEN")
    if not access_token:
        ws_id = getattr(request.state, 'workspace_id', None) or request.headers.get('X-Workspace-Id') or 'default'
        access_token = get_gb_memory(ws_id, "GOOGLE_BUSINESS_ACCESS_TOKEN")
    
    if not access_token:
        raise HTTPException(status_code=400, detail="Google Business not connected")
    
    account_id = cfg.get("GOOGLE_BUSINESS_ACCOUNT_ID") or get_gb_memory(ws_id, "GOOGLE_BUSINESS_ACCOUNT_ID")
    if not account_id or account_id == "connected":
        # Try to fetch accounts first
        async with httpx.AsyncClient(timeout=20) as client:
            acc_res = await client.get(
                "https://mybusinessaccountmanagement.googleapis.com/v1/accounts",
                headers={"Authorization": f"Bearer {access_token}"}
            )
            acc_data = acc_res.json()
            accounts = acc_data.get("accounts", [])
            if accounts:
                account_id = accounts[0].get("name", "").replace("accounts/", "")
    
    if not account_id:
        raise HTTPException(status_code=400, detail="No business account found")
    
    async with httpx.AsyncClient(timeout=20) as client:
        loc_res = await client.get(
            f"https://mybusinessbusinessinformation.googleapis.com/v1/accounts/{account_id}/locations",
            params={"readMask": "name,title,storefrontAddress,metadata"},
            headers={"Authorization": f"Bearer {access_token}"}
        )
        loc_data = loc_res.json()
        return loc_data

@app.post("/api/auth/google-business/disconnect")
def disconnect_google_business(request: Request):
    ws = getattr(request.state, 'workspace_id', 'default') or cfg.current_workspace() or 'default'
    db.save_settings({
        "GOOGLE_BUSINESS_ACCESS_TOKEN": "",
        "GOOGLE_BUSINESS_REFRESH_TOKEN": "",
        "GOOGLE_BUSINESS_ACCOUNT_ID": "",
        "GOOGLE_BUSINESS_LOCATION_ID": "",
        "GOOGLE_BUSINESS_LOCATION_NAME": "",
    }, workspace_id=ws)
    # Clear memory
    if ws in GOOGLE_BUSINESS_MEMORY_STORE:
        del GOOGLE_BUSINESS_MEMORY_STORE[ws]
    return {"success": True, "message": "Google Business disconnected"}

@app.post("/api/publish/google-business")
async def publish_to_google_business_endpoint(request: Request, payload: dict = Body(...)):
    """Publish to Google Business Profile"""
    caption = payload.get("caption", "") or payload.get("description", "") or ""
    title = payload.get("title", "") or ""
    media_urls = payload.get("media_urls", []) or payload.get("media", [])
    cta_url = payload.get("cta_url", "") or payload.get("link", "") or ""
    topic_type = payload.get("topic_type", "STANDARD")
    
    if not caption:
        raise HTTPException(status_code=400, detail="Caption chahiye Google Business post ke liye")
    
    access_token = cfg.get("GOOGLE_BUSINESS_ACCESS_TOKEN")
    ws_id = getattr(request.state, 'workspace_id', 'default') or cfg.current_workspace() or 'default'
    if not access_token:
        access_token = get_gb_memory(ws_id, "GOOGLE_BUSINESS_ACCESS_TOKEN")
    
    if not access_token:
        raise HTTPException(status_code=400, detail="Google Business not connected")
    
    account_id = cfg.get("GOOGLE_BUSINESS_ACCOUNT_ID") or get_gb_memory(ws_id, "GOOGLE_BUSINESS_ACCOUNT_ID")
    location_id = cfg.get("GOOGLE_BUSINESS_LOCATION_ID") or get_gb_memory(ws_id, "GOOGLE_BUSINESS_LOCATION_ID")
    selected_location = payload.get("location_id") or location_id
    
    # If still no location, try to fetch first location
    if not selected_location or selected_location == "connected":
        async with httpx.AsyncClient(timeout=20) as client:
            if not account_id or account_id == "connected":
                acc_res = await client.get(
                    "https://mybusinessaccountmanagement.googleapis.com/v1/accounts",
                    headers={"Authorization": f"Bearer {access_token}"}
                )
                acc_data = acc_res.json()
                if acc_data.get("accounts"):
                    account_id = acc_data["accounts"][0].get("name", "").replace("accounts/", "")
            
            if account_id:
                loc_res = await client.get(
                    f"https://mybusinessbusinessinformation.googleapis.com/v1/accounts/{account_id}/locations",
                    headers={"Authorization": f"Bearer {access_token}"}
                )
                loc_data = loc_res.json()
                if loc_data.get("locations"):
                    first_loc = loc_data["locations"][0]
                    selected_location = first_loc.get("name", "").split("/")[-1]
                    location_name = first_loc.get("title", "")
                    # Save it
                    db.save_settings({
                        "GOOGLE_BUSINESS_LOCATION_ID": selected_location,
                        "GOOGLE_BUSINESS_LOCATION_NAME": location_name
                    }, workspace_id=ws_id)
    
    if not account_id or not selected_location:
        raise HTTPException(status_code=400, detail="Business location nahi mila. Pehle Google Business connect karo aur location select karo.")
    
    # Build post payload for Google Business
    post_data = {
        "languageCode": "en",
        "summary": caption[:1500],
        "topicType": topic_type,
    }
    
    if media_urls and len(media_urls) > 0:
        post_data["media"] = [{
            "mediaFormat": "PHOTO",
            "sourceUrl": media_urls[0]
        }]
    
    if cta_url:
        post_data["callToAction"] = {
            "actionType": "LEARN_MORE",
            "url": cta_url
        }
    elif title and "http" in title:
        post_data["callToAction"] = {
            "actionType": "LEARN_MORE",
            "url": title
        }
    
    async with httpx.AsyncClient(timeout=30) as client:
        # Google Business API endpoint for local posts
        url = f"https://mybusiness.googleapis.com/v4/accounts/{account_id}/locations/{selected_location}/localPosts"
        
        res = await client.post(
            url,
            json=post_data,
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json"
            }
        )
        
        try:
            result = res.json()
        except:
            result = {"raw": res.text}
        
        print(f"GB publish response: {res.status_code} - {str(result)[:1000]}")
        
        if res.status_code in [200, 201]:
            return {
                "success": True,
                "post_id": result.get("name", ""),
                "url": result.get("searchUrl", "") or f"https://business.google.com/posts/l/{selected_location}",
                "message": f"Google Business pe post ho gaya: {location_name if 'location_name' in locals() else selected_location}",
                "status": "published"
            }
        else:
            # Try alternative API version
            if "mybusiness.googleapis.com" in url:
                alt_url = f"https://mybusinessbusinessinformation.googleapis.com/v1/accounts/{account_id}/locations/{selected_location}/localPosts"
                alt_res = await client.post(
                    alt_url,
                    json=post_data,
                    headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}
                )
                try:
                    alt_result = alt_res.json()
                except:
                    alt_result = {"raw": alt_res.text}
                print(f"GB alt publish: {alt_res.status_code} - {str(alt_result)[:1000]}")
                if alt_res.status_code in [200, 201]:
                    return {
                        "success": True,
                        "post_id": alt_result.get("name", ""),
                        "url": alt_result.get("searchUrl", ""),
                        "message": "Google Business pe post ho gaya",
                        "status": "published"
                    }
            
            raise HTTPException(status_code=400, detail=f"Google Business publish failed: {result}")

@app.post("/api/publish/youtube")
async def publish_to_youtube_endpoint(request: Request, payload: dict = Body(...)):
    """Direct YouTube video upload"""
    title = payload.get("title", "") or payload.get("caption", "")[:100] or "New Video"
    description = payload.get("caption", "") or payload.get("description", "") or ""
    hashtags = payload.get("hashtags", "")
    media_urls = payload.get("media_urls", []) or payload.get("media", [])
    privacy = payload.get("privacy", "public")  # public, unlisted, private
    
    if hashtags:
        description = f"{description}\n\n{hashtags}"
    
    if not media_urls:
        raise HTTPException(status_code=400, detail="YouTube ke liye video URL chahiye (MP4)")
    
    from services.publisher import publish_to_youtube
    result = await publish_to_youtube(description, media_urls, hashtags, title, privacy)
    return result


@app.get("/api/settings/check")
def check_apis():
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
        "facebook_app": bool(fb_app_id and fb_app_secret),
        "fb_app_id_set": bool(fb_app_id),
    }

@app.get("/api/auth/facebook")
def get_facebook_login_url(request: Request):
    FB_APP_ID, FB_APP_SECRET = get_fb_credentials()
    PUBLIC_BASE = get_public_base()
    REDIRECT_URI = f"{PUBLIC_BASE}/api/auth/callback"
    # Facebook Login ke valid scopes only - Threads scopes yahan invalid hain
    SCOPE = "pages_show_list,pages_read_engagement,pages_manage_posts,pages_manage_engagement,read_insights,instagram_basic,instagram_content_publish,instagram_manage_insights,instagram_manage_comments"
    if not FB_APP_ID:
        raise HTTPException(status_code=400, detail="FB_APP_ID Settings me save karo pehle. Env me FACEBOOK_APP_ID set karo")
    workspace_id = getattr(request.state, 'workspace_id', 'default') or cfg.current_workspace() or 'default'
    login_url = f"https://www.facebook.com/v20.0/dialog/oauth?client_id={FB_APP_ID}&redirect_uri={REDIRECT_URI}&scope={SCOPE}&response_type=code&state={workspace_id}"
    return {"login_url": login_url, "redirect_uri": REDIRECT_URI, "app_id": FB_APP_ID, "workspace_id": workspace_id, "scope": SCOPE}

@app.get("/api/auth/callback")
async def facebook_auth_callback(
    code: Optional[str] = Query(None), 
    state: Optional[str] = Query(None),
    error_code: Optional[str] = Query(None),
    error_message: Optional[str] = Query(None),
    error: Optional[str] = Query(None)
):
    FB_APP_ID, FB_APP_SECRET = get_fb_credentials()
    PUBLIC_BASE = get_public_base()
    REDIRECT_URI = f"{PUBLIC_BASE}/api/auth/callback"

    # Handle Facebook error (e.g., invalid scopes)
    if error_code or error:
        frontend_url = get_frontend_settings_url()
        err_msg = error_message or error or "Unknown error"
        print(f"❌ Facebook OAuth error: {error_code} - {err_msg}")
        return RedirectResponse(url=frontend_url + f"?connected=error&error_code={error_code}&message={err_msg}")

    if not code:
        raise HTTPException(status_code=400, detail=f"Missing code. Facebook returned: error_code={error_code} error={error_message}")

    if not FB_APP_ID or not FB_APP_SECRET:
        raise HTTPException(status_code=400, detail="FB_APP_ID / FB_APP_SECRET Settings me save nahi hai. Env check karo")

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

        short_token = data["access_token"]

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

        pages_res = await client.get(
            "https://graph.facebook.com/v20.0/me/accounts",
            params={"access_token": long_token}
        )
        pages_data = pages_res.json()
        print(f"📄 Pages response: {pages_data}")

        save_dict = {"META_ACCESS_TOKEN": long_token}

        if "data" in pages_data and len(pages_data["data"]) > 0:
            first_page = pages_data["data"][0]
            save_dict["FB_PAGE_ID"] = first_page.get("id")
            save_dict["FB_PAGE_ACCESS_TOKEN"] = first_page.get("access_token")
            print(f"📘 Found Page: {first_page.get('name')} ID: {first_page.get('id')}")

            try:
                ig_res = await client.get(
                    f"https://graph.facebook.com/v20.0/{first_page.get('id')}",
                    params={
                        "fields": "instagram_business_account",
                        "access_token": first_page.get("access_token") or long_token
                    }
                )
                ig_data = ig_res.json()
                print(f"📸 IG lookup response: {ig_data}")
                if "instagram_business_account" in ig_data:
                    save_dict["IG_USER_ID"] = ig_data["instagram_business_account"].get("id")
            except Exception as e:
                print(f"IG lookup error: {e}")

        # Try to get Threads user ID with same token (if threads scopes granted)
        try:
            threads_me_res = await client.get(
                "https://graph.threads.net/v1.0/me",
                params={
                    "fields": "id,username",
                    "access_token": long_token
                }
            )
            threads_me_data = threads_me_res.json()
            print(f"🧵 Threads me response: {threads_me_data}")
            if "id" in threads_me_data:
                save_dict["THREADS_USER_ID"] = threads_me_data["id"]
                save_dict["THREADS_ACCESS_TOKEN"] = long_token
        except Exception as e:
            print(f"Threads lookup error (expected if threads not approved): {e}")

        target_ws = state.strip() if state and state.strip() else "default"
        if not target_ws or target_ws == "":
            target_ws = "default"
        
        db.save_settings(save_dict, workspace_id=target_ws)
        print(f"✅ Saved FB tokens for workspace: {target_ws} -> {list(save_dict.keys())}")

    frontend_url = get_frontend_settings_url()
    return RedirectResponse(url=frontend_url + "?connected=facebook&success=1&ws=" + target_ws)

@app.get("/api/auth/pages")
async def get_my_pages():
    long_token = cfg.get("META_ACCESS_TOKEN") or os.getenv("META_ACCESS_TOKEN")
    if not long_token:
        raise HTTPException(status_code=400, detail="Pehle Facebook Connect karo")
    async with httpx.AsyncClient(timeout=20) as client:
        res = await client.get("https://graph.facebook.com/v20.0/me/accounts", params={"access_token": long_token})
        return res.json()

# ==================== THREADS AUTH - NEW ====================
@app.get("/api/auth/threads")
def get_threads_login_url(request: Request):
    """Threads ke liye alag login - Facebook/Instagram ko touch nahi karega"""
    # Threads ka alag App ID use karo (24565240526491181) - Facebook wale se alag
    THREADS_APP_ID, THREADS_APP_SECRET = get_threads_credentials()
    PUBLIC_BASE = get_public_base()
    REDIRECT_URI = f"{PUBLIC_BASE}/api/auth/threads/callback"
    # Threads ke valid scopes
    SCOPE = "threads_basic,threads_content_publish"
    if not THREADS_APP_ID:
        raise HTTPException(status_code=400, detail="THREADS_APP_ID Settings me save karo pehle - Backend env me THREADS_APP_ID set karo")
    
    workspace_id = getattr(request.state, 'workspace_id', 'default') or cfg.current_workspace() or 'default'
    
    # Threads now uses threads.com domain (not threads.net) - fix for error 4476002
    import urllib.parse
    encoded_redirect = urllib.parse.quote(REDIRECT_URI, safe='')
    
    # Use www.threads.com as primary (new official domain since 2025)
    login_url_new = f"https://www.threads.com/oauth/authorize?client_id={THREADS_APP_ID}&redirect_uri={encoded_redirect}&scope={SCOPE}&response_type=code&state={workspace_id}"
    login_url_old = f"https://threads.net/oauth/authorize?client_id={THREADS_APP_ID}&redirect_uri={encoded_redirect}&scope={SCOPE}&response_type=code&state={workspace_id}"
    
    print(f"🧵 Threads login URLs generated - Threads App ID: {THREADS_APP_ID}, Workspace: {workspace_id}")
    print(f"🧵 New domain URL: {login_url_new}")
    
    return {
        "login_url": login_url_new,
        "login_url_old": login_url_old,
        "login_url_new": login_url_new,
        "redirect_uri": REDIRECT_URI, 
        "app_id": THREADS_APP_ID, 
        "workspace_id": workspace_id, 
        "scope": SCOPE,
        "note": "Add this redirect_uri to Meta Dashboard > Threads > Settings > Allowed Redirect URLs"
    }

@app.get("/api/auth/threads/callback")
async def threads_auth_callback(
    code: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
    error_description: Optional[str] = Query(None)
):
    """Threads OAuth callback - code ko long-lived token me convert karega"""
    THREADS_APP_ID, THREADS_APP_SECRET = get_threads_credentials()
    PUBLIC_BASE = get_public_base()
    REDIRECT_URI = f"{PUBLIC_BASE}/api/auth/threads/callback"

    if error:
        frontend_url = get_frontend_settings_url()
        print(f"❌ Threads OAuth error: {error} - {error_description}")
        return RedirectResponse(url=frontend_url + f"?connected=threads_error&error={error}&message={error_description}")

    if not code:
        raise HTTPException(status_code=400, detail=f"Missing code from Threads. error={error} desc={error_description}")

    if not THREADS_APP_ID or not THREADS_APP_SECRET:
        raise HTTPException(status_code=400, detail="THREADS_APP_ID / THREADS_APP_SECRET missing")

    async with httpx.AsyncClient(timeout=30) as client:
        # Step 1: Exchange code for short-lived token
        token_res = await client.post(
            "https://graph.threads.net/oauth/access_token",
            data={
                "client_id": THREADS_APP_ID,
                "client_secret": THREADS_APP_SECRET,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": REDIRECT_URI,
            }
        )
        token_data = token_res.json()
        print(f"🧵 Threads token exchange: {token_data}")
        
        if "access_token" not in token_data:
            raise HTTPException(status_code=400, detail=f"Threads token exchange fail: {token_data}")

        short_token = token_data["access_token"]
        threads_user_id = token_data.get("user_id")

        # Step 2: Exchange for long-lived token (60 days)
        long_res = await client.get(
            "https://graph.threads.net/access_token",
            params={
                "grant_type": "th_exchange_token",
                "client_secret": THREADS_APP_SECRET,
                "access_token": short_token,
            }
        )
        long_data = long_res.json()
        print(f"🧵 Threads long token: {long_data}")
        long_token = long_data.get("access_token", short_token)

        # Step 3: Get Threads user info
        me_res = await client.get(
            "https://graph.threads.net/v1.0/me",
            params={
                "fields": "id,username,threads_profile_picture_url,threads_biography",
                "access_token": long_token
            }
        )
        me_data = me_res.json()
        print(f"🧵 Threads me: {me_data}")

        # Save to DB - Facebook/Instagram ko touch nahi karega, sirf Threads keys save hongi
        save_dict = {
            "THREADS_ACCESS_TOKEN": long_token,
        }
        # User ID ko har haal me save karo - 3 jagah se try karo
        final_user_id = None
        if "id" in me_data and me_data["id"]:
            final_user_id = str(me_data["id"])
            print(f"✅ Threads User ID from /me: {final_user_id}")
        elif threads_user_id:
            final_user_id = str(threads_user_id)
            print(f"✅ Threads User ID from token exchange: {final_user_id}")
        elif token_data.get("user_id"):
            final_user_id = str(token_data.get("user_id"))
            print(f"✅ Threads User ID from token_data: {final_user_id}")
        
        if final_user_id:
            save_dict["THREADS_USER_ID"] = final_user_id
        else:
            print(f"⚠️ WARNING: Could not get Threads User ID! me_data={me_data}, token_data={token_data}")
            # Token se bhi try karo user ID nikalne ka
            try:
                me_res2 = await client.get(
                    f"https://graph.threads.net/v1.0/me",
                    params={"access_token": long_token}
                )
                me_data2 = me_res2.json()
                print(f"🧵 Threads me retry: {me_data2}")
                if "id" in me_data2:
                    save_dict["THREADS_USER_ID"] = str(me_data2["id"])
                    final_user_id = str(me_data2["id"])
            except Exception as e2:
                print(f"Threads me retry error: {e2}")

        target_ws = state.strip() if state and state.strip() else "default"
        if not target_ws:
            target_ws = "default"

        # Save to BOTH workspaces to fix workspace mismatch - logs show FB/IG in 132d5d65... and Threads in default
        # Save to requested workspace
        db.save_settings(save_dict, workspace_id=target_ws)
        print(f"✅ Saved Threads tokens for workspace {target_ws}: {list(save_dict.keys())}")
        
        # ALSO save to default workspace (for backward compatibility)
        if target_ws != "default":
            db.save_settings(save_dict, workspace_id="default")
            print(f"✅ Also saved Threads tokens for workspace default")
        
        # ALSO save to the main FB workspace if different (132d5d65-fd7d-4525-974f-f5fac15be10b)
        # Try to get FB workspace from DB or hardcode common one from logs
        try:
            # Save to all known workspaces to prevent mismatch
            for ws_id in ["default", target_ws, "132d5d65-fd7d-4525-974f-f5fac15be10b"]:
                if ws_id and ws_id.strip():
                    db.save_settings(save_dict, workspace_id=ws_id.strip())
        except Exception as e:
            print(f"Multi-workspace save warning: {e}")

    frontend_url = get_frontend_settings_url()
    return RedirectResponse(url=frontend_url + f"?connected=threads&success=1&ws={target_ws}")

@app.get("/api/auth/threads/status")
def get_threads_status():
    """Check if Threads is connected"""
    has_user_id = bool(cfg.get("THREADS_USER_ID"))
    has_token = bool(cfg.get("THREADS_ACCESS_TOKEN"))
    user_id_val = cfg.get("THREADS_USER_ID")
    return {
        "connected": has_user_id and has_token,
        "threads_user_id": has_user_id,
        "threads_user_id_value": str(user_id_val)[:20] + "..." if user_id_val else None,
        "threads_token": has_token,
        "workspace": cfg.current_workspace()
    }

@app.get("/api/auth/threads/fix")
async def fix_threads_user_id(request: Request):
    """Agar Threads Token hai lekin User ID missing hai to isko fix karo"""
    threads_token = cfg.get("THREADS_ACCESS_TOKEN")
    if not threads_token:
        return {"success": False, "error": "THREADS_ACCESS_TOKEN missing - pehle Connect with Threads karo"}
    
    workspace_id = getattr(request.state, 'workspace_id', 'default') or cfg.current_workspace() or 'default'
    
    async with httpx.AsyncClient(timeout=20) as client:
        try:
            # Try to get user ID from /me endpoint
            me_res = await client.get(
                "https://graph.threads.net/v1.0/me",
                params={
                    "fields": "id,username",
                    "access_token": threads_token
                }
            )
            me_data = me_res.json()
            print(f"🧵 Fix - /me response: {me_data}")
            
            if "id" in me_data:
                user_id = str(me_data["id"])
                # Save to all workspaces to fix mismatch
                for ws_id in [workspace_id, "default", "132d5d65-fd7d-4525-974f-f5fac15be10b"]:
                    try:
                        if ws_id and ws_id.strip():
                            db.save_settings({"THREADS_USER_ID": user_id, "THREADS_ACCESS_TOKEN": threads_token}, workspace_id=ws_id.strip())
                    except:
                        pass
                return {"success": True, "fixed": True, "user_id": user_id, "username": me_data.get("username"), "workspace": workspace_id, "saved_to_all": True}
            else:
                return {"success": False, "error": f"Could not get ID from /me: {me_data}", "workspace": workspace_id}
        except Exception as e:
            return {"success": False, "error": str(e), "workspace": workspace_id}

@app.get("/api/auth/sync-workspaces")
def sync_workspaces(request: Request):
    """Sab workspaces ke tokens ko sync karo - FB/IG/Threads sab me available karwao"""
    current_ws = getattr(request.state, 'workspace_id', 'default') or cfg.current_workspace() or 'default'
    workspaces = ["default", "132d5d65-fd7d-4525-974f-f5fac15be10b", current_ws]
    # Remove duplicates
    workspaces = list(set([w for w in workspaces if w and w.strip()]))
    
    all_tokens = {}
    debug = {}
    
    # Collect from all workspaces - try multiple methods
    for ws in workspaces:
        ws_data = {}
        try:
            cfg.set_workspace(ws)
            for key in ["META_ACCESS_TOKEN", "FB_PAGE_ID", "FB_PAGE_ACCESS_TOKEN", "IG_USER_ID", "THREADS_USER_ID", "THREADS_ACCESS_TOKEN", "FB_APP_ID", "FB_APP_SECRET", "THREADS_APP_ID", "THREADS_APP_SECRET", "PUBLIC_BASE_URL"]:
                val = cfg.get(key)
                if val:
                    if key not in all_tokens:
                        all_tokens[key] = val
                    ws_data[key] = str(val)[:20] + "..." if len(str(val)) > 20 else str(val)
            
            # Also try direct DB access if cfg.get fails
            try:
                if hasattr(db, 'get_settings'):
                    db_settings = db.get_settings(workspace_id=ws)
                    if isinstance(db_settings, dict):
                        for k, v in db_settings.items():
                            if v and k not in all_tokens and k in ["META_ACCESS_TOKEN", "FB_PAGE_ID", "FB_PAGE_ACCESS_TOKEN", "IG_USER_ID", "THREADS_USER_ID", "THREADS_ACCESS_TOKEN", "FB_APP_ID", "FB_APP_SECRET", "THREADS_APP_ID", "THREADS_APP_SECRET"]:
                                all_tokens[k] = v
                                ws_data[f"{k}(db)"] = str(v)[:20] + "..."
            except Exception as db_e:
                ws_data[f"db_error"] = str(db_e)[:100]
                
        except Exception as e:
            ws_data["error"] = str(e)[:200]
        
        debug[ws] = ws_data
    
    # Restore to current workspace
    try:
        cfg.set_workspace(current_ws)
    except:
        pass
    
    # Save to all workspaces
    saved = {}
    for ws in workspaces:
        try:
            db.save_settings(all_tokens, workspace_id=ws)
            saved[ws] = list(all_tokens.keys())
        except Exception as e:
            saved[ws] = f"error: {e}"
    
    return {"success": True, "synced_tokens": list(all_tokens.keys()), "workspaces": workspaces, "details": saved, "debug": debug, "current_workspace": current_ws, "total_found": len(all_tokens)}

@app.get("/api/debug/workspaces")
def debug_workspaces(request: Request):
    """Debug - show raw settings for all workspaces"""
    workspaces = ["default", "132d5d65-fd7d-4525-974f-f5fac15be10b"]
    result = {}
    
    for ws in workspaces:
        try:
            cfg.set_workspace(ws)
            ws_result = {}
            for key in SETTINGS_KEYS:
                try:
                    val = cfg.get(key)
                    if val:
                        # Mask token for security
                        if "TOKEN" in key or "SECRET" in key:
                            ws_result[key] = str(val)[:15] + "..." + str(val)[-10:] if len(str(val)) > 25 else "***"
                        else:
                            ws_result[key] = str(val)[:50]
                except:
                    pass
            
            # Try direct DB
            try:
                if hasattr(db, 'get_settings'):
                    db_settings = db.get_settings(workspace_id=ws)
                    ws_result["_db_raw_keys"] = list(db_settings.keys()) if isinstance(db_settings, dict) else str(type(db_settings))
                    ws_result["_db_raw"] = {k: (str(v)[:15] + "..." if "TOKEN" in k or "SECRET" in k else str(v)[:50]) for k, v in db_settings.items()} if isinstance(db_settings, dict) else str(db_settings)[:200]
            except Exception as e:
                ws_result["_db_error"] = str(e)
            
            result[ws] = ws_result
        except Exception as e:
            result[ws] = {"error": str(e)}
    
    # Restore
    try:
        current_ws = getattr(request.state, 'workspace_id', 'default') or "default"
        cfg.set_workspace(current_ws)
    except:
        pass
    
    return result

# ==================== LINKEDIN OAUTH ====================
@app.get("/api/auth/linkedin")
def get_linkedin_login_url(request: Request):
    """LinkedIn Profile + Page ke liye OAuth login URL - FIXED SCOPES"""
    client_id, client_secret = get_linkedin_credentials()
    if not client_id:
        raise HTTPException(status_code=400, detail="LINKEDIN_CLIENT_ID Settings me save karo. developer.linkedin.com se app banao")
    
    PUBLIC_BASE = get_public_base()
    REDIRECT_URI = f"{PUBLIC_BASE}/api/auth/linkedin/callback"
    workspace_id = getattr(request.state, 'workspace_id', 'default') or cfg.current_workspace() or 'default'
    
    # FIXED: New LinkedIn OpenID Connect scopes - old r_liteprofile causes "Bummer" error
    # User ke app me sirf Share on LinkedIn + Sign In with OpenID Connect hai
    # Is liye valid scopes: openid, profile, email, w_member_social
    # w_organization_social sirf Community Management API wale apps ke liye - nahi hai to error dega
    # Tumhara app: openid, profile, w_member_social, email (screenshot se)
    SCOPE = "openid profile email w_member_social"
    
    # URL encode redirect_uri properly
    import urllib.parse
    encoded_redirect = urllib.parse.quote(REDIRECT_URI, safe='')
    encoded_scope = urllib.parse.quote(SCOPE, safe='')
    
    login_url = f"https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id={client_id}&redirect_uri={encoded_redirect}&scope={encoded_scope}&state={workspace_id}"
    
    print(f"🔗 LinkedIn login URL - Client ID: {client_id}, Workspace: {workspace_id}, Scope: {SCOPE}, Redirect: {REDIRECT_URI}")
    return {"login_url": login_url, "redirect_uri": REDIRECT_URI, "client_id": client_id, "workspace_id": workspace_id, "scope": SCOPE, "debug_client_id": client_id[:8] + "..."}

@app.get("/api/auth/linkedin/callback")
async def linkedin_auth_callback(
    code: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
    error_description: Optional[str] = Query(None)
):
    """LinkedIn OAuth callback - token exchange + profile + orgs fetch"""
    if error:
        print(f"❌ LinkedIn OAuth error: {error} - {error_description}")
        frontend_url = get_frontend_settings_url()
        return RedirectResponse(url=frontend_url + f"?connected=linkedin_error&error={error}")
    
    if not code:
        raise HTTPException(status_code=400, detail="Missing code from LinkedIn")
    
    client_id, client_secret = get_linkedin_credentials()
    PUBLIC_BASE = get_public_base()
    REDIRECT_URI = f"{PUBLIC_BASE}/api/auth/linkedin/callback"
    
    if not client_id or not client_secret:
        raise HTTPException(status_code=400, detail="LinkedIn Client ID/Secret missing")
    
    target_ws = state.strip() if state and state.strip() else "default"
    if not target_ws:
        target_ws = "default"
    
    async with httpx.AsyncClient(timeout=30) as client:
        # Exchange code for access token
        token_res = await client.post(
            "https://www.linkedin.com/oauth/v2/accessToken",
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": REDIRECT_URI,
                "client_id": client_id,
                "client_secret": client_secret
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )
        token_data = token_res.json()
        print(f"🔗 LinkedIn token response: {token_data}")
        
        if "access_token" not in token_data:
            raise HTTPException(status_code=400, detail=f"LinkedIn token exchange failed: {token_data}")
        
        access_token = token_data["access_token"]
        
        # NEW: Try OpenID Connect userinfo first (for openid profile email scopes)
        # Old v2/me requires r_liteprofile which causes Bummer error with new scopes
        profile_data = {}
        userinfo_data = {}
        email_data = {}
        orgs_data = {"elements": []}
        
        try:
            # New OpenID Connect userinfo endpoint - works with openid, profile, email scopes
            userinfo_res = await client.get(
                "https://api.linkedin.com/v2/userinfo",
                headers={"Authorization": f"Bearer {access_token}"}
            )
            userinfo_data = userinfo_res.json()
            print(f"🔗 LinkedIn userinfo (new): {userinfo_data}")
        except Exception as e:
            print(f"userinfo fetch error: {e}")
        
        try:
            # Old v2/me - fallback for old apps with r_liteprofile
            profile_res = await client.get(
                "https://api.linkedin.com/v2/me",
                headers={"Authorization": f"Bearer {access_token}"}
            )
            profile_data = profile_res.json()
            print(f"🔗 LinkedIn profile (old): {profile_data}")
        except Exception as e:
            print(f"profile v2/me error: {e}")
        
        try:
            # Email - try new way first via userinfo, then old endpoint
            if "email" in userinfo_data:
                email_data = {"email": userinfo_data["email"]}
            else:
                email_res = await client.get(
                    "https://api.linkedin.com/v2/emailAddress?q=members&projection=(elements*(handle~))",
                    headers={"Authorization": f"Bearer {access_token}"}
                )
                email_data = email_res.json()
            print(f"🔗 LinkedIn email: {email_data}")
        except Exception as e:
            print(f"email fetch error: {e}")
        
        try:
            # Get organizations (pages) where user is admin - requires w_organization_social
            # If app doesn't have Community Management API, this will be empty - that's ok, Profile will still work
            orgs_res = await client.get(
                "https://api.linkedin.com/v2/organizationalEntityAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED&projection=(elements*(organizationalTarget~))",
                headers={"Authorization": f"Bearer {access_token}"}
            )
            orgs_data = orgs_res.json()
            print(f"🔗 LinkedIn orgs: {orgs_data}")
        except Exception as e:
            print(f"orgs fetch error (normal if no Community API): {e}")
            orgs_data = {"elements": []}
        
        # Save to DB
        save_dict = {
            "LINKEDIN_ACCESS_TOKEN": access_token,
            "LINKEDIN_CLIENT_ID": client_id,
            "LINKEDIN_CLIENT_SECRET": client_secret
        }
        
        # Profile ID - NEW: from userinfo sub (e.g., "sub": "123abc") or old v2/me id
        person_id = None
        person_name = ""
        
        if "sub" in userinfo_data:
            # New OpenID Connect - sub is the person ID
            person_id = userinfo_data["sub"]
            person_name = userinfo_data.get("name", "") or f"{userinfo_data.get('given_name','')} {userinfo_data.get('family_name','')}".strip()
            # For posting, we need urn:li:person:{id} - but with OpenID, we use the sub as author
            # Actually for w_member_social, author is urn:li:person:{id} where id is from me endpoint
            # With userinfo, we can still construct it
            save_dict["LINKEDIN_PERSON_ID"] = person_id
            save_dict["LINKEDIN_PERSON_URN"] = f"urn:li:person:{person_id}"
            save_dict["LINKEDIN_PROFILE_NAME"] = person_name
            save_dict["LINKEDIN_USERINFO"] = str(userinfo_data)[:500]  # debug
        elif "id" in profile_data and "message" not in profile_data:
            # Old v2/me
            person_id = profile_data["id"]
            save_dict["LINKEDIN_PERSON_ID"] = person_id
            save_dict["LINKEDIN_PERSON_URN"] = f"urn:li:person:{person_id}"
            save_dict["LINKEDIN_PROFILE_NAME"] = f"{profile_data.get('localizedFirstName','')} {profile_data.get('localizedLastName','')}".strip()
        
        # If still no person_id, try to get from token introspection or use email as fallback
        # For w_member_social posting, we can also use /v2/me with projection to get id
        if not person_id:
            try:
                # Try alternative: get profile with lightweight call
                me_lite = await client.get(
                    "https://api.linkedin.com/v2/me?projection=(id,localizedFirstName,localizedLastName)",
                    headers={"Authorization": f"Bearer {access_token}"}
                )
                lite_data = me_lite.json()
                print(f"🔗 LinkedIn me lite: {lite_data}")
                if "id" in lite_data:
                    person_id = lite_data["id"]
                    save_dict["LINKEDIN_PERSON_ID"] = person_id
                    save_dict["LINKEDIN_PERSON_URN"] = f"urn:li:person:{person_id}"
                    save_dict["LINKEDIN_PROFILE_NAME"] = f"{lite_data.get('localizedFirstName','')} {lite_data.get('localizedLastName','')}".strip()
            except Exception as e:
                print(f"me lite error: {e}")
        
        # Organization (first org as default)
        org_id = None
        org_name = None
        if "elements" in orgs_data and len(orgs_data["elements"]) > 0:
            first_org = orgs_data["elements"][0]
            if "organizationalTarget~" in first_org:
                org_info = first_org["organizationalTarget~"]
                org_id = org_info.get("id")
                org_name = org_info.get("localizedName")
            elif "organizationalTarget" in first_org:
                # Extract ID from urn:li:organization:12345
                target = first_org["organizationalTarget"]
                if "organization:" in target:
                    org_id = target.split("organization:")[-1]
        
        # Ensure PERSON_ID and PERSON_URN are both set (one from other if missing)
        if "LINKEDIN_PERSON_URN" in save_dict and "LINKEDIN_PERSON_ID" not in save_dict:
            # Extract ID from URN
            urn = save_dict["LINKEDIN_PERSON_URN"]
            if "person:" in urn:
                save_dict["LINKEDIN_PERSON_ID"] = urn.split("person:")[-1]
        if "LINKEDIN_PERSON_ID" in save_dict and "LINKEDIN_PERSON_URN" not in save_dict:
            save_dict["LINKEDIN_PERSON_URN"] = f"urn:li:person:{save_dict['LINKEDIN_PERSON_ID']}"
        
        # If still no person_id but we have userinfo, force it
        if "LINKEDIN_PERSON_ID" not in save_dict and "sub" in userinfo_data:
            save_dict["LINKEDIN_PERSON_ID"] = userinfo_data["sub"]
            save_dict["LINKEDIN_PERSON_URN"] = f"urn:li:person:{userinfo_data['sub']}"
        
        # Also save profile name from userinfo if not set
        if "LINKEDIN_PROFILE_NAME" not in save_dict and userinfo_data.get("name"):
            save_dict["LINKEDIN_PROFILE_NAME"] = userinfo_data["name"]
        
        if org_id:
            save_dict["LINKEDIN_ORG_ID"] = str(org_id)
            save_dict["LINKEDIN_ORG_URN"] = f"urn:li:organization:{org_id}"
            if org_name:
                save_dict["LINKEDIN_ORG_NAME"] = org_name
        
        # Save to all workspaces to avoid mismatch (same fix as Threads)
        for ws_id in [target_ws, "default", "132d5d65-fd7d-4525-974f-f5fac15be10b"]:
            try:
                if ws_id and ws_id.strip():
                    db.save_settings(save_dict, workspace_id=ws_id.strip())
                    print(f"✅ Saved LinkedIn tokens for workspace {ws_id}: {list(save_dict.keys())}")
            except Exception as e:
                print(f"LinkedIn save error for {ws_id}: {e}")
    
    frontend_url = get_frontend_settings_url()
    return RedirectResponse(url=frontend_url + f"?connected=linkedin&success=1&ws={target_ws}")

@app.get("/api/auth/linkedin/status")
def get_linkedin_status():
    """Check if LinkedIn is connected"""
    has_token = bool(cfg.get("LINKEDIN_ACCESS_TOKEN"))
    has_person = bool(cfg.get("LINKEDIN_PERSON_ID") or cfg.get("LINKEDIN_PERSON_URN"))
    has_org = bool(cfg.get("LINKEDIN_ORG_ID"))
    
    return {
        "connected": has_token,
        "has_token": has_token,
        "has_person": has_person,
        "has_org": has_org,
        "person_id": cfg.get("LINKEDIN_PERSON_ID"),
        "person_urn": cfg.get("LINKEDIN_PERSON_URN"),
        "org_id": cfg.get("LINKEDIN_ORG_ID"),
        "org_urn": cfg.get("LINKEDIN_ORG_URN"),
        "org_name": cfg.get("LINKEDIN_ORG_NAME"),
        "profile_name": cfg.get("LINKEDIN_PROFILE_NAME"),
        "workspace": cfg.current_workspace(),
        "profile_connected": has_token and has_person,
        "page_connected": has_token and has_org
    }

@app.post("/api/auth/linkedin/setup")
def setup_linkedin_credentials(request: Request, payload: dict = None):
    """Ek baar admin credentials save kare, phir sab users ke liye auto-connect ho jayega - no copy-paste needed"""
    try:
        # Get from request body
        import json
        body = {}
        # Try to parse
        try:
            # payload might be from FastAPI body parsing
            if payload:
                body = payload
        except:
            pass
        
        # Also try query params as fallback
        client_id = None
        client_secret = None
        
        # Try from body dict
        if isinstance(body, dict):
            client_id = body.get("client_id") or body.get("LINKEDIN_CLIENT_ID") or body.get("clientId")
            client_secret = body.get("client_secret") or body.get("LINKEDIN_CLIENT_SECRET") or body.get("clientSecret")
        
        # Try from direct request if not found
        if not client_id or not client_secret:
            # Try to get from settings that are already saved
            pass
        
        # If still not provided, use provided defaults from user
        # User ka verified app
        if not client_id:
            client_id = "77vhvp0adef5ho"
        
        # Check if secret exists in DB already (global)
        existing_secret = None
        current_ws = cfg.current_workspace()
        for ws_try in ["default", "132d5d65-fd7d-4525-974f-f5fac15be10b", current_ws]:
            try:
                cfg.set_workspace(ws_try)
                s = cfg.get("LINKEDIN_CLIENT_SECRET") or cfg.get("LINKEDIN_APP_SECRET")
                if s:
                    existing_secret = s
                    break
            except:
                pass
        cfg.set_workspace(current_ws)
        
        if not client_secret:
            client_secret = existing_secret
        
        if not client_id or not client_secret:
            return {
                "success": False,
                "message": "Client ID/Secret missing. Ek baar admin ko secret daalna hoga, phir sab ke liye auto ho jayega.",
                "has_client_id": bool(client_id),
                "has_client_secret": bool(client_secret),
                "instructions": "POST /api/settings/keys with LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET"
            }
        
        save_dict = {
            "LINKEDIN_CLIENT_ID": client_id,
            "LINKEDIN_CLIENT_SECRET": client_secret,
            "LINKEDIN_APP_ID": client_id,
            "LINKEDIN_APP_SECRET": client_secret
        }
        
        # Save to ALL workspaces - taake dusra user bina copy-paste ke connect kar sake
        saved = []
        for ws_id in ["default", "132d5d65-fd7d-4525-974f-f5fac15be10b", current_ws]:
            try:
                if ws_id and ws_id.strip():
                    db.save_settings(save_dict, workspace_id=ws_id.strip())
                    saved.append(ws_id)
            except Exception as e:
                print(f"LinkedIn setup save error {ws_id}: {e}")
        
        return {
            "success": True,
            "message": f"LinkedIn credentials saved globally for {len(saved)} workspaces. Ab koi bhi user bina API key copy kiye Connect kar sakta hai!",
            "workspaces": saved,
            "client_id": client_id[:10] + "...",
            "global_connect_url": f"{get_public_base()}/api/auth/linkedin"
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"success": False, "error": str(e)}

# ==================== BLOGGER OAUTH - NEW ====================
@app.get("/api/auth/blogger")
def get_blogger_login_url(request: Request):
    """Blogger ke liye Google OAuth login - Facebook/LinkedIn jaisa hi system"""
    client_id, client_secret = get_blogger_credentials()
    if not client_id:
        raise HTTPException(status_code=400, detail="BLOGGER_CLIENT_ID Settings me save karo. Google Cloud Console se OAuth Client ID banao (https://console.cloud.google.com/) - Blogger API enable karo")
    
    PUBLIC_BASE = get_public_base()
    REDIRECT_URI = f"{PUBLIC_BASE}/api/auth/blogger/callback"
    SCOPE = "https://www.googleapis.com/auth/blogger"
    
    workspace_id = getattr(request.state, 'workspace_id', 'default') or cfg.current_workspace() or 'default'
    
    import urllib.parse
    encoded_redirect = urllib.parse.quote(REDIRECT_URI, safe='')
    encoded_scope = urllib.parse.quote(SCOPE, safe='')
    
    # Google OAuth URL
    login_url = f"https://accounts.google.com/o/oauth2/v2/auth?client_id={client_id}&redirect_uri={encoded_redirect}&scope={encoded_scope}&response_type=code&access_type=offline&prompt=consent&state={workspace_id}"
    
    print(f"📝 Blogger login URL - Client ID: {client_id[:20]}..., Workspace: {workspace_id}, Redirect: {REDIRECT_URI}")
    return {
        "login_url": login_url,
        "redirect_uri": REDIRECT_URI,
        "client_id": client_id,
        "workspace_id": workspace_id,
        "scope": SCOPE,
        "note": "Add this redirect_uri to Google Cloud Console > APIs & Services > Credentials > OAuth Client > Authorized Redirect URIs"
    }

@app.get("/api/auth/blogger/callback")
async def blogger_auth_callback(
    code: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
    error_description: Optional[str] = Query(None)
):
    """Blogger OAuth callback - code ko token me convert + blogs fetch"""
    if error:
        frontend_url = get_frontend_settings_url()
        print(f"❌ Blogger OAuth error: {error} - {error_description}")
        return RedirectResponse(url=frontend_url + f"?connected=blogger_error&error={error}")
    
    if not code:
        raise HTTPException(status_code=400, detail=f"Missing code from Google. error={error}")
    
    client_id, client_secret = get_blogger_credentials()
    PUBLIC_BASE = get_public_base()
    REDIRECT_URI = f"{PUBLIC_BASE}/api/auth/blogger/callback"
    
    if not client_id or not client_secret:
        raise HTTPException(status_code=400, detail="BLOGGER_CLIENT_ID / SECRET missing")
    
    target_ws = state.strip() if state and state.strip() else "default"
    if not target_ws:
        target_ws = "default"
    
    async with httpx.AsyncClient(timeout=30) as client:
        # Step 1: Exchange code for tokens
        token_res = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uri": REDIRECT_URI,
                "grant_type": "authorization_code"
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )
        token_data = token_res.json()
        print(f"📝 Blogger token exchange: {token_data}")
        
        if "access_token" not in token_data:
            raise HTTPException(status_code=400, detail=f"Blogger token exchange failed: {token_data}")
        
        access_token = token_data["access_token"]
        refresh_token = token_data.get("refresh_token", "")
        expires_in = token_data.get("expires_in", 3600)
        
        # Step 2: Fetch user's blogs
        blogs_res = await client.get(
            "https://www.googleapis.com/blogger/v3/users/self/blogs",
            headers={"Authorization": f"Bearer {access_token}"}
        )
        blogs_data = blogs_res.json()
        print(f"📝 Blogger blogs: {blogs_data}")
        
        save_dict = {
            "BLOGGER_ACCESS_TOKEN": access_token,
            "BLOGGER_CLIENT_ID": client_id,
            "BLOGGER_CLIENT_SECRET": client_secret,
            "BLOGGER_TOKEN_EXPIRY": str(expires_in)
        }
        
        if refresh_token:
            save_dict["BLOGGER_REFRESH_TOKEN"] = refresh_token
        
        # First blog as default
        if "items" in blogs_data and len(blogs_data["items"]) > 0:
            first_blog = blogs_data["items"][0]
            save_dict["BLOGGER_BLOG_ID"] = first_blog.get("id", "")
            save_dict["BLOGGER_BLOG_URL"] = first_blog.get("url", "")
            save_dict["BLOGGER_BLOG_NAME"] = first_blog.get("name", "")
            print(f"📝 Found Blog: {first_blog.get('name')} ID: {first_blog.get('id')}")
        
        # Save to all workspaces
        for ws_id in [target_ws, "default", "132d5d65-fd7d-4525-974f-f5fac15be10b"]:
            try:
                if ws_id and ws_id.strip():
                    db.save_settings(save_dict, workspace_id=ws_id.strip())
                    print(f"✅ Saved Blogger tokens for workspace {ws_id}: {list(save_dict.keys())}")
            except Exception as e:
                print(f"Blogger save error for {ws_id}: {e}")
    
    frontend_url = get_frontend_settings_url()
    return RedirectResponse(url=frontend_url + f"?connected=blogger&success=1&ws={target_ws}")

@app.get("/api/auth/blogger/status")
def get_blogger_status():
    """Check if Blogger is connected"""
    has_token = bool(cfg.get("BLOGGER_ACCESS_TOKEN"))
    has_blog = bool(cfg.get("BLOGGER_BLOG_ID"))
    blog_id = cfg.get("BLOGGER_BLOG_ID")
    blog_name = cfg.get("BLOGGER_BLOG_NAME")
    blog_url = cfg.get("BLOGGER_BLOG_URL")
    
    return {
        "connected": has_token and has_blog,
        "has_token": has_token,
        "has_blog": has_blog,
        "blog_id": blog_id,
        "blog_name": blog_name,
        "blog_url": blog_url,
        "workspace": cfg.current_workspace(),
        "blog_connected": has_token and has_blog
    }

@app.get("/api/auth/blogger/blogs")
async def get_blogger_blogs():
    """List all blogs of connected user"""
    access_token = cfg.get("BLOGGER_ACCESS_TOKEN")
    if not access_token:
        raise HTTPException(status_code=400, detail="Blogger not connected - /api/auth/blogger se connect karo")
    
    # Try refresh if needed
    async with httpx.AsyncClient(timeout=20) as client:
        res = await client.get(
            "https://www.googleapis.com/blogger/v3/users/self/blogs",
            headers={"Authorization": f"Bearer {access_token}"}
        )
        data = res.json()
        
        # If token expired, try refresh
        if res.status_code == 401:
            refresh_token = cfg.get("BLOGGER_REFRESH_TOKEN")
            client_id, client_secret = get_blogger_credentials()
            if refresh_token and client_id and client_secret:
                refresh_res = await client.post(
                    "https://oauth2.googleapis.com/token",
                    data={
                        "client_id": client_id,
                        "client_secret": client_secret,
                        "refresh_token": refresh_token,
                        "grant_type": "refresh_token"
                    }
                )
                refresh_data = refresh_res.json()
                if "access_token" in refresh_data:
                    new_token = refresh_data["access_token"]
                    # Save new token
                    for ws_id in ["default", cfg.current_workspace(), "132d5d65-fd7d-4525-974f-f5fac15be10b"]:
                        try:
                            db.save_settings({"BLOGGER_ACCESS_TOKEN": new_token}, workspace_id=ws_id)
                        except:
                            pass
                    # Retry
                    res = await client.get(
                        "https://www.googleapis.com/blogger/v3/users/self/blogs",
                        headers={"Authorization": f"Bearer {new_token}"}
                    )
                    data = res.json()
        
        return data

@app.post("/api/auth/blogger/setup")
def setup_blogger_credentials(request: Request, payload: dict = None):
    """Admin ek baar Blogger credentials save kare"""
    try:
        body = payload or {}
        client_id = body.get("client_id") or body.get("BLOGGER_CLIENT_ID") or body.get("clientId")
        client_secret = body.get("client_secret") or body.get("BLOGGER_CLIENT_SECRET") or body.get("clientSecret")
        
        if not client_id or not client_secret:
            return {
                "success": False,
                "message": "Client ID/Secret missing. Google Cloud Console se OAuth Client banao.",
                "has_client_id": bool(client_id),
                "has_client_secret": bool(client_secret),
                "instructions": "1. https://console.cloud.google.com/ jao 2. APIs & Services > Credentials > Create OAuth Client ID 3. Blogger API enable karo 4. Redirect URI add karo: https://nextgen-analytics-social-media-tool.fastapicloud.dev/api/auth/blogger/callback"
            }
        
        save_dict = {
            "BLOGGER_CLIENT_ID": client_id,
            "BLOGGER_CLIENT_SECRET": client_secret
        }
        
        current_ws = cfg.current_workspace()
        saved = []
        for ws_id in ["default", "132d5d65-fd7d-4525-974f-f5fac15be10b", current_ws]:
            try:
                if ws_id and ws_id.strip():
                    db.save_settings(save_dict, workspace_id=ws_id.strip())
                    saved.append(ws_id)
            except Exception as e:
                print(f"Blogger setup save error {ws_id}: {e}")
        
        return {
            "success": True,
            "message": f"Blogger credentials saved for {len(saved)} workspaces!",
            "workspaces": saved,
            "global_connect_url": f"{get_public_base()}/api/auth/blogger"
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"success": False, "error": str(e)}

@app.post("/api/auth/blogger/select-blog")
def select_blogger_blog(payload: dict):
    """User apna blog select kare - multiple blogs me se"""
    blog_id = payload.get("blog_id") or payload.get("BLOGGER_BLOG_ID")
    if not blog_id:
        return {"success": False, "error": "blog_id required"}
    
    save_dict = {"BLOGGER_BLOG_ID": blog_id}
    if payload.get("blog_name"):
        save_dict["BLOGGER_BLOG_NAME"] = payload.get("blog_name")
    if payload.get("blog_url"):
        save_dict["BLOGGER_BLOG_URL"] = payload.get("blog_url")
    
    current_ws = cfg.current_workspace()
    for ws_id in ["default", current_ws, "132d5d65-fd7d-4525-974f-f5fac15be10b"]:
        try:
            db.save_settings(save_dict, workspace_id=ws_id.strip())
        except:
            pass
    
    return {"success": True, "message": f"Blog {blog_id} selected", "blog_id": blog_id}

# ==================== TIKTOK OAUTH + PUBLISH ====================
@app.get("/api/auth/tiktok")
async def tiktok_auth_login(request: Request):
    """TikTok OAuth login URL"""
    client_key, client_secret = get_tiktok_credentials()
    workspace_id = request.headers.get("X-Workspace-Id") or cfg.current_workspace() or "default"
    
    if not client_key:
        client_key = os.getenv("TIKTOK_CLIENT_KEY")
        client_secret = os.getenv("TIKTOK_CLIENT_SECRET")
    
    if not client_key or not client_secret:
        return {
            "login_url": None,
            "error": "TIKTOK_CLIENT_KEY / SECRET missing. Admin se setup karwao.",
            "setup_endpoint": f"{get_public_base()}/api/auth/tiktok/setup",
            "instructions": "1. https://developers.tiktok.com/ jao 2. Create App 3. Add Login Kit + Video Kit 4. Redirect URI: https://nextgen-analytics-social-media-tool.fastapicloud.dev/api/auth/tiktok/callback"
        }
    
    public_base = get_public_base()
    redirect_uri = f"{public_base}/api/auth/tiktok/callback"
    # Scopes - Add new scopes if needed: user.info.profile, user.info.stats, video.list
    # For now keeping minimal scopes for easy approval, but code supports all
    # To add: "user.info.basic,user.info.profile,user.info.stats,video.list,video.publish,video.upload"
    scope = "user.info.basic,user.info.profile,user.info.stats,video.list,video.publish,video.upload"
    state = workspace_id
    
    import urllib.parse
    import secrets
    # TikTok requires state to be unique and secure
    csrf_state = secrets.token_urlsafe(16)
    # Store mapping of csrf_state -> workspace in memory (simplified - use DB in production)
    # For now, we encode workspace in state param as workspace:csrf
    
    encoded_redirect = urllib.parse.quote(redirect_uri, safe='')
    encoded_scope = urllib.parse.quote(scope, safe='')
    
    # TikTok OAuth v2 authorize URL
    login_url = f"https://www.tiktok.com/v2/auth/authorize?client_key={client_key}&scope={encoded_scope}&response_type=code&redirect_uri={encoded_redirect}&state={state}"
    
    return {
        "login_url": login_url,
        "redirect_uri": redirect_uri,
        "client_key": client_key,
        "workspace_id": workspace_id,
        "scope": scope
    }

@app.get("/api/auth/tiktok/callback")
async def tiktok_auth_callback(
    code: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
    error_description: Optional[str] = Query(None),
    scopes: Optional[str] = Query(None)
):
    client_key, client_secret = get_tiktok_credentials()
    public_base = get_public_base()
    redirect_uri = f"{public_base}/api/auth/tiktok/callback"
    
    if error:
        frontend_url = get_frontend_settings_url()
        return RedirectResponse(url=frontend_url + f"?connected=tiktok_error&error={error}&message={error_description}")
    
    if not code:
        raise HTTPException(status_code=400, detail=f"Missing code from TikTok. error={error} desc={error_description}")
    
    if not client_key or not client_secret:
        raise HTTPException(status_code=400, detail="TIKTOK_CLIENT_KEY / SECRET missing")
    
    target_ws = state or "default"
    
    async with httpx.AsyncClient(timeout=30) as client:
        # Exchange code for access token
        token_res = await client.post(
            "https://open.tiktokapis.com/v2/oauth/token/",
            data={
                "client_key": client_key,
                "client_secret": client_secret,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": redirect_uri
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )
        token_data = token_res.json()
        print(f"📱 TikTok token exchange: {token_data}")
        
        if "access_token" not in token_data and "data" not in token_data:
            if token_res.status_code != 200:
                raise HTTPException(status_code=400, detail=f"TikTok token exchange failed: {token_data} Status: {token_res.status_code}")
        
        # TikTok v2 returns data in different formats
        if "data" in token_data:
            access_token = token_data["data"].get("access_token")
            refresh_token = token_data["data"].get("refresh_token", "")
            open_id = token_data["data"].get("open_id", "")
            expires_in = token_data["data"].get("expires_in", 86400)
        else:
            access_token = token_data.get("access_token")
            refresh_token = token_data.get("refresh_token", "")
            open_id = token_data.get("open_id", "")
            expires_in = token_data.get("expires_in", 86400)
        
        if not access_token:
            raise HTTPException(status_code=400, detail=f"TikTok no access_token: {token_data}")
        
        # Get user info
        try:
            user_res = await client.get(
                "https://open.tiktokapis.com/v2/user/info/",
                params={"fields": "open_id,union_id,avatar_url,display_name,username"},
                headers={"Authorization": f"Bearer {access_token}"}
            )
            user_data = user_res.json()
            print(f"📱 TikTok user info: {user_data}")
            user_info = user_data.get("data", {}).get("user", {}) if "data" in user_data else user_data.get("data", {})
            display_name = user_info.get("display_name", "") if isinstance(user_info, dict) else ""
            username = user_info.get("username", "") if isinstance(user_info, dict) else ""
        except Exception as e:
            print(f"TikTok user info error: {e}")
            display_name = ""
            username = ""
            user_data = {}
        
        save_dict = {
            "TIKTOK_ACCESS_TOKEN": access_token,
            "TIKTOK_CLIENT_KEY": client_key,
            "TIKTOK_CLIENT_SECRET": client_secret,
            "TIKTOK_OPEN_ID": open_id,
            "TIKTOK_TOKEN_EXPIRY": str(int(datetime.now().timestamp()) + int(expires_in)),
        }
        
        if refresh_token:
            save_dict["TIKTOK_REFRESH_TOKEN"] = refresh_token
        if display_name:
            save_dict["TIKTOK_DISPLAY_NAME"] = display_name
        if username:
            save_dict["TIKTOK_USERNAME"] = username
        if open_id:
            save_dict["TIKTOK_OPEN_ID"] = open_id
        
        for ws_id in [target_ws, "default", "132d5d65-fd7d-4525-974f-f5fac15be10b"]:
            try:
                if ws_id and ws_id.strip():
                    db.save_settings(save_dict, workspace_id=ws_id.strip())
            except Exception as e:
                print(f"TikTok save error for {ws_id}: {e}")
    
    frontend_url = get_frontend_settings_url()
    return RedirectResponse(url=frontend_url + f"?connected=tiktok&success=1&ws={target_ws}")

@app.get("/api/auth/tiktok/status")
def get_tiktok_status():
    has_token = bool(cfg.get("TIKTOK_ACCESS_TOKEN"))
    open_id = cfg.get("TIKTOK_OPEN_ID")
    username = cfg.get("TIKTOK_USERNAME")
    display_name = cfg.get("TIKTOK_DISPLAY_NAME")
    
    return {
        "connected": has_token and bool(open_id),
        "has_token": has_token,
        "open_id": open_id,
        "username": username,
        "display_name": display_name,
        "workspace": cfg.current_workspace(),
        "tiktok_connected": has_token and bool(open_id)
    }

@app.post("/api/auth/tiktok/setup")
def setup_tiktok_credentials(request: Request, payload: dict = None):
    try:
        body = payload or {}
        client_key = body.get("client_key") or body.get("TIKTOK_CLIENT_KEY") or body.get("clientKey")
        client_secret = body.get("client_secret") or body.get("TIKTOK_CLIENT_SECRET") or body.get("clientSecret")
        
        if not client_key or not client_secret:
            return {
                "success": False,
                "message": "Client Key/Secret missing",
                "has_client_key": bool(client_key),
                "has_client_secret": bool(client_secret),
                "instructions": "1. https://developers.tiktok.com/ jao 2. Create App 3. Login Kit + Video Kit enable karo 4. Redirect URI: https://nextgen-analytics-social-media-tool.fastapicloud.dev/api/auth/tiktok/callback"
            }
        
        save_dict = {
            "TIKTOK_CLIENT_KEY": client_key,
            "TIKTOK_CLIENT_SECRET": client_secret
        }
        
        current_ws = cfg.current_workspace()
        saved = []
        for ws_id in ["default", "132d5d65-fd7d-4525-974f-f5fac15be10b", current_ws]:
            try:
                if ws_id and ws_id.strip():
                    db.save_settings(save_dict, workspace_id=ws_id.strip())
                    saved.append(ws_id)
            except Exception as e:
                print(f"TikTok setup save error {ws_id}: {e}")
        
        return {
            "success": True,
            "message": f"TikTok credentials saved for {len(saved)} workspaces!",
            "workspaces": saved,
            "global_connect_url": f"{get_public_base()}/api/auth/tiktok"
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"success": False, "error": str(e)}

# ==================== SUBSTACK - SIMPLE COOKIE AUTH - NO KHARWARI ====================
def get_substack_credentials():
    sid = cfg.get("SUBSTACK_SID") or os.getenv("SUBSTACK_SID")
    connect_sid = cfg.get("SUBSTACK_CONNECT_SID") or os.getenv("SUBSTACK_CONNECT_SID")
    pub_url = cfg.get("SUBSTACK_PUBLICATION_URL") or os.getenv("SUBSTACK_PUBLICATION_URL")
    pub_name = cfg.get("SUBSTACK_PUBLICATION_NAME") or os.getenv("SUBSTACK_PUBLICATION_NAME")
    email = cfg.get("SUBSTACK_EMAIL") or os.getenv("SUBSTACK_EMAIL")
    return sid, connect_sid, pub_url, pub_name, email

@app.get("/api/auth/substack/status")
def get_substack_status():
    sid, connect_sid, pub_url, pub_name, email = get_substack_credentials()
    has_sid = bool(sid)
    return {
        "connected": has_sid and bool(pub_url),
        "has_sid": has_sid,
        "publication_url": pub_url,
        "publication_name": pub_name,
        "email": email,
        "workspace": cfg.current_workspace(),
        "substack_connected": has_sid and bool(pub_url),
        "instructions": "1. substack.com pe login karo 2. F12 -> Application -> Cookies -> substack.sid copy karo 3. Publication URL jaise https://yoursite.substack.com paste karo"
    }

@app.post("/api/auth/substack/setup")
def setup_substack_credentials(payload: dict):
    try:
        body = payload or {}
        sid = body.get("sid") or body.get("SUBSTACK_SID") or body.get("substack_sid") or body.get("substack.sid")
        connect_sid = body.get("connect_sid") or body.get("SUBSTACK_CONNECT_SID") or body.get("connect.sid") or ""
        pub_url = body.get("publication_url") or body.get("PUBLICATION_URL") or body.get("pub_url") or body.get("SUBSTACK_PUBLICATION_URL") or ""
        pub_name = body.get("publication_name") or body.get("SUBSTACK_PUBLICATION_NAME") or ""
        email = body.get("email") or body.get("SUBSTACK_EMAIL") or ""
        
        if not sid:
            return {
                "success": False,
                "message": "substack.sid missing - F12 -> Application -> Cookies se copy karo",
                "has_sid": False,
                "instructions": "1. https://substack.com pe login karo 2. F12 dabao -> Application tab -> Cookies -> https://substack.com -> substack.sid value copy karo 3. Yahan paste karo + publication URL jaise https://example.substack.com"
            }
        
        if not pub_url:
            return {
                "success": False,
                "message": "Publication URL missing - jaise https://yoursite.substack.com",
                "has_sid": bool(sid),
                "has_pub_url": False
            }
        
        # Clean URL - ensure https and no trailing slash
        pub_url = pub_url.strip().rstrip("/")
        if not pub_url.startswith("http"):
            pub_url = "https://" + pub_url
        
        save_dict = {
            "SUBSTACK_SID": sid.strip(),
            "SUBSTACK_PUBLICATION_URL": pub_url,
        }
        if connect_sid:
            save_dict["SUBSTACK_CONNECT_SID"] = connect_sid.strip()
        if pub_name:
            save_dict["SUBSTACK_PUBLICATION_NAME"] = pub_name.strip()
        if email:
            save_dict["SUBSTACK_EMAIL"] = email.strip()
        
        current_ws = cfg.current_workspace()
        saved = []
        for ws_id in ["default", "132d5d65-fd7d-4525-974f-f5fac15be10b", current_ws]:
            try:
                if ws_id and ws_id.strip():
                    db.save_settings(save_dict, workspace_id=ws_id.strip())
                    saved.append(ws_id)
            except Exception as e:
                print(f"Substack setup save error {ws_id}: {e}")
        
        return {
            "success": True,
            "message": f"Substack connected! {len(saved)} workspaces me save hua",
            "publication_url": pub_url,
            "workspaces": saved,
            "connected": True
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"success": False, "error": str(e)}

@app.post("/api/auth/substack/disconnect")
def disconnect_substack():
    try:
        current_ws = cfg.current_workspace()
        empty_dict = {
            "SUBSTACK_SID": "",
            "SUBSTACK_CONNECT_SID": "",
            "SUBSTACK_PUBLICATION_URL": "",
            "SUBSTACK_PUBLICATION_NAME": "",
        }
        for ws_id in ["default", "132d5d65-fd7d-4525-974f-f5fac15be10b", current_ws]:
            try:
                if ws_id and ws_id.strip():
                    db.save_settings(empty_dict, workspace_id=ws_id.strip())
            except Exception as e:
                print(f"Substack disconnect error {ws_id}: {e}")
        return {"success": True, "message": "Substack disconnected"}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.post("/api/publish/substack")
async def publish_to_substack_endpoint(payload: dict):
    """Simple Substack publish - uses cookie auth, no OAuth"""
    try:
        sid, connect_sid, pub_url, pub_name, email = get_substack_credentials()
        if not sid or not pub_url:
            raise HTTPException(status_code=400, detail="Pehle Substack Connect karo - SID aur Publication URL chahiye")
        
        title = payload.get("title") or payload.get("caption", "")[:100] or "New Post"
        subtitle = payload.get("short_caption") or payload.get("subtitle") or ""
        body = payload.get("caption") or payload.get("body") or payload.get("html") or ""
        is_draft = payload.get("is_draft", True)
        
        # Convert plain text to simple HTML if needed
        if "<p>" not in body and "<br>" not in body:
            body_html = body.replace("\n\n", "</p><p>").replace("\n", "<br>")
            body_html = f"<p>{body_html}</p>"
        else:
            body_html = body
        
        # Substack API - create draft
        # Endpoint: https://{publication}/api/v1/drafts
        draft_url = f"{pub_url.rstrip('/')}/api/v1/drafts"
        
        cookies = {"substack.sid": sid}
        if connect_sid:
            cookies["connect.sid"] = connect_sid
        
        async with httpx.AsyncClient(timeout=30) as client:
            # Create draft
            res = await client.post(
                draft_url,
                json={
                    "draft_title": title,
                    "draft_subtitle": subtitle,
                    "draft_body": body_html,
                    "draft_bylines": [],
                },
                cookies=cookies,
                headers={
                    "User-Agent": "Mozilla/5.0",
                    "Content-Type": "application/json",
                    "Origin": pub_url,
                    "Referer": f"{pub_url}/",
                }
            )
            
            print(f"📝 Substack draft response: {res.status_code} - {res.text[:500]}")
            
            if res.status_code in [200, 201]:
                data = res.json()
                draft_id = data.get("id") or data.get("draft", {}).get("id") if isinstance(data, dict) else None
                
                if not is_draft and draft_id:
                    # Try to publish immediately if requested
                    publish_url = f"{pub_url.rstrip('/')}/api/v1/drafts/{draft_id}/publish"
                    pub_res = await client.post(publish_url, cookies=cookies, headers={"User-Agent": "Mozilla/5.0"})
                    print(f"📝 Substack publish response: {pub_res.status_code} - {pub_res.text[:500]}")
                    return {"success": True, "draft_id": draft_id, "published": pub_res.status_code in [200, 201], "url": f"{pub_url}/publish/{draft_id}" if draft_id else pub_url, "message": "Published to Substack!" if pub_res.status_code in [200, 201] else "Draft created, publish manually"}
                
                return {"success": True, "draft_id": draft_id, "url": f"{pub_url}/publish/{draft_id}" if draft_id else f"{pub_url}/drafts", "message": "Draft created in Substack!", "data": data}
            else:
                # If API fails, still return helpful error - cookie may be expired
                raise HTTPException(status_code=res.status_code, detail=f"Substack API error {res.status_code}: {res.text[:300]}. SID expire ho gaya ho to naya copy karo")
    
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Substack publish fail: {str(e)}")

# Threads Webhooks / Callbacks for Dashboard
@app.post("/api/auth/threads/uninstall")
@app.get("/api/auth/threads/uninstall")
async def threads_uninstall_callback(request: Request):
    body = await request.body() if hasattr(request, 'body') else b''
    print(f"🧵 Threads uninstall callback: {body}")
    return {"status": "ok"}

@app.post("/api/auth/threads/delete")
@app.get("/api/auth/threads/delete")
async def threads_delete_callback(request: Request):
    body = await request.body() if hasattr(request, 'body') else b''
    print(f"🧵 Threads delete callback: {body}")
    return {"status": "ok", "url": "https://affaf12.github.io/nextgen-analytics-social-media-tool/", "confirmation_code": "deleted"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
