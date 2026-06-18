from pydantic import BaseModel, Field


class RepairSuggestionResponse(BaseModel):
    id: str
    group_key: str
    provider: str
    model: str
    explanation: str
    impact: str
    recommended_fix: str
    before_code: str | None = None
    after_code: str | None = None
    confidence: str = "medium"
    limitations: str | None = None
    created_at: str
    updated_at: str


class RepairSuggestionExample(BaseModel):
    element: str
    page_url: str | None = None
    source_hint: str | None = None
    dom_path: str | None = None
    text_preview: str | None = None


class RepairSuggestionGroupResponse(BaseModel):
    group_key: str
    rule_id: str
    title: str
    severity: str
    recommendation: str
    wcag_criteria: list[str] = Field(default_factory=list)
    affected_count: int
    affected_pages: list[str] = Field(default_factory=list)
    examples: list[RepairSuggestionExample] = Field(default_factory=list)
    suggestion: RepairSuggestionResponse | None = None


class RepairSuggestionGroupsResponse(BaseModel):
    scan_id: str
    groups: list[RepairSuggestionGroupResponse]


class GenerateRepairSuggestionRequest(BaseModel):
    force: bool = False
