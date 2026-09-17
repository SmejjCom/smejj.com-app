# Endabnahme A–Z smejj.com — 16./17.09.2026

Auftrag des Betreibers (schriftlich, 16.09.): „KOMPLETTE A–Z ENDABNAHME VON smejj.com – LIVE, LOKAL,
SERVER, DATENBANK, WEB, PWA, iOS, ANDROID, HUAWEI, TABLET UND SECURITY", 19 Phasen.
Zeichen: ✅ bestanden · ⚠️ teilweise / Risiko · ❌ Fehler.
Es wurden keine echten Nutzerdaten gelöscht. Destruktive Tests (Löschen, Anpinnen, XSS) liefen nur in
einer Test-Kopie mit Testsitzung und Test-Chats.

## 1. AKTUELLE LIVE-VERSION ✅
- smejj.com und api.smejj.com liefern beide `smejj-shell-v892` aus (gemessen 17.09. nach dem Deploy).
- Frontend-Repo SmejjCom/smejj-app-frontend `main` = `23df738`.
- Bauzweig `feature/auth-redesign-github-magiclink` = `1e03c0ac`.
- api `/api/health`: `ok:true`, `storage:true`, gestartetAm `2026-09-16T22:01:17Z`.

## 2. LOKALER COMMIT / BRANCH ✅
- Arbeitszweig `feature/design-start-chat-2026-09-13`: `8ba85677` (Fix) und `ed71e8d0` (Kaskade).
  Beide sind gepusht, es gibt keine lokal-only Commits.
- Nicht committet, weil sie aus fremden Änderungen stammen: `docs/werkstatt/BACKLOG.md` und `backlog.json`.
  Beide wurden nicht angefasst.

## 3. LIVE ↔ LOKAL VERGLEICH ✅
SHA-256 (erste 12 Stellen) der Quelle `8ba85677:public/…`, verglichen mit drei Auslieferungsorten:

| Datei | Quelle | smejj.com / | smejj.com /assets | api.smejj.com /assets |
|---|---|---|---|---|
| arbeitsflaeche.js | 9c5b09d404b9 | = | = | = |
| design-v13-kompakt.css | 1aa295ab7c69 | = | = | = |
| index.html | 160f853d17fc | = | = | = (auch api `/`) |
| start-styles.css | ec750cd69df5 | = | = | = |
| sw.js | eb03ca0a4119 | = | = | = (auch api `/sw.js`) |

Precache (251 Einträge, Runde v891): 245 sind auf beiden Ursprüngen identisch.
- `/assets/ai/router.js` weicht gewollt ab (api liefert `src/ai/router.js`).
- `verlauf-messwerte` wird per Workflow erzeugt und weicht deshalb ab.

`check-schutz-echtheit`: 48 ausgelieferte Dateien aus 8 Manifesten stimmen mit smejj.com überein.

## 4. GEÄNDERTE DATEIEN ✅
- `public/design-v13-kompakt.css`: Leiste der ersten Nachricht eingerückt, Menü `max-height`, Platzhalterfarbe.
- `public/arbeitsflaeche.js`: Karte „Rechts öffnen" steht jetzt hinter der Aktionsleiste. Marke v=3→4.
- `public/index.html`: Marken `arbeitsflaeche.js?v=4` und `start-styles.css?v=v13n-20260917`.
- `public/start-styles.css` (Bündel) und `public/sw.js` (v891→v892), jeweils mit Spiegel in `public/assets/`.
- `docs/frontend/start-lock-manifest.json` neu gestempelt, `docs/frontend/marken-manifest.json` angepasst.
- `scripts/einmal/design-v13-kompakt-2026-09-16.sh`: Kaskade auf Runde 4 umgestellt.

## 5. DATENBANKSTATUS ⚠️
- `/api/health` meldet `storage:true` und `trainingsSpeicher.ok:true`.
- Verlauf-Sync live in Chrome: „372 von 372 Chats sind schon aktuell".
- Alle Daten-Endpunkte antworten ohne Anmeldung mit 401.
- **Nicht direkt geprüft:** Datenbankinhalt, Backups der Datenbank und Migrationen. Dafür fehlt der
  Zugang, weil der Zeabur-Schlüssel abgelaufen ist.

