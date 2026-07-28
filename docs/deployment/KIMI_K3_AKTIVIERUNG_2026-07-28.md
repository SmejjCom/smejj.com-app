# smejj.com — Kimi K3 ueber die API aktivieren (Anleitung, 2026-07-28)

Freigabe: "oK, baue Kimi K3 mit API ein" (Wof Kadavanich, 2026-07-28).

Der Code ist fertig und gruen. Was fehlt, sind drei Env-Werte, die nur der
Betreiber setzen kann — Zugangsdaten werden nie im Repo abgelegt.

## Warum API und kein Vault in IDrive e2

K2.7 und GLM-5.2 liegen als Gewichte in IDrive e2. Fuer K3 wird das bewusst
NICHT gemacht:

- Die offenen Gewichte sind je nach Quelle ~594 GB (nativer MXFP4-Download)
  bis ~1,4 TB (Speicherbedarf im Betrieb).
- K3 hat 2,8 T Parameter. Es passt weder auf eine GPU noch auf einen einzelnen
  8-GPU-Knoten; Moonshot nennt Mehr-Knoten-Cluster als Voraussetzung.
- IDrive e2 ist Speicher, kein Rechner. Ein Abzug haette Kosten erzeugt und
  keine Laufzeit gebracht.

Darum traegt `kimi-k3` in der Registry `storage: null` und laeuft ausschliesslich
ueber die Anbieter-API. Der e2-Vault bleibt fuer K2.7 und GLM-5.2 unveraendert.

## Was im Code liegt

| Datei | Inhalt |
|---|---|
| `src/shared/modelRegistry.js` | Eintrag `kimi-k3`, 1 M Kontext, Fallback GLM-5.2, fail-closed |
| `.env.example` | Block `SMEJJ_KIMI_K3_*` |
| `control-server/src/routes/modelRoutes.js` | Worker-Preflight lehnt Modelle ohne Vault sauber mit 409 ab, statt abzustuerzen |
| `control-server/src/llm/modelRouter.js` | Legacy-Eintrag `moonshot` auf die gueltige Modell-ID korrigiert |
| `tests/model-registry.test.mjs` | 8 Schutztests (fail-closed, kein Key-Leak, GLM-5.2 bleibt Standard) |

Endpunkt und Modell-ID laut Moonshot-Quickstart:
`https://api.moonshot.ai/v1` mit `model: "kimi-k3"`, Bearer-Auth.
Die Key-Verwaltung liegt auf `https://platform.kimi.ai` — ein eigenes Konto,
getrennt vom Chat-Login auf kimi.com.

## Schritt 1 — Key holen (nur Betreiber)

1. `https://platform.kimi.ai` oeffnen und anmelden (E-Mail-Code oder Google).
   Das Konto entsteht beim ersten Login.
2. Guthaben aufladen. K3 ist kostenpflichtig: 3 $ / 15 $ pro Mio. Token
   (Ein-/Ausgabe), Cache-Treffer 0,30 $.
3. API-Key erzeugen und sicher ablegen — nie ins Repo, nie in ein Ticket.

## Schritt 2 — smejj-control konfigurieren

    SMEJJ_KIMI_K3_ENABLED=YES
    SMEJJ_LLM_KIMI_K3_API_KEY=<key>

`SMEJJ_LLM_KIMI_K3_BASE_URL` und `SMEJJ_LLM_KIMI_K3_MODEL` haben passende
Vorgaben und muessen nur gesetzt werden, wenn davon abgewichen wird.

Ohne beide Werte bleibt K3 inaktiv und der Router nimmt GLM-5.2. Das ist
Absicht: ein kostenpflichtiges Modell darf nie durch einen vergessenen
Schalter anspringen.

## Schritt 3 — den Router ueberhaupt einschalten (leicht zu uebersehen)

Der Live-Chat laeuft ueber die Container Group der **chat-bridge**, nicht
direkt ueber smejj-control. Die Bridge fragt den Modell-Router nur, wenn dort
gesetzt ist:

    SMEJJ_MULTI_MODEL_ROUTER_ENABLED=YES

Standard ist `NO` (`public/chat-bridge.js`, Konstante `CONTROL_ROUTER_ENABLED`).
Solange der Schalter aus ist, erreicht keine Modellwahl aus der Registry den
Live-Chat — auch K3 nicht.

Die Groq-Schnellspur laeuft vor dem Router, laesst Kimi-Anfragen aber
absichtlich durch (`/glm|kimi|cline/` in `streamFastLane`). Eine ausdrueckliche
K3-Wahl landet also korrekt beim Router.

## Schritt 4 — pruefen

Nach dem Deploy des Control-Servers:

    curl -s "<control-origin>/api/models/status" | grep -o '"id":"kimi-k3"[^}]*'

Erwartung: `status` wechselt von `inactive` auf `configured-unverified` und
nach dem ersten erfolgreichen Aufruf auf `ready`. In der Modell-Auswahl der App
ist "Kimi K3" dann waehlbar statt ausgegraut.

## Rueckweg

- Rollback-Punkt: `backups/rollback-2026-07-28-kimi-k3-api/before/`
- Abschalten ohne Deploy: `SMEJJ_KIMI_K3_ENABLED=NO` setzen und neu starten.
  Der Router faellt sofort auf GLM-5.2 zurueck.

## Verifikation des Codestands (2026-07-28)

- `npm run check:all` → exit 0, inklusive `check:start-lock` 31/31 unveraendert
  und `check:favicon-lock` OK.
- `tests/model-registry.test.mjs` → 21/21 gruen.
- Aufgeloeste Kette lokal geprueft:
  `kimi-k3 → https://api.moonshot.ai/v1/chat/completions model=kimi-k3`,
  dahinter GLM-5.2. Ohne Flag/Key: `requested_model_inactive`.
- Laufender Server: `/api/models/status` und die Modell-Auswahl der App zeigen
  "Kimi K3 · 1M Kontext · flagship · Inaktiv", 0 Konsolenfehler.

## Offen / bewusst nicht gemacht

- Kein Eintrag im BYOK-Anbieter-Katalog (`public/ai/providers-catalog.js`).
  Diese Datei steht unter dem Start-Lock; ein Moonshot-Eintrag fuer eigene
  Nutzer-Keys braucht eine getrennte Freigabe.
- Kein Auto-Modus fuer K3. `auto` waehlt weiterhin nur GLM-5.2 bzw. die
  konfigurierten K2.7-/fast-Modelle; K3 kommt nur bei ausdruecklicher Wahl.
