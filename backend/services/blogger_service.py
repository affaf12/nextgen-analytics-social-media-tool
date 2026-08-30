import httpx
from services import settings_service as cfg
from services.http_utils import safe_json

BLOGGER_BASE = "https://www.googleapis.com/blogger/v3"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"


async def _get_valid_token(client: httpx.AsyncClient):
    """
    Google access tokens sirf ~1 ghante chalte hain. Agar refresh_token + client_id +
    client_secret Settings mein diye hain to yahan khud naya access token le lete hain,
    taake baar baar manually token generate na karna pade.
    """
    refresh_token = cfg.get("BLOGGER_REFRESH_TOKEN")
    client_id = cfg.get("BLOGGER_CLIENT_ID")
    client_secret = cfg.get("BLOGGER_CLIENT_SECRET")

    if refresh_token and client_id and client_secret:
        try:
            r = await client.post(GOOGLE_TOKEN_URL, data={
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
                "client_id": client_id,
                "client_secret": client_secret,
            })
            data, err = safe_json(r)
            if not err and r.status_code < 400 and data.get("access_token"):
                new_token = data["access_token"]
                # naya token DB mein save kar dete hain taake agli dafa bhi taaza mile
                cfg.save("BLOGGER_ACCESS_TOKEN", new_token)
                return new_token
        except httpx.HTTPError:
            pass  # refresh fail ho jaye to neeche wala saved token try karenge

    return cfg.get("BLOGGER_ACCESS_TOKEN")


async def post_to_blogger(caption: str, title: str, media_urls: list, location_name: str = "", labels: list = None):
    blog_id = cfg.get("BLOGGER_BLOG_ID")
    if not blog_id:
        return {"status": "mock", "message": "Blogger Blog ID nahi mila, Settings page mein daalo"}

    content = caption.replace("\n", "<br>")
    if media_urls:
        content = f'<img src="{media_urls[0]}" style="max-width:100%"><br><br>' + content

    payload = {"title": title or "New Post", "content": content}
    if labels:
        payload["labels"] = labels
    if location_name:
        payload["location"] = {"name": location_name}

    async with httpx.AsyncClient(timeout=60) as client:
        token = await _get_valid_token(client)
        if not token:
            return {"status": "mock", "message": "Blogger token nahi mila, Settings page mein daalo"}

        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        try:
            r = await client.post(f"{BLOGGER_BASE}/blogs/{blog_id}/posts/", headers=headers, json=payload)
            data, err = safe_json(r)
            if err:
                return {"status": "error", "detail": err}
            if r.status_code >= 400:
                return {"status": "error", "detail": data}
            return {"status": "published", "platform": "blogger", "url": data.get("url")}
        except httpx.HTTPError as e:
            return {"status": "error", "detail": str(e)}
