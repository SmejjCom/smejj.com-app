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

- **Letzter funktionaler Salad-Pfad gekappt (2026-08-13):** Auf dem Zeabur-Dienst
  `smejj-chat-bridge` stand `SMEJJ_CONTROL_ORIGIN` noch auf
  `https://redbean-caesar-…salad.cloud` — die Bridge prüfte dort Anmeldungen,
  holte Websuche und Stimme. Umgestellt auf `https://smejj-control.zeabur.app`
  + Restart. **Gegenproben bestanden:** `/api/chat` streamt (Testantwort
  „Brueckentest"), `/api/agent` liefert Websuche mit Quellen, und der
  Suchzähler des Zeabur-Control sprang von 0 auf 2 — der Verkehr läuft
  beweisbar dorthin. Vorher geprüft: beide Control-Server sind gleichwertig
  (`ai`, `storage`, `suchquelle.konfiguriert` je true) und die Bridge lädt beim
  Neustart exakt dasselbe Bündel (v133 im Repo = v133 live).

## Bewusst NICHT angefasst (mit Begründung)

Ein pauschaler Salad-Ausbau wäre riskant — der Salad-Control-Server **läuft
weiterhin** (`/api/health` → 200):

| Ort | Warum bleiben |
|---|---|
| `public/chat-bridge.js` | Der Salad-Rückfall im Code ist jetzt totes Gewicht (Env gesetzt), aber die Datei steht unter Security-Lock — Aufräumen braucht eine eigene Freigabe. |
| `public/status.js` | Überwacht die Salad-Hosts. Solange sie laufen, ist die Anzeige korrekt und nützlich. |
| CSP `connect-src` in `public/auth/login/index.html`, `register/index.html` | Beide stehen unter **Security-Lock** (2026-08-12 eingefroren). Entfernen von `salad.cloud` braucht eine eigene Freigabe + Neu-Einfrieren. Funktional harmlos: die Auth-Seiten sprechen nur `smejj-control.zeabur.app` an. |
| 61 Dateien insgesamt mit `salad.cloud` | Überwiegend CSP-Zeilen und Admin-Texte. Ein Sammel-Ersetzen würde Start- und Security-Lock reißen und ist ohne Salad-Abschaltung ohne Nutzen. |

## Empfohlene Reihenfolge für später

1. ~~`SMEJJ_CONTROL_ORIGIN` auf der Zeabur-Bridge umstellen~~ — **erledigt 2026-08-13.**
2. Salad-Dienste beobachten: Läuft eine Woche nichts mehr darüber, abschalten
   (spart Rechenkosten) — vorher `status.js` anpassen, sonst meldet die
   Statusseite dauerhaft rot.
3. **Erst danach** CSP/Texte in einem Rutsch säubern (Start- und Security-Lock
   brauchen je eine Freigabe + Neu-Einfrieren).
