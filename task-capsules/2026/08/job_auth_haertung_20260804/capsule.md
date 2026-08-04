# job_auth_haertung_20260804 — A-bis-Z-Prüfung der öffentlichen Fläche, zwei Befunde behoben

## Ziel (Betreiber-Auftrag 2026-08-04, wörtlich)
„Bitte öffne smejj.com im Browser und teste die gesamte App von A bis Z. Wenn du
Fehler findest, behebe sie sofort, deploye erneut und teste live weiter, bis alles
stabil, sicher und zuverlässig funktioniert. Danach alles 100% schützen."

## Was geprüft wurde
24 Seiten (Start, beide Auth-Seiten, Impressum, Datenschutz, Hilfe, Status,
Verlauf, Maus-Replay, 15 Sprachseiten), 27 Unterressourcen der Startseite,
118 Precache-Einträge, CORS und Rate-Limit beider öffentlicher Dienste, der
SPA-Rückfall, robots/sitemap/Manifest, Konsole und Netzwerk im Browser.

Grün ohne Beanstandung: alle Seiten 200, kein toter Verweis, kein fehlender
Precache-Eintrag, fremde Origin wird von Bridge **und** Control-Server mit 403
abgewiesen, Rate-Limit greift nach 11 Anfragen mit 429, `/404.html` stellt die
SPA-Route sauber wieder her, keine Konsolenfehler.

## Befund 1 — der Passwort-Reset lief über `window.prompt()`

Reproduziert an `/auth/login/?reset=…`: die Seite blockierte auf einem nativen
Browser-Dialog. Vier Probleme, alle auf dem Konto-Wiederherstellungsweg:

1. **Ein `prompt()`-Feld maskiert nicht.** Das neue Passwort stand im Klartext
   auf dem Bildschirm.
2. **Passwortverwaltungen kennen den Dialog nicht** — kein Vorschlag, kein
   Speichern, kein Einfügen. Genau hier braucht man sie am dringendsten.
3. **Der Dialog blockiert die ganze Seite**, und Chrome bietet nach Wiederholung
   „weitere Dialoge unterdrücken" an — danach ist der Weg tot.
4. **Kein zweites Feld.** Ein unsichtbarer Tippfehler sperrt den Nutzer aus dem
   eigenen Konto aus — bei bereits verbrauchtem Reset-Token.

**Behoben:** Der Reset läuft im vorhandenen Seitenformular. Maskiertes Feld,
Bestätigungsfeld, `autocomplete="new-password"`, Vergleich **vor** dem
Serveraufruf, und der verbrauchte Token wird per `history.replaceState` aus
Adresszeile und Verlauf entfernt.

## Befund 2 — die Anmeldeseiten hatten keine Content-Security-Policy

`index.html` trug CSP und Referrer-Regel, `/auth/login/` und `/auth/register/`
nicht — ausgerechnet die Seiten, über die E-Mail, Passwort, OAuth-Rückkehr und
der Passkey-Ablauf laufen.

**Behoben:** Beide Metas ergänzt. `script-src 'self'` ohne `unsafe-inline`;
`connect-src` lässt den Control-Server durch (eine zu strenge CSP wäre schlimmer
als keine — sie hätte jede Anmeldung stumm gebrochen). `frame-ancestors` bleibt
bewusst draußen: die Direktive wirkt nur als HTTP-Kopf, den GitHub Pages nicht
setzen kann; dafür gibt es `frame-guard.js`.

## Umsetzung
| Datei | Änderung |
| --- | --- |
| `public/auth/auth-page.js` | `startPasswordReset()` + `zweitesPasswortfeld()`, `window.prompt` entfernt |
| `public/auth/login/index.html`, `…/register/index.html` | CSP + Referrer-Meta, Cache-Version des Skripts angehoben |
| `public/i18n/*.js` (14 Sprachen) | zwei verwaiste Schlüssel des alten Dialogs entfernt, acht neue Texte ergänzt |
| `tests/auth-pages.test.mjs` | 6 neue Schutztests |

## Checks
`npm run check:all` grün, **1743 Zusicherungen**. Start-Lock unberührt — keine der
geänderten Dateien steht darunter, und die Sprachdateien liegen nicht im Precache
(nur `i18n/ui.js`).

## Live-Beweise (Produktionsdomain, echter Klickpfad)
| Fall | Ergebnis |
| --- | --- |
| Reset-Ansicht | maskiertes Feld + Bestätigungsfeld, Knopf „Neues Passwort setzen", kein Dialog |
| Zwei **ungleiche** Passwörter | „Die beiden Passwörter stimmen nicht überein." — **null Netzaufrufe**, Token bleibt unverbraucht |
| Leere Eingabe | „Bitte ein neues Passwort eingeben." — null Netzaufrufe |
| Gleiche Passwörter, ungültiger Token | Aufruf geht durch die CSP an den Control-Server, saubere Ablehnung |
| Normale Anmeldung | unverändert: Knopf „Weiter", Passwortfeld verborgen, kein Wiederholfeld, Reset-Link sichtbar |
| Konsole / Netzwerk | keine Fehler, alle Ressourcen 200, keine CSP-Blockade |

## Rollback
Frontend: `git revert c788e47` in `smejj-app-frontend`. Dev-Repo: `199449e`.

## Offen / Merkregeln
- **`account-sessions.js` nutzt dieselbe Bauart** für Passwortwechsel und
  Kontolöschung (`window.prompt` für Passwörter). Bewusst NICHT mit ausgeliefert:
  der Weg liegt hinter der Anmeldung und ist aus einer Sitzung nicht prüfbar —
  eine ungetestete Änderung an der Kontolöschung wäre schlimmer als der Befund.
  Wartet auf Freigabe des Betreibers.
- **Eine zu strenge CSP ist schlimmer als keine.** `connect-src` muss den
  Control-Server führen, sonst schlägt jede Anmeldung stumm fehl. Der Schutztest
  liest die Adresse aus `config.js` und hält beides zusammen.
- **Sprachdateien: der Wächter prüft nur EINE Richtung** (Wörterbuch → Quelltext).
  Ein entfernter Aufruf hinterlässt einen verwaisten Schlüssel und macht
  `check:all` rot; neue Texte ohne Übersetzung fallen dagegen nicht auf.
- **Die ausgelieferten Sprachdateien liefen dem Repo voraus** (zwei tote Schlüssel
  aus einem früheren Deploy). Vor dem Überschreiben generierter oder
  mehrfach gepflegter Dateien immer gegen den Live-Stand halten.
