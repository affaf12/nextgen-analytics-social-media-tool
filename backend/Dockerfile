FROM python:3.11-slim

# Hugging Face Docker Spaces default port
ENV PORT=7860
EXPOSE 7860

WORKDIR /app

# System deps (kept minimal)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Hugging Face Spaces run containers as a non-root user by convention.
# Create writable dirs for the SQLite DB and uploaded media before switching user.
RUN useradd -m -u 1000 appuser \
    && mkdir -p /app/uploads \
    && chown -R appuser:appuser /app

USER appuser

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]
