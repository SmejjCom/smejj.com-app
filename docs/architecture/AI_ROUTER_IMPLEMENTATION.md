# AI Router Implementation

## Ziel

Der AI Router macht smejj.com KI-faehig, ohne versteckte KI-Kosten zu erzeugen.
Standard ist sicher: `disabled`.

## Modi

- `local-browser`: nur wenn WebGPU/faehige lokale Runtime erkannt wird.
- `byok-openai-compatible`: Nutzer bringt eigenen Key und eigene Kostenbeziehung mit.
- `free-demo-hardlimit`: nur wenn ein serverseitiger Hard-Limit-Zustand aktiv ist.
- `disabled`: sicherer Standard.
- `later-partner-compute`: deaktivierter Zukunftsmodus bis schriftliche Freigabe vorliegt.

## Regeln

- keine OpenAI/Kimi/Moonshot API ohne Nutzer-Key
- kein Server-Key als Standard
- kein Auto-Fallback auf Paid
- unbekannter Provider wird disabled
- Kostenrisiko wird disabled
- Free-Limit erreicht oder unklar wird disabled
- BYOK-Key wird nicht im Repo und nicht serverseitig gespeichert
- BYOK-Key darf nicht unverschluesselt dauerhaft gespeichert werden

## Server Multi-Modell-Layer

- `src/shared/modelRegistry.js` ist die zentrale Registry.
- GLM-5.2 bleibt aktiver Standard und Qualitaetsfundament.
- Kimi K2.7 ist per `SMEJJ_KIMI_K2_7_ENABLED` feature-geflaggt.
- Beide Modelle nutzen denselben OpenAI-kompatiblen Chat-/Agent-/Streaming-Pfad.
- Kimi-Ausfall faellt nur bei aktivem sicheren Fallback auf GLM-5.2 zurueck.
- Auto-Modus ist vorbereitet, aber standardmaessig inaktiv.
- IDrive e2 ist Modell-Vault, nicht Inferenz-Compute.

## Module

- `src/ai/router.js`
- `src/ai/providers.js`
- `src/ai/byok.js`
- `src/ai/localBrowser.js`
- `src/ai/disabledMode.js`
- `src/ai/freeDemoHardlimit.js`
- `src/ai/costGuard.js`
- `src/ai/promptContextBuilder.js`
- `src/shared/modelRegistry.js`
- `control-server/src/llm/modelRouter.js`
- `control-server/src/routes/modelRoutes.js`

## Tests

```sh
npm run check:ai
```
