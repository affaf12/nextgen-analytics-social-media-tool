import asyncio
import httpx
from services import settings_service as cfg
from services.http_utils import safe_json

GRAPH_VERSION = "v20.0"
GRAPH_BASE = f"https://graph.facebook.com/{GRAPH_VERSION}"
THREADS_BASE = "https://graph.threads.net/v1.0"

VIDEO_EXT = (".mp4", ".mov", ".m4v", ".webm")


def _is_video(url: str) -> bool:
    return url.lower().split("?")[0].endswith(VIDEO_EXT)


async def _resolve_place_id(client: httpx.AsyncClient, token: str, place_query: str):
    """Location ka naam (jaise 'Karachi, Pakistan') dete hi Facebook Places search se
    pehla matching Place ID nikal deta hai — FB/IG dono location-tag isi ID se lagate hain."""
    if not place_query:
        return None
    try:
        r = await client.get(f"{GRAPH_BASE}/search", params={
            "type": "place", "q": place_query, "access_token": token,
        })
        payload, err = safe_json(r)
        if err or r.status_code >= 400:
            return None
        results = payload.get("data") or []
        return results[0]["id"] if results else None
    except httpx.HTTPError:
        return None


async def post_to_facebook_page(caption: str, media_urls: list, location: str = ""):
    token = cfg.get("META_ACCESS_TOKEN")
    page_id = cfg.get("FB_PAGE_ID")
    if not token or not page_id:
        return {"status": "mock", "message": "FB Page token/id nahi mila, Settings page mein daalo"}

    async with httpx.AsyncClient(timeout=120) as client:
        try:
            place_id = await _resolve_place_id(client, token, location) if location else None

            if media_urls and _is_video(media_urls[0]):
                url = f"{GRAPH_BASE}/{page_id}/videos"
                data = {"file_url": media_urls[0], "description": caption, "access_token": token}
            elif media_urls:
                url = f"{GRAPH_BASE}/{page_id}/photos"
                data = {"url": media_urls[0], "caption": caption, "access_token": token}
            else:
                url = f"{GRAPH_BASE}/{page_id}/feed"
                data = {"message": caption, "access_token": token}
            if place_id:
                data["place"] = place_id

            r = await client.post(url, data=data)
            payload, err = safe_json(r)
            if err:
                return {"status": "error", "detail": err}
            if r.status_code >= 400:
                return {"status": "error", "detail": payload}
            return {"status": "published", "platform": "facebook", "response": payload}
        except httpx.HTTPError as e:
            return {"status": "error", "detail": str(e)}


async def _wait_for_ig_container_ready(client: httpx.AsyncClient, creation_id: str, token: str, max_wait_seconds: int = 90):
    """
    IG video/reels ko upload URL se download+process karne mein waqt lagta hai. Agar
    turant "publish" bol diya jaye to "Media ID is not available" error aati hai —
    yahan container ka status poll karte hain jab tak wo FINISHED na ho jaye.
    """
    elapsed = 0
    interval = 3
    while elapsed < max_wait_seconds:
        r = await client.get(f"{GRAPH_BASE}/{creation_id}", params={"fields": "status_code", "access_token": token})
        data, err = safe_json(r)
        if not err and data.get("status_code") == "FINISHED":
            return True, None
        if not err and data.get("status_code") == "ERROR":
            return False, {"status": "error", "step": "media_processing", "detail": data}
        await asyncio.sleep(interval)
        elapsed += interval
    return False, {"status": "error", "step": "media_processing", "detail": "IG media itni der mein process nahi hui (timeout)"}


