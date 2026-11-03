import logging
import math
import os
import secrets
from dataclasses import replace
from datetime import UTC, datetime
from uuid import UUID

from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_db_session, get_session_factory
from app.models.auth import User
from app.models.scan import ScanRun
from app.repositories.scan_repository import (
    ACTIVE_SCAN_STATUSES,
    clear_saved_scans,
    complete_running_scan,
    create_scan_job,
    fail_running_scan,
    get_scan_queue_state,
    get_previously_scanned_page_urls_for_domain,
    get_saved_scan,
    is_scan_cancel_requested,
    list_saved_scans,
    mark_scan_cancelled,
    prioritize_queued_scan_page,
    remove_queued_scan_page,
    request_scan_cancel,
    save_completed_scan,
    save_failed_scan,
    to_saved_scan_response,
    update_scan_progress,
)
from app.repositories.repair_suggestion_repository import (
    get_existing_suggestion,
    get_repair_suggestion_group,
    list_repair_suggestion_groups,
    save_repair_suggestion,
    to_repair_suggestion_response,
)
from app.repositories.auth_repository import (
    create_password_reset_token,
    create_user,
    create_user_session,
    get_or_create_oauth_user,
    get_user_by_email,
    get_user_for_token,
    get_valid_reset_token,
    invalidate_unused_password_reset_tokens,
    revoke_user_session,
    to_user_response,
    update_user_password,
)
from app.schemas.auth import (
    AuthResponse,
    ForgotPasswordRequest,
    GoogleAuthRequest,
    LoginRequest,
    MessageResponse,
    ResetPasswordRequest,
    SignupRequest,
    UserResponse,
)
from app.schemas.history import SavedScanListResponse, SavedScanResponse
from app.schemas.scan import ScanPageRequest, ScanPageResponse, ScanQueuePageRequest
from app.schemas.preferences import AppPreferencesResponse, AppPreferencesUpdate
from app.schemas.repair_suggestion import (
    GenerateRepairSuggestionRequest,
    RepairSuggestionBundleResponse,
    RepairSuggestionGroupsResponse,
    RepairSuggestionResponse,
)
from app.services.page_scanner import (
    CrawlQueueControl,
    CrawlQueueState,
    ScanCancelled,
    ScanError,
    ScanOptions,
    scan_page,
)
from app.services.scan_options_resolver import resolve_scan_settings
from app.services.repair_bundle_service import (
    RepairBundleError,
    build_repair_bundle,
)
from app.services.auth_service import (
    create_session_token,
    generate_reset_token,
    hash_password,
    hash_session_token,
    verify_password,
)
from app.services.repair_suggestion_service import (
    RepairSuggestionGenerationError,
    generate_grouped_repair_suggestion,
    normalize_repair_suggestion_provider,
    resolve_repair_suggestion_model,
)
from app.services import metrics, rate_limit
from app.repositories.preferences_repository import (
    get_preferences,
    reset_preferences,
    update_preferences,
)
from app.utils.encryption import decrypt_api_key

logger = logging.getLogger("app.main")

LOCAL_CORS_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
]
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


_RATE_LIMIT_DETAILS = {
    rate_limit.AUTH_SCOPE: (
        "Too many authentication attempts. Please retry in {seconds} seconds."
    ),
    rate_limit.SCAN_SCOPE: "Too many scan requests. Please retry in {seconds} seconds.",
}


def _client_ip(request: Request) -> str:
    """Rate-limit identity for unauthenticated endpoints.

    Uses the socket peer address. Deployments behind a reverse proxy should
    terminate rate limiting at the proxy (or forward a trusted client address)
    because every proxied request otherwise shares the proxy's address.
    """
    client = request.client
    return client.host if client and client.host else "unknown"


def _enforce_rate_limit(request: Request, *, scope: str, identity: str) -> None:
    """Consume one rate-limit token or raise HTTP 429 with ``Retry-After``.

    NOTE: the limiter is per-process. See ``app.services.rate_limit`` for the
    horizontal-scaling caveat.
    """
    allowed, retry_after_seconds = rate_limit.check_rate_limit(
        scope=scope,
        identity=identity,
    )
    if allowed:
        return

    metrics.record_rate_limited(scope)
    retry_after = max(1, math.ceil(retry_after_seconds))
    detail_template = _RATE_LIMIT_DETAILS.get(
        scope, "Too many requests. Please retry in {seconds} seconds."
    )
    raise HTTPException(
        status_code=429,
        detail=detail_template.format(seconds=retry_after),
        headers={"Retry-After": str(retry_after)},
    )


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


