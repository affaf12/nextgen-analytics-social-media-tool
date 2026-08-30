---
title: NextGen Analytics Social Media Tool
emoji: 📊
colorFrom: blue
colorTo: purple
sdk: docker
app_port: 7860
pinned: false
---

# NextGen Analytics — Social Media Tool (Backend)

Yeh Hugging Face Space sirf backend API hai (FastAPI + SQLite + APScheduler).
Frontend (React) alag se GitHub Pages par host hota hai aur yahan is Space ke
public URL par API calls karta hai.

## Space Settings mein zaroor set karo

**Settings → Variables and secrets** mein ye add karo:

- `ALLOWED_ORIGINS` — GitHub Pages URL, jaise `https://yourusername.github.io`
- `META_ACCESS_TOKEN`, `FB_PAGE_ID`, `IG_USER_ID`, `THREADS_USER_ID`, `THREADS_ACCESS_TOKEN`
- `LINKEDIN_ACCESS_TOKEN`, `LINKEDIN_ORG_ID`, `LINKEDIN_ORG_URN`, `LINKEDIN_PERSON_URN`
- `BLOGGER_ACCESS_TOKEN`, `BLOGGER_BLOG_ID`, `BLOGGER_REFRESH_TOKEN`, `BLOGGER_CLIENT_ID`, `BLOGGER_CLIENT_SECRET`
- `MEDIUM_ACCESS_TOKEN`
- `SUBSTACK_PUBLICATION_URL`, `SUBSTACK_EMAIL`, `SUBSTACK_PASSWORD` (ya `SUBSTACK_COOKIE`)
- `PUBLIC_BASE_URL` — is Space ka apna public URL, e.g. `https://yourusername-affaf-crm-backend.hf.space`
  (media uploads ke liye zaroori hai, warna FB/IG/Threads ko image ka URL nahi milega)

Sab keys UI se bhi Settings page (Channels) ke through save ho sakti hain — ye env
vars sirf pehli baar ke liye ya backup ke liye hain.

**Important:** yeh env vars/secrets SIRF tumhare apne direct/local use ke liye
fallback hoti hain. Koi doosra banda jab yeh app ka link share kar ke khole, uska
browser apna khud ka private "workspace ID" banata hai (koi login nahi) — uski Settings
page se daali gayi keys, leads, aur scheduled posts sirf usi workspace se linked
rehte hain. Woh tumhari yahan saved keys kabhi nahi dekh sakta na use kar sakta hai,
aur agar woh apni key na daale to uska request "mock" response dega — kisi ki key
kisi doosre ke posts publish nahi karti.

## Important limits (free HF Space)

- **SQLite data** ephemeral hai — Space restart/rebuild hone par CRM data
  (leads, scheduled posts) delete ho sakta hai jab tak Persistent Storage add na karo.
- **Sleep**: free Space ek lambe inactivity period ke baad so jata hai. Pehli
  request uske baad thodi slow (cold start, ~30-60 sec) hogi — yeh normal hai,
  koi error nahi.
- **Local LLM (Ollama) hata diya gaya hai** — caption generator ab template-based
  hai, koi external model call nahi karta.

## Local run / test

```
cd backend
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload --port 8000
```