async def post_to_instagram(caption: str, media_urls: list, location: str = ""):
    token = cfg.get("META_ACCESS_TOKEN")
    ig_id = cfg.get("IG_USER_ID")
    if not token or not ig_id:
        return {"status": "mock", "message": "IG token/id nahi mila, Settings page mein daalo"}
    if not media_urls:
        return {"status": "error", "detail": "Instagram ke liye kam az kam 1 image/video URL zaroori hai"}

    is_video = _is_video(media_urls[0])

    async with httpx.AsyncClient(timeout=180) as client:
        try:
            place_id = await _resolve_place_id(client, token, location) if location else None

            container_url = f"{GRAPH_BASE}/{ig_id}/media"
            container_data = {"caption": caption, "access_token": token}
            if is_video:
                container_data["media_type"] = "REELS"
                container_data["video_url"] = media_urls[0]
            else:
                container_data["image_url"] = media_urls[0]
            if place_id:
                container_data["location_id"] = place_id

            r1 = await client.post(container_url, data=container_data)
            container_res, err = safe_json(r1)
            if err:
                return {"status": "error", "step": "container", "detail": err}
            if r1.status_code >= 400 or "id" not in container_res:
                return {"status": "error", "step": "container", "detail": container_res}

            creation_id = container_res["id"]

            # Video ho ya image, publish se pehle confirm karo container process ho chuka hai
            ready, error = await _wait_for_ig_container_ready(client, creation_id, token)
            if not ready:
                return error

            publish_url = f"{GRAPH_BASE}/{ig_id}/media_publish"
            publish_data = {"creation_id": creation_id, "access_token": token}
            r2 = await client.post(publish_url, data=publish_data)
            publish_res, err = safe_json(r2)
            if err:
                return {"status": "error", "step": "publish", "detail": err}
            if r2.status_code >= 400:
                return {"status": "error", "step": "publish", "detail": publish_res}

            return {"status": "published", "platform": "instagram", "response": publish_res}
        except httpx.HTTPError as e:
            return {"status": "error", "detail": str(e)}


async def _wait_for_threads_container_ready(client: httpx.AsyncClient, creation_id: str, token: str, max_wait_seconds: int = 60):
    """
    Meta ne khud confirm kiya hai ye ek known Threads API quirk hai: agar container
    (khaas kar media wala) create hone ke turant baad "publish" bol do, kabhi kabhi
    "requested resource does not exist" error aati hai kyunki media abhi process ho
    raha hota hai. Yahan status poll karte hain jab tak FINISHED na ho jaye.
    """
    elapsed = 0
    interval = 2
    while elapsed < max_wait_seconds:
        r = await client.get(f"{THREADS_BASE}/{creation_id}", params={"fields": "status", "access_token": token})
        data, err = safe_json(r)
        if not err and data.get("status") == "FINISHED":
            return True, None
        if not err and data.get("status") == "ERROR":
            return False, {"status": "error", "step": "media_processing", "detail": data}
        await asyncio.sleep(interval)
        elapsed += interval
    return True, None  # timeout ho gaya to bhi publish try karte hain, shayad theek nikle


async def post_to_threads(caption: str, media_urls: list):
    token = cfg.get("THREADS_ACCESS_TOKEN") or cfg.get("META_ACCESS_TOKEN")
    threads_id = cfg.get("THREADS_USER_ID")
    if not token or not threads_id:
        return {"status": "mock", "message": "Threads token/id nahi mila, Settings page mein daalo"}

    is_video = bool(media_urls) and _is_video(media_urls[0])

    async with httpx.AsyncClient(timeout=180) as client:
        try:
            container_url = f"{THREADS_BASE}/{threads_id}/threads"
            if is_video:
                media_type = "VIDEO"
            elif media_urls:
                media_type = "IMAGE"
            else:
                media_type = "TEXT"
            container_data = {"media_type": media_type, "text": caption, "access_token": token}
            if media_urls:
                if is_video:
                    container_data["video_url"] = media_urls[0]
                else:
                    container_data["image_url"] = media_urls[0]

            r1 = await client.post(container_url, data=container_data)
            container_res, err = safe_json(r1)
            if err:
                return {"status": "error", "step": "container", "detail": err}
            if r1.status_code >= 400 or "id" not in container_res:
                return {"status": "error", "step": "container", "detail": container_res}

            creation_id = container_res["id"]

            if media_urls:
                # Media wale posts ke liye process hone ka wait karo (text-only turant chal jate hain)
                ready, error = await _wait_for_threads_container_ready(client, creation_id, token)
                if not ready:
                    return error
                # Ek extra chhota buffer bhi de dete hain, Meta ka status kabhi thora pehle
                # FINISHED bol deta hai jabke publish endpoint abhi bhi 1-2 second maang leta hai
                await asyncio.sleep(2)

            publish_url = f"{THREADS_BASE}/{threads_id}/threads_publish"
            publish_data = {"creation_id": creation_id, "access_token": token}
            r2 = await client.post(publish_url, data=publish_data)
            publish_res, err = safe_json(r2)
            if err:
                return {"status": "error", "step": "publish", "detail": err}
            if r2.status_code >= 400:
                return {"status": "error", "step": "publish", "detail": publish_res}

            return {"status": "published", "platform": "threads", "response": publish_res}
        except httpx.HTTPError as e:
            return {"status": "error", "detail": str(e)}
