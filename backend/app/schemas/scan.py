from pydantic import BaseModel, Field, HttpUrl


class ScanPageRequest(BaseModel):
    url: HttpUrl = Field(..., description="Public webpage URL to scan")


class ScanIssue(BaseModel):
    rule_id: str
    severity: str
    element: str
    message: str
    recommendation: str


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
