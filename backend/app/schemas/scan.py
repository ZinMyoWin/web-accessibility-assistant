from pydantic import BaseModel, Field, HttpUrl


class ScanPageRequest(BaseModel):
    url: HttpUrl = Field(..., description="Public webpage URL to scan")


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


class ScanSummary(BaseModel):
    total_issues: int
    high: int
    medium: int
    low: int


class ScanPageResponse(BaseModel):
    url: str
    scanned_at: str
    summary: ScanSummary
    issues: list[ScanIssue]
