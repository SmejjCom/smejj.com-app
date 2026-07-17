FROM mcr.microsoft.com/playwright:v1.45.3-jammy

WORKDIR /app
COPY package.json /app/package.json
RUN PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install --omit=dev --no-audit --no-fund playwright@1.45.3
COPY workers/remote-browser/worker.js /app/remote-browser/worker.js
COPY workers/remote-browser/session-engine.js /app/remote-browser/session-engine.js
COPY workers/smejj-worker /app/smejj-worker

ENV NODE_ENV=production
ENV PORT=8080
ENV SMEJJ_HOST=0.0.0.0

EXPOSE 8080
CMD ["node", "/app/remote-browser/worker.js"]
