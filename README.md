# NextGen Analytics — Social Media Tool

AI se social media post banao (image/video ke sath), abhi ya future date/time par
schedule karo, ek click mein platforms par publish karo, aur leads ko CRM pipeline
mein track karo. Sab keys ek Settings page se save hoti hain.

## Stack
- Backend: FastAPI (Python), SQLite, APScheduler (background scheduling)
- Frontend: React + Vite + Tailwind
- Caption generator: template-based (no external/local LLM required)

## Live deployment (GitHub Pages + Hugging Face Space)

Yeh repo do jagah split hoke deploy hota hai:

| Part | Where | Auto-deploy |
|---|---|---|
| Frontend (React) | GitHub Pages | `.github/workflows/deploy.yml` — har push par |
| Backend (FastAPI) | Hugging Face Space (Docker) | Space ko GitHub repo se sync/link karo, ya `backend/` folder manually push karo |

### 1. Backend → Hugging Face Space
1. huggingface.co par naya Space banao → **Docker** SDK select karo.
2. Sirf `backend/` folder ka content us Space repo mein push karo (`backend/Dockerfile`,
   `backend/README.md` mein HF metadata pehle se hai).
3. Space **Settings → Variables and secrets** mein saari API keys aur
   `ALLOWED_ORIGINS=https://yourusername.github.io` add karo (details `backend/README.md` mein).
4. Space ka public URL note kar lo, e.g. `https://yourusername-affaf-crm-backend.hf.space`

### 2. Frontend → GitHub Pages
1. Repo **Settings → Pages → Source: GitHub Actions** set karo.
2. Repo **Settings → Secrets and variables → Actions → Variables** mein:
   - `VITE_API_URL` = upar wala HF Space URL
3. `main` branch par push karo (ya Actions tab se workflow manually run karo) — Pages par
   khud build ho kar deploy ho jayega.

### 3. (Optional) Space ko sleep se bachane ke liye
Free HF Space lambe inactivity ke baad so jata hai (pehli request tab thodi slow hoti hai).
`.github/workflows/keepalive.yml` har 30 min mein Space ko ping karta hai — isay chalane ke
liye Actions variable `HF_SPACE_URL` set karo. Yeh 100% guarantee nahi deta (HF maintenance
apna restart kar sakta hai) lekin normal idle-sleep ko rok deta hai.

## Local development
```
cd backend
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload --port 8000
```
```
cd frontend
npm install
npm run dev
```
App: http://localhost:5173 · API docs: http://localhost:8000/docs

## Pages
- **Generator** — prompt se 3 platform-optimized caption variations (template-based)
- **Publish** — image/video upload, caption, title, platforms, "Publish now" ya "Schedule for later"
- **Calendar** — month view + upcoming scheduled posts, status (pending/published/failed), cancel option
- **Leads** — kanban-style pipeline, live stats
- **Channels (Settings)** — har platform ki API key daal kar save karo; SQLite mein store hoti hain

## Supported platforms
Facebook Page, Instagram (image + video/reels), Threads, LinkedIn (profile + company page), Blogger, Medium, Substack.
Jis platform ki key nahi mili, wo `status: "mock"` return karta hai — app kabhi crash nahi hota.

## Media upload — important
Facebook/Instagram/Threads ko ek **publicly reachable** image/video URL chahiye hota hai.
HF Space deployment mein Space ka apna public URL hi `PUBLIC_BASE_URL` ke tor par use karo
(details `backend/README.md` mein).

## Scheduling
Har 30 second mein backend khud check karta hai koi post due hai to publish kar deta hai —
server (HF Space) active rehna zaroori hai isliye keep-alive workflow ka istemal karo.
