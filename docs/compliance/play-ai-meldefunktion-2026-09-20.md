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

---

## Runde 2 (20.09.2026 abends) — dritte Ablehnung, zwei echte Luecken

Google hat die Einreichung vom 18:45 Uhr erneut mit derselben Richtlinie abgelehnt. Der
Belegname im Ablehnungsschreiben ist identisch mit dem der vorigen Runde
(`IN_APP_EXPERIENCE-4924.png`) — der Pruefer hat den Beleg also womoeglich wiederverwendet,
bevor die Meldefunktion live war. Die Vollansicht des Belegs (URL mit `=w2400`) zeigt
trotzdem zwei Stellen, an denen die erste Runde wirklich zu kurz griff:

1. **Das Drei-Punkte-Menue stand auch in einer englischen App auf Deutsch.**
   Die ITEMS-Tabelle in `chat-actions-menu.js` ist gemischt uebersetzt; die Beschriftung
   lief roh in den DOM. Ein englischsprachiger Pruefer sah "Inhalt melden" und konnte es
   nicht als Meldefunktion erkennen. Jetzt geht jede Beschriftung durch `t()`; die beiden
   letzten fehlenden Woerter ("Hilfreich", "Nicht hilfreich") sind in allen 14 Sprachdateien
   ergaenzt. Englisch: "Report content" bzw. "Report".

2. **Das Bild im Vollbild hatte keinen Melde-Weg.** Das vierte Bild des Belegs zeigt genau
   diese Ansicht: Herunterladen, Teilen, Schliessen. Google schreibt dazu ausdruecklich
   "Dieses Problem tritt moeglicherweise auch an anderen Stellen auf. Pruefe alle Bereiche
   deiner App". Die Leiste traegt jetzt einen Knopf "Melden" zwischen Teilen und dem Kreuz.

**Warum der Knopf aus `inhalt-melden.js` kommt und nicht aus `chat-medien-ansicht.js`:**
jene Datei liegt tief im Importbaum (chat-medien → chat-store → chat-sync …). Eine Aenderung
dort zieht die Marke jedes ladenden Moduls hoch — beim ersten Versuch waren das rund 30
Dateien fuer einen einzigen Knopf. `inhalt-melden.js` laedt niemand statisch: es ist ein
Blatt, und ein Blatt kostet keine Kaskade. Der Preis dafuer ist, dass der Knopf still ins
Leere greifen kann, wenn die Vollbild-Ansicht ihre Klassennamen aendert — dagegen wacht ein
Test, der die Selektoren beider Dateien gegeneinander prueft.

Geschlossen wird ueber den Klick auf das Kreuz der Leiste, nicht per `remove()`: nur dessen
Handler raeumt Fokusfalle und Ueberlauf-Stil wieder auf. Welcher Chat-Eintrag gemeint ist,
merkt sich ein Klick-Beobachter in der Erfassungsphase; ueber das `alt`-Attribut
zurueckzusuchen waere bei zwei gleich betitelten Bildern falsch.

**Auslieferung:** `scripts/einmal/melden-runde2-2026-09-20.sh`, per Doppelklick auf
"smejj.com Melden Runde 2 ausliefern.command". Die Kaskade liest die Commits aus der eigenen
Arbeitskopie `~/smejj-melden-runde2` — die Parallelsitzung hat die geteilte Arbeitskopie an
diesem Tag mit ihrer eigenen Kaskade zurueckgesetzt und dabei ungesicherte Arbeit geloescht.

**Erst nach dem Live-Nachweis erneut einreichen.** Die Einreichung vom 16:02 Uhr wurde
abgelehnt, weil der Verstoss zu diesem Zeitpunkt noch offen stand und erst um 16:27 Uhr auf
"Verstoss behoben" sprang. Reihenfolge also: ausliefern → Nachweis der Kaskade abwarten →
Richtlinienstatus pruefen → einreichen.
