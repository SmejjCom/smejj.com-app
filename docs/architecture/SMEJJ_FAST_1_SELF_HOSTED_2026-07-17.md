# smejj fast 1.0 — eigenes, selbst gehostetes Modell (2026-07-17)

Status: Router-Anbindung IMPLEMENTIERT und getestet, Laufzeit NOCH NICHT gestartet
(kostet Geld -> braucht Freigabe mit exaktem Betrag). Freigabe-Stand: Betreiber hat
Option 3 ("kleines eigenes Modell, ~3-10 EUR/Tag GPU-Miete") schriftlich gewaehlt
("3" + "Ja", Wof Kadavanich, 2026-07-17). Exakter Betrag siehe unten.

## Warum ueberhaupt

Live gemessen am 2026-07-17 gegen die Produktion: Chat-Antwort 3,7-5,4 s,
Zeit bis zum ersten Wort (TTFT) 3,6-8,5 s. Ursache ist NICHT der eigene Code —
Streaming laeuft, GLM-Thinking ist im Chat bereits abgeschaltet (src/server.js:503).
Die Wartezeit entsteht auf den Servern von Z.ai. Dort gibt es keinen kostenlosen Hebel.

Ehrliche Konsequenz: GLM-5.2 hat 753B Parameter. Selbst betrieben braeuchte es
~8x H100/H200 dauerhaft (grob 15.000-25.000 EUR/Monat). "Blitzschnell UND eigenes
Modell" geht nur mit einem KLEINEN Modell.

## Architekturentscheidung

Zwei Modelle, klar getrennte Rollen — GLM-5.2 wird NICHT ersetzt:

| Profil | Modell | Wo | Warum |
|---|---|---|---|
| `fast` (kurze Anfragen <80 Zeichen) | smejj fast 1.0 | eigene Salad-GPU | Tempo |
| `coding`, `reasoning`, `web`, `default` | GLM-5.2 | Z.ai-API (BYOK) | Qualitaet |

Der Router ist bereits modell-agnostisch (`resolveModelSelection` +
`resolveModelRequest`); es kam KEIN neuer Architektur-Baustein dazu — nur ein
Registry-Eintrag plus eine Profil-Regel. Das entspricht dem Master-Prompt
("neue Modelle nur als neue Router-Eintraege, ohne Architekturaenderung").

## Basismodell (online verifiziert am 2026-07-17)

- Quelle: `Qwen/Qwen3-Coder-30B-A3B-Instruct` (HF-API abgefragt, nicht geraten)
- Lizenz: **Apache-2.0** -> kommerzielle Nutzung UND Fine-Tuning erlaubt
  (wichtig: spaeteres smejj-1-0-Fine-Tuning auf dieser Basis ist zulaessig)
- Groesse: 30,53 Mrd. Parameter gesamt, **~3 Mrd. aktiv pro Token** (MoE)
  -> Antworttempo eines 3B-Modells bei der Qualitaet eines 30B-Modells
- Kontext: 262.144 Token
- Laufzeit-Gewichte: AWQ-4bit (~18 GB) — passt auf eine 24-GB-Karte
- FP8-Variante (`...-Instruct-FP8`, sha dcaee4d4) waere ~30 GB -> passt NICHT auf 24 GB

Verworfen: `Qwen/Qwen3-Coder-Next-FP8` — 79,7 Mrd. Parameter / ~80 GB. Zu gross
fuer eine bezahlbare Einzelkarte (haette 2x A100 80GB gebraucht).

## Kosten — echte Portal-Preise (Salad, ausgelesen 2026-07-17)

Preis pro Stunde je Prioritaet (24-GB-Klasse und groesser):

| GPU | Lowest | Low | Medium | High |
|---|---|---|---|---|
| RTX A5000 (24 GB) | $0,09 | $0,143 | $0,197 | $0,25 |
| RTX 3090 Ti (24 GB) | $0,10 | $0,16 | $0,22 | $0,28 |
| RTX 5090 Laptop (24 GB) | $0,10 | $0,16 | $0,22 | $0,28 |
| RTX 4090 (24 GB) | $0,16 | $0,207 | $0,253 | $0,30 |
| RTX 5090 (32 GB) | $0,25 | $0,31 | $0,38 | $0,45 |

**Empfehlung: 1x RTX 4090 (24 GB), Prioritaet "Lowest"**
= $0,16/h x 24 h = **$3,84/Tag ~ 3,53 EUR/Tag ~ 107 EUR/Monat**
(unteres Ende des freigegebenen Rahmens von 3-10 EUR/Tag)

