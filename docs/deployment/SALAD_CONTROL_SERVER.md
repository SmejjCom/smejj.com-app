# Control Server auf SaladCloud (CPU-only, Stufe 2 des Salad-Wegs)

Stand: 2026-07-03. Oracle ist raus (Nutzer-Anweisung); der Betriebsweg ist Salad.
Stufe 1 (LLM-Backend smejj-llm-qwen3 auf RTX 4090) laeuft bereits — siehe Memory_Bank.

## Architektur

- Control Server = minimaler Node-Prozess (KEINE npm-Dependencies) als CPU-only
  Salad Container Group hinter dem Container Gateway (stabile HTTPS-URL, optional Auth).
- Kosten: CPU-only Nodes ab ca. 0,01-0,04 USD/h vom Guthaben (Auto-Recharge bleibt aus).
- Stateless-Prinzip: Salad-Nodes koennen jederzeit reallozieren (kurze Ausfaelle,
  In-Memory-Jobstatus geht verloren). Quelle der Wahrheit bleibt IDrive e2 — konzeptkonform.
  Fuer bessere Uptime: 2 Replicas.
- Gateway-Domain ist *.salad.cloud (keine Custom Domain). smejj.com bleibt auf GitHub Pages;
  die Verbindung Frontend -> Salad-API braucht spaeter eine konfigurierbare API-Origin
  (Aenderung an der eingefrorenen Startseite -> nur mit schriftlicher Freigabe + start-lock-Freeze).

## Schritte

1. IMAGE BAUEN (lokal auf dem Mac, Docker Desktop):
   ```bash
   cd "smejj.com App"
   docker build -f deploy/control-server/Dockerfile -t smejj-control:latest .
   docker run --rm -p 3000:3000 -e SMEJJ_HOST=0.0.0.0 smejj-control:latest  # Smoke-Test
   curl http://127.0.0.1:3000/api/health
   ```
2. IMAGE VEROEFFENTLICHEN (einmalig, NUTZER-SCHRITT — Registry-Login/Token tippt nur der Nutzer):
   ```bash
   docker tag smejj-control:latest ghcr.io/smejjcom/smejj-control:latest
   docker login ghcr.io   # GitHub-Token mit write:packages
   docker push ghcr.io/smejjcom/smejj-control:latest
   ```
   Hinweis: ghcr.io ist fuer oeffentliche Images kostenlos (Free-Policy-konform).
   Das Image enthaelt KEINE Secrets (alles env-basiert) — oeffentlich ist ok;
   alternativ Package auf "private" stellen und Salad Registry-Credentials geben.
3. SALAD DEPLOY (Portal, Projekt default): Custom Container Group ->
   Image ghcr.io/smejjcom/smejj-control:latest, Umgebung CPU-only (2 vCPU / 2 GB reicht),
   1-2 Replicas, Container Gateway AN (Port 3000) + Authentication nach Bedarf.
   Environment Variables setzen (Werte traegt der Nutzer ein):
   ```
   SMEJJ_HOST=0.0.0.0
   PORT=3000
   SMEJJ_SERVER_AI_ENABLED=true
   SMEJJ_SERVER_AI_REMAINING=1000
   SMEJJ_LLM_SALAD_BASE_URL=https://<llm-gateway>.salad.cloud/v1
   SMEJJ_LLM_SALAD_API_KEY=<Salad-API-Key>
   IDRIVE_E2_ENDPOINT/REGION/BUCKET/ACCESS_KEY/SECRET_KEY=<Object Brain>
   GOOGLE_CLIENT_ID/SMEJJ_SESSION_SECRET=<Auth, optional fuer Start>
   ```
4. VERIFIKATION: GET <control-gateway>/api/health -> ok:true; POST /api/agent ->
   Antwort mit Header x-smejj-model-backend: salad:tgi (eigene GPU antwortet);
   GET /api/rag/search?q=test -> Treffer aus dem eingebackenen Projektwissen.

## Grenzen (ehrlich)

- SSE-Streams reissen bei Node-Reallocation ab — Client muss neu verbinden (Frontend tut das).
- Der PWA-Teil auf smejj.com bleibt die Hauptauslieferung; der Salad-Control-Server
  liefert nur /api/* (die eingebaute Statik ist Bonus fuer Direktzugriff).
