import os
from datetime import UTC, datetime
from uuid import UUID

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session

from app.db import get_db_session
from app.repositories.scan_repository import (
    clear_saved_scans,
    get_saved_scan,
    list_saved_scans,
    save_completed_scan,
    save_failed_scan,
    to_saved_scan_response,
)
from app.schemas.history import SavedScanListResponse, SavedScanResponse
from app.schemas.scan import ScanPageRequest, ScanPageResponse
from app.schemas.preferences import AppPreferencesResponse, AppPreferencesUpdate
from app.services.page_scanner import ScanError, scan_page
from app.repositories.preferences_repository import (
    get_preferences,
    reset_preferences,
    update_preferences,
)

LOCAL_CORS_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
]


def get_allowed_origins() -> list[str]:
    origins = list(LOCAL_CORS_ORIGINS)

    frontend_url = os.getenv("FRONTEND_URL", "").strip()
    if frontend_url:
        origins.append(frontend_url)

    extra_origins = os.getenv("CORS_ALLOWED_ORIGINS", "")
    if extra_origins:
        origins.extend(origin.strip() for origin in extra_origins.split(","))

    deduplicated_origins: list[str] = []
    seen_origins: set[str] = set()

    for origin in origins:
        normalized_origin = origin.rstrip("/")
        if not normalized_origin or normalized_origin in seen_origins:
            continue
        seen_origins.add(normalized_origin)
        deduplicated_origins.append(normalized_origin)

    return deduplicated_origins


def get_allowed_origin_regex() -> str | None:
    allowed_origin_regex = os.getenv("CORS_ALLOWED_ORIGIN_REGEX", "").strip()
    return allowed_origin_regex or None


app = FastAPI(title="Web Accessibility Assistant API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_allowed_origins(),
    allow_origin_regex=get_allowed_origin_regex(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def read_root():
    return {"message": "Web Accessibility Assistant API is running"}


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "web-accessibility-assistant-backend",
    }


@app.get("/test/page-bad", response_class=HTMLResponse)
def test_bad_page():
    return """
    <html>
      <body>
        <a href="/more">click here</a>
        <img src="/image.png">
        <h1>Main heading</h1>
        <h3>Skipped heading level</h3>
        <div id="duplicate-id">First block</div>
        <div id="duplicate-id">Second block</div>

        <!-- Additional issues for axe-core detection -->
        <p style="color: #aaa; background-color: #fff;">Low contrast text</p>
        <button></button>
        <form>
          <input type="text">
          <select><option>Pick one</option></select>
        </form>
        <marquee>Scrolling text</marquee>
        <table>
          <tr><td>Data without headers</td><td>Another cell</td></tr>
        </table>
      </body>
    </html>
    """


@app.post("/scan/page", response_model=ScanPageResponse)
def scan_single_page(request: ScanPageRequest, db: Session = Depends(get_db_session)):
    requested_url = str(request.url)
    started_at = datetime.now(UTC)

    try:
        result = scan_page(requested_url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ScanError as exc:
        try:
            save_failed_scan(
                db,
                requested_url=requested_url,
                error_message=exc.message,
                started_at=started_at,
                completed_at=datetime.now(UTC),
            )
        except Exception:
            db.rollback()
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    completed_at = datetime.fromisoformat(result.scanned_at)

    try:
        saved_scan = save_completed_scan(
            db,
            requested_url=requested_url,
            result=result,
            started_at=started_at,
            completed_at=completed_at,
        )
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to save scan result") from exc

    result.scan_id = str(saved_scan.id)
    return result


@app.get("/scans", response_model=SavedScanListResponse)
def get_scans(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    status: str | None = Query(default=None),
    mode: str | None = Query(default=None),
    q: str | None = Query(default=None),
    db: Session = Depends(get_db_session),
):
    return list_saved_scans(db, limit=limit, offset=offset, status=status, mode=mode, q=q)


@app.get("/scans/{scan_id}", response_model=SavedScanResponse)
def get_scan(scan_id: UUID, db: Session = Depends(get_db_session)):
    scan_run = get_saved_scan(db, scan_id)
    if scan_run is None:
        raise HTTPException(status_code=404, detail="Scan not found")
    return to_saved_scan_response(scan_run)


@app.delete("/scans")
def delete_scans(db: Session = Depends(get_db_session)):
    deleted = clear_saved_scans(db)
    return {"deleted_scan_runs": deleted}


@app.get("/preferences", response_model=AppPreferencesResponse)
def get_app_preferences(db: Session = Depends(get_db_session)):
    prefs = get_preferences(db)
    # Expose if a key is stored, but do not expose the encrypted key itself
    has_api_key = bool(prefs.encrypted_api_key)
    return AppPreferencesResponse.model_validate(prefs).model_copy(update={"has_api_key": has_api_key})


@app.put("/preferences", response_model=AppPreferencesResponse)
def update_app_preferences(update_data: AppPreferencesUpdate, db: Session = Depends(get_db_session)):
    prefs = update_preferences(db, update_data)
    has_api_key = bool(prefs.encrypted_api_key)
    return AppPreferencesResponse.model_validate(prefs).model_copy(update={"has_api_key": has_api_key})


@app.post("/preferences/reset", response_model=AppPreferencesResponse)
def reset_app_preferences(db: Session = Depends(get_db_session)):
    prefs = reset_preferences(db)
    has_api_key = bool(prefs.encrypted_api_key)
    return AppPreferencesResponse.model_validate(prefs).model_copy(update={"has_api_key": has_api_key})
