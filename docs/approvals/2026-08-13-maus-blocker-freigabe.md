# Freigabe: Maus-Blocker beheben (Teil 0 + Git-Bau)

Datum: 2026-08-13
Betreiber-Freigabe: per Klick in der Sitzung ("Freigabe erteilen", Bauplan
`docs/PLAN_MAUS_BROWSER_LIVE_2026-08-13.md`).

## Freigegeben ist

1. **Env-Aenderung am Dienst `smejj-control` (Salad)**, Weg
   lesen–ergaenzen–ganz-schreiben, nichts anderes wird angefasst:
   - `IDRIVE_E2_CAPSULES_BUCKET` = `smejj-model-files` (kein Geheimwert)
   - `SMEJJ_MAUS_ENGINE_TOKEN` = der Wert aus der lokalen sicheren Ablage
     (`~/.config/smejj.com/env.local`) — von der Engine nachweislich
     akzeptiert (Probe 2026-08-13: lokaler Token → 422, Salad-Token → 401).
     Der Wert erscheint nirgends im Klartext, nur als SHA-Fingerabdruck.
2. **Umstellung des Zeabur-Dienstes `smejj-maus-engine` auf Git-Bau**
   (statt eingefrorenem Abbild `ghcr.io/smejjcom/smejj-maus-engine:v1`).
   Ausfuehrung im Portal durch den Betreiber, Anleitung aus der Sitzung.
   Rueckfall: das alte Abbild v1 bleibt als Notausgang.

## Nicht freigegeben / unveraendert

- `IDRIVE_E2_BUCKET` bleibt `smejj-app`.
- Keine neuen Dienste, keine neuen Kosten.
- Vision-Stufe der Engine bleibt gesperrt (`policy.visionAllowed=false`).

## Nachweis nach Ausfuehrung

`node scripts/diagnose/maus-abgleich.mjs` muss mit Exit 0 enden;
Engine-`/health` muss das `sitzungen`-Feld tragen (neuer Code live).
