# Use a lightweight official Python image as the base for the backend container.
FROM python:3.11-slim

# Prevent Python from writing .pyc files inside the container.
ENV PYTHONDONTWRITEBYTECODE=1
# Send Python logs straight to stdout/stderr without buffering.
ENV PYTHONUNBUFFERED=1

# Set the working directory for all following commands.
WORKDIR /app

# Copy dependencies first so Docker can cache this layer when app code changes.
COPY requirements.txt ./

# Install Python packages, then install Chromium and system deps for Playwright.
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt \
    && python -m playwright install --with-deps chromium

# Copy the FastAPI application source into the container.
COPY app ./app

# Document that the container listens on port 8000.
EXPOSE 8000

# Start the FastAPI app with Uvicorn when the container launches.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
