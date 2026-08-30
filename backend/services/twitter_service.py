import base64
import hashlib
import hmac
import random
import string
import time
import urllib.parse

import httpx

from services import settings_service as cfg
from services.http_utils import safe_json

TWEET_URL = "https://api.twitter.com/2/tweets"
MEDIA_UPLOAD_URL = "https://upload.twitter.com/1.1/media/upload.json"

VIDEO_EXT = (".mp4", ".mov", ".m4v", ".webm")


def _is_video(url: str) -> bool:
    return url.lower().split("?")[0].endswith(VIDEO_EXT)


def _oauth_header(method: str, url: str, oauth_token: str, oauth_token_secret: str,
                   consumer_key: str, consumer_secret: str, extra_params: dict = None) -> str:
    """
    Twitter/X ke liye OAuth 1.0a signature banata hai (HMAC-SHA1). Ye sirf isliye manual
    likha hai taake tweepy jaisi extra heavy library install na karni pade.
    """
    def enc(s):
        return urllib.parse.quote(str(s), safe="~")

    oauth_params = {
        "oauth_consumer_key": consumer_key,
        "oauth_nonce": "".join(random.choices(string.ascii_letters + string.digits, k=32)),
        "oauth_signature_method": "HMAC-SHA1",
        "oauth_timestamp": str(int(time.time())),
        "oauth_token": oauth_token,
        "oauth_version": "1.0",
    }

    sign_params = dict(oauth_params)
    if extra_params:
        sign_params.update(extra_params)

    param_str = "&".join(f"{enc(k)}={enc(v)}" for k, v in sorted(sign_params.items()))
    base_str = "&".join([method.upper(), enc(url), enc(param_str)])
    signing_key = f"{enc(consumer_secret)}&{enc(oauth_token_secret)}"
    signature = base64.b64encode(
        hmac.new(signing_key.encode(), base_str.encode(), hashlib.sha1).digest()
    ).decode()
    oauth_params["oauth_signature"] = signature

    return "OAuth " + ", ".join(f'{enc(k)}="{enc(v)}"' for k, v in sorted(oauth_params.items()))


def _get_creds():
    return (
        cfg.get("TWITTER_API_KEY"),
        cfg.get("TWITTER_API_SECRET"),
        cfg.get("TWITTER_ACCESS_TOKEN"),
        cfg.get("TWITTER_ACCESS_SECRET"),
    )


async def _upload_media(client: httpx.AsyncClient, media_url: str, creds) -> tuple[str | None, dict | None]:
    """Media URL se bytes download karke Twitter par upload karta hai, media_id return karta hai."""
    consumer_key, consumer_secret, token, token_secret = creds

    r = await client.get(media_url, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
    })
    if r.status_code >= 400:
        return None, {"status": "error", "step": "media_download", "detail": f"Media download fail: HTTP {r.status_code}"}
    file_bytes = r.content
    is_video = _is_video(media_url)

    if not is_video:
        # Chota image: single-shot base64 upload
        media_data = base64.b64encode(file_bytes).decode()
        data = {"media_data": media_data}
        header = _oauth_header("POST", MEDIA_UPLOAD_URL, token, token_secret, consumer_key, consumer_secret, data)
        resp = await client.post(MEDIA_UPLOAD_URL, data=data, headers={"Authorization": header})
        payload, err = safe_json(resp)
        if err or resp.status_code >= 400:
            return None, {"status": "error", "step": "media_upload", "detail": err or payload}
        return payload.get("media_id_string"), None

    # Video: chunked upload (INIT -> APPEND -> FINALIZE)
    total_bytes = len(file_bytes)
    init_data = {"command": "INIT", "total_bytes": str(total_bytes), "media_type": "video/mp4", "media_category": "tweet_video"}
    header = _oauth_header("POST", MEDIA_UPLOAD_URL, token, token_secret, consumer_key, consumer_secret, init_data)
    r_init = await client.post(MEDIA_UPLOAD_URL, data=init_data, headers={"Authorization": header})
    init_res, err = safe_json(r_init)
    if err or r_init.status_code >= 400:
        return None, {"status": "error", "step": "media_init", "detail": err or init_res}
    media_id = init_res.get("media_id_string")

    chunk_size = 4 * 1024 * 1024
    segment_index = 0
    for i in range(0, total_bytes, chunk_size):
        chunk = file_bytes[i:i + chunk_size]
        append_params = {"command": "APPEND", "media_id": media_id, "segment_index": str(segment_index)}
        header = _oauth_header("POST", MEDIA_UPLOAD_URL, token, token_secret, consumer_key, consumer_secret, append_params)
        files = {"media": ("chunk", chunk, "application/octet-stream")}
        r_append = await client.post(MEDIA_UPLOAD_URL, data=append_params, files=files, headers={"Authorization": header})
        if r_append.status_code >= 400:
            return None, {"status": "error", "step": "media_append", "detail": r_append.text}
        segment_index += 1

    finalize_data = {"command": "FINALIZE", "media_id": media_id}
    header = _oauth_header("POST", MEDIA_UPLOAD_URL, token, token_secret, consumer_key, consumer_secret, finalize_data)
    r_fin = await client.post(MEDIA_UPLOAD_URL, data=finalize_data, headers={"Authorization": header})
    fin_res, err = safe_json(r_fin)
    if err or r_fin.status_code >= 400:
        return None, {"status": "error", "step": "media_finalize", "detail": err or fin_res}

    return media_id, None


async def post_to_twitter(text: str, media_urls: list):
    consumer_key, consumer_secret, token, token_secret = _get_creds()
    if not all([consumer_key, consumer_secret, token, token_secret]):
        return {"status": "mock", "message": "Twitter/X API keys nahi mile, Settings page mein daalo"}

    # Twitter ki free-tier limit 280 characters hai
    if len(text) > 280:
        text = text[:277] + "..."

    async with httpx.AsyncClient(timeout=180) as client:
        try:
            media_ids = []
            if media_urls:
                media_id, error = await _upload_media(client, media_urls[0], (consumer_key, consumer_secret, token, token_secret))
                if error:
                    return error
                if media_id:
                    media_ids.append(media_id)

            body = {"text": text}
            if media_ids:
                body["media"] = {"media_ids": media_ids}

            # /2/tweets ka body JSON hai (form-encoded nahi), is liye signature mein extra params shamil nahi karte
            header = _oauth_header("POST", TWEET_URL, token, token_secret, consumer_key, consumer_secret)
            r = await client.post(TWEET_URL, json=body, headers={"Authorization": header, "Content-Type": "application/json"})
            payload, err = safe_json(r)
            if err:
                return {"status": "error", "detail": err}
            if r.status_code >= 400:
                return {"status": "error", "detail": payload}
            return {"status": "published", "platform": "twitter", "response": payload}
        except httpx.HTTPError as e:
            return {"status": "error", "detail": str(e)}
