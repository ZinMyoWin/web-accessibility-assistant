import os
from dataclasses import replace
from datetime import UTC, datetime
from uuid import UUID

from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session

from app.db import get_db_session, get_session_factory
from app.models.auth import User
from app.repositories.scan_repository import (
    clear_saved_scans,
    complete_running_scan,
    create_scan_job,
    fail_running_scan,
    get_scan_queue_state,
    get_previously_scanned_page_urls_for_domain,
    get_saved_scan,
    list_saved_scans,
    prioritize_queued_scan_page,
    remove_queued_scan_page,
    save_completed_scan,
    save_failed_scan,
    to_saved_scan_response,
    update_scan_progress,
)
from app.repositories.auth_repository import (
    create_user,
    create_user_session,
    get_user_by_email,
    get_user_for_token,
    revoke_user_session,
    to_user_response,
)
from app.schemas.auth import AuthResponse, LoginRequest, SignupRequest, UserResponse
from app.schemas.history import SavedScanListResponse, SavedScanResponse
from app.schemas.scan import ScanPageRequest, ScanPageResponse, ScanQueuePageRequest
from app.schemas.preferences import AppPreferencesResponse, AppPreferencesUpdate
from app.services.page_scanner import CrawlQueueControl, CrawlQueueState, ScanError, ScanOptions, scan_page
from app.services.auth_service import create_session_token, hash_password, verify_password
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
SYNC_CRAWL_PAGE_LIMIT = 5
SCAN_EXECUTION_MODE_BACKGROUND = "background"
SCAN_EXECUTION_MODE_WORKER = "worker"


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


@app.get("/test/page-js-rendered", response_class=HTMLResponse)
def test_js_rendered_page():
    return """
    <html lang="en">
      <head>
        <title>JavaScript rendered accessibility test</title>
      </head>
      <body>
        <h1>JavaScript rendered test page</h1>
        <div id="app">Initial static content is accessible.</div>
        <script>
          window.setTimeout(() => {
            const app = document.getElementById("app");
            app.innerHTML = `
              <section>
                <h2>Rendered content</h2>
                <img src="/dynamic-product.png">
                <a href="/dynamic-details">click here</a>
                <button></button>
              </section>
            `;
          }, 150);
        </script>
      </body>
    </html>
    """


@app.post("/scan/page", response_model=ScanPageResponse)
def scan_single_page(
    request: ScanPageRequest,
    background_tasks: BackgroundTasks,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db_session),
):
    current_user = _get_user_from_authorization_header(db, authorization)
    requested_url = str(request.url)
    started_at = datetime.now(UTC)
    mode = request.mode
    page_limit = min(request.page_limit, SYNC_CRAWL_PAGE_LIMIT) if request.mode == "multi" else None
    previously_scanned_urls = (
        get_previously_scanned_page_urls_for_domain(db, current_user.id, requested_url)
        if request.mode == "multi" and request.skip_previously_scanned_pages
        else set()
    )
    options = ScanOptions(
        mode=request.mode,
        page_limit=page_limit or 1,
        crawl_depth=request.crawl_depth,
        request_delay_ms=request.request_delay_ms,
        page_timeout_ms=request.page_timeout_ms,
        ignored_url_patterns=tuple(request.ignored_url_patterns),
        stay_within_domain=request.stay_within_domain,
        respect_robots_txt=request.respect_robots_txt,
        skip_previously_scanned_pages=request.skip_previously_scanned_pages,
        previously_scanned_urls=frozenset(previously_scanned_urls),
    )

    if request.mode == "multi":
        try:
            execution_mode = get_scan_execution_mode()
            job_status = "queued" if execution_mode == SCAN_EXECUTION_MODE_WORKER else "running"
            scan_run = create_scan_job(
                db,
                user_id=current_user.id,
                requested_url=requested_url,
                started_at=started_at,
                mode=mode,
                page_limit=page_limit,
                status=job_status,
                scan_options=serialize_scan_options(options),
            )
        except Exception as exc:
            db.rollback()
            raise HTTPException(status_code=500, detail="Failed to create scan job") from exc

        background_options = replace(options, run_browser_analysis_for_multi=True)
        if execution_mode == SCAN_EXECUTION_MODE_BACKGROUND:
            background_tasks.add_task(
                run_multi_page_scan_job,
                scan_run.id,
                requested_url,
                background_options,
            )

        return ScanPageResponse(
            scan_id=str(scan_run.id),
            status=job_status,
            url=requested_url,
            scanned_at=started_at.isoformat(),
            mode="multi",
            pages_scanned=0,
            pages_skipped=0,
            scanned_page_urls=[],
            skipped_page_urls=[],
            queued_page_urls=[],
            excluded_page_urls=[],
            current_page_url=None,
            worker_attempts=0,
            max_worker_attempts=3,
            last_error=None,
            summary={"total_issues": 0, "high": 0, "medium": 0, "low": 0},
            issues=[],
        )

    try:
        result = scan_page(requested_url, options)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ScanError as exc:
        try:
            save_failed_scan(
                db,
                user_id=current_user.id,
                requested_url=requested_url,
                error_message=exc.message,
                started_at=started_at,
                completed_at=datetime.now(UTC),
                mode=mode,
                page_limit=page_limit,
            )
        except Exception:
            db.rollback()
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    completed_at = datetime.fromisoformat(result.scanned_at)

    try:
        saved_scan = save_completed_scan(
            db,
            user_id=current_user.id,
            requested_url=requested_url,
            result=result,
            started_at=started_at,
            completed_at=completed_at,
            mode=mode,
            page_limit=page_limit,
        )
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to save scan result") from exc

    result.scan_id = str(saved_scan.id)
    return result


