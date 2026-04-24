# Backend Persistence Implementation Guide

## Feature Overview

### 1. What

This document explains the backend persistence task for the project.

The task is to make the backend save scan results into PostgreSQL instead of only returning them in memory.

This means we will build:

- a database layer for the backend
- database models for saved scans and saved issues
- Alembic migration wiring
- scan saving logic after `POST /scan/page`
- future-ready backend endpoints for scan history

### 2. Why

Right now, the project can scan a page, but the result disappears after the response is returned.

That creates a problem:

- the scan history page cannot use real data
- the issues page cannot open a saved scan later
- reports cannot use stored scan records
- there is no long-term record of what was scanned

If we do not implement this, the database setup will exist, but it will not provide any real value to the product.

### 3. How

We will connect the new PostgreSQL setup to the backend in stages:

1. create a proper database connection layer
2. create SQLAlchemy models
3. connect Alembic to the models
4. create the first real migration
5. save scan results into the database
6. prepare read endpoints for scan history

## Problem Statement

### 1. What

The current backend only scans and returns a live response.

It does not store:

- when a scan happened
- which URL was scanned
- whether the scan succeeded or failed
- which issues were found

### 2. Why

This is a gap because the frontend already has a scan history page design, but it still depends on mock data.

The database has been set up, but it is not yet connected to the real application flow.

### 3. How

We will solve this by making the scan endpoint do two jobs:

1. return the scan result to the frontend
2. save the same result into PostgreSQL

## Implementation Goal

### 1. What

The goal is to make persistence the new backend foundation for saved scans.

After this work, the backend should be able to:

- connect to PostgreSQL
- create scan tables through Alembic
- save each scan run
- save each issue found in that scan

### 2. Why

This is the first real step that turns the database from setup work into a working feature.

It unlocks the next product features:

- real scan history
- real issue drilldown by scan ID
- report export later
- comparison later

### 3. How

We will first support single-page scan persistence only.

We will keep the design simple, but structure it in a way that still supports future multi-page crawling.

## Current Behavior

### 1. What

The current behavior looks like this:

1. user submits a URL
2. backend scans the page
3. backend returns JSON
4. result is shown in the frontend
5. result is not saved anywhere

### 2. Why

This behavior was good for the MVP because it proved the scanner works.

But it is not enough anymore because the project now has:

- a database setup
- a scan history UI
- a need for stored scan records

### 3. How

Current flow example:

```text
User submits URL
    ->
POST /scan/page
    ->
scan runs
    ->
response returned
    ->
scan result disappears after the request finishes
```

Example current output:

```json
{
  "url": "https://example.com",
  "summary": {
    "total_issues": 6,
    "high": 2,
    "medium": 3,
    "low": 1
  }
}
```

This response is useful, but it is temporary.

## Expected Behavior

### 1. What

After persistence is implemented, the backend should:

1. scan the page
2. save the scan record
3. save the issues for that scan
4. return the same response to the frontend

### 2. Why

This gives the project both:

- live scan results
- stored scan history

That is much better than the current temporary-only flow.

### 3. How

New flow example:

```text
User submits URL
    ->
POST /scan/page
    ->
scan runs
    ->
scan saved to database
    ->
issues saved to database
    ->
response returned
```

Before vs after:

- Before: scan result only exists in the API response
- After: scan result exists in the API response and in PostgreSQL

Example future user scenario:

1. user scans `https://example.com`
2. backend saves the scan as `scan_id = 123`
3. user opens scan history later
4. frontend requests the saved scan list
5. frontend shows the real record for that scan

## Affected Files, Modules, And Components

### 1. What

These are the main places that will be affected later during implementation.

### 2. Why

Knowing the affected files early helps avoid confusion when revisiting the project.

### 3. How

Main backend files:

- `backend/app/main.py`
- `backend/app/services/page_scanner.py`
- `backend/alembic/env.py`
- `backend/alembic/versions/9848b576f059_create_scan_tables.py`

New backend files expected:

- `backend/app/db.py`
- `backend/app/models/base.py`
- `backend/app/models/scan.py`
- `backend/app/repositories/scan_repository.py`

Frontend impact later:

- `frontend/src/app/(dashboard)/scan-history/page.tsx`
- `frontend/src/lib/mock-scans.ts`

Documentation affected:

- `docs/architecture/system-architecture.md`
- `docs/tracking/feature-checklist.md`
- `docs/tracking/implementation-log.md`

## Step-By-Step Implementation Plan

### 1. What

This is the practical order of work for the persistence feature.

### 2. Why

Doing the work in the wrong order will create confusion.

