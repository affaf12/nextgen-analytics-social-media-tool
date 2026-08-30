from datetime import datetime
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from services.publisher import publish_to_platforms
from services import settings_service as cfg

_scheduler = AsyncIOScheduler()


def start_scheduler(db):
    async def check_due_posts():
        due = db.get_due_posts(datetime.utcnow())
        for post in due:
            # Turant "processing" mark karo (publish call se pehle) — taake agar koi dusra
            # overlapping check-run isi post ko dobara utha le (jab pichla run abhi khatam
            # nahi hua), to wo duplicate publish na kare. Status khud "processing" filter
            # ho jata hai kyunki get_due_posts sirf "pending" wale posts uthata hai.
            db.mark_scheduled_result(post["id"], "processing", {})
            # Yeh post kis workspace (kis banda) ka hai, usi ki API keys use ho —
            # background job ke paas koi request/browser nahi hota, isliye yahan
            # explicitly set karna zaroori hai (warna last request wali workspace
            # ki keys use ho jatin, jo galat banda ki keys se publish kar deta).
            cfg.set_workspace(post.get("workspace_id", "default"))
            try:
                results = await publish_to_platforms(
                    post["caption"], post.get("title", ""), post["media_urls"], post["platforms"],
                    post.get("short_caption", ""), post.get("hashtags", ""),
                    post.get("location", ""), post.get("labels", []),
                )
                failed = any(r.get("status") == "error" for r in results.values())
                db.mark_scheduled_result(post["id"], "failed" if failed else "published", results)
            except Exception as e:
                db.mark_scheduled_result(post["id"], "failed", {"error": str(e)})

    # IMPORTANT: pass the coroutine function itself (not a sync wrapper).
    # AsyncIOScheduler detects async functions and runs them directly on the
    # running event loop. A sync wrapper gets pushed to a worker thread by
    # APScheduler, where there is no running loop -> "no running event loop".
    #
    # max_instances=3: agar ek publish (jaise LinkedIn ka retry-wala flow) 30 second se
    # zyada le le, to agla scheduled check "skip" nahi hona chahiye — warna dusre due
    # posts miss ho jate hain jab tak pehla khatam na ho. misfire_grace_time badha diya
    # hai taake agar backend kuch der band raha ho (jaisa restart karte waqt), to wapas
    # aane par overdue posts turant fire ho jayen, "misfire" declare karke skip na ho.
    _scheduler.add_job(
        check_due_posts, "interval", seconds=30, id="scheduled_posts_check",
        replace_existing=True, max_instances=3, misfire_grace_time=3600,
    )
    _scheduler.start()


def stop_scheduler():
    if _scheduler.running:
        _scheduler.shutdown(wait=False)