@app.get("/metrics", include_in_schema=False)
def metrics_endpoint(db: Session = Depends(get_db_session)):
    """Expose process metrics in the Prometheus text exposition format.

    Queue depth and total worker attempts are refreshed from the database at
    scrape time (the queue-depth count is backed by
    ``ix_scan_runs_status_started_at`` from migration 9848b576f075) so the
    numbers also cover a separately running scan worker. All other values are
    per-process counters. Returns 404 when ``METRICS_ENABLED`` is false.
    """
    if not metrics.metrics_enabled():
        raise HTTPException(status_code=404, detail="Metrics are disabled.")
    try:
        queued_count = db.scalar(
            select(func.count()).select_from(ScanRun).where(ScanRun.status == "queued")
        )
        worker_attempts = db.scalar(
            select(func.coalesce(func.sum(ScanRun.worker_attempts), 0))
        )
        metrics.set_scan_queue_depth(int(queued_count or 0))
        metrics.set_scan_worker_attempts_total(int(worker_attempts or 0))
    except Exception:  # pragma: no cover - metrics must render even if the DB hiccups
        logger.warning("failed to refresh database-backed scan metrics", exc_info=True)
    return Response(
        content=metrics.render_prometheus(),
        media_type=metrics.PROMETHEUS_CONTENT_TYPE,
    )


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
    http_request: Request,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db_session),
):
    current_user = _get_user_from_authorization_header(db, authorization)
    _enforce_rate_limit(
        http_request,
        scope=rate_limit.SCAN_SCOPE,
        identity=f"user:{current_user.id}",
    )
    requested_url = str(request.url)
    started_at = datetime.now(UTC)
    preferences = get_preferences(db, current_user.id)
    settings = resolve_scan_settings(request, preferences)
    mode = settings.mode
    page_limit = settings.page_limit
    previously_scanned_urls = (
        get_previously_scanned_page_urls_for_domain(db, current_user.id, requested_url)
        if mode == "multi" and settings.skip_previously_scanned_pages
        else set()
    )
    options = ScanOptions(
        mode=mode,
        page_limit=page_limit or 1,
        crawl_depth=settings.crawl_depth,
        request_delay_ms=settings.request_delay_ms,
        page_timeout_ms=settings.page_timeout_ms,
        ignored_url_patterns=settings.ignored_url_patterns,
        stay_within_domain=settings.stay_within_domain,
        respect_robots_txt=settings.respect_robots_txt,
        skip_previously_scanned_pages=settings.skip_previously_scanned_pages,
        wcag_standard=settings.wcag_standard,
        include_best_practices=settings.include_best_practices,
        previously_scanned_urls=frozenset(previously_scanned_urls),
    )

    execution_mode = get_scan_execution_mode()
    should_enqueue_scan = mode == "multi" or execution_mode == SCAN_EXECUTION_MODE_WORKER

    if should_enqueue_scan:
        try:
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
        if mode == "multi" and execution_mode == SCAN_EXECUTION_MODE_BACKGROUND:
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
            mode=mode,
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
        if is_scan_cancel_requested(db, scan_id):
            mark_scan_cancelled(db, scan_id)
            return
        complete_running_scan(
            db,
            scan_id,
            result=result,
            completed_at=datetime.fromisoformat(result.scanned_at),
        )
    except ScanCancelled:
        mark_scan_cancelled(db, scan_id)
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
            issues=list(state.issues),
        )

    def refresh() -> tuple[list[str], set[str]]:
        return get_scan_queue_state(db, scan_id)

    def should_cancel() -> bool:
        return is_scan_cancel_requested(db, scan_id)

    return CrawlQueueControl(
        publish=publish,
        refresh=refresh,
        should_cancel=should_cancel,
    )


def get_scan_execution_mode() -> str:
    mode = os.getenv("SCAN_EXECUTION_MODE", SCAN_EXECUTION_MODE_BACKGROUND).strip().lower()
    if mode == SCAN_EXECUTION_MODE_WORKER:
        return SCAN_EXECUTION_MODE_WORKER
    return SCAN_EXECUTION_MODE_BACKGROUND