For example, writing persistence logic before the models and migration exist will waste time.

### 3. How

#### Step 1: Create the database connection layer

What:

- create a central place for SQLAlchemy engine and sessions

Why:

- the backend needs one standard way to open database sessions

How:

- read `DATABASE_URL`
- create the SQLAlchemy engine
- create a session factory

#### Step 2: Create the SQLAlchemy base and models

What:

- create the ORM models for scans and issues

Why:

- Alembic and the backend need real table definitions

How:

- create a shared `Base`
- create `ScanRun`
- create `ScanIssue`

#### Step 3: Connect Alembic to the models

What:

- update Alembic so it knows the real metadata

Why:

- right now `target_metadata = None`
- that means Alembic does not know your tables

How:

- import the SQLAlchemy base
- set `target_metadata = Base.metadata`
- read the database URL from environment instead of the placeholder URL

#### Step 4: Replace the empty migration

What:

- replace the current empty migration with real table creation

Why:

- the current migration file only contains `pass`

How:

- create `scan_runs`
- create `scan_issues`
- create the foreign key from issues to scans

#### Step 5: Save scan results after scanning

What:

- update `POST /scan/page` flow so the result is stored

Why:

- this is the real product behavior we need

How:

- run the scan
- create a scan row
- create issue rows
- commit the transaction
- return the normal response

#### Step 6: Save failures too

What:

- save failed scans as error records

Why:

- scan history should show failed scans too

How:

- when a scan fails, store:
  - requested URL
  - status = `error`
  - error message
  - started time
  - completed time

#### Step 7: Prepare scan history read endpoints

What:

- add backend endpoints for reading saved scans later

Why:

- the scan history page needs real API data

How:

- add list endpoint for scans
- add detail endpoint for one saved scan

## Important Business Logic And Rules

### 1. What

These are the key rules the persistence logic must follow.

### 2. Why

Without clear rules, the saved data may become inconsistent or confusing.

### 3. How

Important rules:

- every scan must create one scan record
- every issue belongs to exactly one saved scan
- failed scans should still be stored
- the backend response shape for `POST /scan/page` should stay compatible
- the first version should support single-page scans only
- the schema should still leave room for multi-page support later

Simple example:

- one scan finds 5 issues
- database result should be:
  - 1 row in `scan_runs`
  - 5 rows in `scan_issues`

## Assumptions And Dependencies

### 1. What

These are the assumptions behind this work.

### 2. Why

They define what must already be true before implementation starts.

### 3. How

Assumptions:

- PostgreSQL is already running correctly
- `DATABASE_URL` is available
- Alembic has been initialized
- backend dependencies already include:
  - SQLAlchemy
  - Alembic
  - psycopg

Dependencies:

- Docker Compose database setup
- backend scan response schema
- current `POST /scan/page` flow

## Possible Edge Cases And Risks

### 1. What

These are problems that may appear during implementation.

### 2. Why

Thinking about them early makes the implementation safer.

### 3. How

Edge cases:

- database is running, but backend uses the wrong host name
- migration exists, but creates no tables
- scan succeeds, but database save fails
- scan fails before any issue rows exist
- duplicate save logic creates repeated rows
- frontend expects mock-data fields that do not match real database fields

Risks:

- storing screenshots in PostgreSQL would make rows too large
- changing API response shape too early could break the frontend
- mixing scan logic and database logic in one file could make the code hard to maintain

Recommended first-version rule:

- do not save screenshot base64 data in the first persistence version

## Testing Approach

### 1. What

This section explains how the persistence feature should be tested later.

### 2. Why

The feature is not complete unless we can prove:

- tables are created
- scans are saved
- issues are saved
- failures are handled correctly

### 3. How

Testing checklist:

1. run Alembic migration
2. confirm the tables exist
3. call `POST /scan/page` with a valid URL
4. confirm one scan row is saved
5. confirm related issue rows are saved
6. call `POST /scan/page` with a failing URL
7. confirm one error scan row is saved
8. confirm the original scan endpoint still returns the normal response

Example test scenario:

Input:

```json
{
  "url": "http://127.0.0.1:8000/test/page-bad"
}
```

Expected result:

- API returns issue data
- database stores one scan record
- database stores the related issues

## Final Notes For Future Reference

### 1. What

This task is the bridge between setup work and real product behavior.

### 2. Why

Before this task:

- the database exists but is not useful yet

After this task:

- the backend starts creating real saved scan history

### 3. How

When returning to this project later, remember this order:

1. database connection layer
2. models
3. Alembic metadata wiring
4. migration
5. save scan results
6. add history endpoints

That is the safest and easiest path for this feature.
