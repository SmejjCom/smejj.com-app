# Task Capsule — job_kimi_k3_api_20260728

Datum: 2026-07-28
Auftrag: "oK, baue Kimi K3 mit API ein" + "Komplett live schalten" (Wof Kadavanich)
Status: abgeschlossen, live verifiziert

## Ziel

Kimi K3 als waehlbares Modell in smejj.com, angebunden ueber die Anbieter-API,
ohne die bestehende Modellzuordnung zu verschieben.

## Die Entscheidung, die den Auftrag praegte: kein Vault in IDrive e2

Der Betreiber wollte urspruenglich die offenen Gewichte auf IDrive e2 legen und
als Fundament nutzen — so wie es bei GLM-5.2 und K2.7 gemacht wurde. Das waere
Geld ohne Gegenwert gewesen:

- K3 hat 2,8 Billionen Parameter, der Download misst je nach Quelle ~594 GB
  (nativer MXFP4-Stand) bis ~1,4 TB (Speicherbedarf im Betrieb).
- Das Modell passt weder auf eine GPU noch auf einen einzelnen 8-GPU-Knoten;
  Moonshot nennt Mehr-Knoten-Cluster als Voraussetzung.
- IDrive e2 ist Speicher, kein Rechner. Die Gewichte haetten dort gelegen und
  nichts getan, bei ~6 $/Monat Dauerkosten.

Darum traegt `kimi-k3` in der Registry bewusst `storage: null` und laeuft
ausschliesslich ueber `https://api.moonshot.ai/v1` mit `model: "kimi-k3"`.
Der e2-Vault von K2.7 und GLM-5.2 bleibt unangetastet.

## Betroffene Dateien

| Datei | Aenderung |
| --- | --- |
| `src/shared/modelRegistry.js` | Eintrag `kimi-k3`; `runtime.keyFallbackEnvPrefix` |
| `src/ai/reasoningEffortPolicy.js` | NEU — Denktiefe je Profil |
| `src/server.js` | `reasoningEffort` an `streamLLM` durchgereicht |
| `control-server/src/llm/modelRouter.js` | `reasoning_effort` nur an K3; Legacy-`moonshot` korrigiert |
| `control-server/src/routes/modelRoutes.js` | Worker-Preflight ohne Vault: 409 statt Absturz |
| `scripts/deploy/set_control_artifact_env.mjs` | Flag und Denktiefe im Release-Schalter |
| `.env.example` | Block `SMEJJ_KIMI_K3_*` |
| `tests/model-registry.test.mjs` | 8 Schutztests |
| `tests/reasoning-effort-policy.test.mjs` | NEU — 9 Tests |

## Das Key-Erbe: eine Handeingabe weniger

Im Moonshot-Konto lag bereits der Key `smejj-control-prod-20260712`, und der
Live-Control-Server meldete `kimi-k2-7` als `ready` — der Wert war also schon
ausgerollt. Ohne Erbe haette derselbe Geheimwert ein zweites Mal von Hand in
die Salad-Oberflaeche getippt werden muessen; jede Handeingabe eines Secrets
ist eine Fehler- und Leckquelle.

`runtime.keyFallbackEnvPrefix` ist generisch: greift nur, wenn fuer das Modell
gar kein eigener Key gesetzt ist, und nur zu einem ausdruecklich benannten
Schwestermodell. Eigener Key hat Vorrang. Einseitig — der K3-Key konfiguriert
K2.7 nicht.

Damit schrumpfte die Aktivierung auf genau ein Flag.

## Nebenbefund, der schon vorher da war

`handleWorkerPreflight` las `definition.storage.vaultStatusId` ohne Pruefung.
Fuer Modelle ohne e2-Vault ist `storage` null — der Aufruf stuerzte ab. Das
betraf bereits `smejj fast 1.0`, faellt aber erst mit K3 haeufiger auf.
Jetzt: sauberes 409 `model_not_vault_backed`.

## Deploy

