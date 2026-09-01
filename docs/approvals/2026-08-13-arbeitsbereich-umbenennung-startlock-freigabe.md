# Betreiber-Freigabe: „Projekte“ → „Arbeitsbereich“ (Start-Lock, index.html)

**Datum:** 2026-08-13
**Betrifft:** `public/index.html` (Start-Lock, `docs/frontend/start-lock-manifest.json`)

## Anlass

Mit dem Verlauf-Ausbau heißen die Chat-Sammlungen jetzt **„Projekte“**
(Betreiber-Entscheidung, internationaler Standard wie ChatGPT/Claude, siehe
`smejj-projekte-im-verlauf`). Der Seitenleisten-Knopf **„Projekte“** führte aber
zu einer völlig anderen, unverwandten Fläche: dem lokalen Datei- und
Snapshot-Bereich (`projects-surface.js`, Route `/projects`).

Zwei verschiedene Dinge trugen damit denselben Namen. Wer im Menü „Projekte“
antippte, landete nicht bei seinen Chat-Projekten.

## Freigabe

Der Betreiber wurde gefragt und hat entschieden:

- Umbenennung durchführen: **„Projekte“ → „Arbeitsbereich“** (international
  „Workspace“ — der Standardbegriff für genau diese Fläche).
- Die Freigabe deckt ausdrücklich die Änderung der gesperrten `public/index.html`
  für diesen Zweck ab.

## Umfang der Änderung

| Datei | Was |
|---|---|
| `public/index.html` | Nav-Knopf (Text + `title`), `aria-label`, Eyebrow und Überschrift der Ansicht, Browser-Panel-Sprung |
| `public/search.js` | Statischer Sucheintrag; die alten Suchwörter („projekt“, „projekte“, „workspace“) bleiben stehen, damit die Fläche auffindbar bleibt |
| `public/settings-surface.js` | Auswahl „Beim Öffnen anzeigen“ |
| `public/icon-nutzung.js` | Anzeigename des Nav-Eintrags |
| `public/i18n/*.js` (14 Sprachen) | Schlüssel `"Projekte"` → `"Arbeitsbereich"` mit übersetztem Wert (Workspace, 工作区, Espace de travail …) |

**Nicht geändert:** interne IDs (`projects`, `#projectCreate` …) und die Route
`/projects` — reine Anzeige-Umbenennung, keine Verhaltensänderung.

## Nachweis

- Live im lokalen Browser geprüft: Nav, Überschrift und Fenstertitel zeigen
  „Arbeitsbereich“ / „Lokale Dateien und Snapshots“; die Chat-Projekte im
  Verlauf funktionieren unverändert (Gruppe „📁 Reise“ mit Karte).
- `tests/i18n-ui.test.mjs`: der Schlüsselsatz bleibt über alle 14 Sprachen
  identisch. Der dort weiterhin gemeldete verwaiste Schlüssel
  („Baue mir eine kleine Web-App“) stammt aus den Beispiel-Chips einer
  Parallelsitzung und war **vor** dieser Änderung bereits rot (gegen `4c8e415`
  nachgestellt) — nicht Teil dieser Freigabe.

## Hinweis zum Einfrieren

`--freeze` erst ausführen, wenn `git status` für alle gesperrten Pfade sauber
ist. Am 2026-08-13 hat eine Parallelsitzung im Commit `88c69c4` eine
halbfertige Zwischenfassung dieser i18n-Dateien mitcommittet (`git add -A`);
die korrigierte Endfassung steht im Folgecommit.
