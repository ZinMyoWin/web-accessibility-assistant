from typing import Literal

from pydantic import BaseModel, Field, HttpUrl


class ScanPageRequest(BaseModel):
    """Scan request body.

    Every option is optional: when a field is omitted the user's saved
    preferences supply the value, and only explicitly provided values override
    those preferences. ``model_fields_set`` is used by the resolver to tell an
    omitted field apart from an explicit value.
    """

    url: HttpUrl = Field(..., description="Public webpage URL to scan")
    mode: Literal["single", "multi"] | None = None
    page_limit: int | None = Field(default=None, ge=1, le=500)
    crawl_depth: int | None = Field(default=None, ge=1, le=10)
    request_delay_ms: int | None = Field(default=None, ge=0, le=5000)
    page_timeout_ms: int | None = Field(default=None, ge=1000, le=60000)
    ignored_url_patterns: list[str] | None = None
    stay_within_domain: bool | None = None
    respect_robots_txt: bool | None = None
    skip_previously_scanned_pages: bool | None = None
    wcag_standard: str | None = None
    include_best_practices: bool | None = None


class ScanIssue(BaseModel):
    rule_id: str
    severity: str
    element: str
    message: str
    recommendation: str
    line: int | None = None
    column: int | None = None
    source_hint: str | None = None
    dom_path: str | None = None
    text_preview: str | None = None
    screenshot_data_url: str | None = None
    wcag_criteria: list[str] | None = None
    source: str | None = None
    page_url: str | None = None


class ScanSummary(BaseModel):
    total_issues: int
    high: int
    medium: int
    low: int


class ScanPageResponse(BaseModel):
    scan_id: str | None = None
    status: Literal["queued", "running", "complete", "error", "cancelled"] = "complete"
    url: str
    scanned_at: str
    mode: Literal["single", "multi"] = "single"
    pages_scanned: int = 1
    pages_skipped: int = 0
    scanned_page_urls: list[str] = Field(default_factory=list)
    skipped_page_urls: list[str] = Field(default_factory=list)
    queued_page_urls: list[str] = Field(default_factory=list)
    excluded_page_urls: list[str] = Field(default_factory=list)
    current_page_url: str | None = None
    worker_attempts: int = 0
    max_worker_attempts: int = 3
    last_error: str | None = None
    summary: ScanSummary
    issues: list[ScanIssue]


class ScanQueuePageRequest(BaseModel):
    url: str
