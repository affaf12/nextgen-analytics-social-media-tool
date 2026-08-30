import json
import os
from sqlalchemy import create_engine, Column, Integer, String, DateTime, Text
from sqlalchemy.orm import declarative_base, sessionmaker
from datetime import datetime

Base = declarative_base()

VALID_STATUSES = ["New", "Contacted", "Qualified", "Customer", "Lost"]
VALID_SCHEDULE_STATUSES = ["pending", "processing", "published", "failed", "cancelled"]

DEFAULT_WORKSPACE = "default"

_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_DB_URL = f"sqlite:///{os.path.join(_BACKEND_DIR, 'crm.db')}"

SETTINGS_KEYS = [
    "META_ACCESS_TOKEN", "FB_PAGE_ID", "IG_USER_ID",
    "THREADS_USER_ID", "THREADS_ACCESS_TOKEN",
    "TWITTER_API_KEY", "TWITTER_API_SECRET", "TWITTER_ACCESS_TOKEN", "TWITTER_ACCESS_SECRET",
    "LINKEDIN_ACCESS_TOKEN", "LINKEDIN_ORG_ID", "LINKEDIN_PERSON_URN", "LINKEDIN_ORG_URN",
    "BLOGGER_ACCESS_TOKEN", "BLOGGER_BLOG_ID", "BLOGGER_REFRESH_TOKEN",
    "BLOGGER_CLIENT_ID", "BLOGGER_CLIENT_SECRET",
    "MEDIUM_ACCESS_TOKEN",
    "SUBSTACK_COOKIE", "SUBSTACK_PUBLICATION_URL", "SUBSTACK_EMAIL", "SUBSTACK_PASSWORD",
    "PUBLIC_BASE_URL",
]


class Lead(Base):
    __tablename__ = "leads"
    id = Column(Integer, primary_key=True)
    workspace_id = Column(String, default=DEFAULT_WORKSPACE, index=True)
    name = Column(String)
    source_post = Column(String)
    platform = Column(String)
    status = Column(String, default="New")
    ai_score = Column(Integer, default=50)
    created_at = Column(DateTime, default=datetime.utcnow)


class Setting(Base):
    # Composite key: same key name can exist once per workspace, so every user's
    # API keys are stored separately and never bleed into someone else's session.
    __tablename__ = "settings"
    workspace_id = Column(String, primary_key=True, default=DEFAULT_WORKSPACE)
    key = Column(String, primary_key=True)
    value = Column(Text, default="")


class ScheduledPost(Base):
    __tablename__ = "scheduled_posts"
    id = Column(Integer, primary_key=True)
    workspace_id = Column(String, default=DEFAULT_WORKSPACE, index=True)
    caption = Column(Text)
    title = Column(String, default="")
    short_caption = Column(Text, default="")
    hashtags = Column(Text, default="")
    location = Column(String, default="")
    labels = Column(Text, default="[]")
    media_urls = Column(Text, default="[]")
    platforms = Column(Text, default="[]")
    scheduled_at = Column(DateTime)
    status = Column(String, default="pending")
    result = Column(Text, default="{}")
    created_at = Column(DateTime, default=datetime.utcnow)


