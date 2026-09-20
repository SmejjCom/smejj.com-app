# Google-Play-Ablehnung 20.09.2026 — Meldefunktion für KI-Inhalte

## Was Google geschrieben hat (wörtlich)

> **App Status: Rejected** … **Issue found: Violation of AI-Generated Content policy**
> Your app doesn't comply with the AI-Generated Content policy. Here's what needs fixing:
> **Your app lacks in-app features for users to report or flag offensive content.**
> Version code 1: In-app experience: Please see attached screenshot IN_APP_EXPERIENCE-4924.png
> … Update your app to include an in-app user reporting or flagging feature that allows users
> to report offensive AI-generated content **without exiting the app** to regain compliance.

Betroffen war die **Aktualisierung** (Titel/Texte/Screenshots vom 20.09.), nicht die bereits
veröffentlichte App: „If you have an older version of your app, it will still be available on
Google Play." Die App blieb also live, nur die Änderungen kamen nicht durch.

## Warum das passiert ist

Die App erzeugt Text, Bilder, Videos und Sprache per KI. Damit greift die Richtlinie für
KI-generierte Inhalte. Sie verlangt eine Meldefunktion **innerhalb** der App. Vorhanden waren nur
Daumen hoch/runter (das ist Qualitäts-Feedback, keine Moderation) und die Hilfeseite — ein Weg
nach draußen zählt ausdrücklich nicht.

Dass die App eine TWA auf `https://smejj.com` ist, hilft hier: **die Meldefunktion kommt mit der
Webseite, ein neues AAB und damit der Upload-Keystore sind nicht nötig.**

## Was gebaut wurde

| Ort | Datei | Inhalt |
|---|---|---|
| Menü | `public/chat-actions-menu.js` | Punkt „Inhalt melden" (`act: "report"`) — nur bei Antworten, nicht bei eigenen Fragen |
| Dialog | `public/inhalt-melden.js` | Blatt von unten: sechs Gründe, optionale Notiz, „Melden"; 44-px-Ziele; Escape/Klick daneben schließt |
| Stil | `public/design-v13-kompakt.css` → `public/start-styles.css` | `.melden-*`, viereckig, dunkel, wie „Text auswählen" |
| Server | `control-server/src/routes/inhaltMeldungRoutes.js` | `POST /api/inhalt-meldung` (angemeldet, PII-bereinigt, 20/h), `GET /api/inhalt-meldung/alle` nur Betreiber |
| Einbindung | `src/server.js` | Route hinter `handleFeedbackRoute` eingehängt |
| Offline | `public/inhalt-melden.js` | ohne Netz wird die Meldung lokal gemerkt und beim nächsten Start nachgereicht |
| Tests | `tests/inhalt-melden.test.mjs` | 5 Tests: Menüpunkt, Verdrahtung/Precache/Marke, Nutzlast, Route, Ende-zu-Ende |

**Bewusst NICHT über `/api/feedback`:** das Schwungrad macht aus Signalen Trainingspaare. Eine
Meldung ist Moderation und darf nie ins Training fließen — ein Test hält das fest.

Die Gründe: anstößig, sexuell, Gewalt, Hass, falsch, sonstiges. Die meldende Person wird nur als
Hash abgelegt (Missbrauchserkennung), der gemeldete Text läuft durch `scrubPiiData`.

## Live gemessen (20.09., lokale Probeseite in Chrome)

- Menüpunkt öffnet den Dialog, „Melden" bleibt gesperrt, bis ein Grund gewählt ist
- Abgesendete Nutzlast: `{grund:"hass", art:"text", inhalt:"Eine Antwort der KI", frage:"Erzähl mir etwas"}` — Markdown abgebaut, vorherige Frage mitgeschickt
- Bestätigung „Danke — die Meldung ist angekommen und wird geprüft.", Dialog schließt
- Ohne Netz: Meldung landet in `smejj.meldungen.offen.v1`, Hinweis „Kein Netz — die Meldung wird später gesendet."
- Knopfhöhen 44 px, Kasten läuft am schmalen Schirm nicht über

## In der Play Console erledigt

Die Prüfer-Anleitung unter **App-Inhalte → Anmeldedaten** nennt jetzt den Weg zur Meldefunktion
(Feld erlaubt höchstens 500 Zeichen, daher knapp gehalten). Gespeichert, aber **bewusst noch
nicht eingereicht** — erst muss die Funktion live sein.

## Was noch zu tun ist

1. **Doppelklick auf `smejj.com Inhalt-melden ausliefern.command`** (Auto-Modus sperrt Stempel und Deploys). Liefert Server + smejj.com aus, SW v911.
2. Danach in der Konsole unter **Veröffentlichungen – Übersicht** die Änderungen erneut zur Überprüfung einreichen.
3. Erst nach der Freigabe die Custom Store Listings anlegen (`docs/aso/custom-listings-plan.md`).

**Achtung Parallelsitzung:** v908 ist von einer anderen Sitzung belegt (`~/smejj-bau-runde6`),
diese Runde trägt deshalb v909.
