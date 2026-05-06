from pydantic import BaseModel, Field

from app.schemas.scan import ScanIssue, ScanSummary


class SavedScanListItem(BaseModel):
    id: str
    url: str
    requested_url: str
    final_url: str | None = None
    status: str
    mode: str
    page_limit: int | None = None
    pages_scanned: int
    pages_skipped: int = 0
    scanned_page_urls: list[str] = Field(default_factory=list)
    skipped_page_urls: list[str] = Field(default_factory=list)
    queued_page_urls: list[str] = Field(default_factory=list)
    excluded_page_urls: list[str] = Field(default_factory=list)
    current_page_url: str | None = None
    worker_attempts: int = 0
    max_worker_attempts: int = 3
    last_error: str | None = None
    started_at: str
    completed_at: str | None = None
    duration_seconds: int | None = None
    summary: ScanSummary
    score: int | None = None
    error_message: str | None = None


class SavedScanListResponse(BaseModel):
    total: int
    limit: int
    offset: int
    items: list[SavedScanListItem]


class SavedScanResponse(SavedScanListItem):
    issues: list[ScanIssue] = Field(default_factory=list)
