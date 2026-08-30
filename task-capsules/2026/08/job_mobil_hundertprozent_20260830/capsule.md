# Task Capsule — 100 % Mobil + Sprachwelle lebendig, SW v715 (2026-08-30, job_mobil_hundertprozent_20260830)

## Auftrag

Betreiber-Freigabe 2026-08-30 (Master-Prompt „Autonom bis zum Ende"):
„muss hundert Prozent Mobilversion angepasst werden … fuege von dir aus und
mach eine komplette Check" + „Sprachwelle … wie ChatGPT/Gemini/Claude".
Reihenfolge vorgegeben: Audit → Fixes → Sprachwelle → Deploy → Handy-Test.

## Audit-Befunde (live gemessen, echtes DOM)

1. Querformat 844×390: Touchziele 38/34 px — die 44-px-Regel (v264) galt nur
   bis 600 px BREITE; Querformat-Handys sind breit, aber flach.
2. 100vh in design-v11 (Chat-Halter, Code-Fläche, Erwähnungs-Menü) rechnet
   die iOS-Adressleiste mit ein — Inhalte ragten hinter die Leiste.
3. overscroll-behavior fehlte komplett: Pull-to-Refresh lud im Browser-Tab
   die Seite neu, mitten im Chat.
4. Kein Tastatur-Handling: Android braucht interactive-widget=resizes-content
   (Meta), iOS ignoriert das — fixe Flächen (Sprach-Overlay-Eingabe) standen
   hinter der Tastatur.
5. Sprachwelle: Sprechpause 1100 ms (ChatGPT ~600–800 ms); das Overlay-Logo
   lief in einer starren Schleife statt auf die Stimme zu reagieren.
6. Positiv (kein Handeln nötig): viewport-fit=cover ✓, Inputs ≥16px ✓,
   maskable Icon ✓, theme-color ✓, kein user-scalable-Block ✓, Hotfixes
   (Inline-Früh-Gate/CSP/preload) bereits im App-Repo ✓, kein Überlauf bei
   320–430 px ✓.

## Umsetzung

- Querformat-44px + dvh-Übersteuerung in mobil-composer.css. Lehre:
  design-v11.css steht in der Ratsche (Baseline 2744, darf nicht wachsen)
  und ist vertragsgemäß Kaskaden-Ende im Bundle — deshalb gezielte
  Spezifitäts-Erhöhung VOR design-v11 statt Kaskadenbruch dahinter:
  Icon-Knöpfe #start .prompt-glass .prompt-actions … (1,4,0 gegen 1,3,0),
  dvh-Doppelschritt .codeflaeche.codeflaeche (1,2,0 gegen 1,1,0).
  Bewusst OHNE pointer:coarse (Automatisierungs-Browser melden coarse
  falsch — Regel wäre bei uns nie prüfbar gewesen).
- overscroll-behavior-y: none auf html.
- Viewport-Meta + interactive-widget=resizes-content (Android-Tastatur).
- Tastatur-Brücke in pwa-schnellstart.js (v3): visualViewport-Rückstand als
  --tastatur-hoehe; Sprach-Overlay polstert darüber (composer-tools.css).
  Bewusst KEINE eigene Datei: index.html steht ebenfalls in der Ratsche
  (Baseline 1016) — 3 neue Zeilen hätten sie gebrochen.
- Sprachwelle: stilleMs 1100→750 ms; aufPegel-Hook im Ohr-Solo-Takt setzt
  --pegel auf dem Overlay; Chevron-Spitzen, Punkte und Aura reagieren live
  (Formel live bewiesen: Scale 1.102/−8.5 px bei Pegel 0.85). Die alten
  Balken (.voice-mode-wave) sind nach dem Overlay-Upgrade tot — sichtbar ist
  das Logo (upgradeVoiceOverlay ersetzt die Balken).
- Markenkette: voice-ohr-solo v6 → werkzeuge-12 → b102; start-styles
  mobilfix3-20260830; pwa-schnellstart v3. SW v715 (Precache-Pflicht).
- Test-Zweitwahrheit aktualisiert (tests/voice-ohr-solo.test.mjs: v6),
  10/10 grün. check:all EXIT 0, Start-Lock neu gestempelt (11:33:43Z).

## Deploy + Live-Beweis

Frontend-Main fca2127 (nach 2a91674), chirurgisch 13 Dateien, Hotfixes
geprüft unverändert. Live: sw v715 ✓, b102/pwaV3/mobilfix3/interactive-
widget ✓, Bundle mit quer44/dvh/overscroll/pegelLogo/tastaturPolster ✓
(per Direktnavigation, network-first), laufende Instanz Cache NUR v715 ✓,
Querformat live 44×44 (vorher 38/34) ✓, Portrait-Minimum 44 ✓, kein
Überlauf ✓. App-Repo 9950a720 auf feature/design-v11 gepusht.

## Stolpersteine (für die Zukunft)

1. Pre-Push-Hook github_kostenfrei.sh blockt bei GitHub-Netzflake
   („Sichtbarkeit nicht feststellbar") — Kurzfassung im Skript selbst:
   kurz warten, erneut pushen. Kein --no-verify nötig.
2. Live-Prüfung von Precache-Assets NICHT per fetch() im App-Tab (SW matcht
   ignoreSearch und bedient Alt-Cache) — Direktnavigation ist network-first
   und zeigt die deployten Bytes.
3. IAB-Messbrücke: bei Hintergrund-Tabs frieren CSS-Transitions ein;
   (pointer: coarse) ist false; evaluate-Rückgaben können stale wirken.
   Formel-Beweis bei EINER sichtbarer Messung genügt.

## Bewusst offen

1. Codeberg-Spiegel weiterhin offen (SSH-Key nicht geladen).
2. Frontend-Spiegel assets/index.html und Root-app.js/composer-tools.js
   bleiben divergiert (Abgleichsprojekt der v713-Kapsel).
3. Mikrofon-Test am echten iPhone bleibt Betreiber-Handarbeit (2-Minuten-
   Protokoll im Abschlussbericht): Safari einmal erlauben, dann PWA/Chrome —
   Logo muss mit der Stimme wachsen, Antwort nach ~0,75 s Pause kommen.

## Rollback

Frontend: git revert fca2127 auf main (Pages deployt sofort zurück).
App-Repo: git revert 9950a720. Start-Lock-Backup:
backups/start-design-lock/2026-08-30T11-33-43-524Z/.