def run_multi_page_scan_job(scan_id: UUID, requested_url: str, options: ScanOptions) -> None:
    session_factory = get_session_factory()
    db = session_factory()
    try:
        result = scan_page(requested_url, options, _build_queue_control(db, scan_id))
        result.scan_id = str(scan_id)
        complete_running_scan(
            db,
            scan_id,
            result=result,
            completed_at=datetime.fromisoformat(result.scanned_at),
        )
    except ValueError as exc:
        fail_running_scan(
            db,
            scan_id,
            error_message=str(exc),
            completed_at=datetime.now(UTC),
        )
    except ScanError as exc:
        fail_running_scan(
            db,
            scan_id,
            error_message=exc.message,
            completed_at=datetime.now(UTC),
        )
    except Exception:
        db.rollback()
        fail_running_scan(
            db,
            scan_id,
            error_message="Unexpected error while running multi-page scan.",
            completed_at=datetime.now(UTC),
        )
    finally:
        db.close()


def _build_queue_control(db: Session, scan_id: UUID) -> CrawlQueueControl:
    def publish(state: CrawlQueueState) -> None:
        update_scan_progress(
            db,
            scan_id,
            current_page_url=state.current_page_url,
            queued_page_urls=state.queued_page_urls,
            scanned_page_urls=state.scanned_page_urls,
            skipped_page_urls=state.skipped_page_urls,
        )

    def refresh() -> tuple[list[str], set[str]]:
        return get_scan_queue_state(db, scan_id)

    return CrawlQueueControl(publish=publish, refresh=refresh)


def get_scan_execution_mode() -> str:
    mode = os.getenv("SCAN_EXECUTION_MODE", SCAN_EXECUTION_MODE_BACKGROUND).strip().lower()
    if mode == SCAN_EXECUTION_MODE_WORKER:
        return SCAN_EXECUTION_MODE_WORKER
    return SCAN_EXECUTION_MODE_BACKGROUND


def serialize_scan_options(options: ScanOptions) -> dict[str, object]:
    return {
        "mode": options.mode,
        "page_limit": options.page_limit,
        "crawl_depth": options.crawl_depth,
        "request_delay_ms": options.request_delay_ms,
        "page_timeout_ms": options.page_timeout_ms,
        "ignored_url_patterns": list(options.ignored_url_patterns),
        "stay_within_domain": options.stay_within_domain,
        "respect_robots_txt": options.respect_robots_txt,
        "skip_previously_scanned_pages": options.skip_previously_scanned_pages,
        "previously_scanned_urls": sorted(options.previously_scanned_urls),
    }


@app.post("/auth/signup", response_model=AuthResponse)
def signup(request: SignupRequest, db: Session = Depends(get_db_session)):
    if get_user_by_email(db, request.email):
        raise HTTPException(status_code=409, detail="An account with this email already exists.")

    user = create_user(
        db,
        name=request.name,
        email=request.email,
        password_hash=hash_password(request.password),
    )
    token, token_jti, expires_at = create_session_token(user.id)
    create_user_session(db, user=user, token_jti=token_jti, expires_at=expires_at)
    return AuthResponse(token=token, user=to_user_response(user))


