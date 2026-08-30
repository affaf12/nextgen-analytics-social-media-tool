import random

# Ollama (local LLM) hata diya gaya hai — ab yeh rule-based/template generator hai jo
# turant 3 platform-optimized caption variations deta hai, koi external model call nahi.
# Agar future mein koi cloud LLM API (OpenAI, Groq, Gemini free-tier, etc.) use karni ho,
# to bas is function ke andar httpx.post() call add kar dena — baaki app ko pata nahi
# chalega, kyunke return shape wahi rehta hai jo pehle tha.

TEMPLATES_FB = [
    "{prompt} - Alhamdulillah hum apne customers ke liye behtareen service la rahe hain! 🚀 DM karein.",
    "{prompt} — aaj hi visit karein aur khud dekhein farq! 🙌",
]
TEMPLATES_LINKEDIN = [
    "🚀 {prompt} | B2B Solution for Growth. Let's Connect! #B2B",
    "{prompt} — scaling businesses with the right tools. Open to collaborate.",
]
TEMPLATES_INSTA = [
    "{prompt} ✨ New drop is here! Tap to shop 👇",
    "{prompt} 🔥 Swipe to see more. Tag a friend!",
]

HASHTAG_POOL = ["#KarachiBusiness", "#Pakistan", "#B2B", "#Growth", "#InstaPK",
                "#Trending", "#NewArrival", "#LinkedInPakistan", "#SmallBusiness", "#Digital"]


async def local_llm_generate(prompt: str, platforms: list, tone: str, language: str):
    """
    Ollama ki jagah simple template-based generator. Signature aur return shape
    bilkul same rakhi hai taake main.py ya frontend mein koi change na karna pade.
    """
    caption_fb = random.choice(TEMPLATES_FB).format(prompt=prompt)
    caption_li = random.choice(TEMPLATES_LINKEDIN).format(prompt=prompt)
    caption_ig = random.choice(TEMPLATES_INSTA).format(prompt=prompt)

    return {
        "variations": [
            {
                "caption": caption_fb,
                "hashtags": random.sample(HASHTAG_POOL, 3),
                "image_prompt": "Pakistani business celebration",
                "best_for": "Facebook Page",
            },
            {
                "caption": caption_li,
                "hashtags": random.sample(HASHTAG_POOL, 3),
                "image_prompt": "professional office meeting",
                "best_for": "LinkedIn",
            },
            {
                "caption": caption_ig,
                "hashtags": random.sample(HASHTAG_POOL, 3),
                "image_prompt": "aesthetic product photo",
                "best_for": "Instagram / Threads",
            },
        ],
        "note": "Template-based caption (local LLM removed for cloud deployment).",
    }
