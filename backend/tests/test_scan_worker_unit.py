from uuid import uuid4

from app import scan_worker
from app.schemas.scan import ScanIssue
from app.services.page_scanner import CrawlQueueState


def test_default_poll_interval_is_half_second(monkeypatch):
    monkeypatch.delenv("SCAN_WORKER_POLL_INTERVAL_SECONDS", raising=False)

    assert scan_worker._get_poll_interval_seconds() == 0.5


def test_worker_queue_control_publishes_partial_issues(monkeypatch):
    captured: dict[str, object] = {}

    def fake_update_scan_progress(db, scan_id, **kwargs):
        captured.update(kwargs)

    monkeypatch.setattr(scan_worker, "update_scan_progress", fake_update_scan_progress)

    issue = ScanIssue(
        rule_id="image-alt",
        severity="medium",
        element="<img>",
        message="Image is missing an alt attribute.",
        recommendation="Add alt text.",
    )
    control = scan_worker._build_queue_control(object(), uuid4())

    control.publish(
        CrawlQueueState(
            current_page_url=None,
            queued_page_urls=[],
            scanned_page_urls=["https://example.com"],
            skipped_page_urls=[],
            issues=(issue,),
        )
    )

    assert captured["scanned_page_urls"] == ["https://example.com"]
    assert captured["issues"] == [issue]