| Schritt | Ergebnis |
| --- | --- |
| Artefakt 1 | `smejj-control-kimi-k3-2026-07-28.tar.gz`, sha `f18ff65b…`, 713 Dateien |
| Artefakt 2 | `smejj-control-k3-effort-2026-07-28.tar.gz`, sha `62bdc2dc…`, 725 Dateien |
| Auf e2 | beide `immutable: true`, `contentVerified: true` |
| Salad | Gruppe `smejj-control`, Version 95 → 96 |
| Rueckweg | `deployments/control/smejj-control-stufe2-2026-07-28.tar.gz` |
| Rollback-Punkt | `backups/rollback-2026-07-28-kimi-k3-api/before/` |

Zeabur musste nicht angefasst werden: die Bridge meldet
`multiModelRouterEnabled: true`, der Router-Schalter stand live laengst auf YES.
Die `NO`-Vorgabe in `.env.example` ist keine Auskunft ueber den Live-Stand.

## Live-Belege

- `/api/models/status`: `kimi-k3` → `active=true`, `selectable=true`,
  `runtimeConfigured=true`. Kein Key im Payload.
- Control-Server direkt: `x-smejj-model-backend: kimi:kimi-k3`,
  `x-smejj-model-fallback: false`.
- Ueber die Bruecke (echter Nutzerweg): `x-smejj-bridge: multi-model-router`,
  `kimi:kimi-k3`, Antwort "Ich bin Kimi, ein Modell von Moonshot AI."
- Auf smejj.com: "Kimi K3 · 1M Kontext · flagship · **Bereit**", waehlbar.

## Nicht-Regression

- Standardanfrage ohne Modellwahl: unveraendert Groq-Schnellspur
  (`groq:llama-3.1-8b-instant`).
- `kimi-k2-7`: unveraendert `kimi:kimi-k2.7-code`.
- `check:all` exit 0, `release:guard` exit 0.
- `check:start-lock` 31/31, `check:favicon-lock` OK — in `public/` wurde nichts
  angefasst.

## Tempo: ein Fehlalarm und was dahinter lag

Die Erstmessung ergab 11 982 ms bis zum ersten sichtbaren Zeichen — gegen das
1,0-s-Budget sah das nach einem schweren Fehler aus. Dann habe ich Prompt UND
Denktiefe gleichzeitig geaendert und daraus fast den falschen Schluss gezogen.
Eine Messung mit zwei geaenderten Variablen ist keine Messung.

Der saubere A/B (identischer Prompt, 7 Laeufe je Seite, Umschaltung ueber
`SMEJJ_LLM_KIMI_K3_REASONING_EFFORT`):

| Denktiefe | erstes sichtbares Zeichen | p95 | Ende |
| --- | --- | --- | --- |
| `max` (Modellvorgabe) | 13 856 ms | 15 656 ms | 17 345 ms |
| `low` (Regel) | **8 606 ms** | 10 018 ms | 11 051 ms |

38 % schneller. K3 mit der Regel ist rund 48 % schneller als GLM-5.2 auf
demselben Weg (16 638 ms).

## Benchmarks

| Messung | Ergebnis |
| --- | --- |
| TTFB (smejj.com, Median) | 42 ms — Budget 200 ms |
| LCP (Median / p75) | 172 ms / 596 ms — Budget 1 500 ms |
| CLS | 0 — Budget 0,1 |
| INP | 40 ms — Budget 200 ms |
| Erstes Token K3 (`low`) | 8 606 ms |

Kein Budget gerissen (Exit-Code 0). Das 1,0-s-Budget fuer das erste Token
erreicht weiterhin nur die Groq-Schnellspur (703 ms) — bei allen Deep-Lane-
Modellen offen, siehe `docs/benchmarks/BEFUND_KIMI_K3_TEMPO_2026-07-28.md`.

## Qualitaetsbewertung

Ziel erreicht: K3 ist live, waehlbar, fail-closed und ohne Regression.
Offen geblieben ist nichts am Auftrag. Ehrlich beziffertes Restrisiko: die
Wartezeit bis zum ersten Zeichen liegt bei allen Deep-Lane-Modellen weit ueber
dem 1,0-s-Budget — ein Architektur-Merkmal, kein Fehler dieser Aenderung, und
K3 ist dort schneller als das bisherige Fundament.
