# Bauplan: Maus bedient den Browser wie ChatGPT / Claude / Gemini

Stand: 2026-08-13. Ziel: Maus kann einen Browser echt bedienen (Seiten oeffnen,
klicken, tippen, Fehler erkennen und beheben) — professionell nach dem Muster
der grossen Anbieter.

## Wie es die Profis machen (Kurzfassung)

Alle drei arbeiten nach derselben Schleife: **Sehen → Planen → Handeln → Pruefen**.

| Anbieter | Browser | Steuerung |
|---|---|---|
| ChatGPT (Agent) | eigener Chromium in einer Cloud-Sandbox | DevTools-Protokoll + Screenshots |
| Claude (in Chrome) | der echte Chrome des Nutzers | Browser-Erweiterung, liest Seitenstruktur |
| Gemini (Mariner) | der echte Chrome des Nutzers | Browser-Erweiterung |

smejj hat fuer BEIDE Wege schon Code:

- **Weg A — eigener Cloud-Browser**: `workers/maus-engine/` (Playwright +
  Chromium, deterministischer Plan-Interpreter, Sitzungs-Lease, Screencast,
  interaktive Schleife). Laeuft als Zeabur-Dienst `smejj-maus-engine`.
- **Weg B — Nutzer-Chrome**: `extensions/smejj-maus-bruecke/` (Erweiterung mit
  Freigabe-Seite). Spaeterer Ausbau, nicht Teil dieses Plans.

**Empfehlung: Weg A zuerst live bringen.** Der Dienst existiert schon, es
entstehen KEINE neuen Kosten. Es sind nur zwei Blocker offen.

## Die zwei Blocker (beide bekannt, beide klein)

**Frisch nachgemessen am 2026-08-13 — beide bestehen weiterhin:**
`maus-abgleich.mjs` endet mit Exit 2 (Token abgelehnt 401, Eimer verschieden);
das Live-`/health` der Engine hat kein `sitzungen`-Feld, der Repo-Stand schon
→ die Engine laeuft nachweislich noch auf dem alten Abbild v1.

### Blocker 1 — "Teil 0": zwei Umgebungswerte beim Control-Server
Die Engine lehnt den Token des Control-Servers ab (401), und der Control-Server
liest den falschen e2-Eimer. Fix = zwei Zeilen beim Dienst `smejj-control`:

1. `IDRIVE_E2_CAPSULES_BUCKET` = `smejj-model-files`
2. `SMEJJ_MAUS_ENGINE_TOKEN` = derselbe Wert wie beim Zeabur-Dienst
   `smejj-maus-engine` (Geheimnis — nur der Betreiber kann ihn im
   Zeabur-Portal nachsehen und kopieren)

`IDRIVE_E2_BUCKET` bleibt unveraendert `smejj-app`.
Nachmessen: `node scripts/diagnose/maus-abgleich.mjs` muss mit Exit 0 enden.

### Blocker 2 — Engine haengt auf eingefrorenem Abbild
`smejj-maus-engine` laeuft aus `ghcr.io/smejjcom/smejj-maus-engine:v1`.
Aller neuer Engine-Code (z. B. die Sitzungs-Lease vom 31.07.) erreicht die
Produktion NICHT, weil niemand nach ghcr.io pushen kann.

Fix: den Dienst im Zeabur-Portal auf **Git-Bau** umstellen —
`Dockerfile.smejj-maus-engine` liegt schon im Repo, Zeabur baut dann bei jedem
Push selbst. Das passt zur Betreiber-Entscheidung "Neues nur noch auf Zeabur"
und macht die Registry dauerhaft ueberfluessig. Rueckfall: das alte Abbild v1
bleibt als Notausgang dokumentiert.

## Stand der Ausfuehrung (2026-08-13, Freigabe liegt vor)

- **ERLEDIGT**: `IDRIVE_E2_CAPSULES_BUCKET = smejj-model-files` auf
  `smejj-control` gesetzt und zurueckgelesen (Version 206 → 207).
- **OFFEN, nur Betreiber (2 Handgriffe):**
  1. Doppelklick auf **„smejj.com Maus-Token-setzen.command"** im Projektordner
     (setzt den Token; Ergebnis landet in `tmp/maus-token-setzen.log`, die
     Sitzung liest es selbst nach). Der Sitzungs-Klassifizierer blockiert das
     Token-Schreiben aus der Sitzung — das ist der Grund fuer den Handgriff.
  2. Zeabur-Portal: `smejj-maus-engine` auf Git-Bau umstellen — kompletter,
     gegen alle Fallen gepruefter Weg: `docs/deployment/MAUS_ENGINE_GIT_BAU.md`.
     (Die dortige Zurueckstellung vom 2026-07-29 ist durch die Freigabe vom
     2026-08-13 ueberholt: die Engine muss jetzt ohnehin geaendert werden.)

## Schritte in Reihenfolge

| # | Was | Wer | Dauer |
|---|---|---|---|
| 1 | Freigabe-Zettel unter `docs/approvals/` anlegen (Env-Werte + Git-Bau-Umstellung) | Sitzung | 5 min |
| 2 | Blocker 1: zwei Env-Zeilen bei `smejj-control` setzen (lesen-ergaenzen-ganz-schreiben) | Betreiber (Token) + Sitzung (Bucket-Wert, mit Freigabe) | 10 min |
| 3 | Blocker 2: `smejj-maus-engine` im Zeabur-Portal auf Git-Bau umstellen | Betreiber im Portal, Sitzung leitet an | 15 min |
| 4 | Beweis 1 (Direktlauf): `scripts/diagnose/maus-direktlauf.mjs` gegen die neue Engine | Sitzung | 15 min |
| 5 | Beweis 2 (ueber die App): Maus-Auftrag aus dem Chat, Screencast + e2-Artefakte pruefen | Sitzung | 15 min |
| 6 | Interaktive Schleife scharf: Fehler auf einer Seite erkennen → Folgeplan → beheben (wie ChatGPT Agent) | Sitzung | nach 4+5 |

## Sicherheit (bleibt wie gebaut)

- Fail-closed: ungueltiger Plan → 422; Vision bleibt gesperrt bis Phase-3-Freigabe.
- Allowlist (`allowlist.mjs`) begrenzt, welche Seiten Maus besuchen darf.
- Keine Zugangsdaten im Klartext; Geheimnisse nur ueber `secret-vault.mjs`.
- Sitzungs-Lease auf e2: nie zwei Browser fuer dieselbe Sitzung (409).

## Kosten

Keine neuen Dienste, keine neuen Kosten. Beide Blocker sind Umkonfiguration
bestehender Dienste — brauchen aber je eine ausdrueckliche Betreiber-Freigabe
(Merkregel: Aenderung an Produktionsdiensten nur mit Freigabe).
