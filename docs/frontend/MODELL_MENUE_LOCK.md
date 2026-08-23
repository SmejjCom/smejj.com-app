# Modell-Listen-Lock (100 % Schutz)

**Angeordnet vom Betreiber am 2026-08-23, im Wortlaut:**

> „Genau diese Liste ich will haben und musst du sichern soll nicht geändert
> werden nicht kaputt gemacht werden ohne meine schriftliche Bestätigung.“

Ab sofort gilt: an der Modell-Liste wird **nichts** geändert, verkürzt,
umsortiert oder abgeschaltet, solange keine ausdrückliche schriftliche
Bestätigung des Betreibers vorliegt.

---

## Was genau geschützt ist

Live gemessen am 2026-08-23 im angemeldeten Chrome des Betreibers auf
`https://smejj.com`. Es sind **zwei** Menüs, und beide zeigen dieselbe lange
Liste — sie kommen nur an unterschiedlichen Stellen aus der Oberfläche.

### 1. Start-Picker → „Coding-Agent (Cline) ▸"

Datei: `public/cline-model-menu.js`

| Reihenfolge | Inhalt |
|---|---|
| ganz oben | **Auto** (aktiv, mit Häkchen) |
| Gruppe | **Cline Pass** — kimi-k2.6, deepseek-v4-pro, qwen3.8-max, deepseek-v4-flash, glm-5.2, kimi-k3, qwen3.7-plus, minimax-m3, kimi-k2.7-code, glm-5.3, mimo-v2.5-pro, mimo-v2.5 |
| Gruppe | **Empfohlen** — kimi-k3, claude-opus-5, gpt-5.6-sol |
| ganz unten | „Alle Modelle & Key → Einstellungen" |

### 2. Code-Fläche → Modellknopf unten rechts

Datei: `public/code-modell-menue.js`

| Reihenfolge | Inhalt |
|---|---|
| 1. | **Auto** (aktiv) |
| 2. | smejj 1.0 |
| 3.–16. | Opus 5, GPT 5.6, GLM 5.3, Kimi K3, Deepseek V4 Pro, Qwen 3.8 Max, Kimi K2.7 Code, Minimax M3, Deepseek V4 Flash, GLM 5.2, Mimo V2.5 Pro, Qwen 3.7 Plus, Kimi K2.6, Mimo V2.5 |

Die Reihenfolge der 14 stammt aus der Betreiber-Freigabe vom 2026-08-17
(„smejj 1.0 zuerst, dann nach Stärke/Beliebtheit").

---

## Der Punkt, den man leicht übersieht

**Die lange Liste steht nicht im Code.** Sie wird bei jedem Öffnen frisch von
`GET /api/providers/cline/models` geholt. Ein Schutz, der nur die zwei
Menü-Dateien einfriert, wäre halb blind: bleibt die Antwort leer, baut das
Menü stillschweigend eine kurze Liste — ohne Fehlermeldung, ohne rote Ampel.

Darum stehen der Katalog-Holer und seine Route mit unter Schutz.

---

## Die zwei Schlösser

| Schloss | Datei | Was es prüft |
|---|---|---|
| Dateisperre | `scripts/check-modell-menue-lock.mjs` | Byte-genaue Hashes der 6 Dateien. Jede Änderung schlägt an. |
| Struktur-Wächter | `tests/modellmenue-lock.test.mjs` | Ob die Liste noch *funktioniert*: Auto oben, Gruppenfolge, Katalog-Nachbau vorhanden, kein Deckel auf der Länge, Quelle = Auslieferung. |

Beide werden gebraucht. Die Dateisperre meldet jede Änderung, sagt aber nichts
darüber, ob die Liste noch lebt. Der Struktur-Wächter meldet den Ausfall, lässt
aber harmlose Umbauten durch.

### Geschützte Dateien

```
public/cline-model-menu.js                          Untermenü mit der langen Liste
public/code-modell-menue.js                         Menü der Code-Fläche
public/assets/cline-model-menu.js                   ausgelieferte Kopie
public/assets/code-modell-menue.js                  ausgelieferte Kopie
control-server/src/providers/clineClient.js         holt den Katalog, hält den Vorrat
control-server/src/routes/providerRoutes.js         Endpunkt /api/providers/cline/models
```

---

## Prüfen

```bash
npm run check:modell-menue-lock
```

Läuft auch als Teil von `npm run check:all` und `npm run check:frontend`.

## Ändern — nur mit schriftlicher Bestätigung

1. Bestätigung des Betreibers einholen, **Wortlaut aufbewahren**.
2. Änderung umsetzen, alle Check-Suiten grün bekommen.
3. Neu einfrieren:

```bash
node scripts/check-modell-menue-lock.mjs --freeze --confirm "<Wortlaut des Betreibers>"
```

Ohne `--confirm` verweigert das Einfrieren den Dienst. Der Wortlaut landet im
Manifest `docs/approvals/modell-menue-lock-manifest.json` und ist damit
nachlesbar — nicht nur im Chatverlauf.

---

## Was dieser Lock **nicht** kann

Er schützt unseren Code, nicht den fremden Katalog. Wirft Cline selbst ein
Modell aus dem Angebot, verschwindet es aus der Liste, ohne dass hier eine
Datei anders wird. Dagegen hilft nur Messen:
`npm run check:funktionen-live` prüft, ob der Endpunkt antwortet.
