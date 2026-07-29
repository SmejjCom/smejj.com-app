# Maus-Engine: von der Registry auf Git-Bau umstellen

Stand: 2026-07-29. **Vorbereitet, NICHT ausgerollt.**
Die Umstellung ist eine Produktionsaenderung und braucht die ausdrueckliche
schriftliche Freigabe des Betreibers.

Ablage in `docs/deployment/` (nicht `docs/deploy/`), damit der Weg neben dem
direkten Gegenstueck `CONTROL_SERVER_ZEABUR_UMZUG.md` liegt.

---

## 1. Warum

| | heute | nach der Umstellung |
| --- | --- | --- |
| Herkunft des Abbilds | `ghcr.io/smejjcom/smejj-maus-engine:v1` | Zeabur baut aus `Dockerfile.smejj-maus-engine` |
| Bau lokal moeglich? | nein — Docker-Daemon aus, kein ghcr-Login | entfaellt, Zeabur baut |
| Kostenweg GitHub Packages | offen, aber ungenutzt (Paket ist oeffentlich) | strukturell zu |
| Quelltext vs. laufendes Abbild | koennen auseinanderlaufen | jeder Push baut neu |

Kostenbezug: `docs/policy/GITHUB_KOSTENFREI.md`, Regel B.

## 2. Was schon fertig ist

`Dockerfile.smejj-maus-engine` liegt im Repo-Wurzelverzeichnis.

**Der Dateiname ist bewusst `Dockerfile.smejj-maus-engine`, nicht
`Dockerfile.maus-engine`.** Zeabur ordnet ueber `Dockerfile.<dienstname>` zu;
der Dienst heisst `smejj-maus-engine` (Domain `smejj-maus-engine.zeabur.app`).
Bei falschem Namen greift Zeabur nicht zu, zbpack uebernimmt, und zbpack fuehrt
`npm start` aus — das ist in diesem Repo der **Control Server**
(`package.json`: `"start": "node src/server.js"`). Der Dienst saehe dann aus wie
die Maus-Engine und waere in Wahrheit etwas anderes.

## 3. Geprueft gegen die bekannten Zeabur-Fallen

| Falle | Behandlung | Nachweis |
| --- | --- | --- |
| `npm/pnpm start` startet den Control Server | ausdruecklicher `CMD ["node", "/app/workers/maus-engine/worker.mjs"]`, absoluter Pfad | Dockerfile Zeile "CMD" |
| zbpack-Erkennung uebergeht das Dockerfile | Dateiname folgt `Dockerfile.<dienstname>` — dasselbe Muster wie das live laufende `Dockerfile.smejj-training-loop` | Muster live bestaetigt |
| `build:i18n` | wird bewusst **nicht** ausgefuehrt; erzeugt nur `public/`-Sprachseiten, die Engine kopiert `public/` gar nicht | Kommentar im Dockerfile |
| `.dockerignore` schneidet Pfade weg | `.dockerignore` hat `workers/*`, aber `!workers/maus-engine/**`, `!workers/glm-salad/s3.js`; `schemas/*`, aber beide Maus-Schemata negiert — exakt die Pfade, die dieses Dockerfile kopiert | `.dockerignore` gelesen; dieselben COPY-Pfade haben bereits das heute laufende Abbild gebaut |
| Worker beendet sich nach jedem Lauf | `ENV SMEJJ_MAUS_EXIT_AFTER_RUN=NO` im Abbild — sonst startet der Zeabur-Dienst nach jeder Aufgabe neu (Salad brauchte das Gegenteil) | `worker.mjs:19` |
| Schema-Pfade zur Laufzeit | Schemata liegen unter `/app/schemas/`, weil `plan-validator.mjs`, `prompt-template.mjs` und `interactive-loop.mjs` sie ueber `../../schemas/` aufloesen | real gemessen, siehe unten |
| Playwright-Version | Basis `playwright:v1.45.3-jammy` und `npm install playwright@1.45.3` — identisch, sonst sucht Playwright einen Browser-Ordner, den es nicht gibt | Dockerfile |

### Messung des COPY-Umfangs (2026-07-29)

