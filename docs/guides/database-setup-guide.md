# Database Setup Guide

> Historical/setup note: this guide documents the original persistence bootstrap sequence. Some references to mock-era UI behavior are kept for historical context and may no longer reflect current UI integration status.

## Purpose

This document explains how to prepare the project for PostgreSQL-backed scan history.

It focuses on four things:

- PostgreSQL for local development
- backend database dependencies
- Alembic migration setup
- the first persistence foundation for scan history

The guide is written for a Windows machine and assumes Docker Desktop is already installed and working.

## Before You Start

Make sure these things are already available:

- Docker Desktop is installed and running
- the backend virtual environment already exists
- the backend folder is `web-accessibility-assistant\backend`
- the project root is `web-accessibility-assistant`

If you still need Docker Desktop, download it from:

- <https://www.docker.com/products/docker-desktop/>

## Step One: Install Python Packages For Database Support

### What

Install the Python packages needed for PostgreSQL, ORM access, and migrations.

### Why

The backend does not currently include a database layer.

These packages add the standard stack for FastAPI + PostgreSQL:

- `sqlalchemy` for ORM and database access
- `alembic` for migrations
- `psycopg[binary]` for the PostgreSQL driver

### How

Run these commands from:

```text
web-accessibility-assistant\backend
```

Commands:

```powershell
cd web-accessibility-assistant\backend
.\venv\Scripts\python.exe -m pip install sqlalchemy alembic "psycopg[binary]"
.\venv\Scripts\python.exe -m pip freeze > requirements.txt
```

What each command does:

- the first command installs the new packages into your backend virtual environment
- the second command updates `requirements.txt` so the same packages can be installed again later

## Step Two: Add PostgreSQL To Docker Compose

### What

Add a PostgreSQL service named `db` to:

- `docker-compose.yml`
- `docker-compose.dev.yml`

### Why

This keeps the database part of the same local development environment as the frontend and backend.

It avoids installing PostgreSQL directly on Windows and makes the setup easier to repeat later.

### How

Add a new service called `db` with these core settings:

- image: `postgres:16`
- port mapping: `5432:5432`
- environment variables:
  - `POSTGRES_DB=accessibility_assistant`
  - `POSTGRES_USER=postgres`
  - `POSTGRES_PASSWORD=postgres`
- a named volume for persistent database data
- a healthcheck using `pg_isready`

Example service block:

```yaml
db:
  image: postgres:16
  container_name: web-accessibility-db
  environment:
    POSTGRES_DB: accessibility_assistant
    POSTGRES_USER: postgres
    POSTGRES_PASSWORD: postgres
  ports:
    - "5432:5432"
  volumes:
    - postgres_data:/var/lib/postgresql/data
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U postgres -d accessibility_assistant"]
    interval: 10s
    timeout: 5s
    retries: 5
```

Also add a named volume near the bottom of the Compose file:

```yaml
volumes:
  postgres_data:
```

Important note:

- this is for local development only
- production should not hardcode these credentials

## Step Three: Add Backend Database Environment Variables

### What

Add a `DATABASE_URL` setting for the backend.

### Why

The backend needs one connection string that tells it how to reach PostgreSQL.

### How

You have two local development cases.

### Case A: Running the backend on your machine

Put this in a backend `.env` file or set it in your terminal:

```text
DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/accessibility_assistant
```

### Case B: Running the backend inside Docker Compose

Put this in the backend `environment:` block in Compose:

```text
DATABASE_URL=postgresql+psycopg://postgres:postgres@db:5432/accessibility_assistant
```

Example:

```yaml
backend:
  environment:
    DATABASE_URL: postgresql+psycopg://postgres:postgres@db:5432/accessibility_assistant
```

Do not put `DATABASE_URL` under the `db` service.

The `db` service only needs PostgreSQL startup variables such as:

- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`

What each part means:

- first `postgres`: username
- second `postgres`: password
- `localhost` or `db`: host name
- `5432`: PostgreSQL port
- `accessibility_assistant`: database name

Use this rule:

- use `localhost` when the backend runs on your Windows machine
- use `db` when the backend runs inside Docker Compose

## Step Four: Start PostgreSQL

### What

Start the database container.

### Why

You need PostgreSQL running before testing connections or creating migrations.

### How

Run these commands from:

```text
web-accessibility-assistant
```

Commands:

```powershell
cd web-accessibility-assistant
docker compose up -d db
docker compose ps
```

What success looks like:

- the `db` service appears in `docker compose ps`
- the container is running
- port `5432` is mapped

## Step Five: Verify PostgreSQL Is Healthy

### What

Check the PostgreSQL logs.

### Why

The container may be running but still not ready to accept connections.

### How

Run this from:

```text
web-accessibility-assistant
```

Command:

```powershell
cd web-accessibility-assistant
docker compose logs db
```

What to look for:

```text
database system is ready to accept connections
```

That message means PostgreSQL finished starting correctly.

## Step Six: Initialize Alembic

### What

Initialize Alembic in the backend project.

### Why

Alembic manages database schema changes over time.

It is the standard migration tool used with SQLAlchemy.

### How

Run this from:

```text
web-accessibility-assistant\backend
```

Command:

```powershell
cd web-accessibility-assistant\backend
.\venv\Scripts\alembic.exe init alembic
```

This creates:

- `alembic/`
- `alembic.ini`

Later, you will edit:

- `alembic.ini`
- the Alembic environment configuration inside `alembic`

## Step Seven: First Migration Workflow

### What

Create and apply the first database migration.

### Why

This is how your project will create real tables such as scan history tables.

### How

Run these commands from:

```text
web-accessibility-assistant\backend
```

Commands:

```powershell
cd web-accessibility-assistant\backend
.\venv\Scripts\alembic.exe revision -m "create scan tables"
.\venv\Scripts\alembic.exe upgrade head
```

What they do:

- `revision` creates a new migration file
- `upgrade head` applies all migrations up to the latest version

## Step Eight: Verify The Backend Can Still Run

### What

Start the backend after the database setup.

### Why

This confirms the project still runs after the new dependencies and settings are added.

### How

Run this from:

```text
web-accessibility-assistant\backend
```

Command:

```powershell
cd web-accessibility-assistant\backend
.\venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

Then check:

- <http://127.0.0.1:8000/health>

If the backend starts and `/health` responds, the basic environment is still working.

## Step Nine: How This Connects To Scan History

The goal of this setup is not only to add a database.

It also prepares the project for real saved scans.

Later, the backend will use PostgreSQL to:

- save every completed or failed scan
- store scan issue details
- return real saved history data

That will allow:

- the scan-history page to stop using `MOCK_SCANS`
- the issues page to use real saved scan IDs
- future reporting and exports to use stored data

## Common Problems

### Docker Desktop Is Not Started

Problem:

- `docker compose` commands fail or cannot connect

Fix:

- open Docker Desktop
- wait until Docker shows that it is running
- run the command again

### Port `5432` Is Already In Use

Problem:

- PostgreSQL container fails to start because another service already uses port `5432`

Fix:

- stop the other PostgreSQL service, or
- change the left side of the port mapping, for example:

```yaml
ports:
  - "5433:5432"
```

If you change the host port, also update the local `DATABASE_URL`.

### `alembic.exe` Is Not Found

Problem:

- PowerShell says `alembic.exe` cannot be found

Fix:

- confirm the package install step completed successfully
- confirm the virtual environment exists in `backend\venv`
- run the command using the full path:

```powershell
.\venv\Scripts\alembic.exe init alembic
```

### Backend Cannot Connect To The Database

Problem:

- backend startup fails with a connection error

Fix:

- confirm the `db` container is running
- confirm the health logs show the database is ready
- check `DATABASE_URL`
- make sure username, password, port, and database name are correct
- make sure DATABASE_URL is set on the backend service, not the db service

### Wrong Host Name

Use this rule:

- use `localhost` outside Docker
- use `db` inside Docker Compose

If you use the wrong host name, the backend will not be able to connect.

## Quick Repeat Checklist

If you need to repeat this setup later, use this order:

1. install backend DB packages
2. update `requirements.txt`
3. add `db` service to Compose files
4. set `DATABASE_URL`
5. start PostgreSQL
6. initialize Alembic
7. create and run the first migration
8. verify the backend still runs

## Commands Reference

These are the main commands from the guide.

Run from `web-accessibility-assistant\backend`:

```powershell
cd web-accessibility-assistant\backend
.\venv\Scripts\python.exe -m pip install sqlalchemy alembic "psycopg[binary]"
.\venv\Scripts\python.exe -m pip freeze > requirements.txt
.\venv\Scripts\alembic.exe init alembic
.\venv\Scripts\alembic.exe revision -m "create scan tables"
.\venv\Scripts\alembic.exe upgrade head
.\venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

Run from `web-accessibility-assistant`:

```powershell
cd web-accessibility-assistant
docker compose up -d db
docker compose ps
docker compose logs db
```

## Test Plan

After following this guide, you should be able to confirm:

- backend packages install successfully
- `requirements.txt` includes SQLAlchemy, Alembic, and psycopg
- PostgreSQL starts through Docker Compose
- database health logs show readiness
- Alembic initializes successfully
- migration commands are available
- backend still starts after the setup

## Assumptions And Defaults

- file path: `docs/guides/database-setup-guide.md`
- audience: beginner to intermediate developer
- OS: Windows
- Docker is already installed
- database runtime: PostgreSQL in Docker Compose
- persistence stack: sync SQLAlchemy + Alembic + psycopg
- production should use a provider-specific `DATABASE_URL`, but production deployment setup is outside this guide


