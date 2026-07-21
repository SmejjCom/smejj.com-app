# smejj.com voice worker — GPU image, stateless, no secrets baked in.
# cudnn-runtime base so faster-whisper (CTranslate2) can use the GPU.
FROM nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    SMEJJ_WORKER_PORT=8080 \
    PYTHONPATH=/app/src \
    # Ephemeral model cache only — the container stays stateless (wiped on stop).
    HF_HOME=/tmp/smejj-voice-cache

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
       ca-certificates python3 python3-pip ffmpeg libgomp1 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps first for better layer caching.
COPY requirements.txt /app/requirements.txt
RUN python3 -m pip install --no-cache-dir --upgrade pip \
  && python3 -m pip install --no-cache-dir -r /app/requirements.txt

# Only the runtime package — no tests, docs, secrets or .env in the image.
COPY src /app/src

EXPOSE 8080

# Fail-closed at the orchestration edge: the container reports unhealthy until
# /health answers (which only happens after the budget gate approved startup).
HEALTHCHECK --interval=30s --timeout=5s --start-period=180s --retries=3 \
  CMD python3 -c "import os,urllib.request;urllib.request.urlopen('http://127.0.0.1:'+os.environ.get('SMEJJ_WORKER_PORT','8080')+'/health').read()" || exit 1

# Self-terminating worker: on idle/runtime-cap it exits -> Salad replica stops
# -> GPU billing ends. restart_policy must be "never" on the Salad group.
CMD ["python3", "-m", "smejj_voice_worker.server"]