## 6. API-STATUS ✅
- `/api/health` antwortet mit 200 in 0,53 s.
- `/api/status` und `/api/system/status` antworten mit 401 `authentication_required`.
- Kein CORS für fremde Ursprünge, Path-Traversal ist gesperrt.
- `/.env` und `/.git/config` auf api liefern nur die HTML-Rückfallseite (text/html), keine Geheimnisse.

## 7. WEB-TEST ✅
- **Chrome 152 (Desktop, angemeldet, live):**
  - v892 aktiv, 10 Nachrichten und 10 Aktionsleisten, keine doppelten Leisten.
  - Keine Konsolenfehler, Platzhalter `rgba(151,158,171,0.9)`.
- **Firefox 155.0.1 (Desktop, headless, Test-Kopie, 1366×683):**
  - Layout ohne Befund.
  - Alle Menüaktionen für 6 schwierige Nachrichten ohne Befund: Emoji, RTL, Code, XSS, 8000 Zeichen.
  - `xss:0`, `angriffImDom:0`.
- **Menü (Chrome, Test-Kopie):** 13 Menüpunkte an KI-Antworten, 11 an eigenen Nachrichten, alle vorhanden.
  - Ausgeführt ohne Befund: Kopieren, Teilen, Vorlesen, Anpinnen an/aus (bleibt nach Neuladen),
    Antworten, Zitieren, Weiterleiten, Übersetzen, Text auswählen, Ab hier neuer Chat, Löschen (nur Test-Chat).
  - „Neu erzeugen" ohne echte KI-Antwort, siehe 23.

## 8. PWA-TEST ✅
- **Update v890→v891** (Chrome, localhost-Kopie): sauberer Wechsel ohne gemischten Stand, offline geht.
- **Update v891→v892** (Chrome, live):
  - Erster Aufruf installiert v892.
  - Beim zweiten Aufruf liefert v892 aus (`start-styles` enthält den Fix), und der v891-Cache ist gelöscht.

