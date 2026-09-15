# A-bis-Z-Qualitätskontrolle nach ChatGPT-Vorschlag und Master-Prompt (14.09.2026)

**Auftrag (Betreiber, wörtlich, gekürzt):** „Übernimm jetzt die vollständige technische Qualitätskontrolle
von smejj.com und arbeite sie von A bis Z selbstständig fertig … checke diesen Vorschlag und was hat
ChatGPT vergessen … Nach der Umsetzung bitte live gehen, live testen und prüfen, ob alles richtig
funktioniert. Fehler sofort beheben und erneut testen, bis alles 100 % sauber läuft. Zum Schluss bitte
100 % Schutz aktivieren."

## Ergebnis in einem Satz

Prüfplan an unser System angepasst (17 Phasen, Messregeln, Vergleich mit ChatGPT/Claude/Gemini), dann
sechs Fixrunden **live** (SW v867 → v873, Brücke v151, Control-Server neunmal neu gebaut): 26 Frontend-Fehler,
acht Server-Befunde und die Brücken-Schutzregel behoben — darunter ein **Papierkorb, der seit dem 25.08. immer leer war**, und ein
**Löschen, das nie zum Server kam**; die drei Design-Entscheide (F18/F20/F14) sind nach dem Betreiber-OK
umgesetzt, die kleinen Punkte in Fixrunde 5 (Workflow: 12 Analysten + 24 Skeptiker); F27, F6, F11 und die
Brücken-Schutzregel folgten nach der Freigabe „alle Rechte von A bis Z 100 %“ (Fixrunde 6).

## Die Funde (Kurzform; Details in `docs/qa/befunde-2026-09-14.md`)

| # | Befund | Ursache | Nachweis |
|---|---|---|---|
| F1 | Papierkorb immer leer | `PAPIERKORB_TAGE` nie definiert in `chat-store-bereiche.js` → ReferenceError, still gefangen | live: 5 alte Löschungen erschienen, Wiederherstellen synchron |
| F2 | Löschen erreichte den Server nie | kein `updatedAt`-Bump; Sync ohne Papierkorb; `window.smejjChatStore` ohne die neue Funktion | live: Server trägt `deletedAt` nach dem nächsten Sync |
| F3 | Browser-Panel sprang nach dem Schließen wieder auf | `knopf-puffer.js` deutete „nicht offen nach 60 ms“ als verlorenen Klick | Wache „vorher offen“ + Test |
| S1 | Modell-Katalog-Wache falsch rot seit 08.09. | Zhipu listet glm-4.5-flash nicht in `/models`, bedient es aber | Kleinstanfrage + Nachprüfung; Ampel grün |
| S4 | Tiefe Spur lief seit 07.09. auf glm-4.5-flash (Kontingent-Ausweich) | nie zurückgestellt | glm-5.2 zurück, glm-4.5-flash als Rückfall; `schutz-design-lock` 3/3 grün |
| S3 | api.smejj.com trug sw.js v839 | Bauzweig-`public/` seit 11.09. nicht abgeglichen | Abgleich nach jeder Kaskade; Probe-Nutzer grün |
| S2 | AI-Act-Verzeichnis ohne smejj-1 | Modell seit 13.09. produktiv | Eintrag; Ampel grün |

## Was gemessen wurde

| Bereich | Wie | Ergebnis |
|---|---|---|
| Desktop angemeldet | Chrome-Erweiterung (Betreiber-Sitzung), echte und JS-Klicks, 232 Elemente inventarisiert | Chat, Verlauf, Papierkorb, Modell-Menü, Plus-Menü, Sprachmodus, Diktat, Code, Websuche, Bild verstehen, Maus (Ada Lovelace 1815 in 58 s), Datei-Anhang (CDP) — grün; 0 Konsolenfehler |
| Web nicht angemeldet | `rundgang.mjs` 19 Ansichten × 2 Runden, dreimal (vor/nach Fixrunden) | 0 Befunde |
| Responsive | `messe_responsive.mjs` 8 Größen 320–1920 | 152 Messpunkte, 0 Verstöße |
| Touch-Ziele | `measure_touch_targets_app.mjs` 375×812 | 4 Spur-Einträge 38 px (F14, Design-Lock) |
| Mobil angemeldet | headless Chrome 402×874 + Eval-Ausweis (`mobil-angemeldet.mjs`) | Bubble-Umbruch, Composer an der Unterkante grün |
| PWA | `pwa-offline.mjs`, Cache-Zählung im Browser | SW aktiv, 235 Einträge, App offen ohne Netz |
| iOS | Simulator iPhone 17 Pro, Safari angemeldet, `simctl io screenshot` | Startseite/Chat sauber; Werkzeug-Kacheln trennen Wörter (F18) |
| Android | Emulator `smejj_pixel`, installierte TWA `com.smejj.app`, `rundgang.mjs --fern` | 38 Ansichten grün (abgemeldet); Hinweisstreifen über Überschrift (F21) |
| Web Vitals | `measure_web_vitals.mjs` 3 Läufe | kalt LCP 1,06 s, CLS 0,021, INP 24 ms; Gewicht 302 KB (Budget 300, F15) |
| Sicherheit | check:security/abuse/gatekeeper/passkey/users, CVE-Wächter, Dependabot | grün; 3 bekannte Python-CVEs in nicht gebauten Workern |
| Suite | `check:all` Arbeitszweig | 1117 grün, 2 Tests an die neue Modellkette angepasst (beide Zweige) |
| Ampel | `check-autopilot-health.mjs` | 79 grün, 2 gelb, 3 rot (Betreiber: Zeabur-Schlüssel, Codeberg-Token; Tiefe-Spur bis Tagesmessung) |

