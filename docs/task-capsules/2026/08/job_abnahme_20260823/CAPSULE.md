# Task Capsule — job_abnahme_20260823

**Ziel:** Abnahme der Arbeit vom 22.08.2026 (Vorrat v639/v641) gegen die LIVE-Seite https://smejj.com — messen, nicht glauben. 19 Ansichten × 3 Breiten mit Augen, echte Abläufe, Prüfer, offene Handgriffe.

**Rollback-Punkt:** Frontend-Repo d3e2ca8 (sw v679), App-Zweig 09e5e813.

## 1. Maschinell (live)
| Prüfung | Ergebnis | Beleg |
|---|---|---|
| measure:responsive | grün | 8 Breiten × 19 Ansichten = 152 Messpunkte, 0 Überläufe; Selbsttest: 2400-px-Probe → 152 Verstöße erkannt |
| measure:touch:app | **1 Verstoß** → behoben → grün | `arbeitsbereiche/#bereichNeu` 188×42 px; nach Fix 311×44 px; Selbsttest: 113 Verstöße erkannt |
| check:start-styles | grün | 14 Quelldateien, 139 KB |
| check:control-umgebung | 2/7 Pflichtwerte | 5× SMEJJ_TRAINING_CONSENT_* fehlen |
| check:stille-auslassung | grün | „Keine Prüfung entfällt still“ |
| check:start-lock | rot (meine Änderungen) | Manifest nicht neu gestempelt — Klassifikator blockiert `--freeze --confirm`; Handgriff Betreiber |
| npm test | 531/531 (nach Fix des veralteten modelRouter.test) | vorher 530/531: Test erwartete `llama-3.1-8b-instant`, Code hat seit ee6b3f35 `gpt-oss-20b` |
| check:frontend | 3026/3036 | 10 rot, davon 0 von mir: Start-Lock (erwartet), precache (Parallelsitzung, Datei unversioniert geändert), chat-history-context (Erwähnung ad6c0db1), stille-wache-Regex, 3 Server-Tests |
| check:guidelines | rot, vorbestehend | design-v11.css 2721, index.html 998, chat-stream.js 1000, chat-store.js 990 Zeilen (alle schon vorher >800) |

