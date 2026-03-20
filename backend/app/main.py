from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse

from app.schemas.scan import ScanPageRequest, ScanPageResponse
from app.services.page_scanner import ScanError, scan_page

app = FastAPI(title="Web Accessibility Assistant API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ],
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