def get_password_reset_link_logging_enabled() -> bool:
    return os.getenv("PASSWORD_RESET_LOG_LINKS", "").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


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
        "wcag_standard": options.wcag_standard,
        "include_best_practices": options.include_best_practices,
    }


@app.post("/auth/signup", response_model=AuthResponse)
def signup(
    request: SignupRequest,
    http_request: Request,
    db: Session = Depends(get_db_session),
):
    _enforce_rate_limit(
        http_request,
        scope=rate_limit.AUTH_SCOPE,
        identity=_client_ip(http_request),
    )
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
def login(
    request: LoginRequest,
    http_request: Request,
    db: Session = Depends(get_db_session),
):
    _enforce_rate_limit(
        http_request,
        scope=rate_limit.AUTH_SCOPE,
        identity=_client_ip(http_request),
    )
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


@app.post("/auth/google", response_model=AuthResponse)
def google_auth(
    request: GoogleAuthRequest,
    x_oauth_proxy_secret: str | None = Header(default=None),
    db: Session = Depends(get_db_session),
):
    """Exchange a Google-verified profile (forwarded by the trusted Next.js
    server after it completes the OAuth code exchange) for a backend session
    token. The shared OAUTH_PROXY_SECRET prevents arbitrary clients from
    minting tokens for any email.

    NOTE (scaffold): set OAUTH_PROXY_SECRET in both the backend and frontend
    environments to enable this endpoint.
    """
    expected_secret = os.getenv("OAUTH_PROXY_SECRET")
    if not expected_secret:
        raise HTTPException(
            status_code=503,
            detail="Google sign-in is not configured on the server.",
        )
    if not x_oauth_proxy_secret or not secrets.compare_digest(
        x_oauth_proxy_secret, expected_secret
    ):
        raise HTTPException(status_code=401, detail="Invalid OAuth proxy secret.")

    user = get_or_create_oauth_user(db, name=request.name, email=request.email)
    token, token_jti, expires_at = create_session_token(user.id)
    create_user_session(db, user=user, token_jti=token_jti, expires_at=expires_at)
    return AuthResponse(token=token, user=to_user_response(user))


@app.post("/auth/forgot-password", response_model=MessageResponse)
def forgot_password(
    request: ForgotPasswordRequest,
    http_request: Request,
    db: Session = Depends(get_db_session),
):
    """Begin the password-reset flow.

    Always responds with the same message so callers cannot probe which emails
    are registered. When the email exists a single-use reset token is created.

    NOTE (scaffold): delivering the reset link by email is not wired up yet.
    Set PASSWORD_RESET_LOG_LINKS=true in local development only to log the link
    and exercise the flow end to end.
    """
    _enforce_rate_limit(
        http_request,
        scope=rate_limit.AUTH_SCOPE,
        identity=_client_ip(http_request),
    )
    generic_message = (
        "If an account exists for that email, a reset link has been sent."
    )
    user = get_user_by_email(db, request.email)
    if user is None:
        return MessageResponse(message=generic_message)

    raw_token, token_hash, expires_at = generate_reset_token()
    invalidate_unused_password_reset_tokens(db, user=user)
    create_password_reset_token(
        db, user=user, token_hash=token_hash, expires_at=expires_at
    )

    if get_password_reset_link_logging_enabled():
        frontend_base_url = os.getenv("FRONTEND_BASE_URL", "http://localhost:3000")
        reset_link = f"{frontend_base_url}/reset-password?token={raw_token}"
        # TODO: replace local-only console logging with transactional email.
        print(f"[password-reset] reset link for {user.email}: {reset_link}")

    return MessageResponse(message=generic_message)


@app.post("/auth/reset-password", response_model=MessageResponse)
def reset_password(
    request: ResetPasswordRequest,
    db: Session = Depends(get_db_session),
):
    reset_token = get_valid_reset_token(db, hash_session_token(request.token))
    if reset_token is None:
        raise HTTPException(
            status_code=400,
            detail="This reset link is invalid or has expired.",
        )

    update_user_password(
        db,
        user=reset_token.user,
        password_hash=hash_password(request.password),
    )
    invalidate_unused_password_reset_tokens(db, user=reset_token.user)
    return MessageResponse(message="Your password has been updated. You can now log in.")


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
    include_issues: bool = Query(
        default=True,
        description=(
            "Set false for lightweight status polling: the response keeps the "
            "same shape with summary/queue metadata but an empty issues list."
        ),
    ),
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db_session),
):
    current_user = _get_user_from_authorization_header(db, authorization)
    scan_run = get_saved_scan(
        db,
        scan_id,
        current_user.id,
        include_issues=include_issues,
    )
    if scan_run is None:
        raise HTTPException(status_code=404, detail="Scan not found")
    return to_saved_scan_response(scan_run, include_issues=include_issues)


