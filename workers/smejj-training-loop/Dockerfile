# smejj.com Training-Loop-Worker — dauerhafter Prozess (Zeabur, Notfallserver-Rolle).
# Keine npm-Dependencies (nur Node-Bordmittel), gleiches Konzept wie
# deploy/control-server/Dockerfile: kein npm install, kein Lockfile-Risiko.
# NICHT deploybar ohne schriftliche Betreiber-Freigabe fuer einen neuen Dienst
# auf dem bestehenden Zeabur-Server (docs/architecture/FREE_ONLY_MASTER_POLICY.md,
# Abschnitt "Dokumentierte Ausnahmen").
#
# Build:  docker build -f workers/smejj-training-loop/Dockerfile -t smejj-training-loop:latest .
# Lokal:  docker run --rm -p 8080:8080 --env-file .env smejj-training-loop:latest
FROM node:22-slim

ENV NODE_ENV=production \
    SMEJJ_HOST=0.0.0.0 \
    PORT=8080

WORKDIR /app

# Nur was der Worker wirklich braucht — Pfade bleiben repo-relativ, damit die
# bestehenden relativen Imports in den kopierten Dateien unveraendert funktionieren
# (gleiches Muster wie workers/maus-engine/Dockerfile).
COPY --chown=node:node workers/smejj-training-loop ./workers/smejj-training-loop
# worker.mjs importiert den Brueckenwaechter (seit aa07a12b) - ohne diese Zeile
# startet der Container nicht (ERR_MODULE_NOT_FOUND, gemessen 02.09.2026 im
# Zeabur-Log) und Zeabur pausiert den Dienst nach der Absturzschleife.
COPY --chown=node:node workers/smejj-brueckenwaechter/brueckenWaechter.js ./workers/smejj-brueckenwaechter/brueckenWaechter.js
COPY --chown=node:node workers/maus-engine/artifact-uploader.mjs ./workers/maus-engine/artifact-uploader.mjs
COPY --chown=node:node workers/glm-salad/s3.js ./workers/glm-salad/s3.js
COPY --chown=node:node src/evaluation ./src/evaluation
COPY --chown=node:node src/training ./src/training
COPY --chown=node:node scripts/evaluation/run_model_eval.mjs ./scripts/evaluation/run_model_eval.mjs
COPY --chown=node:node control-server/src/storage/s3Signer.js ./control-server/src/storage/s3Signer.js
COPY --chown=node:node control-server/src/shared/hash.js ./control-server/src/shared/hash.js
COPY --chown=node:node control-server/src/training/consentLedger.js ./control-server/src/training/consentLedger.js
COPY --chown=node:node evals/suites ./evals/suites
# Seit dem Projektwissen-Umbau (feat(rag), 01.09.2026) zieht src/evaluation
# beim Start control-server/src/rag nach sich, und das wiederum Autopilot-,
# Record- und Websuche-Module. Lokal gemessen (abbild-sim, 02.09.2026): ohne
# diese Zeilen ERR_MODULE_NOT_FOUND auf agentContext.js; mit ihnen startet der
# Worker und meldet 'listening'. smejj-lora-loop wird vom LoRA-Anbau lazy
# geladen - ohne ihn lief der Loop zwar, aber ohne LoRA.
COPY --chown=node:node control-server/src/rag ./control-server/src/rag
COPY --chown=node:node control-server/src/autopilots/deepResearchAutopilot.js ./control-server/src/autopilots/deepResearchAutopilot.js
COPY --chown=node:node control-server/src/autopilots/realtimeInternetHarvesterAutopilot.js ./control-server/src/autopilots/realtimeInternetHarvesterAutopilot.js
COPY --chown=node:node control-server/src/admin/recordStore.js ./control-server/src/admin/recordStore.js
COPY --chown=node:node control-server/src/shared/parallelFetch.js ./control-server/src/shared/parallelFetch.js
COPY --chown=node:node src/search ./src/search
COPY --chown=node:node workers/smejj-lora-loop ./workers/smejj-lora-loop

# Nicht als root laufen (Sicherheit ist Pflicht).
USER node

# Pflicht-Env zur Laufzeit (fail-closed ohne sie):
#   SMEJJ_TRAINING_LOOP_ENABLED=YES         (sonst laeuft nur /health, kein Tick)
#   SMEJJ_TRAINING_LOOP_EVAL_ENABLED=YES    (Eval-Zyklus)
#   SMEJJ_TRAINING_LOOP_TRAINING_ENABLED=YES (Trainings-Warteschlangen-Zyklus)
#   SMEJJ_TRAINING_CAPTURE_ENABLED=YES      (bestehende projektweite Trainings-Sperre)
#   IDRIVE_E2_ENDPOINT / IDRIVE_E2_BUCKET / IDRIVE_E2_REGION /
#   IDRIVE_E2_ACCESS_KEY / IDRIVE_E2_SECRET_KEY                (Checkpoint + Benchmarks)
#   IDRIVE_E2_TRAINING_* (siehe src/training/idrive-conditional-writer.js)
#   SMEJJ_TRAINING_CONSENT_BINDING_KEY / SMEJJ_TRAINING_CONSENT_SIGNING_KEY
#   SMEJJ_TRAINING_EVIDENCE_VERIFIER_PUBLIC_KEY (o.ae., siehe src/training/evidence.js)

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["node", "workers/smejj-training-loop/worker.mjs"]
