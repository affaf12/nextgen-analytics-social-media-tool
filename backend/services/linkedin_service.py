import asyncio
import httpx
from services import settings_service as cfg
from services.http_utils import safe_json

LINKEDIN_BASE = "https://api.linkedin.com/v2"

VIDEO_EXT = (".mp4", ".mov", ".m4v", ".webm")


def _is_video(url: str) -> bool:
    return url.lower().split("?")[0].endswith(VIDEO_EXT)


async def _request_with_retry(client: httpx.AsyncClient, method: str, url: str, step: str, retries: int = 3, **kwargs):
    """
    LinkedIn ke sath kabhi kabhi network/firewall connection beech mein tor deta hai
    ("Server disconnected without sending a response") — ye kisi bhi step (register,
    download, ya upload) par ho sakta hai. Isliye har HTTP call ko yahan se guzarte hain
    taake har step khud retry ho jaye aur agar phir bhi fail ho to exact step pata chale.
    """
    last_error = None
    for attempt in range(retries):
        try:
            print(f"[LinkedIn] {step}: attempt {attempt + 1}/{retries} -> {method} {url}", flush=True)
            resp = await client.request(method, url, **kwargs)
            print(f"[LinkedIn] {step}: got HTTP {resp.status_code}", flush=True)
            return resp, None
        except Exception as e:
            print(f"[LinkedIn] {step}: EXCEPTION {type(e).__module__}.{type(e).__name__}: {e}", flush=True)
            last_error = {"status": "error", "step": step, "detail": f"{type(e).__name__}: {str(e)} (attempt {attempt + 1}/{retries})"}
            await asyncio.sleep(2)
    return None, last_error



async def _get_person_urn(client: httpx.AsyncClient, token: str) -> str:
    cached = cfg.get("LINKEDIN_PERSON_URN")
    if cached:
        return cached
    headers = {"Authorization": f"Bearer {token}"}
    r, err = await _request_with_retry(client, "GET", f"{LINKEDIN_BASE}/userinfo", "userinfo", headers=headers)
    if err:
        raise RuntimeError(f"{err['step']}: {err['detail']}")
    r.raise_for_status()
    data = r.json()
    member_id = data.get("sub")
    if not member_id:
        raise ValueError(f"userinfo se member id nahi mila: {data}")
    return f"urn:li:person:{member_id}"


async def _upload_media_asset(client: httpx.AsyncClient, token: str, owner_urn: str, media_url: str, is_video: bool):
    """
    LinkedIn direct URL accept nahi karta — pehle ek "asset" register karna padta hai,
    phir file ke bytes khud LinkedIn ke diye hue upload-URL par PUT karne parte hain.
    Ye function media_url se file download karke LinkedIn par upload karta hai aur
    final asset URN return karta hai (jo post ke sath attach hota hai).
    """
    recipe = "urn:li:digitalmediaRecipe:feedshare-video" if is_video else "urn:li:digitalmediaRecipe:feedshare-image"
    register_payload = {
        "registerUploadRequest": {
            "recipes": [recipe],
            "owner": owner_urn,
            "serviceRelationships": [
                {"relationshipType": "OWNER", "identifier": "urn:li:userGeneratedContent"}
            ],
        }
    }
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json", "X-Restli-Protocol-Version": "2.0.0"}

    r, err = await _request_with_retry(
        client, "POST", f"{LINKEDIN_BASE}/assets?action=registerUpload",
        "register_upload", headers=headers, json=register_payload,
    )
    if err:
        return None, err
    reg_data, jerr = safe_json(r)
    if jerr or r.status_code >= 400:
        return None, {"status": "error", "step": "register_upload", "detail": jerr or reg_data}

    value = reg_data.get("value", {})
    upload_url = (
        value.get("uploadMechanism", {})
        .get("com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest", {})
        .get("uploadUrl")
    )
    asset_urn = value.get("asset")
    if not upload_url or not asset_urn:
        return None, {"status": "error", "step": "register_upload", "detail": reg_data}

    media_resp, err = await _request_with_retry(
        client, "GET", media_url, "media_download",
        headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"},
    )
    if err:
        return None, err
    if media_resp.status_code >= 400:
        return None, {"status": "error", "step": "media_download", "detail": f"HTTP {media_resp.status_code}"}

    put_resp, err = await _request_with_retry(
        client, "PUT", upload_url, "media_put",
        content=media_resp.content,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/octet-stream"},
    )
    if err:
        return None, err
    if put_resp.status_code not in (200, 201):
        return None, {"status": "error", "step": "media_put", "detail": f"HTTP {put_resp.status_code}: {put_resp.text}"}

    return asset_urn, None


async def post_to_linkedin(caption: str, media_urls: list, type: str):
    token = cfg.get("LINKEDIN_ACCESS_TOKEN")
    if not token:
        return {"status": "mock", "message": "LinkedIn token nahi mila, Settings page mein daalo"}

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
    }

    async with httpx.AsyncClient(timeout=180) as client:
        try:
            if type == "linkedin_page":
                org_urn = cfg.get("LINKEDIN_ORG_URN")
                org_id = cfg.get("LINKEDIN_ORG_ID")
                if org_urn:
                    author = org_urn
                elif org_id:
                    author = f"urn:li:organization:{org_id}"
                else:
                    return {"status": "error", "detail": "LinkedIn org id/URN Settings mein missing hai"}
            else:
                author = await _get_person_urn(client, token)

            share_content = {
                "shareCommentary": {"text": caption},
                "shareMediaCategory": "NONE",
            }

            if media_urls:
                is_video = _is_video(media_urls[0])
                asset_urn, err = await _upload_media_asset(client, token, author, media_urls[0], is_video)
                if err:
                    return err
                share_content["shareMediaCategory"] = "VIDEO" if is_video else "IMAGE"
                share_content["media"] = [{
                    "status": "READY",
                    "description": {"text": caption[:200]},
                    "media": asset_urn,
                    "title": {"text": caption[:100] or "Post"},
                }]

            payload = {
                "author": author,
                "lifecycleState": "PUBLISHED",
                "specificContent": {"com.linkedin.ugc.ShareContent": share_content},
                "visibility": {"com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"},
            }

            r, err = await _request_with_retry(
                client, "POST", f"{LINKEDIN_BASE}/ugcPosts", "create_post", headers=headers, json=payload,
            )
            if err:
                return err
            if r.status_code >= 400:
                return {"status": "error", "detail": r.text}

            post_urn = r.headers.get("x-restli-id", "")
            return {"status": "published", "platform": type, "post_urn": post_urn}
        except Exception as e:
            print(f"[LinkedIn] UNCAUGHT {type(e).__module__}.{type(e).__name__}: {e}", flush=True)
            return {"status": "error", "detail": f"{type(e).__name__}: {str(e)}"}
