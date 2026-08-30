import os
from contextvars import ContextVar

_db = None

# Har request/background-job iteration ke shuru mein set hota hai (main.py ke middleware
# se, ya scheduler_service.py se due post publish karne se pehle) — isi ki wajah se
# cfg.get()/cfg.save() ko har call site par workspace_id pass karne ki zaroorat nahi padti,
# aur meta_service.py, linkedin_service.py, etc. ko chhedna nahi pada.
_workspace_ctx: ContextVar[str] = ContextVar("workspace_id", default="default")


def bind_db(db):
    """Called once from main.py so this module can read saved settings from SQLite."""
    global _db
    _db = db


def set_workspace(workspace_id: str):
    """Current context (request ya scheduler tick) ke liye active workspace set karo."""
    _workspace_ctx.set(workspace_id or "default")


def current_workspace() -> str:
    return _workspace_ctx.get()


def get(key: str, default: str = "") -> str:
    """DB-saved value (is workspace ki, Settings page se) wins over .env.

    IMPORTANT: .env / HF Space Secrets ka fallback SIRF "default" workspace ke liye
    chalta hai (yani jab koi X-Workspace-Id header hi na bheje — apna local/direct use).
    Har aur workspace (koi doosra banda apna browser se link khol kar) ke liye agar
    usne apni key Settings page se save nahi ki, to woh key khaali hi rahegi (service
    "mock" return karega) — kabhi bhi app deploy karne wale ki apni saved key
    doosre users ko silently mil kar use nahi hogi.
    """
    ws = _workspace_ctx.get()
    if _db is not None:
        val = _db.get_setting(key, workspace_id=ws)
        if val:
            return val
    if ws == "default":
        return os.getenv(key, default)
    return default


def save(key: str, value: str):
    """Ek single key ko is workspace ke liye DB mein save karta hai (e.g. auto-refreshed OAuth tokens ke liye)."""
    if _db is not None:
        _db.save_settings({key: value}, workspace_id=_workspace_ctx.get())
