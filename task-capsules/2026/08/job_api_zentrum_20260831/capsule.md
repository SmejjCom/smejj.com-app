# Task Capsule — Zentraler API-Bereich im OpenRouter-Layout (job_api_zentrum_20260831)

## Auftrag
Betreiber, 2026-08-31: Der API-Bereich „sitzt hässlich aus, überhaupt nicht
übersichtlich" — Vorbild https://openrouter.ai/workspaces/default/keys. Zwei
Freigaben: (1) „Ich finde deinen Vorschlag gut. Kannst Du umsetzen / Ich gebe
dir alle Rechte von A bis z. Mach hundert Prozent fertig. Lass nicht offen."
(2) Nachtrag mit Screenshot: „mach 1 zu 1 genau wie openrouter… gleiche Design".
Master-Prompt: Ship-Loop inkl. Live-Gang, Live-Test, 100-%-Schutz am Ende.

## Umsetzung (zwei Commits im App-Repo)
- Commit 1 (1326260c): EINE Fläche statt zwei — api-center-surface.js/.css
  ersetzt api-keys-surface.js/.css + api-konto-surface.js + entwickler.css
  (alles gelöscht, Quelle + assets-Spiegel). Einstellungsreiter „API",
  /entwickler.html rendert dasselbe Modul (kopf: voll). i18n: 26 Waisen raus,
  25 neue in 14 Sprachen. sw v718, Marken b104/b42f/b44/v1/v3.
- Commit 2 (dieser): OpenRouter-Layout 1:1 — große Überschrift „API-Keys" +
  ein Hauptknopf oben rechts, KEINE Kacheln (Konto als schlanke Zeile),
  eine Karte mit großer Suche („Nach Name oder Schlüssel suchen …", immer
  sichtbar wie OpenRouter), Spalten Schlüssel · Typ · Läuft ab · Zuletzt
  genutzt · Verbrauch · Limit · ⋮-Menü mit Icons (Kopieren/Modell wählen/
  Guthaben aufladen/Widerrufen/Entfernen), Fusszeile „N Schlüssel",
  widerrufene Zeilen ausgegraut, Verbindung & Preise eingeklappt unter
  „Verbinden & Preise". Settings-Panel ohne eigene Überschrift.
  i18n: 4 Waisen (inkl. Duplikate!) raus, 9 neue in 14 Sprachen.
  sw v719, Marken app b107 / premium b42i / settings b47 / api-center v4 /
  css v3 / entwickler.js v6.

## Lehren (für Memory)
1. `hidden`-Attribut verliert gegen Autoren-`display` — jede Klasse mit
   eigenem display braucht `[hidden]{display:none}` (Fund: Guthaben-Leiste
   zeigte Platzhalter live).
2. `json.dumps` escapet Unicode — i18n-Pflege-Regexe müssen die RAW
   UTF-8-Zeichenkette matchen, sonst bleiben Doppel-Einträge stehen.
3. assets/ai/ existiert nur im Frontend-Klon, nicht im App-Repo — lokale
   Browser-Tests brauchen die Kopie, Deploy nicht (chirurgischer Satz).
4. Seitenspezifische Regeln (`html.p-recht h2`, 2em Abstand) schlagen
   Flächen-CSS gleicher Spezifität — Abstände mit höherer Spezifität
   (.ac-surface .ac-head h2) setzen.
5. Der Frontend-Klon trägt live neuere Dateien als das App-Repo (Parallele
   Admin-Sitzungen) — deploy-abgleich STOPP-Meldungen je Datei klassifizieren:
   eigene Streichungen vs. fremde Hotfixes; chirurgischer Dateisatz kopieren.

## Prüfungen
- check:all-Stufen: alle grün auf Commit-Stand (Einzelheiten Log). Ausnahme:
  check:admin-console-sync rot wegen Parallelsitzung (Live-Klon trägt deren
  neueres admin/console.js) — mein Commit berührt 0 Admin-Dateien
  (git show --stat | grep -ci admin => 0).
- i18n-ui, api-keys-provider, deferred-start: grün.
- Lokale GUI: Desktop (1280) + Handy (375), Leer-/Fehlerzustände, Formular,
  Idempotenz, Übersetzungslaufzeit, kein Querscroll, 44-px-Ziele.
- Live: SW v718/v719 per curl, api-center 200, alte Dateien 404,
  /entwickler.html v=6, funktionen-live 8/8, Klickpfad Einstellungen › API
  mit echten Daten (6 Schlüssel, Guthaben, Preise) — Screenshots im Gespräch.

## Benchmarks
docs/benchmarks/webvitals_v718_nachdeploy_2026-08-31.json — Messfenster stark
gestaut (Parallelsitzung + fremde Browsernutzung); Startpfad inhaltlich
unverändert (Start-Lock/Auslieferungs-Lock grün), Wiederholung im ruhigen
Fenster empfohlen.

## Rollback
App-Repo: revert der Commits 1326260c + Nachfolgecommit. Frontend-Klon: revert
des Deploy-Commits, danach SW-Stempel auf die nächste freie Nummer.