Begruendung: 24 GB reichen fuer AWQ-4bit (~18 GB) plus ~30-40K Kontext.
"Lowest" ist vertretbar, WEIL der Router bei Ausfall automatisch auf GLM-5.2
zurueckfaellt (kein Totalausfall, nur voruebergehend langsamer). Das Muster
"Lowest + Redundanz" laeuft beim Control-Server bereits stabil.

Skalierungsoption spaeter: 2 Replicas (= 7,05 EUR/Tag) fuer Dauer-Warmhaltung,
oder RTX 5090 32 GB (5,50 EUR/Tag) fuer mehr Kontext.

WICHTIG: Die GPU kostet rund um die Uhr, auch wenn niemand chattet. Das ist der
Preis fuer "immer warm = sofort schnell".

## Implementierung (fertig, im Repo)

- `src/shared/modelRegistry.js`: neuer Eintrag `smejj-fast-1`
  (`enabledByDefault: false`, `featureFlag: SMEJJ_FAST_1_ENABLED`,
  `fallbackModelId: glm-5-2`, `envPrefix: FAST`, Header `Salad-Api-Key`).
- `src/shared/modelRegistry.js` / `autoModelId()`: Profil `fast` waehlt
  `smejj-fast-1` NUR wenn Flag gesetzt UND Runtime vollstaendig konfiguriert ist.
- `tests/model-registry.test.mjs`: 7 neue Schutz-Tests (siehe unten).
- `.env.example`: Block `smejj fast 1.0` mit allen Werten, alle fail-closed auf NO.

Fail-closed-Kette (dreifach abgesichert):
1. `SMEJJ_FAST_1_ENABLED` nicht "YES" -> Modell inaktiv.
2. `SMEJJ_LLM_FAST_BASE_URL` oder `SMEJJ_LLM_FAST_API_KEY` fehlt -> `configured: false`.
3. `SMEJJ_MODEL_AUTO_ENABLED` nicht aktiv -> Profil-Routing greift gar nicht.
Jeder dieser Faelle landet automatisch bei GLM-5.2.

## Tests

`node --test tests/model-registry.test.mjs` (7 neue Tests, alle gruen):
- inaktiv ohne Konfiguration (fail-closed)
- greift NICHT ohne BASE_URL (auch mit Flag)
- greift NICHT ohne API-Key (auch mit Flag + URL)
- uebernimmt Profil `fast` nur bei vollstaendiger Konfiguration
- verdraengt GLM-5.2 NICHT bei coding/reasoning/default/web
- nutzt Salad-Header + Apache-2.0-Basismodell
- bleibt aus, wenn Feature-Flag ausgeschaltet ist

Gesamtlauf Router-/Modell-Suiten: 43/43 gruen.

## Offene Schritte bis live (in Reihenfolge)

1. **Freigabe des exakten Betrags** (3,53 EUR/Tag, RTX 4090, Lowest) — steht aus.
2. Container-Image mit vLLM + eingebackenen AWQ-Gewichten nach ghcr.io
   (Gewichte INS IMAGE backen, nicht bei jedem Node-Start 18 GB laden —
   sonst kostet jeder Reallocate mehrere Minuten Kaltstart).
3. Salad Container Group anlegen (GPU RTX 4090, Prioritaet Lowest,
   Container Gateway an, Health-Probe auf `/health`).
4. `SMEJJ_LLM_FAST_BASE_URL` + `SMEJJ_LLM_FAST_API_KEY` + `SMEJJ_FAST_1_ENABLED=YES`
   + `SMEJJ_MODEL_AUTO_ENABLED=YES` in die Control-Server-ENV (Salad) -> neue Version.
5. Live-Messung: TTFT vorher/nachher gegen dieselbe Anfrage, Ergebnis hier eintragen.

## Gefundener Fremdbefund (NICHT von dieser Runde verursacht)

`tests/model-promotion.test.mjs` schlaegt fehl: `protected_asset_digest_mismatch`
fuer `scripts/validate-manifests.mjs`, `scripts/check-guidelines.mjs` und
`tests/training-manifest-policy.test.mjs`. Diese drei Dateien wurden in einer
FRUEHEREN Runde am 2026-07-17 (12:51 / 13:31) legitim geaendert, ohne die
gepinnten Digests in `idrive-layout/manifests/evaluations/phase1-foundation-benchmark.json`
nachzuziehen. Die Aenderungen dieser Runde (16:54) sind NICHT die Ursache.

Das Suite-Manifest ist `"immutable": true` / `"overwriteAllowed": false` — also ein
Schutz-Artefakt. Es wird deshalb NICHT eigenmaechtig editiert. Sauberer Weg:
neue Suite-Version `2026-07-17.1` mit neu berechneten Digests und neuem
`versionedObjectKey` anlegen. **Braucht schriftliche Freigabe** (Schutz-Lock).
