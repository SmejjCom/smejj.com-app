FROM nvidia/cuda:12.4.1-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    SMEJJ_WORKER_PORT=8080 \
    SMEJJ_MODEL_CACHE_DIR=/cache/glm-5-2-fp8 \
    SMEJJ_GLM_RUNTIME=sglang

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl git python3 python3-pip nodejs npm \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g playwright \
  && npx playwright install --with-deps chromium

RUN python3 -m pip install --no-cache-dir --upgrade pip \
  && python3 -m pip install --no-cache-dir sglang[all] vllm ktransformers boto3

WORKDIR /app
COPY worker.js /app/worker.js

EXPOSE 8080
CMD ["node", "/app/worker.js"]
