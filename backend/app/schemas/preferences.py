from pydantic import BaseModel, Field


class AppPreferencesBase(BaseModel):
    ai_provider: str = "openai"
    ai_model: str = "gpt-4o"
    active_suggestion_provider: str = "openai"
    auto_generate_suggestions: bool = True
    
    default_scan_mode: str = "multi"
    default_page_limit: int = Field(default=20, ge=1, le=500)
    crawl_depth: int = Field(default=3, ge=1, le=10)
    request_delay_ms: int = Field(default=250, ge=0, le=5000)
    page_timeout_ms: int = Field(default=15000, ge=1000, le=60000)
    ignored_url_patterns: list[str] = ["/logout", "/admin", "*.pdf"]
    stay_within_domain: bool = True
    respect_robots_txt: bool = True
    
    wcag_standard: str = "wcag2aa"
    include_best_practices: bool = True
    fail_on_experimental: bool = False
    
    email_notifications: bool = False
    email_address: str | None = None
    notify_on_scan_complete: bool = True
    notify_on_scan_failed: bool = True
    notify_on_high_severity: bool = False
    weekly_summary: bool = False
    
    theme: str = "light"
    reduced_motion: bool = False
    high_contrast: bool = False
    density: str = "comfortable"


class AppPreferencesUpdate(AppPreferencesBase):
    api_key: str | None = None  # Received from frontend, encrypted and stored


class AppPreferencesResponse(AppPreferencesBase):
    has_api_key: bool = False  # Tells frontend if a key is currently configured

    class Config:
        from_attributes = True
