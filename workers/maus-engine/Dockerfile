# smejj.com Maus-Engine — stateless Salad-Worker-Image.
# Browser-Binaries sind im Image gecacht (Kostenregel); der Worker beendet
# sich nach jeder Aufgabe (Scale-to-zero hinter dem bestehenden Budget-Gate).
FROM mcr.microsoft.com/playwright:v1.45.3-jammy

WORKDIR /app
COPY package.json /app/package.json
RUN PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install --omit=dev --no-audit --no-fund playwright@1.45.3

# Engine + wiederverwendete S3-Schicht + normatives Schema (eine Quelle der
# Wahrheit fuer Validator und Prompt-Template).
COPY workers/maus-engine /app/workers/maus-engine
COPY workers/glm-salad/s3.js /app/workers/glm-salad/s3.js
COPY schemas/maus-action-plan.schema.json /app/schemas/maus-action-plan.schema.json
# Einzelschritt-Vertrag des interaktiven Loop-Modus (Freigabe 2026-07-15).
# Pflicht im Image: interactive-loop.mjs liest das Schema beim ersten
# Loop-Schritt; ohne die Datei waere der Loop-Modus zur Laufzeit tot.
COPY schemas/maus-step-decision.schema.json /app/schemas/maus-step-decision.schema.json

ENV NODE_ENV=production
ENV PORT=8080
ENV SMEJJ_HOST=0.0.0.0

# Pflicht-Env zur Laufzeit (Salad-Secrets, fail-closed ohne sie):
#   SMEJJ_MAUS_ENGINE_TOKEN
#   IDRIVE_E2_ENDPOINT / IDRIVE_E2_BUCKET / IDRIVE_E2_REGION
#   IDRIVE_E2_ACCESS_KEY / IDRIVE_E2_SECRET_KEY
#   optional: SMEJJ_MAUS_SECRET_* fuer secretRef-Aufloesung

EXPOSE 8080
CMD ["node", "/app/workers/maus-engine/worker.mjs"]
