# smejj.com — Echtes KI-Chatten/Coding live schalten (Anleitung, 2026-07-05)

Stand: Frontend + Backend sind live und gesund. GPU `smejj-llm-qwen3`
(Qwen3 8B, RTX 4090) läuft (1/1 Replica). Es fehlt nur noch die Verdrahtung
des Control Servers mit dem LLM-Gateway. Das ist **ein Nutzerschritt**, weil
der Salad-API-Key ein Geheimnis ist (kein KI-Agent tippt Keys).

## Warum nicht vom Agenten vorab gesetzt
`SMEJJ_SERVER_AI_ENABLED=true` OHNE gültigen Key würde den Live-Chat von der
jetzigen fail-safe Antwort auf HTTP 400 kippen. Deshalb werden alle Variablen
in EINEM Save gesetzt — erst dann geht AI sauber live. Zusätzlich vermeidet
das eine unnötige zweite Instanz-Reallokation des laufenden Backends.

## Schritt 1 — Salad-API-Key holen
Salad-Portal → Container Group `smejj-llm-qwen3` ist "Authentication Required".
Der zugehörige Gateway-Key steht im Salad-Portal (API Access / Container Gateway
Auth). Diesen Wert brauchst du unten für `SMEJJ_LLM_SALAD_API_KEY`.

## Schritt 2 — Env-Variablen in smejj-control setzen
Portal → Container Groups → **smejj-control** → **Edit** →
**Environment Variables** → **Bulk Edit** → folgende Zeilen ergänzen
(bestehende Variablen NICHT löschen):

```
SMEJJ_LLM_SALAD_BASE_URL=https://tangerine-dill-g0pw1k0sdg3rhtb0.salad.cloud/v1
SMEJJ_LLM_SALAD_API_KEY=<DEIN_SALAD_GATEWAY_KEY>
SMEJJ_LLM_SALAD_MODEL=tgi
SMEJJ_SERVER_AI_ENABLED=true
SMEJJ_SERVER_AI_REMAINING=1000
```

Danach **Configure → Save**. Salad rollt automatisch eine neue Version aus
(TCP-Probes greifen; ~1 Min). WICHTIG (aus Erfahrung): Command muss
`node` + `src/server.js` bleiben, Image `ghcr.io/smejjcom/smejj-control:latest`,
Probes TCP:3000 — nur die Env ergänzen, sonst nichts anfassen.

## Schritt 3 — Live-Test (nach dem Roll)
1. `https://tangerine-dill-g0pw1k0sdg3rhtb0.salad.cloud/api/health` → `ok:true`.
2. Auf https://smejj.com eine Nachricht senden → es sollte jetzt eine echte
   Modellantwort streamen (nicht mehr der lokale fail-safe Text).
3. Kosten im Blick: GPU ~0,30 USD/h. Wenn nicht gebraucht → GPU stoppen
   (1 Klick), Chat fällt automatisch fail-safe zurück (kein Fehler).

## Fallback-Kette (bereits im Code)
Salad (eigene GPU) → OpenRouter (falls Key gesetzt) → generischer Endpoint.
Ohne Konfiguration bleibt alles fail-closed; der Chat zeigt die lokale
fail-safe Antwort statt eines Fehlers.
