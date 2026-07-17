# smejj.com Control Server — minimales Image fuer SaladCloud (CPU-only, AMD64).
# Keine npm-Dependencies (nur Node-Bordmittel) -> kein npm install, kein Lockfile-Risiko.
# Build:  docker build -f deploy/control-server/Dockerfile -t smejj-control:latest .
# Lokal:  docker run --rm -p 3000:3000 -e SMEJJ_HOST=0.0.0.0 --env-file .env smejj-control:latest
FROM node:22-slim

ENV NODE_ENV=production \
    SMEJJ_HOST=0.0.0.0 \
    PORT=3000

WORKDIR /app

# Nur was der Server wirklich braucht (Konzept: Control Server minimal).
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node control-server ./control-server
COPY --chown=node:node gatekeeper ./gatekeeper
COPY --chown=node:node worker-templates ./worker-templates
COPY --chown=node:node public ./public
COPY --chown=node:node Memory_Bank.md AI_Guidelines.md Project_Goals.md AGENTS.md README.md ./
COPY --chown=node:node docs ./docs

# Nicht als root laufen (Sicherheit ist Pflicht).
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["node", "src/server.js"]
