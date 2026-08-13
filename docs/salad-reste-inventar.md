# Salad-Reste: was weg ist und was bewusst bleibt

**Stand:** 2026-08-13 · Bezug: Betreiber-Entscheidung „Neues nur noch auf Zeabur,
Salad ist Auslaufmodell" (2026-08-12).

## Erledigt

- **Google Cloud Console** (Client `457164842646-…`): die beiden
  Salad-Weiterleitungs-URIs
  (`redbean-caesar-…salad.cloud/api/auth/google`,
  `elderberry-yam-…salad.cloud/api/auth/google`) gelöscht.
  Übrig bleiben: `smejj.com/api/auth/google`, `127.0.0.1:3000/api/auth/google`
  (lokale Entwicklung) und `smejj-control.zeabur.app/api/auth/google` (live).
  **Gegenprobe bestanden:** Google-Login danach komplett durchgespielt —
  `/api/auth/me` meldet `authenticated: true, method: google`.
- **GitHub-OAuth-App** war bereits am 2026-08-12 auf Zeabur umgestellt.

## Bewusst NICHT angefasst (mit Begründung)

Ein pauschaler Salad-Ausbau wäre riskant — der Salad-Control-Server **läuft
weiterhin** (`/api/health` → 200):

| Ort | Warum bleiben |
|---|---|
| `public/chat-bridge.js` | `CONTROL_ORIGIN` fällt ohne `SMEJJ_CONTROL_ORIGIN` auf die Salad-Adresse zurück. Erst umstellen, wenn die Env auf der Bridge gesetzt ist — sonst reißt der Chat ab. Datei steht zudem unter Security-Lock. |
| `public/status.js` | Überwacht die Salad-Hosts. Solange sie laufen, ist die Anzeige korrekt und nützlich. |
| CSP `connect-src` in `public/auth/login/index.html`, `register/index.html` | Beide stehen unter **Security-Lock** (2026-08-12 eingefroren). Entfernen von `salad.cloud` braucht eine eigene Freigabe + Neu-Einfrieren. Funktional harmlos: die Auth-Seiten sprechen nur `smejj-control.zeabur.app` an. |
| 61 Dateien insgesamt mit `salad.cloud` | Überwiegend CSP-Zeilen und Admin-Texte. Ein Sammel-Ersetzen würde Start- und Security-Lock reißen und ist ohne Salad-Abschaltung ohne Nutzen. |

## Empfohlene Reihenfolge für später

1. `SMEJJ_CONTROL_ORIGIN` auf der Zeabur-Bridge auf `https://smejj-control.zeabur.app`
   setzen → dann ist der letzte funktionale Salad-Pfad tot.
2. Salad-Dienste abschalten und **erst danach** CSP/Status/Texte in einem Rutsch
   säubern (mit Lock-Freigaben).
