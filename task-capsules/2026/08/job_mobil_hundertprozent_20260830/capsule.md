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

## Messpflicht erfuellt (Nachher gegen v713)

| Metrik | v713 | v715 | Budget |
|---|---|---|---|
| CLS | 0 | 0 | < 0,1 OK |
| INP kalt | 40 ms | 40 ms (p75 48) | < 200 OK |
| LCP kalt | 976 ms | **780 ms** | < 1.500 OK |
| TTFB kalt p75 | 250 ms | 173 ms | < 200 OK |
| Gewicht kalt | 297 KB | 298 KB | < 300 OK |

Keine Regression; LCP und TTFB verbessert. Benchmark:
docs/benchmarks/webvitals_v715_nachdeploy_2026-08-30.json (5 Laeufe, kalt +
warm, headless Chrome gegen Produktion).

## Nachtrag Abschluss (Betreiber-Freigabe "alle Rechte A-Z, lass nichts offen")

1. **Codeberg-Spiegel GESCHLOSSEN**: Schlüssel ~/.ssh/codeberg_smejj_ed25519
   existierte, war nur nicht im Agent (.git/config erzwingt per core.sshcommand
   den GITHUB-Schlüssel mit IdentitiesOnly — Codeberg bekam den falschen
   angeboten). Loesung ohne Config-Aenderung:
   GIT_SSH_COMMAND="ssh -i ~/.ssh/codeberg_smejj_ed25519 -o IdentitiesOnly=yes"
   git push codeberg feature/design-v11 -> 29fd706d..037242ff.
2. **Spiegel-Angleich (Frontend 7ef4c7d)**: genau 3 ungefaehrliche Dateien
   auf App-Stand gebracht — assets/index.html (ungenutzt: kein Precache,
   kein Import, bewiesen), Root-Spiegel app.js + composer-tools.js (keine
   Seite laedt sie). Alle GELADENEN Dateien vorher gegen App-Stand verifiziert
   identisch; Produktion danach bewiesen intakt (200, b102, v715, Hotfixes).
3. **Gesamtdivergenz vermessen: 147 von 492 gemeinsamen Dateien** weichen
   ab (u. a. assets/chat-bridge.js 5286 Diff-Zeilen — gebuendeltes Artefakt,
   nur ueber bundle:bridge; ai/chat-stream.js 550; admin/* Flut). Bewusst
   NICHT blind angeglichen: Die Frontend-Seite traegt Produktions-Hotfixes
   (wie frueher viewport-fit/Inline-Gate), die zurueckportiert werden
   muessen, nicht ueberschrieben. Das ist ein eigenes Abgleichsprojekt
   Datei fuer Datei — dokumentiert, nicht ueberstuerzt (Abgleichs-Lehre
   23.08., Non-Regression-Pflicht).

## Nachtrag 2: Divergenz-Angleich abgeschlossen (Abend, gleicher Tag)

**Richtungsanalyse** (Commit-Daten beidseitig): 11 Assets-Dateien waren LIVE
neuer als die Quelle (unrueckportierte Hotfixes vom 24./25.08.), die
statischen HTML-Seiten waren im App-Repo neuer. Zurueckportiert:
chat-store-Diaet (Papierkorb/Projekte -> chat-store-bereiche.js, Re-Exporte),
account-privacy-Zweiteilung (+ account-privacy-formulare.css), Code-
Anhaenge-Import-Fix (SyntaxError live gefixt worden), auth-gate, profile-
dock, search, code-flaeche/-nachladen, chat-title-auto, account-auth-state.

**Tests als zweite Wahrheit** angepasst (bewusst, mit Datum+Begruendung im
Test): chat-store-Selbstheilungs-Harness schreibt jetzt BEIDE Zyklus-Module
in tmp (store<->bereiche importieren sich gegenseitig); konto-formulare liest
beide CSS-Teile (der Lader laedt beide); chat-title-auto akzeptiert den
dynamischen chat-stream-Import (Diaet).

**Marken-Kaskade bis Fixpunkt** automatisiert (chat-store b65, profile-dock
b49, account-privacy b48, search b52, app b103, pwa v4 + 12 Folgelader;
check:markenkette 110 Module OK). SW v716 (Precache-Pflicht).
Start-Lock UND Abo-Lock (account-privacy haengt an der Zahlungskette) mit
Betreiber-Wortlaut neu gestempelt; check:all EXIT 0.

**Deploy-Lehre nachgemessen**: Der erste Angleich (fd75784) liess 7 Dateien
alt, die im App-Repo nur im ROOT existieren (noch nie in assets/ gespiegelt):
chat-store-bereiche, pwa-schnellstart, bedarf-nachladen, such-nachladen,
maus-chrome, manifest, verlauf-messwerte. Folge: live gemessener DOPPEL-
IMPORT chat-store b64+b65 (zweite Modulinstanz, F-07-Verstoess) und +12 KB
Gewicht. Nach-Deploy 91874cd behob beide — live bewiesen: b64=0, b65=1,
298 KB.

**Benchmark v716**: CLS 0, INP 48 ms, Gewicht 298 KB — im Budget. TTFB/LCP
am Abend netzdegradiert (499/2068 ms), aber KONTROLLMESSUNG gegen eine
fremde GitHub-Pages-Site zeigt dieselbe Degradation (570 ms; curl 0.48s
gegen 0.57s) — Netzweg, nicht Deploy; derselbe Inhalt mass mittags 142/780.
Beleg inkl. Kontrolle: webvitals_v716_nachdeploy_2026-08-30.json.

**Endstand der Divergenz**: App-Repo und Frontend-Repo sind bis auf die 7
by-design-Bruecken-Buendel (nur via bundle:bridge) inhaltlich identisch. Das
147-Dateien-Projekt ist ABGESCHLOSSEN.
