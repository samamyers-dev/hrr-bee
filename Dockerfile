# ---- Frontend build stage ----
FROM node:20-slim AS frontend-build
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- Python builder stage ----
FROM python:3.12-slim-bookworm AS builder

WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# --- Runtime stage ---
FROM python:3.12-slim-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
    libssl3 ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy installed packages from builder
COPY --from=builder /root/.local /root/.local
ENV PATH=/root/.local/bin:$PATH

# Copy backend code
COPY backend/ ./backend/

# Copy migrations
COPY migrations/ ./migrations/

# Copy frontend built in the frontend-build stage
COPY --from=frontend-build /frontend/dist/ ./frontend/dist/

EXPOSE 8080

CMD ["sh", "-c", "python -m uvicorn backend.main:app --host [IP_ADDRESS] --port ${PORT:-8080}"]