Das Abbild-Layout wurde ohne Docker nachgestellt (nur die COPY-Zeilen, 38
Dateien) und der Worker daraus gestartet:

```
/health                                  {"ok":true,"engine":"smejj.com maus-engine","running":false}
POST /run ohne Token                     401
POST /run mit Token, ungueltiger Plan    422
Log                                      smejj.com maus-engine bereit auf 127.0.0.1:18099
```

Die `422` ist der eigentliche Beweis: sie entsteht erst, wenn
`schemas/maus-action-plan.schema.json` tatsaechlich vom Datentraeger gelesen
werden konnte. Der COPY-Umfang ist also vollstaendig.

**Ungeprueft geblieben:** ein echter `docker build` (kein Docker-Daemon auf
diesem Rechner) und ein echter Browserlauf (Stufe 2, Playwright wird erst dann
geladen). Beides zeigt sich beim ersten Zeabur-Bau.

## 4. Umstellungsweg (erst nach Freigabe)

1. `Dockerfile.smejj-maus-engine` committen und pushen.
2. Zeabur-Portal → Projekt → Dienst `smejj-maus-engine` → Einstellungen.
3. Quelle von "Image" auf "Git" umstellen (GitHub-App, Repo
   `SmejjCom/smejj.com-app`, Branch `feature/auth-redesign-github-magiclink`).
4. Umgebungsvariablen **unveraendert lassen** — sie haengen am Dienst, nicht am
   Abbild. Pflicht bleiben: `SMEJJ_MAUS_ENGINE_TOKEN`, `IDRIVE_E2_ENDPOINT`,
   `IDRIVE_E2_BUCKET`, `IDRIVE_E2_REGION`, `IDRIVE_E2_ACCESS_KEY`,
   `IDRIVE_E2_SECRET_KEY`. `SMEJJ_MAUS_EXIT_AFTER_RUN=NO`, `PORT=8080` und
   `SMEJJ_HOST=0.0.0.0` stehen jetzt zusaetzlich im Abbild; die Portal-Werte
   duerfen bleiben und gewinnen ohnehin.
5. Bau ausloesen. Rechne mit deutlich laengerer erster Bauzeit als beim
   Image-Pull (Playwright-Basis ~692 MB komprimiert, danach Schicht-Cache).
6. Abnahme, bevor irgendetwas anderes umgestellt wird:
   ```bash
   curl -s https://smejj-maus-engine.zeabur.app/health
   ```
   Erwartet: `{"ok":true,"engine":"smejj.com maus-engine","running":false}`
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" -X POST \
     https://smejj-maus-engine.zeabur.app/run \
     -H 'content-type: application/json' -d '{"plan":{}}'
   ```
   Erwartet: `401`.
7. Erst danach einen echten Selbsttest-Plan fahren
   (`workers/maus-engine/plaene/selbsttest-smejj-com-v1.json`) — der ist der
   erste Lauf, der Playwright wirklich startet.

## 5. Rueckfall

Das alte Abbild bleibt unangetastet und oeffentlich abrufbar. Rueckfall in
einem Schritt:

- Zeabur-Portal → Dienst `smejj-maus-engine` → Quelle wieder auf **Image**
  stellen: `ghcr.io/smejjcom/smejj-maus-engine:v1`
- Port 8080 HTTP, Env unveraendert.

Verfuegbarkeit am 2026-07-29 anonym geprueft (kein Login noetig, damit auch
Zeabur jederzeit ziehen kann):

```
ghcr.io Token -> Manifest v1: HTTP 200
Tags: v1, latest, 410349af..., 7fe709fb..., 07b80607...
Groesse: 11 Schichten, ~692 MB komprimiert
```

**Regel B verlangt ausdruecklich, dass dieses Paket oeffentlich bleibt.** Wird
es auf privat gestellt, faellt der Rueckfallweg nicht nur unter Kosten, er
braeuchte zusaetzlich einen ghcr-Login in Zeabur — den es heute nicht gibt.

Nach erfolgreicher Umstellung kann `scripts/deploy/build_and_push_maus_engine_image.sh`
stillgelegt werden; solange der Rueckfall gebraucht wird, bleibt es liegen.
