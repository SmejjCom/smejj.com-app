# A-bis-Z-Qualitätskontrolle nach ChatGPT-Vorschlag und Master-Prompt (14.09.2026)

**Auftrag (Betreiber, wörtlich, gekürzt):** „Übernimm jetzt die vollständige technische Qualitätskontrolle
von smejj.com und arbeite sie von A bis Z selbstständig fertig … checke diesen Vorschlag und was hat
ChatGPT vergessen … Nach der Umsetzung bitte live gehen, live testen und prüfen, ob alles richtig
funktioniert. Fehler sofort beheben und erneut testen, bis alles 100 % sauber läuft. Zum Schluss bitte
100 % Schutz aktivieren."

## Ergebnis in einem Satz

Prüfplan an unser System angepasst (17 Phasen, Messregeln, Vergleich mit ChatGPT/Claude/Gemini), dann
vier Fixrunden **live** (SW v867 → v871, Control-Server fünfmal abgeglichen): 14 Frontend-Fehler und
sechs Server-Befunde behoben — darunter ein **Papierkorb, der seit dem 25.08. immer leer war**, und ein
**Löschen, das nie zum Server kam**; die drei Design-Entscheide (F18/F20/F14) sind nach dem Betreiber-OK
umgesetzt, F27 (Code-Vorlagen 38 px) wartet auf ein OK.

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

Rollback-Tag `stand-2026-09-14-vor-qa-a-bis-z`, Release-Tags `release-2026-09-14-qa-fixrunde-2` bis `-4` auf
Arbeitszweig, Klon und Bauzweig (GitHub + Codeberg); Start-Lock viermal gestempelt; Zweigschutz
(kein Force-Push, kein Löschen) auf Klon `main`, Bauzweig und Arbeitszweig; Schutz-Echtheit grün.

## Werkzeuge, die neu sind

- `scripts/einmal/qa-fixrunde-2026-09-14.sh <SW_alt> <SW_neu> <Basis> <Kurz>` — generische Kaskade (Wächter, Stempel, Klon-Abgleich, Push, Live-Wartezeit; schreibt index.html auch nach `assets/`).
- Scratch: `marke-hochziehen.mjs` (Cache-Marken rekursiv), `mobil-angemeldet.mjs`, `upload-angemeldet.mjs` (headless Chrome + Eval-Ausweis), `static-server.mjs` + `kacheln-lokal.mjs` (Startseite vor dem Deploy bei 402/390/360 px messen, mit lokaler Sitzung).
- Kaskade: `FREIGABE="…"` trägt bei Design-Freigaben den Betreiber-Wortlaut in den Stempel (Fixrunde 4).

## Offen

- Betreiber-Entscheid (Design-Lock): F27 Code-Vorlagen-Knöpfe 38 px (wie F14 auf 44 px). F18/F20/F14 sind umgesetzt (Fixrunde 4, SW v871, Bauzweig 010d7abc).
- Betreiber-Handgriff: Zeabur-Schlüssel, `CODEBERG_TOKEN`, Apple-Freigabe (TestFlight), Keystore sichern.
- Klein (nächste Fixrunde): F6, F15, F21, F10, F11, F16, F8, F23, F12, F13.