@app.get(
    "/scans/{scan_id}/repair-suggestion-groups",
    response_model=RepairSuggestionGroupsResponse,
)
def get_repair_suggestion_groups(
    scan_id: UUID,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db_session),
):
    current_user = _get_user_from_authorization_header(db, authorization)
    scan_run = get_saved_scan(db, scan_id, current_user.id)
    if scan_run is None:
        raise HTTPException(status_code=404, detail="Scan not found")

    return RepairSuggestionGroupsResponse(
        scan_id=str(scan_run.id),
        groups=list_repair_suggestion_groups(db, scan_run),
    )


@app.post(
    "/scans/{scan_id}/repair-suggestion-groups/{group_key}/generate",
    response_model=RepairSuggestionResponse,
)
def generate_repair_suggestion_group(
    scan_id: UUID,
    group_key: str,
    request: GenerateRepairSuggestionRequest,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db_session),
):
    current_user = _get_user_from_authorization_header(db, authorization)
    scan_run = get_saved_scan(db, scan_id, current_user.id)
    if scan_run is None:
        raise HTTPException(status_code=404, detail="Scan not found")

    group = get_repair_suggestion_group(scan_run, group_key)
    if group is None:
        raise HTTPException(status_code=404, detail="Repair suggestion group not found")

    existing = get_existing_suggestion(
        db,
        scan_run_id=scan_run.id,
        user_id=current_user.id,
        group_key=group_key,
    )
    if existing is not None and not request.force:
        return to_repair_suggestion_response(existing)

    prefs = get_preferences(db, current_user.id)
    provider = normalize_repair_suggestion_provider(
        prefs.active_suggestion_provider or prefs.ai_provider
    )
    model = resolve_repair_suggestion_model(provider, prefs.ai_model)
    api_key = decrypt_api_key(prefs.encrypted_api_key)
    if not api_key:
        raise HTTPException(
            status_code=400,
            detail="Add an AI provider API key in Preferences before generating repair suggestions.",
        )

    try:
        draft = generate_grouped_repair_suggestion(
            provider=provider,
            model=model,
            api_key=api_key,
            group=group,
        )
    except RepairSuggestionGenerationError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    suggestion = save_repair_suggestion(
        db,
        scan_run=scan_run,
        group=group,
        provider=provider,
        model=model,
        draft=draft,
    )
    return to_repair_suggestion_response(suggestion)


@app.get(
    "/scans/{scan_id}/repair-suggestion-bundle",
    response_model=RepairSuggestionBundleResponse,
)
def get_repair_suggestion_bundle(
    scan_id: UUID,
    bundle_format: str = Query(default="markdown", alias="format"),
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db_session),
):
    """Export every repair suggestion for a scan as one downloadable document.

    ``format`` accepts ``markdown`` (default) or ``json``; any other value is a
    400 so clients fail loudly instead of silently getting markdown.
    """
    current_user = _get_user_from_authorization_header(db, authorization)
    scan_run = get_saved_scan(db, scan_id, current_user.id)
    if scan_run is None:
        raise HTTPException(status_code=404, detail="Scan not found")

    groups = list_repair_suggestion_groups(db, scan_run)
    try:
        return build_repair_bundle(scan_run, groups, bundle_format=bundle_format)
    except RepairBundleError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/scans/{scan_id}/cancel", response_model=SavedScanResponse)
def cancel_scan(
    scan_id: UUID,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db_session),
):
    """Cancel a queued scan or request that a running scan stop between pages."""
    current_user = _get_user_from_authorization_header(db, authorization)
    scan_run = get_saved_scan(db, scan_id, current_user.id)
    if scan_run is None:
        raise HTTPException(status_code=404, detail="Scan not found")
    if scan_run.status not in ACTIVE_SCAN_STATUSES:
        raise HTTPException(
            status_code=409,
            detail="Scan is already finished and can no longer be cancelled.",
        )

    updated_scan = request_scan_cancel(db, scan_id, current_user.id)
    if updated_scan is None:
        raise HTTPException(status_code=404, detail="Scan not found")
    return to_saved_scan_response(updated_scan)


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
