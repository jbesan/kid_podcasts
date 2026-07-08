# Stage 1: Build the virtual environment using Astral uv
FROM ghcr.io/astral-sh/uv:latest AS uv_setup

FROM python:3.13-slim AS builder

# Copy the prebuilt uv binary from the official image
COPY --from=uv_setup /uv /uvx /bin/

# Set working directory and optimize Python/uv settings
WORKDIR /app
ENV UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1 \
    PYTHONUNBUFFERED=1

# Copy only dependency definitions first to maximize layer caching
COPY pyproject.toml uv.lock ./

RUN uv venv /app/.venv && \
    . /app/.venv/bin/activate && \
    uv pip install --no-cache -r pyproject.toml

# Stage 2: Final minimal execution image
FROM python:3.13-slim

WORKDIR /app

# Set production environment variables
ENV PYTHONUNBUFFERED=1 \
    PORT=8080 \
    PATH="/app/.venv/bin:$PATH"

# Create a secure, non-privileged system user for Cloud Run execution
RUN groupadd -g 10001 appgroup && \
    useradd -u 10001 -g appgroup -m -s /bin/bash appuser

# Copy virtual environment from builder
COPY --from=builder /app/.venv /app/.venv

# Copy application source code and template markdown files
COPY main.py podcast_generator.py transcript_prompt_template.md tts_prompt_template.md ./
COPY models/ ./models/
COPY utils/ ./utils/

# Create ephemeral podcasts directory and assign ownership to appuser
RUN mkdir -p /app/podcasts && \
    chown -R appuser:appgroup /app

# Switch to non-privileged user
USER appuser

# Expose NiceGUI port
EXPOSE 8080

# Run NiceGUI server
CMD ["python", "main.py"]