## 9. iOS-TEST ✅
Simulator iOS 26.5, Safari (UA „iPhone OS 18_7"), Test-Kopie:

| Gerät | Viewport | DPR | Befunde | Erste Nachricht | Menü-Knopf trifft |
|---|---|---|---|---|---|
| iPhone 17e | 390×699 | 3 | keine | 7 px | menu |
| iPhone 17 Pro Max | 440×796 | 3 | keine | 7 px | menu |
| iPad mini (A17 Pro) | 744×1047 | 2 | keine | 53 px | menu |

- Verfügbar: `navigator.share`, Clipboard, `speechSynthesis`, `webkitSpeechRecognition`, `:has`, `dvh`.
- Zitieren geprüft: „> Kurz 👋".
- ⚠️ Pro Max: Im ersten Lauf lag das Menü einmal oben außerhalb (−289). Drei gezielte Wiederholungen
  mit Scroll- und Viewport-Diagnose zeigten 8..454 px, scrollY 0. Nicht reproduzierbar.
- Offene Tastatur: Safari schiebt die Seite samt Kopf nach oben, und das Schreibfeld bleibt über der
  Tastatur (Screenshot). Das ist Standardverhalten des Browsers.

## 10. ANDROID-TEST ✅
Emulator `smejj_pixel`: Android 15, 1080×2400, Chrome 124.0.6367.219.
- Viewport 412×783, keine Befunde, Menü 59..505, Knopf trifft „menu".
- Voller Menütest: `xss:0`, `angriffImDom:0`.
- Ein Befund „Zitat ohne >" bei Nachricht 5 lag am Testablauf. Per DevTools nachgestellt: Das Zitat
  beginnt korrekt mit „> Sonderzeichen …" (1209 Zeichen).

## 11. HUAWEI-TEST ⚠️
- Kein Huawei-Gerät und kein HMS-Emulator vorhanden, deshalb nur eine Prüfung des Codes.
- Keine Firebase-, GMS-, reCAPTCHA-, Analytics- oder Play-Abhängigkeit.
- Die Google-Anmeldung ist ein Web-OAuth-Redirect und braucht kein GMS.
- Die Spracherkennung prüft vorher, ob der Browser sie kann (`SpeechRecognition || webkitSpeechRecognition`).
  Fehlt sie, erscheint der Hinweis „Spracherkennung wird von diesem Browser nicht unterstuetzt".
- Auf echtem Huawei-Browser oder Petal nicht verifiziert.

## 12. TABLET-TEST ✅
- **Android `smejj_tablet`** (2560×1600, Android 15, Chrome): quer 1280×648 und hoch 800×1128 ohne Befunde,
  Menü 114..543.
- **iPad mini** (siehe 9) ohne Befunde.
- ⚠️ Die Sidebar zeigt englische Texte, wenn die Browsersprache Englisch ist. Die Sprache folgt dem
  Browser, das ist kein Fehler.

## 13. RESPONSIVE-TEST ✅
- Chrome-Emulation aller Handy- und Tablet-Größen der Runde ist nach den Fixes ohne Befund.
- Handy quer: Menü 374 px hoch und scrollbar, statt 513 px aus dem Bild.
- Firefox kann headless nur Desktop-Breite, siehe 23.

## 14. ACCESSIBILITY ⚠️
- `lang="de"`, 0 Knöpfe oder Links ohne zugänglichen Namen, 0 Bilder ohne alt, 0 Felder ohne Label.
- Vorhanden: `main`, `nav` und 4× `aria-live`, 27 `:focus-visible`-Regeln und eine Regel für
  `prefers-reduced-motion`. Zoom ist nicht gesperrt.
- Kontraste (WCAG, geblendet gerechnet):
  - Antworttext 12,69:1, eigene Nachricht 15,99:1, Feldtext 10,35:1, Modell-Knopf 6,54:1.
  - Platzhalter vorher 4,26:1 (❌ AA), **behoben: 5,21:1**.
- Nicht geprüft: VoiceOver und TalkBack mit echter Sprachausgabe.

## 15. PERFORMANCE ✅
`scripts/testing/measure_web_vitals.mjs --url https://smejj.com/ --runs 3` meldet: alle Budgets eingehalten.

| Messwert | Erstbesuch (p75) | Wiederbesuch mit SW (p75) |
|---|---|---|
| LCP | 928 ms | 340 ms |
| CLS | 0,002 | 0,002 |
| INP | 16 ms | 16 ms |
| TTFB | 185 ms | – |
| Startgewicht | 72 KB | – |
| lcpRender | – | 37 ms |

Test-Chat mit 600 Nachrichten:
- 600 Einträge und 600 Leisten gerendert, eine einzige lange Aufgabe von 127 ms.
- Sprung nach oben und unten in 38 ms (2 Frames).

## 16. SECURITY ⚠️
- `npm audit`: 0 Lücken, gilt für alle und für Produktions-Abhängigkeiten.
- `check:security` und `check:paths`: grün.
- **api.smejj.com Header:** CSP `default-src 'self'`, HSTS 180 d, `X-Frame-Options: DENY`, `nosniff`,
  `Referrer-Policy`, `Permissions-Policy` (Kamera und Mikrofon aus).
- **smejj.com (GitHub Pages):**
  - HSTS 1 Jahr, Meta-CSP mit `script-src 'self' 'sha256-…'`, `object-src 'none'`.
  - Restrisiko: Pages kann keine Header setzen, daher kein `frame-ancestors`/`X-Frame-Options`
    (Clickjacking theoretisch möglich) und `style-src 'unsafe-inline'`.
- XSS mit `<img onerror>` und `<script>` in einer Nachricht: wird in allen getesteten Engines nicht
  ausgeführt (Chromium, Gecko, WebKit iOS).
- Restrisiko: Die öffentliche Server-Policy-Quelle ist lesbar. Sie enthält keine Geheimnisse.

## 17. LOGS ⚠️
- Browser-Konsole live, angemeldet und beim Neuladen: 0 Fehler, nur 2× Info vom Verlauf-Sync.
- Gastseite im Browser-Pane: 0 Konsolenmeldungen, alle Anfragen 200.
- GitHub Actions grün, außer dem **Codeberg-Backup** (rot seit 13.09., Token).
- **Zeabur-Logs nicht einsehbar:** Die API antwortet 401, der Schlüssel ist seit 02.09. abgelaufen.

## 18. DEPLOYMENT / ZEABUR ✅ (⚠️ Schlüssel)
- Kaskade `scripts/einmal/design-v13-kompakt-2026-09-16.sh`: Basisprüfung, alle 5 Dateien „gleich",
  nur Fast-Forward-Pushes.
- smejj.com war nach 30 s live, api.smejj.com nach 45 s (Auto-Deploy nach dem Push).
- Der Extra-Anstoß über die Zeabur-API scheitert mit 401. Der Schlüssel wurde nicht verändert.

## 19. BACKUP / ROLLBACK ✅
Neue Anker auf dem Live-Stand v891 vor dem Fix, alle gepusht (Tags sind per Ruleset unlöschbar):
- `schutz-100-2026-09-17-v891` → `c1000034`
- `schutz-100-2026-09-17-v891-bauzweig` → `47ac393f`
- `schutz-100-2026-09-17-v891-frontend` → `dab9a33`

Start-Lock-Backups liegen unter `backups/start-design-lock/2026-09-16T21-5*`.

Rückroll-Weg:
1. Im Frontend-Repo den Inhalt von `schutz-100-2026-09-17-v891-frontend` als neuen Commit auf `main`
   legen, mit SW auf v893.
2. Den Bauzweig ebenso aus dem Bauzweig-Anker per Fast-Forward-Commit zurückführen.

## 20. GEFUNDENE FEHLER
1. Die erste eigene Nachricht auf dem Handy hatte ihren „···"-Knopf unter dem Browser-Icon
   (`elementFromPoint` = `browserButton`), sie war nicht bedienbar.
2. Unter Code- und Tabellen-Antworten standen zwei Aktionsleisten. Ursache: `arbeitsflaeche.js` setzte
   die Karte zwischen Antwort und Leiste, und `chat-actions.js` baute deshalb eine zweite.
3. Das Nachrichten-Menü ragte im Handy-Querformat aus dem Bild (513 px bei 390 px Sicht).
4. Der Platzhalter im Schreibfeld lag unter dem AA-Kontrast (4,26:1).

## 21. BEHOBENE FEHLER ✅
Alle 4 Fehler sind behoben, in einer Runde ausgeliefert (Commit `8ba85677`, SW v892) und nachgetestet:

| Fehler | Nachtest |
|---|---|
| 1 | Knopf trifft „menu" auf iPhone 17e, iPhone 17 Pro Max, iPad mini, Pixel und Android-Tablet |
| 2 | Reihenfolge Nachricht–Leiste–Karte, 6 Leisten bei 6 Einträgen; live 10/10 |
| 3 | Menü 374 px und scrollbar |
| 4 | live `rgba(151,158,171,0.9)` = 5,21:1 |

Regression danach:
- `check:frontend` 687 Tests / 0 fehlgeschlagen.
- Alle Einzelprüfungen von `check:all` sind grün. Der Echtheitswächter war vor dem Deploy erwartungsgemäß
  rot und ist nach dem Deploy grün.
- Live-Konsole ohne Fehler.

## 22. NOCH OFFENE PUNKTE ⚠️
- Zeabur-API-Schlüssel abgelaufen: keine Logs und kein Extra-Neubau per API. Erneuern kann nur der
  Betreiber (Zugangsdaten).
- Codeberg-Backup-Workflow rot (Token). Erneuern kann nur der Betreiber.
- Pins liegen nur im `localStorage`: nicht zwischen Geräten synchronisiert.
- api.smejj.com als direkt geöffnete Oberfläche (Rückfallweg): Die strengere CSP (`style-src 'self'`,
  `microphone=()`) lässt dort eingespeiste Stil-Module und das Diktieren nicht zu. smejj.com ist davon
  nicht betroffen.
- ~~Veraltete Kopien unter `/assets/admin` auf api.smejj.com~~ — nachgeprüft 17.09.: kein Befund. `/assets/admin/index.html` und `/assets/admin/radar/index.html` liefern beide die Rückfallseite (gleiche Prüfsumme a193a1fd5ae1), `console.css` ist identisch mit `/admin/console.css` (a85b93e3c7de).
- smejj.com auf GitHub Pages: keine Header-Kontrolle (siehe 16).

## 23. NICHT TESTBARE PUNKTE
- Echte Geräte: iPhone, Android, Huawei (HMS, Petal). Nur Simulator, Emulator und Code-Prüfung.
- Ältere iOS-Versionen: Auf dem Mac ist nur die Runtime iOS 26.5 installiert.
- Safari Desktop: Nicht automatisiert, weil „Entwicklerfunktionen/Remote-Automation" eine
  Systemeinstellung wäre. WebKit ist über iOS abgedeckt.
- Edge: nicht installiert. Chromium ist über Chrome abgedeckt.
- Firefox in Handy-Breite: headless ignoriert die Fenstergröße.
- VoiceOver und TalkBack mit echter Sprachausgabe.
- Echte KI-Antwort neu erzeugen und Login/Logout live: würde den Betreiber abmelden oder echte Chats verändern.
- Datenbankinhalt, DB-Backups und Zeabur-Serverlogs: Zugang fehlt (401).
- Grober Zeiger (Touch) am Tablet in der Chrome-Desktop-Emulation. Ersatzweise auf dem Android-Tablet
  und dem iPad-Simulator geprüft.

## 24. ENDSTATUS ⚠️ (stabil, keine bekannten kritischen Fehler)
- Lokaler Code, smejj.com und api.smejj.com sind byte-gleich (v892).
- Alle gefundenen Fehler sind behoben und live nachgetestet.
- Web (Chrome, Firefox), PWA, iOS, Android und Tablet sind im Simulator bzw. Emulator ohne Befund.
- Performance-Budgets eingehalten, 0 npm-Lücken.
- Kein „100 % sicher": Die Restrisiken stehen in 16 und 22, die Lücken in 23.

---

## NACHTRAG 17.09. — Live-Test auf Geräten, 5. Fehler behoben (SW v893) ✅

Auftrag des Betreibers (17.09.): „Bitte öffne smejj.com im Browser und teste die gesamte App … Wenn du Fehler
findest, behebe sie sofort, deploye erneut und teste live weiter … Danach alles 100 % schützen."

**Live-Tests auf den Geräten:**
- **iPhone 17 Pro** (Simulator iOS 26.5, Safari) auf https://smejj.com/: Startseite sauber (Screenshot).
- **Android, Pixel** (Chrome 124), live mit dem Betreiber-Konto (Zugang „local-e2e"):
  - SW v892 aktiv, alte Caches werden abgeräumt, kein seitlicher Scroll, 0 Knöpfe ohne Namen.
  - Eine klar beschriftete Testfrage „Endabnahme v892 Android-Test: Wie viel ist 3 plus 4?" wurde nach 6 s
    mit „7" beantwortet.
  - Menüs: 11 bzw. 13 Punkte, ganz im Bild, der Knopf trifft „menu".

**5. Fehler (live gefunden):**
- Symptom: Die erste Zeile der ersten Nachricht war im Chat am Handy verdeckt.
- Ursache: Der Kopf-Glasstreifen `.mobil-kopfglas` aus `mobil-dock.js` (fixed, 52 px, 92 % deckend) stammt aus
  der Zeit mit 56 px Polster. Seit v891 beginnt der Verlauf an der Oberkante.

**Fix:**
- `design-v13-kompakt.css` blendet den Streifen im Chat am Handy aus. Die Code-Ansicht behält ihn.
- Neuer Regressionstest `tests/kopfglas-verdeckt-nicht.test.mjs`.
- Commits: Arbeitszweig `425aa2b2`, Bauzweig `c7d11e5f`, Frontend `5dd7551`.

**Prüfungen und Auslieferung:**
- `check:frontend` 688 bestanden, 0 fehlgeschlagen; alle `check:all`-Einzelprüfungen grün.
- smejj.com war nach 30 s live, api.smejj.com nach 45 s.
- Prüfsummen (Quelle = smejj.com = api.smejj.com):
  - `design-v13-kompakt.css` 9ab83ec2a076
  - `index.html` 0a9dcaccbf6f
  - `start-styles.css` 0da7fc932d2a
  - `sw.js` d98cc591e65f
- `schutz-echtheit` OK (48 Dateien).

**Nachtest:**
- **Android live** (v893): Streifen im Chat `display:none`, erste Zeile bei y=20 frei (elementsFromPoint =
  `entry user`), Screenshot zeigt beide Zeilen. In der Code-Ansicht ist der Streifen weiter `block`.
- **iOS Test-Kopie:**
  - iPhone 17 Pro 402×714: Streifen `none`, erste Zeile bei y=17 frei, Layout ohne Befund.
  - iPhone 17e: Streifen `none`, nachdem der alte Cache der Test-Kopie erneuert war.

**Schutz:**
- Anker auf v892 (vor dem Fix): `schutz-100-2026-09-17-v892`, `-v892-bauzweig`, `-v892-frontend`.
- Anker auf v893 (neuer Stand): `schutz-100-2026-09-17-v893`, `-v893-bauzweig`, `-v893-frontend`.
- Tags sind per Ruleset unlöschbar und unverschiebbar.
- Zweigschutz aktiv (kein Force-Push, kein Löschen) auf Frontend `main`, Bauzweig, Arbeitszweig und
  `feature/design-v11`.
- Start-Lock mit Wortlaut gestempelt: Änderungen an der Startseite schlagen ohne neuen Stempel an.

## NACHTRAG 2 — Zeabur-Zugang erneuert (17.09., 23:3x UTC) ✅
- Der Betreiber hat `npx zeabur@latest auth login` selbst ausgeführt. Der alte Zugang war ein
  „deprecated legacy API key", jetzt ist ein Access-Token in `~/.config/zeabur/cli.yaml` abgelegt.
- `scripts/diagnose/zeabur-schluessel-suchen.mjs` meldet: `cli.yaml:token … TRAEGT — angemeldet als smejjcom`.
- **Server-Protokolle** (Zeabur-CLI, Laufzeit, nur lesend):
  - `smejj-control`: 11 Zeilen, 0 Fehler, Start 23:36:16Z.
  - `smejj-chat-bridge`: 65 Zeilen, 0 Fehler.
  - `brueckenwaechter`: 11 Zeilen, 0 Fehler.
- Der Neustart von `smejj-control` um 23:36Z war der Auto-Deploy einer **parallelen Sitzung**
  (Medien-System, SW v894, Bauzweig `bd84e8e7`, Frontend `fd873f6`). Er baut per Fast-Forward auf v893 auf.
- Auf beiden Ursprüngen nachgeprüft, dass alle Fixes dieser Endabnahme in v894 enthalten sind:
  Kopfglas-Regel, Platzhalter 0.9, Menü-`max-height`, Leisten-Einzug, Karten-Reihenfolge.
- `scripts/diagnose/zeabur-dienste-zeigen.mjs` scheiterte an einer geänderten Zeabur-API
  (HTTP 422 „edges on Service"). Das Skript fragt jetzt zweistufig ab wie `findeDienst()` und läuft wieder.
- **Offen bleibt nur `CODEBERG_TOKEN`:** `gh secret list` ist leer. Die Codeberg-Token-Seite ist in Chrome
  vorbereitet; erzeugen und bei GitHub eintragen kann nur der Betreiber.

## NACHTRAG 3 — Codeberg-Sicherung ohne Token nachgeholt (17.09.) ✅ / Automatik ⚠️
- Der Mac hat einen funktionierenden SSH-Zugang zu Codeberg (`git ls-remote codeberg` klappt).
- `scripts/deploy/codeberg_spiegel_sync.sh lokal` lief über SSH mit Exit 0: alle Zweige und Tags von GitHub
  gespiegelt, ohne Prune, also ohne Löschen.
- Nachweis: Bauzweig `bd84e8e7` und Arbeitszweig `01e43ff6` sind auf GitHub und Codeberg gleich. Codeberg führt
  144 Tags (GitHub 100, ältere bleiben erhalten), darunter `schutz-100-2026-09-17-v893`.
- **Automatik:** Codeberg bietet keine Pull-Spiegel mehr an (Migrationsformular ohne Mirror-Option).
  Die tägliche GitHub Action braucht deshalb weiter das Secret `CODEBERG_TOKEN`.
  - Die Token-Seite ist in Chrome vorbereitet (Name `github-sicherung-smejj`, repository: Lesen und Schreiben).
  - Token erzeugen und bei GitHub eintragen kann nur der Betreiber.
  - Bis dahin bleibt die Action bewusst rot (fail-closed) und täuscht keine Sicherung vor.

## NACHTRAG 4 — Tägliche Codeberg-Sicherung läuft wieder ✅ (17.09., 00:16 UTC)
- Der Betreiber hat den Codeberg-Token erzeugt: nur Repository `smejj/smejj.com-app`, `write:repository`.
  Er ist als GitHub-Secret `CODEBERG_TOKEN` hinterlegt (`gh secret list`: 2026-09-17T00:14:49Z).
- Der Fehler beim ersten Versuch („Repository- und Organisationszugriff darf nicht leer sein") lag am fehlenden
  Repository-Zugriff im Formular. Das ist ergänzt.
- Manueller Lauf https://github.com/SmejjCom/smejj.com-app/actions/runs/35165814305: **success**, alle Schritte grün.
  Der Zeitplan (täglich 11:20 UTC) läuft ab jetzt selbstständig.
- Damit ist nichts mehr offen, was einen Zugang des Betreibers braucht.
