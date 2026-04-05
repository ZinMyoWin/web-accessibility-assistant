import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse

from app.schemas.scan import ScanPageRequest, ScanPageResponse
from app.services.page_scanner import ScanError, scan_page

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
    return {
        "message": "Web Accessibility Assistant API is running"
    }


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
def scan_single_page(request: ScanPageRequest):
    try:
        return scan_page(str(request.url))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ScanError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
