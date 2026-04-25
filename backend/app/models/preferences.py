from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB

from app.models.base import Base


class AppPreferences(Base):
    __tablename__ = "app_preferences"

    # Only one row should exist. We'll enforce this with a check constraint or just hardcode id=1
    id = Column(Integer, primary_key=True)

    # AI Provider
    ai_provider = Column(String, default="openai")
    encrypted_api_key = Column(Text, nullable=True)
    ai_model = Column(String, default="gpt-4o")
    active_suggestion_provider = Column(String, default="openai")
    auto_generate_suggestions = Column(Boolean, default=True)

    # Crawl Defaults
    default_scan_mode = Column(String, default="multi")
    default_page_limit = Column(Integer, default=20)
    crawl_depth = Column(Integer, default=3)
    request_delay_ms = Column(Integer, default=250)
    page_timeout_ms = Column(Integer, default=15000)
    ignored_url_patterns = Column(JSONB, default=["/logout", "/admin", "*.pdf"])
    stay_within_domain = Column(Boolean, default=True)
    respect_robots_txt = Column(Boolean, default=True)

    # WCAG Standard
    wcag_standard = Column(String, default="wcag2aa")
    include_best_practices = Column(Boolean, default=True)
    fail_on_experimental = Column(Boolean, default=False)

    # Notifications
    email_notifications = Column(Boolean, default=False)
    email_address = Column(String, nullable=True)
    notify_on_scan_complete = Column(Boolean, default=True)
    notify_on_scan_failed = Column(Boolean, default=True)
    notify_on_high_severity = Column(Boolean, default=False)
    weekly_summary = Column(Boolean, default=False)

    # Appearance
    theme = Column(String, default="light")
    reduced_motion = Column(Boolean, default=False)
    high_contrast = Column(Boolean, default=False)
    density = Column(String, default="comfortable")

    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
