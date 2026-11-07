from __future__ import annotations

import logging
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.db import get_db_session
from app.models.mcp import McpAccountLink
from app.repositories.auth_repository import get_user_for_token
from app.repositories.mcp_repository import (
    dialect_insert, enforce_mcp_rate_limit, get_mcp_scan, list_mcp_issues, list_mcp_scans,
)
from app.services.mcp_auth import mcp_identity_key, verify_mcp_assertion

router = APIRouter(prefix="/mcp", tags=["MCP internal bridge"])
logger = logging.getLogger("app.mcp")


def _bearer(authorization: str | None) -> str:
    if not authorization or not authorization.startswith("Bearer ") or not authorization[7:].strip():
        raise HTTPException(status_code=401, detail="Authentication required.")
    return authorization[7:].strip()


def _app_user(db: Session, authorization: str | None):
    user = get_user_for_token(db, _bearer(authorization))
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid or expired session.")
    return user


def _mcp_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db_session),
) -> UUID:
    claims = verify_mcp_assertion(_bearer(authorization))
    user_id = db.scalar(select(McpAccountLink.user_id).where(
        McpAccountLink.identity_key == mcp_identity_key(claims),
        McpAccountLink.oauth_issuer == claims["oauth_issuer"],
        McpAccountLink.oauth_subject == claims["sub"],
    ))
    if user_id is None:
        raise HTTPException(status_code=403, detail="Link this OAuth identity to your application account first.")
    enforce_mcp_rate_limit(db, user_id)
    return user_id


@router.post("/link")
def link_account(
    authorization: str | None = Header(default=None),
    x_mcp_assertion: str | None = Header(default=None),
    db: Session = Depends(get_db_session),
):
    claims = verify_mcp_assertion(x_mcp_assertion or "")
    user = _app_user(db, authorization)
    enforce_mcp_rate_limit(db, user.id)
    identity_key = mcp_identity_key(claims)
    statement = dialect_insert(db, McpAccountLink).values(
        identity_key=identity_key, oauth_issuer=claims["oauth_issuer"],
        oauth_subject=claims["sub"], user_id=user.id,
    ).on_conflict_do_nothing(index_elements=[McpAccountLink.identity_key])
    db.execute(statement)
    link = db.scalar(select(McpAccountLink).where(McpAccountLink.identity_key == identity_key))
    if link is None or link.user_id != user.id:
        db.rollback()
        logger.warning("mcp_account_link_conflict user_id=%s", user.id)
        raise HTTPException(status_code=409, detail="OAuth identity is already linked to another account.")
    db.commit()
    logger.info("mcp_account_linked user_id=%s", user.id)
    return {"linked": True, "user_id": str(user.id)}


@router.delete("/link")
def unlink_account(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db_session),
):
    user = _app_user(db, authorization)
    deleted = db.execute(delete(McpAccountLink).where(McpAccountLink.user_id == user.id)).rowcount
    db.commit()
    logger.info("mcp_account_unlinked user_id=%s count=%s", user.id, deleted)
    return {"unlinked": deleted}


@router.get("/identity")
def identity(user_id: UUID = Depends(_mcp_user)):
    return {"user_id": str(user_id)}


@router.get("/scans")
def scans(
    limit: int = Query(default=10, ge=1, le=20),
    offset: int = Query(default=0, ge=0, le=100000),
    status: Literal["queued", "running", "complete", "error", "cancelled"] | None = None,
    q: str | None = Query(default=None, max_length=200),
    user_id: UUID = Depends(_mcp_user),
    db: Session = Depends(get_db_session),
):
    return list_mcp_scans(db, user_id, limit=limit, offset=offset, status=status, q=q)


@router.get("/scans/{scan_id}")
def scan(
    scan_id: UUID,
    user_id: UUID = Depends(_mcp_user),
    db: Session = Depends(get_db_session),
):
    return get_mcp_scan(db, user_id, scan_id)


@router.get("/scans/{scan_id}/issues")
def issues(
    scan_id: UUID,
    limit: int = Query(default=20, ge=1, le=50),
    offset: int = Query(default=0, ge=0, le=100000),
    severity: Literal["high", "medium", "low"] | None = None,
    user_id: UUID = Depends(_mcp_user),
    db: Session = Depends(get_db_session),
):
    return list_mcp_issues(db, user_id, scan_id, limit=limit, offset=offset, severity=severity)