@app.post("/auth/login", response_model=AuthResponse)
def login(request: LoginRequest, db: Session = Depends(get_db_session)):
    user = get_user_by_email(db, request.email)
    if user is None or not verify_password(request.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    token, token_jti, expires_at = create_session_token(user.id)
    create_user_session(db, user=user, token_jti=token_jti, expires_at=expires_at)
    return AuthResponse(token=token, user=to_user_response(user))


@app.get("/auth/me", response_model=UserResponse)
def get_current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db_session),
):
    user = _get_user_from_authorization_header(db, authorization)
    return to_user_response(user)


@app.post("/auth/logout")
def logout(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db_session),
):
    token = _get_bearer_token(authorization)
    revoke_user_session(db, token)
    return {"logged_out": True}


def _get_user_from_authorization_header(
    db: Session,
    authorization: str | None,
) -> User:
    token = _get_bearer_token(authorization)
    user = get_user_for_token(db, token)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid or expired session.")
    return user


def _get_bearer_token(authorization: str | None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required.")
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required.")
    return token


@app.get("/scans", response_model=SavedScanListResponse)
def get_scans(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    status: str | None = Query(default=None),
    mode: str | None = Query(default=None),
    q: str | None = Query(default=None),
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db_session),
):
    current_user = _get_user_from_authorization_header(db, authorization)
    return list_saved_scans(
        db,
        user_id=current_user.id,
        limit=limit,
        offset=offset,
        status=status,
        mode=mode,
        q=q,
    )


@app.get("/scans/{scan_id}", response_model=SavedScanResponse)
def get_scan(
    scan_id: UUID,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db_session),
):
    current_user = _get_user_from_authorization_header(db, authorization)
    scan_run = get_saved_scan(db, scan_id, current_user.id)
    if scan_run is None:
        raise HTTPException(status_code=404, detail="Scan not found")
    return to_saved_scan_response(scan_run)


@app.post("/scans/{scan_id}/queue/remove", response_model=SavedScanResponse)
def remove_scan_queue_page(
    scan_id: UUID,
    request: ScanQueuePageRequest,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db_session),
):
    current_user = _get_user_from_authorization_header(db, authorization)
    scan_run = remove_queued_scan_page(db, scan_id, current_user.id, request.url)
    if scan_run is None:
        raise HTTPException(status_code=404, detail="Scan not found")
    return to_saved_scan_response(scan_run)


@app.post("/scans/{scan_id}/queue/prioritize", response_model=SavedScanResponse)
def prioritize_scan_queue_page(
    scan_id: UUID,
    request: ScanQueuePageRequest,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db_session),
):
    current_user = _get_user_from_authorization_header(db, authorization)
    scan_run = prioritize_queued_scan_page(db, scan_id, current_user.id, request.url)
    if scan_run is None:
        raise HTTPException(status_code=404, detail="Scan not found")
    return to_saved_scan_response(scan_run)


@app.delete("/scans")
def delete_scans(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db_session),
):
    current_user = _get_user_from_authorization_header(db, authorization)
    deleted = clear_saved_scans(db, current_user.id)
    return {"deleted_scan_runs": deleted}


@app.get("/preferences", response_model=AppPreferencesResponse)
def get_app_preferences(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db_session),
):
    current_user = _get_user_from_authorization_header(db, authorization)
    prefs = get_preferences(db, current_user.id)
    # Expose if a key is stored, but do not expose the encrypted key itself
    has_api_key = bool(prefs.encrypted_api_key)
    return AppPreferencesResponse.model_validate(prefs).model_copy(update={"has_api_key": has_api_key})


@app.put("/preferences", response_model=AppPreferencesResponse)
def update_app_preferences(
    update_data: AppPreferencesUpdate,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db_session),
):
    current_user = _get_user_from_authorization_header(db, authorization)
    prefs = update_preferences(db, current_user.id, update_data)
    has_api_key = bool(prefs.encrypted_api_key)
    return AppPreferencesResponse.model_validate(prefs).model_copy(update={"has_api_key": has_api_key})


@app.post("/preferences/reset", response_model=AppPreferencesResponse)
def reset_app_preferences(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db_session),
):
    current_user = _get_user_from_authorization_header(db, authorization)
    prefs = reset_preferences(db, current_user.id)
    has_api_key = bool(prefs.encrypted_api_key)
    return AppPreferencesResponse.model_validate(prefs).model_copy(update={"has_api_key": has_api_key})
