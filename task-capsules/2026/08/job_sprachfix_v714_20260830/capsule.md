# Task Capsule — Sprachfix-Auslieferung v714 (2026-08-30, job_sprachfix_v714_20260830)

## Auftrag

Betreiber-Freigabe 2026-08-30: „Ich gebe dir alle Rechte von A bis z. Mach
hundert Prozent fertig. Lass nicht offen." — Abschluss des Mobil-Pakets:
Icons in einer Zeile (v713, durch Parallel-Session übernommen), Sprachwelle-
Fehlermeldung, Modell-Menü-Häkchen, A–Z-Responsive-Sweep, Deploy, Live-Beweis.

## Umsetzung

1. **Sprachwelle (voice-ohr-solo.js)**: iOS-HomeScreen-PWA verweigert
   getUserMedia still (NotAllowedError ohne Dialog); der Fallback zeigte das
   irreführende Generikum. Neu: soloFehlertext() unterscheidet gesperrtes
   Mikrofon (klarer Weg: Einstellungen › Datenschutz › Mikrofon für smejj.com
   erlauben, oder einmal in Safari öffnen) und fehlendes Mikrofon. Tipp-
   Fallback (Antwort wird vorgelesen) bleibt.
2. **Markenkette**: voice-ohr-solo ?v=4 → composer-tools werkzeuge-10 →
   app.js b100. check:markenkette hatte die Kaskade Schritt fuer Schritt erzwungen.
3. **SW v714 (die eigentliche Lehre)**: Nach Deploy der Marker-Kette war
   index.html (network-first) frisch, aber app/composer/voice blieben ALT —
   der Fetch-Handler matcht Precache-Pfade mit ignoreSearch:true, ?v=-Marker
   umgehen den Cache NICHT. Für precache-Dateien ist der CACHE_NAME-Stempel
   Pflicht (so steht es auch im sw.js-Kommentar). v714 gestempelt, danach
   Live-Beweis: laufende Instanz Cache= nur smejj-shell-v714.
4. **Modell-Menü**: Häkchen live bewiesen — Menü öffnet, „smejj 1.0" trägt
   aria-checked="true" + sichtbares ✓ (.modus-haken), alle anderen false.
5. **A–Z-Sweep 375px** (Bildanalyse je Ansicht): Code ✓, Verlauf ✓ (erstes
   weißes Foto war Capture-Panne), Status ✓, Einstellungen ✓ („Kartenbreiten-
   Differenz" erwies sich als Navigations-Chips — DOM-Messung: Panel
   einheitlich 345px), Konto ✓ (Chip-Umbruch ist Design). Kein Defekt offen.
6. **Frontend-Deploy chirurgisch**: ~/smejj-app-frontend hatte 3 divergierte
   Dateien (u. a. assets/index.html mit viewport-fit=cover, Inline-Früh-Gate,
   CSP-Hash — Produktions-Hotfixes, die im App-Repo fehlen). Blindkopieren
   hätte sie gelöscht; stattdessen nur 4 Dateien (+20/−4) nach der Abgleichs-
   Lehre der v713-Kapsel.

## Commits

- App-Repo feature/design-v11: c2498a72 (Sprachfix+Markenkette+Start-Lock),
  a48e1f96 (SW v714 + Verlauf-Eintrag). GitHub gepusht; Codeberg-Spiegel
  OFFEN (SSH-Zugang verweigert, Schlüssel nicht geladen — nachholen).
- Frontend-Repo main: 4bb4de4 (Sprachfix+Marker), 2a91674 (SW v714).

## Verifikation

- check:all EXIT 0 (zweimal, je nach Start-Lock-Stempel), check:guidelines
  2008 Dateien, npm run check (Static-Shell) EXIT 0, Favicon-/Start-/
  Auslieferungs-/Deploy-Locks alle OK; Start-Lock 2× neu gestempelt mit
  Betreiber-Wortlaut.
- Live: /sw.js = v714; /assets/voice-ohr-solo.js?v=4 enthält beide Meldungen;
  composer-tools (werkzeuge-10) importiert v4; app.js (b100) importiert
  werkzeuge-10; Hotfixes viewport-fit + Inline-Früh-Gate unverändert live;
  Cache der laufenden Instanz = smejj-shell-v714.

## Bewusst offen

1. Codeberg-Spiegelstand feature/design-v11 (SSH-Key laden, dann push).
2. 3 divergierte Frontend-Dateien (assets/index.html, app.js, composer-tools.js
   Root-Spiegel) — eigenes Abgleichsprojekt wie in der v713-Kapsel notiert.
3. i18n-Lücken im EN-Locale (z. B. „API & Schlüssel") — für deutschsprachiges
   Endgerät des Betreibers ohne Wirkung; separates Übersetzungsprojekt.

## Rollback

Frontend: git revert 2a91674 + 4bb4de4 auf main, Pages deployt sofort zurück.
App-Repo: git revert a48e1f96 c2498a72. Start-Lock-Backups:
backups/start-design-lock/2026-08-30T10-32-16-770Z/ und …T10-46-02-838Z/.