## Schutz

Rollback-Tag `stand-2026-09-14-vor-qa-a-bis-z`, Release-Tags `release-2026-09-14-qa-fixrunde-2` bis `-6` auf
Arbeitszweig, Klon und Bauzweig, `release-2026-09-14-bruecke-v151` (GitHub + Codeberg); Start-Lock sechsmal, Security-
und Abo-Lock einmal gestempelt; Zweigschutz
(kein Force-Push, kein Löschen) auf Klon `main`, Bauzweig und Arbeitszweig; Schutz-Echtheit grün.

## Werkzeuge, die neu sind

- `scripts/einmal/qa-fixrunde-2026-09-14.sh <SW_alt> <SW_neu> <Basis> <Kurz>` — generische Kaskade (Wächter, Stempel, Klon-Abgleich, Push, Live-Wartezeit; schreibt index.html auch nach `assets/`).
- Scratch: `marke-hochziehen.mjs` (Cache-Marken rekursiv), `mobil-angemeldet.mjs`, `upload-angemeldet.mjs` (headless Chrome + Eval-Ausweis), `static-server.mjs` + `kacheln-lokal.mjs` (Startseite vor dem Deploy bei 402/390/360 px messen, mit lokaler Sitzung).
- Kaskade: `FREIGABE="…"` trägt bei Design-Freigaben den Betreiber-Wortlaut in den Stempel (Fixrunde 4).
- Scratch `patch-anwenden.mjs`: wendet Workflow-Patches (Datei, old, new) an — Probelauf prüft jeden Edit auf genau einen Treffer; `f5-live.mjs` (F8/F12/F13/F16/F21 live, Panel per `openPane()` aus `/assets/browser-pane.js`, weil JS-`click()` das nachgeladene Panel nicht öffnet); `api-latenz.mjs` mit 700-ms-Takt (Missbrauchs-Wache).

## Offen

- Erledigt nach Freigabe „alle Rechte“ (Fixrunde 6, SW v873, Bauzweig 74d7df57): F27, F6, F11; Brücke v151 mit Schutzregel auf dem Chat-Weg (Quelle der Wahrheit `feature/design-v11`, Kaskade nimmt `chat-bridge.js` aus); Mac-Wächter auf HTTPS; Codeberg-Spiegel gerade.
- Fixrunde 7: Katalog-Wache (Netz-Aussetzer ≠ verschwunden), Kernsuite 1.2.0 (drei belegte Weitungen, Prüfsumme neu), Sicherheitscheck grün (`.gitignore` für Store-Bilder), Play-Keystore nach `~/.config/smejj.com/keys/` gesichert, Memory_Bank-Eintrag.
- Release: `release:preflight` Arbeitszweig EXIT 0 (2.403), `check:all` Bauzweig EXIT 0 (2.328); Qualitätsmessung Kernsuite 1.2.0 100 %, 0 kritisch; Benchmarks `docs/benchmarks/*_v873_2026-09-14.json`.
- Betreiber (Zugangsdaten/Apple): Zeabur-API-Schlüssel für die Betriebswerte der Oberflächenwache, Apple-Freigabe X29W6DM972.
- **Betreiber (Sicherheit):** neue Adresse `[private Admin-Adresse]` in `SMEJJ_ADMIN_OWNER_EMAILS` (Konto-Wache rot seit 17:47 UTC) — nicht von dieser Sitzung; bestätigen oder entfernen.
- Betreiber-Handgriff: Zeabur-Schlüssel, `CODEBERG_TOKEN`, Apple-Freigabe (TestFlight), Keystore sichern.
- Klein: nichts mehr offen (Fixrunde 5).
