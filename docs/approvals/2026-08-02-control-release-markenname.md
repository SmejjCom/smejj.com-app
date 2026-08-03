# Freigabe-Nachweis — Control-Server-Release 2026-08-02

Der Release-Builder schreibt in jedes Manifest `productionDeployAuthorized: false`
und `separateApprovalEvidenceRequired: true`. Die Freigabe wird deshalb hier
getrennt festgehalten, nicht im Artefakt.

## Wortlaut des Betreibers

```
FREIGABE Control-Server-Release, 2026-08-02

Ich gebe den Produktions-Release des Control Servers frei.

Artefakt:   smejj-control-markenname-2026-08-02.tar.gz
sha256:     09e559dce6e3ee0df80d91f157729d0e1ab343f04481fcd01034493f55883e61
Umfang:     929 Dateien, 2 086 227 Bytes, secretsIncluded: false
Ziel:       Salad-Container smejj-control (redbean-caesar-...salad.cloud)

Mir ist bekannt und ich stimme zu:
- Der Release enthaelt ausser den Modellwahl-Korrekturen (228743b, 0c4654a)
  auch die committeten Aenderungen der Parallelsitzung (fd442f0, b92502d).
- Das derzeit live laufende Artefakt stammt vom 2026-07-30; der Release holt
  alle Korrekturen seither nach.
- Es entstehen keine neuen Kosten und kein neuer Anbieter. Kimi K2.7 ist
  bereits aktiviert, konfiguriert und bezahlt (BYOK).
- Der Container startet dabei neu; kurze Nichterreichbarkeit ist in Ordnung.
- Rueckweg: SMEJJ_CONTROL_ARTIFACT_KEY und SMEJJ_CONTROL_ARTIFACT_SHA256
  zurueck auf die Werte aus backups/salad/smejj-control-2026-08-02-vor-auto-schalter.json.
  Bei Fehlschlag sofort zurueckrollen, ohne Rueckfrage.

Betreiber smejj.com
```

## Was freigegeben wurde

| Feld | Wert |
|---|---|
| Artefakt | `smejj-control-markenname-2026-08-02.tar.gz` |
| sha256 | `09e559dce6e3ee0df80d91f157729d0e1ab343f04481fcd01034493f55883e61` |
| Dateien | 929 |
| Groesse | 2 086 227 Bytes |
| Geheimnisse enthalten | nein (`secretsIncluded: false`) |
| Ziel | Salad-Container `smejj-control` |

## Vorpruefungen vor der Freigabe

- `check:all` vollstaendig gruen
- `check:release-imports` OK — 175 Dateien transitiv geprueft, 2 Laufzeit-Ressourcen bestaetigt
- `release:guard` OK — GitHub Free, GitHub Pages, IDrive e2, Salad pay-per-use
- `check:guidelines` OK — 1240 Dateien

## Rueckweg

Der Container zieht sein Artefakt ueber zwei Umgebungswerte. Zuruecksetzen
bedeutet, beide auf den Stand vor dem Release zu stellen:

| Variable | Wert vor dem Release |
|---|---|
| `SMEJJ_CONTROL_ARTIFACT_KEY` | `deployments/control/smejj-control-projektion-b-2026-07-30.tar.gz` |
| `SMEJJ_CONTROL_ARTIFACT_SHA256` | `0cfa79d362cb8ff6ad20a465abbefc6111f6b18c3e9f4bc9ab6c1a0ccd6482b0` |

Vollstaendige Container-Beschreibung vor der Aenderung:
`backups/salad/smejj-control-2026-08-02-vor-auto-schalter.json` (nicht im Git,
enthaelt Zugangsdaten).

## Durchfuehrung und Ergebnis (2026-08-02)

1. Artefakt nach IDrive e2 hochgeladen:
   `s3://smejj-model-files/deployments/control/smejj-control-markenname-2026-08-02.tar.gz`
   — `created: true`, `immutable: true`, `contentVerified: true`,
   `overwriteProofStatus: 412` (der Ueberschreibschutz wurde nachgewiesen).
2. Container `smejj-control` auf das neue Artefakt gezeigt (PATCH mit der
   VOLLSTAENDIGEN Variablenliste): Version 129 -> 130, alle 77 Variablen
   erhalten, `startup_probe` und `liveness_probe` unveraendert,
   `SMEJJ_MODEL_DEFAULT` weiterhin `kimi-k2-7`.
3. Neustart beobachtet: eine Messung sah HTTP 503, die naechste (34 s spaeter)
   war fertig. Kurze Nichterreichbarkeit wie angekuendigt.

**Abnahme bestanden.** Ueber die echte Nutzerkette (Bruecke, `model: "smejj 1.0"`),
je 2 Durchgaenge:

| Art | Ergebnis | Median | Backend |
|---|---|---|---|
| Coding | 6 von 6 | **4 537 ms** | `kimi:kimi-k2.7-code` |
| Normal | 2 von 2 | 641 ms | `groq:llama-3.1-8b-instant` |
| Websuche | 2 von 2 | 7 919 ms | `kimi:kimi-k2.7-code` |

Gesamt **10 von 10, 0 Fehler**. Coding vorher: 19 667 ms ueber
`zhipu:glm-4.7-flash` — also rund viermal schneller und beim vorgesehenen Modell.

`/api/health` bestaetigt es auch dort, wo vorher ein Widerspruch stand:
`defaultModelId`, `activeModelId` und `aiBackend` zeigen jetzt alle auf Kimi
(vorher meldete `defaultModelId` Kimi, waehrend `activeModelId` auf `glm-5-2`
stehenblieb).

Ein Rueckrollen war nicht noetig. Der Rueckweg bleibt gueltig.

## Abnahmekriterium

Nach dem Release muss eine Coding-Frage ueber die echte Nutzerkette von
Kimi K2.7 beantwortet werden (`x-smejj-model-backend: kimi:kimi-k2.7-code`) und
deutlich schneller sein als die zuvor gemessenen ~19,7 s. Wird das nicht
erreicht, wird ohne Rueckfrage zurueckgerollt.
