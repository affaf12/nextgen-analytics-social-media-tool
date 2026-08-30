import json
import httpx
from services import settings_service as cfg
from services.http_utils import safe_json

"""
ZAROORI NOTE: Substack ka koi OFFICIAL public "publish post" API nahi hai (sirf ek
profile-search API hai jo posting ke liye nahi). Ye service Substack ke apne website
ke wahi internal/undocumented endpoints use karti hai jo browser khud call karta hai —
isi tareeqe se saari "unofficial" Substack libraries (jaise python-substack) kaam karti
hain. Yahan koi proper API token nahi hota, balke ek login-session cookie use hoti hai.
Ye kabhi bhi Substack apne internal API mein tabdeeli kare to tut sakta hai, kyunki
Substack ne isay officially support/document nahi kiya.

Cookie do tareeqon se mil sakti hai:
1. Manual: browser mein login karke DevTools se "substack.sid" cookie copy karna.
2. Auto-refresh: agar SUBSTACK_EMAIL + SUBSTACK_PASSWORD Settings mein diye hain, to
   ye service khud Substack ke login endpoint se naya cookie le kar save kar leti hai —
   na manually DevTools kholni parti hai, na baar baar cookie copy karni parti hai.
   (Note: agar account "password-less / magic link" wala hai to pehle Substack par
   password set karna hoga — Sign out -> "Sign in with password" -> "Set a new password".)
"""

LOGIN_URL = "https://substack.com/api/v1/login"
BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
}


async def refresh_substack_cookie(client: httpx.AsyncClient = None):
    """Email+password se login karke naya session cookie leta hai aur Settings mein save
    kar deta hai. Ye function 'Refresh' button se, ya khud-ba-khud (cookie expire hone par)
    dono se call ho sakta hai."""
    email = cfg.get("SUBSTACK_EMAIL")
    password = cfg.get("SUBSTACK_PASSWORD")
    if not email or not password:
        return None, {"status": "error", "detail": "SUBSTACK_EMAIL/SUBSTACK_PASSWORD Settings mein nahi diye"}

    own_client = client is None
    if own_client:
        client = httpx.AsyncClient(timeout=30, headers=BROWSER_HEADERS)
    try:
        # Substack ka login endpoint pehle se ek base/anonymous session cookie maangta
        # hai (jaisa normal browser pehle site khol ke aata hai) — seedha login POST
        # karne se "session cookie not set" jaisi error aati hai. Isliye pehle ek chhoti
        # si warm-up request bhejte hain taake httpx apne cookie jar mein zaroori
        # cookies bhar le, phir login karte hain.
        await client.get("https://substack.com/", headers=BROWSER_HEADERS)

        r = await client.post(LOGIN_URL, headers=BROWSER_HEADERS, json={
            "redirect": "", "for_pub": "", "email": email, "password": password, "captcha_response": None,
        })
        if r.status_code >= 400:
            data, _ = safe_json(r)
            # Substack kabhi kabhi login pe captcha maang leta hai — automation se wo pass
            # nahi ho sakta, is case mein manual (DevTools) cookie hi chalegi
            return None, {"status": "error", "step": "login", "detail": data or f"HTTP {r.status_code}"}

        new_cookie = r.cookies.get("substack.sid")
        if not new_cookie:
            return None, {"status": "error", "step": "login", "detail": "Login kaamyab laga lekin cookie nahi mili"}

        cfg.save("SUBSTACK_COOKIE", new_cookie)
        return new_cookie, None
    except httpx.HTTPError as e:
        return None, {"status": "error", "step": "login", "detail": str(e)}
    finally:
        if own_client:
            await client.aclose()


async def _get_user_id(client: httpx.AsyncClient, base_url: str, cookie: str):
    r = await client.get(f"{base_url}/api/v1/subscription", headers={"Cookie": f"substack.sid={cookie}"})
    data, err = safe_json(r)
    if err or r.status_code >= 400:
        return None, cookie, {"status": "error", "step": "auth", "detail": err or data}
    user_id = data.get("user_id") or (data.get("publication") or {}).get("author_id")
    if not user_id:
        return None, cookie, {"status": "error", "step": "auth", "detail": "Cookie se user id nahi mila — cookie expire/galat ho sakti hai"}
    return user_id, cookie, None


async def _get_user_id_with_auto_refresh(client: httpx.AsyncClient, base_url: str, cookie: str):
    """Pehle jo cookie hai wahi try karo; agar wo expire nikli aur email/password Settings
    mein diye hain, to khud login karke naya cookie le lo aur ek dafa dobara try karo."""
    user_id, cookie, err = await _get_user_id(client, base_url, cookie)
    if not err:
        return user_id, cookie, None

    new_cookie, refresh_err = await refresh_substack_cookie(client)
    if refresh_err:
        # Auto-refresh na ho saka (email/password nahi diye, ya login fail hua) — asal
        # (pehli) error hi dikhao, us mein clear pata chal jayega ke cookie refresh
        # karni hai
        return None, cookie, err

    user_id, cookie, err2 = await _get_user_id(client, base_url, new_cookie)
    if err2:
        return None, cookie, err2
    return user_id, cookie, None


async def post_to_substack(caption: str, title: str, media_urls: list):
    cookie = cfg.get("SUBSTACK_COOKIE")
    pub_url = cfg.get("SUBSTACK_PUBLICATION_URL", "").rstrip("/")
    has_login = bool(cfg.get("SUBSTACK_EMAIL")) and bool(cfg.get("SUBSTACK_PASSWORD"))
    if not pub_url or (not cookie and not has_login):
        return {"status": "mock", "message": "Substack cookie (ya email+password) aur publication URL nahi mila, Settings page mein daalo"}
    if not pub_url.startswith("http"):
        pub_url = f"https://{pub_url}"

    content_nodes = []
    if media_urls:
        content_nodes.append({"type": "captionedImage", "content": [{"type": "image2", "attrs": {"src": media_urls[0]}}]})
    content_nodes.append({"type": "paragraph", "content": [{"type": "text", "text": caption}]})

    draft_body = {"type": "doc", "content": content_nodes}

    async with httpx.AsyncClient(timeout=60, headers=BROWSER_HEADERS) as client:
        try:
            user_id, cookie, err = await _get_user_id_with_auto_refresh(client, pub_url, cookie)
            if err:
                return err

            headers = {"Cookie": f"substack.sid={cookie}", "Content-Type": "application/json"}

            payload = {
                "draft_title": title or "New Post",
                "draft_subtitle": "",
                "draft_body": json.dumps(draft_body),
                "draft_bylines": [{"id": user_id, "is_guest": False}],
                "type": "newsletter",
                "audience": "everyone",
            }
            r1 = await client.post(f"{pub_url}/api/v1/drafts", headers=headers, json=payload)
            draft_res, err = safe_json(r1)
            if err:
                return {"status": "error", "step": "draft", "detail": err}
            if r1.status_code >= 400 or "id" not in draft_res:
                return {"status": "error", "step": "draft", "detail": draft_res}

            draft_id = draft_res["id"]

            r2 = await client.post(
                f"{pub_url}/api/v1/drafts/{draft_id}/publish",
                headers=headers,
                json={"send": False, "share_automatically": False},
            )
            publish_res, err = safe_json(r2)
            if err:
                return {"status": "error", "step": "publish", "detail": err}
            if r2.status_code >= 400:
                return {"status": "error", "step": "publish", "detail": publish_res}

            return {"status": "published", "platform": "substack", "url": publish_res.get("canonical_url") or pub_url}
        except httpx.HTTPError as e:
            return {"status": "error", "detail": str(e)}
