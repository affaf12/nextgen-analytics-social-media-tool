from services.meta_service import post_to_facebook_page, post_to_instagram, post_to_threads
from services.twitter_service import post_to_twitter
from services.linkedin_service import post_to_linkedin
from services.blogger_service import post_to_blogger
from services.medium_service import post_to_medium
from services.substack_service import post_to_substack


def _with_hashtags(text: str, hashtags: str) -> str:
    """Hashtags ko caption ke aakhir mein neat tareeqe se jorta hai (agar user ne khud se
    '#' laga rakha hai to double '#' nahi banta)."""
    if not hashtags:
        return text
    tags = []
    for tag in hashtags.replace(",", " ").split():
        tag = tag.strip()
        if not tag:
            continue
        tags.append(tag if tag.startswith("#") else f"#{tag}")
    if not tags:
        return text
    return f"{text}\n\n{' '.join(tags)}" if text else " ".join(tags)


async def publish_to_platforms(
    caption: str, title: str, media_urls: list, platforms: list,
    short_caption: str = "", hashtags: str = "", location: str = "", labels: list = None,
) -> dict:
    # Threads aur Twitter dono kam-text platforms hain, isliye ek hi "short" content share
    # karte hain; agar khaali chora hai to normal caption fallback hoga
    short_text = (short_caption or "").strip() or caption

    caption_with_tags = _with_hashtags(caption, hashtags)
    short_text_with_tags = _with_hashtags(short_text, hashtags)

    results = {}
    for plat in platforms:
        try:
            if plat == "fb_page":
                results[plat] = await post_to_facebook_page(caption_with_tags, media_urls, location)
            elif plat == "ig":
                results[plat] = await post_to_instagram(caption_with_tags, media_urls, location)
            elif plat == "threads":
                results[plat] = await post_to_threads(short_text_with_tags, media_urls)
            elif plat == "twitter":
                results[plat] = await post_to_twitter(short_text_with_tags, media_urls)
            elif plat in ["linkedin_profile", "linkedin_page"]:
                results[plat] = await post_to_linkedin(caption_with_tags, media_urls, plat)
            elif plat == "blogger":
                results[plat] = await post_to_blogger(caption, title, media_urls, location, labels)
            elif plat == "medium":
                results[plat] = await post_to_medium(caption, title, media_urls)
            elif plat == "substack":
                results[plat] = await post_to_substack(caption, title, media_urls)
            else:
                results[plat] = {"status": "error", "detail": f"Unknown platform: {plat}"}
        except Exception as e:
            results[plat] = {"status": "error", "detail": str(e)}
    return results
