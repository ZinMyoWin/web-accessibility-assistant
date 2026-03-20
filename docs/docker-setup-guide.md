# Docker Setup Guide

## Purpose

This document explains the Docker setup for the project in a step-by-step way so it can be repeated later without guesswork.

Each step uses the same pattern:

- what
- why
- how

Examples are included where they make the process easier to follow.

## 1. What We Wanted To Achieve

### What

We wanted one command to start both parts of the project:

- the FastAPI backend
- the Next.js frontend

### Why

Running both services manually works, but it creates setup friction:

- Python and Node.js must be installed correctly on every machine
- Playwright and Chromium must be installed manually
- the correct ports and startup commands must be remembered
- team members may run different versions of dependencies

Docker solves this by packaging the environment together with the application.

### How

We created:

- one Dockerfile for the backend
- one Dockerfile for the frontend
- one `docker-compose.yml` file at the project root
- one `.dockerignore` file for each service

That gives us this model:

```text
docker compose up --build
        |
        +--> build backend image
        +--> build frontend image
        +--> start backend container
        +--> wait for backend health check
        +--> start frontend container
```

## 2. Step One: Create A Backend Dockerfile

### What

We created [backend/Dockerfile](/d:/Lithan/UOR/Final%20Year%20Project/web-accessibility-assistant/backend/Dockerfile).

### Why

The backend needs:

- Python
- the Python packages in `requirements.txt`
- Playwright
- Chromium for screenshot capture

Without a backend Dockerfile, Docker would not know how to build the backend environment.

### How

We used a small official Python image:

```dockerfile
FROM python:3.11-slim
```

Then we configured Python for container use:

```dockerfile
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
```

Then we set the working directory:

```dockerfile
WORKDIR /app
```

Then we copied dependencies first:

```dockerfile
COPY requirements.txt ./
```

This matters because Docker caches layers. If only app code changes later, Docker can reuse the dependency install layer and rebuild faster.

Then we installed the backend dependencies and Chromium:

```dockerfile
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt \
    && python -m playwright install --with-deps chromium
```

Then we copied the backend source code:

```dockerfile
COPY app ./app
```

Then we documented the port and startup command:

```dockerfile
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Example

If you build this image, Docker creates a backend environment that already knows how to start FastAPI on port `8000`.

## 3. Step Two: Create A Backend .dockerignore File

### What

We created [backend/.dockerignore](/d:/Lithan/UOR/Final%20Year%20Project/web-accessibility-assistant/backend/.dockerignore).

### Why

When Docker builds an image, it sends files from the build context into the Docker build process.

We do not want to send unnecessary files such as:

- `__pycache__/`
- virtual environments
- test caches
- coverage output

Those files:

- make builds slower
- make images larger
- can introduce machine-specific noise

### How

We listed files and folders that should not be included in the backend build context.

Example:

```text
__pycache__/
.venv/
venv/
.pytest_cache/
```

## 4. Step Three: Create A Frontend Dockerfile

### What

We created [frontend/Dockerfile](/d:/Lithan/UOR/Final%20Year%20Project/web-accessibility-assistant/frontend/Dockerfile).

### Why

The frontend needs:

- Node.js
- npm dependencies from `package-lock.json`
- a production build step for Next.js

It also needs the backend API URL available during the build, because `NEXT_PUBLIC_*` values are used by Next.js when it builds the application.

### How

We started from a small official Node.js image:

```dockerfile
FROM node:22-alpine
```

Then we declared the build argument:

```dockerfile
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

This means the frontend build can receive the backend API URL.

Then we set production mode and passed the build argument into the environment:

```dockerfile
ENV NODE_ENV=production
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
```

Then we copied dependency files first:

```dockerfile
COPY package.json package-lock.json ./
RUN npm ci
```

We use `npm ci` instead of `npm install` because:

- it follows the lock file exactly
- it is more reproducible in CI and Docker builds
- it fails if the lock file and package file do not match

Then we copied the rest of the source code and built the app:

```dockerfile
COPY . .
RUN npm run build
```

Then we exposed port `3000` and started the production server:

```dockerfile
EXPOSE 3000
CMD ["npm", "start", "--", "--hostname", "0.0.0.0", "--port", "3000"]
```

### Example

If the frontend calls:

```ts
const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";
```

then this Docker setup ensures the built app uses:

```text
http://localhost:8000
```

from the browser.

## 5. Step Four: Create A Frontend .dockerignore File

### What

We created [frontend/.dockerignore](/d:/Lithan/UOR/Final%20Year%20Project/web-accessibility-assistant/frontend/.dockerignore).

### Why

The frontend build should not send:

- `node_modules/`
- `.next/`
- local build outputs
- package manager log files

