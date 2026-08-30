import httpx
from services import settings_service as cfg

MEDIUM_BASE = "https://api.medium.com/v1"


async def post_to_medium(caption: str, title: str, media_urls: list):
    token = cfg.get("MEDIUM_ACCESS_TOKEN")
    if not token:
        return {"status": "mock", "message": "Medium token nahi mila, Settings page mein daalo"}

    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json", "Accept": "application/json"}
    content = caption.replace("\n", "<br>")
    if media_urls:
        content = f'<img src="{media_urls[0]}" style="max-width:100%"><br><br>' + content

    async with httpx.AsyncClient(timeout=60) as client:
        try:
            me = await client.get(f"{MEDIUM_BASE}/me", headers=headers)
            try:
                me_data = me.json()
            except ValueError:
                return {"status": "error", "detail": f"Medium se JSON nahi mila (HTTP {me.status_code})"}
            user_id = me_data.get("data", {}).get("id")
            if not user_id:
                return {"status": "error", "detail": me_data}

            payload = {
                "title": title or "New Post",
                "contentFormat": "html",
                "content": f"<h1>{title or 'New Post'}</h1>{content}",
                "publishStatus": "public",
            }
            r = await client.post(f"{MEDIUM_BASE}/users/{user_id}/posts", headers=headers, json=payload)
            try:
                data = r.json()
            except ValueError:
                return {"status": "error", "detail": f"Medium se JSON nahi mila (HTTP {r.status_code})"}
            if r.status_code >= 400:
                return {"status": "error", "detail": data}
            return {"status": "published", "platform": "medium", "url": data.get("data", {}).get("url")}
        except httpx.HTTPError as e:
            return {"status": "error", "detail": str(e)}
