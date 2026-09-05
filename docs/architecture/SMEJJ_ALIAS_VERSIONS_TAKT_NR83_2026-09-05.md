# Alias „smejj" und smejj-Versions-Takt (Autopilot Nr. 83) — Stand 2026-09-05

Betreiber-Auftrag 2026-09-05: „Wenn eine neue Version kommt, soll sie automatisch
alles übernehmen … alles über unsere Autopilots." Wahl: „Alias smejj im Router bauen",
„in einen Autopiloten reinbauen oder einen neuen bauen".

## 1. Wie es professionell geht (und jetzt gebaut ist)

| Baustein | Aufgabe | Datei |
|---|---|---|
| Alias `smejj` | Nutzer und API-Keys zeigen nie auf eine Versionsnummer. `smejj`, `smejj-latest`, `smejj 1.0` sind Markennamen: „das Modell der Plattform". | `src/shared/modelRegistry.js` (BRAND_ALIASES) |
| Versionsregister | e2 `smejj/versionen/register.json`: `stable`, `live`, `liveGrund`, alle Versionen mit Status (stable, ersetzt, abgelehnt, zurückgerollt), Verlauf. Nichts wird gelöscht. | `src/shared/smejjVersionen.js` |
| Entscheidung | Adapter besser als Basis nackt, mehr als 2 Punkte über der bisherigen stable, null kritische Sicherheitsfehler. Fail-closed. | `entscheideBefoerderung()` |
| Zwei Stufen | `stable` = beste eigene Version. `live` = Alias darf auf sie zeigen, nur wenn die Note die Referenz der Live-Kette (Nr. 72/75) erreicht. | `liveTauglich()` |
| Router | `resolveModelSelection({ aliasZiel })`: greift NUR bei Anfragen ohne ausdrückliche Anbieterwahl; ein gewählter Anbieter bleibt eine Wahl. Standardmodell bleibt in der Kette als Rückfall. | `src/shared/modelRegistry.js`, `control-server/src/llm/modelRouter.js` |
| Prozess-Stand | Der Router ist synchron, das Register liegt in e2: `smejjAlias.js` hält den Stand im Speicher, Nr. 83 führt ihn nach. Ohne Stand: Alias AUS. | `control-server/src/llm/smejjAlias.js` |
| Laufzeit-Anbindung | Registry-Modell `smejj-1` (Qwen3-4B-Instruct-2507 + Adapter), fail-closed: `SMEJJ_1_ENABLED` + `SMEJJ_LLM_SMEJJ1_BASE_URL` + `SMEJJ_LLM_SMEJJ1_API_KEY`. | `.env.example` |
| Autopilot Nr. 83 | Alle 30 min: Register lesen, neue Bewertungen entscheiden, umhängen, Live nach Gesundheit schalten, Register schreiben, Router-Stand setzen. | `control-server/src/autopilots/smejjVersionsTaktAutopilot.js` |
| Bewertung | Das Mess-Skript legt je Messjob `smejj/bewertungen/<jobId>.json` mit Status `neu` ab; Nr. 83 entscheidet, nicht das Skript. | `scripts/training/smejj-1-1-messen.mjs --bewerten` |
| Rückweg | Automatisch: rote Laufzeit → Alias AUS im nächsten Takt. Von Hand: `smejj-alias.mjs --zurueck` / `--live aus`. | `scripts/training/smejj-alias.mjs` |
| Sichtbarkeit | `/api/health` → `smejjAlias: { modelId, version, live, grund }`; Ampel Nr. 83 im Adminbereich „Modelle & Wissen". | `aiAvailability.js` |

## 2. Ehrlicher Stand

- **Es gibt noch keine Laufzeit für smejj 1**: kein Dauerdienst, der Basis + Adapter
  OpenAI-kompatibel bedient (Salad läuft nur im Job-Betrieb). Bis dahin bleibt der Alias
  sichtbar AUS mit Grund „SMEJJ_1_ENABLED nicht gesetzt" — Nutzer bekommen weiter GLM-5.2.
- **Die Referenz der Live-Kette liegt bei 100 %** (Nr. 75 laut Nr. 72). Ein 4B-Modell mit
  LoRA wird sie nicht sofort erreichen; dann ist die Version `stable` (beste eigene), aber
  nicht `live`. Das ist gewollt: kein eigenes Modell übernimmt Nutzer, nur weil es unseres ist.
- **Nr. 18 (Release-Verwalter)** bleibt unverändert im Register (Nummern eingefroren); seine
  Idee lebt jetzt in Nr. 83 mit echtem Register, echter Messung und echtem Router.

## 3. Nächste Schritte

1. Betreiber-Doppelklick „smejj.com Nr. 83 Admin-Lock stempeln.command" (opsAutopilotenBereiche.js ist gesperrt).
2. Push des Bauzweigs → Zeabur-Bau → Ampel Nr. 83 grün, `/api/health.smejjAlias` sichtbar.
3. Laufzeit für smejj 1 bauen (Salad Container Group mit vLLM/llama.cpp, Adapter aus e2) und die drei Env-Werte setzen — erst dann kann der Alias LIVE gehen.
