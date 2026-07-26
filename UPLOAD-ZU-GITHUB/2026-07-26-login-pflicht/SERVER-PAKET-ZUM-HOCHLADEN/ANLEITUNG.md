# Server-Update in 3 Schritten (Magic-Link-Fix live bringen)

Der Produktions-Deploy-Schutz laesst diese Schritte bewusst nur den Betreiber
ausfuehren (so schon dokumentiert am 2026-07-13). Alles ist vorbereitet.

## Schritt 1 — Paket nach IDrive e2 hochladen — ERLEDIGT (2026-07-26)

Das Paket liegt geprueft und unveraendert auf IDrive e2:

```
s3://smejj-model-files/deployments/control/smejj-control-magiclink-fix-2026-07-25-rc1/smejj-control-context.tar.gz
SHA-256   2445eed255245add52ae98d6cde394a04c644abfb3371c86ce7883c6431e5f0c
Groesse   1.302.172 Bytes
```

Ueber die Weboberflaeche: IDrive e2 → Buckets → **smejj-model-files** →
deployments → **control** → `smejj-control-magiclink-fix-2026-07-25-rc1`.

Die `.tar.gz` ist deshalb **nicht mehr im Git-Repo** — GitHub Free ist nur fuer
Code, grosse Artefakte gehoeren nach IDrive e2
(`docs/architecture/FREE_ONLY_MASTER_POLICY.md`). Wer die Datei noch einmal
braucht, holt sie aus IDrive e2 (Pfad oben) oder aus der Git-Historie von
Commit `7f2ad71`.

## Schritt 2 — Zwei Werte im Salad-Portal setzen

portal.salad.com → Container Groups → **smejj-control** → **Edit**
→ Environment Variables → diese ZWEI Werte ersetzen:

```
SMEJJ_CONTROL_ARTIFACT_KEY
deployments/control/smejj-control-magiclink-fix-2026-07-25-rc1/smejj-control-context.tar.gz
```

```
SMEJJ_CONTROL_ARTIFACT_SHA256
2445eed255245add52ae98d6cde394a04c644abfb3371c86ce7883c6431e5f0c
```

**Nichts anderes anfassen.** `SMEJJ_CONTROL_BOOTSTRAP_URL` bleibt unveraendert.

## Schritt 3 (optional, gleicher Vorgang) — GitHub-Login aktivieren

Im selben Salad-Formular zwei NEUE Variablen hinzufuegen:

```
SMEJJ_GITHUB_LOGIN_CLIENT_ID
Ov23liSqth5JlAHAtaZV
```

```
SMEJJ_GITHUB_LOGIN_CLIENT_SECRET
<auf github.com erzeugen: Settings → Developer settings → OAuth Apps
 → "smejj.com Login" → "Generate a new client secret">
```

Danach speichern und deployen.

## Rollback (falls etwas nicht startet)

Im Salad-Portal `SMEJJ_CONTROL_ARTIFACT_KEY` und `SMEJJ_CONTROL_ARTIFACT_SHA256`
auf die vorherigen Werte zuruecksetzen (Salad zeigt den Versionsverlauf) und
erneut deployen. Das alte Paket bleibt in IDrive unveraendert liegen.

## Danach

Claude Bescheid geben — Live-Tests (Magic-Link mit >2 Minuten Wartezeit,
GitHub-Login Ende-zu-Ende, Gesundheitscheck) und Abschlussbericht folgen
automatisch.

## Nachweis zum Paket

- Gebaut aus Commit `89fab38` (Branch feature/auth-redesign-github-magiclink)
- 579 Dateien, deterministisch, `secretsIncluded: false`
- Enthaelt den Handoff-Verfall-Fix (geprueft: `sessionHandoffStore.start`
  im Verify-Pfad von `control-server/src/routes/magicLinkRoutes.js`)
- 10 Unit-Tests gruen (magic-link + session-handoff)