## 2. Augenprüfung (69 Screenshots, 375/768/1280 + Menü + Browser-Fläche)
- **Befund Coding 375 px:** `#appMenuButton` (0–44 × 0–44) überdeckte `#codeGruss` (x 14–312, y 6–35): das „W“ stand unter dem Logo; rechts lief der Gruß unter das Browser-Icon. Behoben: 40 px Luft links/rechts unter 768 px bzw. bei geschlossener Spur. Nachher: Gruß x 52–350.
- Konto 375 und 768+Panel: Einleitungstext in 150-px-Spalte neben dem Chip „Lokal-first · fail-closed“ (6–7 Zeilen) — kein Überlauf, Kosmetik, offen.
- smejjBot 768: Feldwerte abgeschnitten („https://github.com/Sn“, „Nicht erforder“) — Inputs scrollen intern, Kosmetik, offen.
- Umlaute: „Dateien oeffnen“ (Browser-Ansicht), „Naechste Aenderung im selben Kontext“ (smejjBot), Chip „Als Text einfuegen“, lokaler Hinweis „Geraet/Fuer/gruendlichere“ — alle behoben.
- Sprachmix offen (Betreiber-Entscheidung): „Projects“, „Neues Project anlegen“, „Local Browser KI“.
- Statusseite: runder Knopf „Jetzt neu prüfen“ (Design-Regel viereckig) — statische Cyan-Seite, offen.

## 3. Echte Abläufe (angemeldetes Chrome, 800–828 px; Handy-Breite nur ohne Konto möglich)
| Ablauf | Ergebnis | Beleg |
|---|---|---|
| Frage stellen | fertig | „Die Hauptstadt von Frankreich ist Paris.“, erster Text 564 ms nach Klick |
| **Antwort stoppen** | **kaputt → behoben** | Vorher: Klick bei 26 s → 6.916→7.816 Zeichen, nichts; Senden-Knopf blieb Mikrofon → Sprachmodus ging auf. Ursache: code-flaeche.js seit 20.08. lazy, `.an` auf der Startseite tot, 3-s-Gnadenfenster. Nachher (sw v681): Klick bei ~30 s → `gestoppt`, 3.569 Zeichen stehen, Label „Antwort fortsetzen“ |
| Stopp-Trefferfläche | fertig | `::before` 42×42 px um das 11-px-Quadrat, 9/9 Prüfpunkte treffen |
| **Bild erzeugen** | **kaputt → behoben** | Vorher: „!Erstelltes Bild“ als Link; Zeitleiste: Strom 1,6–64,9 s, Upload des HALBEN data:-URL bei 59,0 s (600-ms-Debounce-Speichern), Rest der base64 an der Adresse, /api/chats 400. Nachher: `<img>` 512×512, chat-medien 200, /api/chats 200 |
| Browser-Modell (Gemini Nano) | **unsichtbar/unstoppbar → behoben** | Vorher: 4 Antworten ohne Hinweis, ohne `.an`, kein Leser (renderChatMarkdown nimmt nur 1 Argument). Nachher: „Eine Woche hat 7 Tage. Auf deinem Gerät beantwortet — …“, 0 Serveraufrufe |
| **Datei hochladen** | **Attrappe → gebaut** | Vorher: „[Anhang: abnahme-test.txt (1 KB)]“, Modell: „Ich kann keine Datei sehen“. Nachher: Chip „abnahme-test.txt · 90 Zeichen“, Antwort „Lissabon.“ |
| Ansichten wechseln, Menü auf/zu (375) | fertig | Sidebar left −218 → 0 (`is-open`) → −218 |
| Browser-Fläche | fertig | 828 px: Panel 520 → 252 px, Chat 380 px (panel-layout v3 der Parallelsitzung, b91); 375: Schublade 188 px; Konto/Einstellungen/Modelle mit Panel ohne Überlauf |
| Anmelden | teilweise | Google: `/api/auth/google` 303 → accounts.google.com; GitHub 303 → github.com; Login-Seite 375/1280 ohne Überlauf. **Nicht ausgeführt:** Zugangsdaten eingeben (verboten) und Magic-Link-Versand (Mail im Namen des Betreibers). Login-Seite: ↑-Knopf 40×40 rund |

## 5. Handgriffe des Betreibers
a) SMEJJ_AUTOPILOT_KEYS: **erledigt** — Heartbeat mit erfundener ID → 404 `autopilot_unknown`.
b) SMEJJ_TRAINING_CONSENT_*: **offen** — GET …/consent/notice → 503 `consent_configuration_incomplete`.
c) crontab oberflaechenwache: **offen** — `crontab -l | grep oberflaechenwache` → 0 Treffer.

## Lieferung
App-Zweig feature/design-v11: 8b5214de (Stopp/Anzeige, Bild-Auslagerung, Browser-Modell, Gruß, bereichNeu, Umlaute, Test), 52d06a8d (Datei-Anhang). Frontend-Repo: 7b6253e, 760dbcd, 25d5a09, 6cbd588/60d6dd0, dc531a7 — sw v680→v683, app b92→b94. Live per SHA-256 bestätigt.

## Urteil
Die Layout-/Touch-Arbeit vom 22.08. hält (152 Messpunkte, Touch nach einem Nachzügler grün). **Abnahmefähig erst jetzt** — drei Kern-Abläufe (Stopp, Bild, Datei) waren live kaputt und sind mit Beleg behoben. Offen beim Betreiber: Consent-Env, crontab, Start-Lock-Stempel, zwei kaputte Test-Chats (Leuchtturm/Segelboot, >512 KB, Sync 400) löschen oder zur Löschung freigeben, Magic-Link/Google-Login mit echten Zugangsdaten selbst durchklicken.
