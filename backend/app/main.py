from fastapi import FastAPI, HTTPException

from app.schemas.scan import ScanPageRequest, ScanPageResponse
from app.services.page_scanner import ScanError, scan_page

app = FastAPI(title="Web Accessibility Assistant API")


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


@app.post("/scan/page", response_model=ScanPageResponse)
def scan_single_page(request: ScanPageRequest):
    try:
        return scan_page(str(request.url))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ScanError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
