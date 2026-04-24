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