class CRM_DB:
    def __init__(self, db_url=DEFAULT_DB_URL):
        self.engine = create_engine(db_url, connect_args={"check_same_thread": False})
        Base.metadata.create_all(self.engine)
        self._migrate()
        self.Session = sessionmaker(bind=self.engine)
        self._seed()

    def _migrate(self):
        with self.engine.connect() as conn:
            # scheduled_posts: older columns
            cols = [row[1] for row in conn.exec_driver_sql("PRAGMA table_info(scheduled_posts)").fetchall()]
            if "short_caption" not in cols:
                if "threads_caption" in cols:
                    conn.exec_driver_sql("ALTER TABLE scheduled_posts RENAME COLUMN threads_caption TO short_caption")
                else:
                    conn.exec_driver_sql("ALTER TABLE scheduled_posts ADD COLUMN short_caption TEXT DEFAULT ''")
                conn.commit()
            for col, ddl in [
                ("hashtags", "ALTER TABLE scheduled_posts ADD COLUMN hashtags TEXT DEFAULT ''"),
                ("location", "ALTER TABLE scheduled_posts ADD COLUMN location TEXT DEFAULT ''"),
                ("labels", "ALTER TABLE scheduled_posts ADD COLUMN labels TEXT DEFAULT '[]'"),
                ("workspace_id", f"ALTER TABLE scheduled_posts ADD COLUMN workspace_id TEXT DEFAULT '{DEFAULT_WORKSPACE}'"),
            ]:
                if col not in cols:
                    conn.exec_driver_sql(ddl)
                    conn.commit()

            # leads: workspace_id
            lead_cols = [row[1] for row in conn.exec_driver_sql("PRAGMA table_info(leads)").fetchall()]
            if "workspace_id" not in lead_cols:
                conn.exec_driver_sql(f"ALTER TABLE leads ADD COLUMN workspace_id TEXT DEFAULT '{DEFAULT_WORKSPACE}'")
                conn.commit()

            # settings: old schema had "key" as the sole primary key (single shared row
            # per key, no workspace). Rebuild the table so every (workspace_id, key) pair
            # gets its own row — old saved keys become the "default" workspace's keys,
            # nothing is lost, but new browsers/workspaces start empty.
            setting_cols = [row[1] for row in conn.exec_driver_sql("PRAGMA table_info(settings)").fetchall()]
            if setting_cols and "workspace_id" not in setting_cols:
                conn.exec_driver_sql("ALTER TABLE settings RENAME TO settings_old")
                conn.exec_driver_sql(
                    "CREATE TABLE settings ("
                    "workspace_id TEXT NOT NULL DEFAULT 'default', "
                    "key TEXT NOT NULL, "
                    "value TEXT DEFAULT '', "
                    "PRIMARY KEY (workspace_id, key))"
                )
                conn.exec_driver_sql(
                    f"INSERT INTO settings (workspace_id, key, value) "
                    f"SELECT '{DEFAULT_WORKSPACE}', key, value FROM settings_old"
                )
                conn.exec_driver_sql("DROP TABLE settings_old")
                conn.commit()

    def _seed(self):
        session = self.Session()
        if session.query(Lead).count() == 0:
            demo = [
                Lead(workspace_id=DEFAULT_WORKSPACE, name="Ali Traders", source_post="Eid Offer - 50% Off", platform="instagram", status="New", ai_score=85),
                Lead(workspace_id=DEFAULT_WORKSPACE, name="Sara Marketing", source_post="B2B Leads Guide", platform="linkedin", status="Qualified", ai_score=92),
                Lead(workspace_id=DEFAULT_WORKSPACE, name="Karachi Store", source_post="New Collection", platform="fb_page", status="Contacted", ai_score=70),
            ]
            session.add_all(demo)
            session.commit()
        session.close()

    # ---------- Leads (workspace-scoped) ----------
    @staticmethod
    def _to_dict(l: Lead):
        return {
            "id": l.id, "name": l.name, "source_post": l.source_post,
            "platform": l.platform, "status": l.status, "ai_score": l.ai_score,
            "created_at": str(l.created_at),
        }

    def get_all_leads(self, workspace_id: str = DEFAULT_WORKSPACE):
        session = self.Session()
        leads = session.query(Lead).filter(Lead.workspace_id == workspace_id).order_by(Lead.created_at.desc()).all()
        result = [self._to_dict(l) for l in leads]
        session.close()
        return result

    def add_lead(self, data, workspace_id: str = DEFAULT_WORKSPACE):
        session = self.Session()
        lead = Lead(workspace_id=workspace_id, **data)
        session.add(lead)
        session.commit()
        session.refresh(lead)
        result = self._to_dict(lead)
        session.close()
        return result

    def update_lead(self, lead_id: int, data: dict, workspace_id: str = DEFAULT_WORKSPACE):
        session = self.Session()
        lead = session.query(Lead).filter(Lead.id == lead_id, Lead.workspace_id == workspace_id).first()
        if not lead:
            session.close()
            return None
        for key, value in data.items():
            if value is not None and hasattr(lead, key):
                setattr(lead, key, value)
        session.commit()
        session.refresh(lead)
        result = self._to_dict(lead)
        session.close()
        return result

    def delete_lead(self, lead_id: int, workspace_id: str = DEFAULT_WORKSPACE):
        session = self.Session()
        lead = session.query(Lead).filter(Lead.id == lead_id, Lead.workspace_id == workspace_id).first()
        if not lead:
            session.close()
            return False
        session.delete(lead)
        session.commit()
        session.close()
        return True

    def get_stats(self, workspace_id: str = DEFAULT_WORKSPACE):
        session = self.Session()
        leads = session.query(Lead).filter(Lead.workspace_id == workspace_id).all()
        stats = {"total": len(leads), "by_status": {}, "by_platform": {}, "avg_score": 0}
        if leads:
            for l in leads:
                stats["by_status"][l.status] = stats["by_status"].get(l.status, 0) + 1
                stats["by_platform"][l.platform] = stats["by_platform"].get(l.platform, 0) + 1
            stats["avg_score"] = round(sum(l.ai_score for l in leads) / len(leads), 1)
        session.close()
        return stats

    # ---------- Settings (workspace-scoped — this is what keeps API keys isolated) ----------
    def get_setting(self, key: str, default: str = "", workspace_id: str = DEFAULT_WORKSPACE) -> str:
        session = self.Session()
        row = session.query(Setting).filter(Setting.key == key, Setting.workspace_id == workspace_id).first()
        session.close()
        return row.value if row and row.value else default

    def get_all_settings(self, workspace_id: str = DEFAULT_WORKSPACE):
        session = self.Session()
        rows = session.query(Setting).filter(Setting.workspace_id == workspace_id).all()
        result = {r.key: r.value for r in rows}
        session.close()
        return result

    def save_settings(self, data: dict, workspace_id: str = DEFAULT_WORKSPACE):
        session = self.Session()
        for key, value in data.items():
            if key not in SETTINGS_KEYS:
                continue
            clean_value = (value or "").strip().strip('"').strip("'").strip()
            row = session.query(Setting).filter(Setting.key == key, Setting.workspace_id == workspace_id).first()
            if row:
                row.value = clean_value
            else:
                session.add(Setting(workspace_id=workspace_id, key=key, value=clean_value))
        session.commit()
        session.close()
        return self.get_all_settings(workspace_id)

    # ---------- Scheduled posts (workspace-scoped) ----------
    @staticmethod
    def _sched_to_dict(s: ScheduledPost):
        return {
            "id": s.id, "caption": s.caption, "title": s.title,
            "short_caption": s.short_caption or "",
            "hashtags": s.hashtags or "",
            "location": s.location or "",
            "labels": json.loads(s.labels or "[]"),
            "media_urls": json.loads(s.media_urls or "[]"),
            "platforms": json.loads(s.platforms or "[]"),
            "scheduled_at": (s.scheduled_at.isoformat() + "Z") if s.scheduled_at else None,
            "status": s.status,
            "result": json.loads(s.result or "{}"),
            "created_at": str(s.created_at),
            "workspace_id": s.workspace_id,
        }

    def add_scheduled_post(self, caption, title, media_urls, platforms, scheduled_at,
                            short_caption="", hashtags="", location="", labels=None,
                            workspace_id: str = DEFAULT_WORKSPACE):
        session = self.Session()
        row = ScheduledPost(
            workspace_id=workspace_id,
            caption=caption, title=title, short_caption=short_caption or "",
            hashtags=hashtags or "", location=location or "", labels=json.dumps(labels or []),
            media_urls=json.dumps(media_urls or []),
            platforms=json.dumps(platforms or []),
            scheduled_at=scheduled_at, status="pending",
        )
        session.add(row)
        session.commit()
        session.refresh(row)
        result = self._sched_to_dict(row)
        session.close()
        return result

    def get_scheduled_posts(self, workspace_id: str = DEFAULT_WORKSPACE):
        session = self.Session()
        rows = session.query(ScheduledPost).filter(
            ScheduledPost.workspace_id == workspace_id
        ).order_by(ScheduledPost.scheduled_at.asc()).all()
        result = [self._sched_to_dict(r) for r in rows]
        session.close()
        return result

    def get_due_posts(self, now: datetime):
        # NOTE: intentionally NOT workspace-filtered — the background scheduler must see
        # due posts across every workspace, then set the right workspace context per post
        # before publishing (see scheduler_service.py) so each post uses its owner's keys.
        session = self.Session()
        rows = session.query(ScheduledPost).filter(
            ScheduledPost.status == "pending", ScheduledPost.scheduled_at <= now
        ).all()
        result = [self._sched_to_dict(r) for r in rows]
        session.close()
        return result

    def mark_scheduled_result(self, post_id: int, status: str, result: dict):
        session = self.Session()
        row = session.query(ScheduledPost).filter(ScheduledPost.id == post_id).first()
        if row:
            row.status = status
            row.result = json.dumps(result)
            session.commit()
        session.close()

    def delete_scheduled_post(self, post_id: int, workspace_id: str = DEFAULT_WORKSPACE):
        session = self.Session()
        row = session.query(ScheduledPost).filter(
            ScheduledPost.id == post_id, ScheduledPost.workspace_id == workspace_id
        ).first()
        if not row:
            session.close()
            return False
        session.delete(row)
        session.commit()
        session.close()
        return True