This keeps the build context smaller and cleaner.

### How

We added ignore rules such as:

```text
node_modules/
.next/
dist/
build/
```

## 6. Step Five: Create docker-compose.yml

### What

We created [docker-compose.yml](/d:/Lithan/UOR/Final%20Year%20Project/web-accessibility-assistant/docker-compose.yml).

### Why

The Dockerfiles define how to build each service separately, but we also need one file that tells Docker:

- which services exist
- which ports to expose
- which service depends on another
- which build settings to use

That is the job of Docker Compose.

### How

We defined two services:

- `backend`
- `frontend`

For the backend:

```yaml
backend:
  build:
    context: ./backend
    dockerfile: Dockerfile
  ports:
    - "8000:8000"
```

This means:

- build the backend image from the `backend/` folder
- expose backend port `8000`

Then we added a health check:

```yaml
healthcheck:
  test:
    [
      "CMD",
      "python",
      "-c",
      "import urllib.request; urllib.request.urlopen(\"http://127.0.0.1:8000/health\")",
    ]
```

This health check confirms the backend is not just running, but actually responding on `/health`.

For the frontend:

```yaml
frontend:
  build:
    context: ./frontend
    dockerfile: Dockerfile
    args:
      NEXT_PUBLIC_API_BASE_URL: http://localhost:8000
```

This passes the API URL into the frontend build.

Then we added:

```yaml
depends_on:
  backend:
    condition: service_healthy
```

This tells Docker Compose to wait until the backend passes the health check before starting the frontend.

### Example

Without `depends_on`, the frontend might start while the backend is still booting.

With `depends_on`, the startup order is safer:

1. backend starts
2. backend health check passes
3. frontend starts

## 7. Step Six: Update The README

### What

We updated [README.md](/d:/Lithan/UOR/Final%20Year%20Project/web-accessibility-assistant/README.md).

### Why

A Docker setup is not complete if the next developer has to inspect the files to guess how to run it.

The README should contain the minimum command needed to start the project.

### How

We added a simple Docker run section:

```powershell
docker compose up --build
```

and documented the service URLs:

- frontend: `http://127.0.0.1:3000`
- backend API: `http://127.0.0.1:8000`
- backend docs: `http://127.0.0.1:8000/docs`

## 8. Step Seven: Validate The Compose File

### What

We validated the Docker Compose configuration.

### Why

A Compose file can look correct but still fail because of:

- bad YAML structure
- invalid indentation
- invalid Docker Compose syntax

Validation catches that before a full build.

### How

We ran:

```powershell
docker compose -f web-accessibility-assistant\docker-compose.yml config
```

If Docker can print the resolved configuration, the file is structurally valid.

### Example

This command does not fully build the images. It only checks that Compose understands the file.

That is useful for quick verification after editing comments or YAML structure.

## 9. Step Eight: Run The Full Stack

### What

After creating the files, the next operational step is to run both services together.

### Why

This proves the Docker setup works end to end.

### How

From the project root:

```powershell
cd web-accessibility-assistant
docker compose up --build
```

Docker will:

1. build the backend image
2. build the frontend image
3. start the backend container
4. run the backend health check
5. start the frontend container

Then verify:

- frontend: `http://127.0.0.1:3000`
- backend health: `http://127.0.0.1:8000/health`
- backend docs: `http://127.0.0.1:8000/docs`
- local test page: `http://127.0.0.1:8000/test/page-bad`

## 10. Important Notes To Remember Later

### What

These are the key lessons from this setup.

### Why

These are the details most likely to be forgotten when repeating the work.

### How

Remember these points:

1. `NEXT_PUBLIC_*` values in Next.js are build-time sensitive, so the API URL must be available during the frontend image build.
2. Playwright needs Chromium installed inside the backend image, not only on the host machine.
3. `.dockerignore` files matter because they reduce build time and avoid copying local junk into images.
4. `depends_on` is better when combined with a real health check, not just service start order.

## 11. Quick Repeat Checklist

If you need to repeat this setup from scratch later, follow this order:

1. Create `backend/Dockerfile`
2. Create `backend/.dockerignore`
3. Create `frontend/Dockerfile`
4. Create `frontend/.dockerignore`
5. Create `docker-compose.yml`
6. Add Docker run instructions to `README.md`
7. Validate with `docker compose config`
8. Run with `docker compose up --build`
9. Verify frontend and backend URLs in the browser

## 12. Short Summary

### What

We containerized both the frontend and backend.

### Why

To make the project easier to run, easier to share, and more consistent across machines.

### How

We gave each service its own Dockerfile, reduced build noise with `.dockerignore`, connected them with Docker Compose, documented the run command, and validated the configuration before running it.
