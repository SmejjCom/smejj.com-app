# Freigabe: Control-Release „Admin-Step-up" (2026-08-06)

## Wortlaut des Betreibers

Auf die Empfehlung „Step-up-Authentifizierung für Admins … für schreibende
Admin-Aktionen (Löschen, Rollen) wäre eine frische Bestätigung der
professionelle Standard" antwortete der Betreiber:

> **„Ja"**

## Was es ist

Sitzungen laufen bis zu 180 Tage. Für LESEN ist das vertretbar — für Sperren,
Löschen, Rollenvergabe und Impersonation-Anträge verlangt der Server jetzt
zusätzlich einen **frischen Besitznachweis**: einen 6-stelligen Code an die
Admin-E-Mail (10 Minuten gültig, max. 5 Versuche), der ein **Schreibfenster
von 15 Minuten** öffnet. Danach schließt es sich von selbst.

Warum E-Mail-Code und nicht Passkey: WebAuthn bindet an die Domain; die
Konsole läuft auf salad.cloud, die Passkeys gehören zu smejj.com. Passkey-
Step-up wird möglich, sobald die Konsole eine smejj.com-Subdomain bekommt.

Entwurfsentscheidungen:

- Fenster in-memory (eine Replika; Neustart = Fenster zu, fail-closed).
- Reine Listen (`approvals`, `impersonation/list`) bleiben ohne Step-up.
- Ohne Mail-Zustellung entsteht kein Code (`step_up_mail_failed`, 503) —
  ein offenes Fenster bleibt davon unberührt.
- Jede Anforderung und jede Bestätigung schreibt einen Audit-Eintrag
  (`step_up.requested`, `step_up.confirmed`).
- Konsole: `api.js` fängt `admin_step_up_required` zentral ab — Code
  anfordern, abfragen, Aktion einmal wiederholen. Kein View wurde angefasst.

## Nachtrag 2026-08-06: Ausweitung + Change-Lock

Auf den Auftrag „arbeite jede Aufgabe bis zur vollständigen Fertigstellung …
nach Abschluss aktiviere einen Change-Lock" wurde der Umfang erweitert:

- **Stufe-4-Schreibrouten** (Moderation, DSGVO, Ankündigungen, Feature-Flags,
  Aufgaben) verlangen jetzt ebenfalls ein offenes Step-up-Fenster. Lesen
  bleibt frei. Damit ist **jede** ändernde Adminroute abgedeckt.
- **Change-Lock** `scripts/check-admin-lock.mjs` (admin lock v1) friert die
  12 Dateien der Adminbereich-Sicherheitskette byte-genau ein. Eigenes
  Manifest, weil Start- und Security-Lock `public/` in einem anderen Takt
  einfrieren; überschneidungsfrei per Test zugesichert.
- Der Ersatz-Release trägt daher die Id `…-stepup-v2-…`; das zuerst gebaute
  Artefakt `…-stepup-…` (sha `78b6f6e4…`) wurde nie ausgerollt und ist
  gegenstandslos.

Neues Artefakt: `smejj-control-admin-stepup-v2-2026-08-06`,
sha256 `66ab8e9c6b4b0bbc414fde1f37025eeadd2bc7ba854273749ebf07bb824b600e`,
1022 Dateien, 2.398.690 Bytes, `secretsIncluded: false`.
Basis: laufendes Live-Artefakt `smejj-control-erfassung-erreichbar-2026-08-05`
(Salad 149, 91 Variablen). `diff -rq` gegen Live: genau 7 Dateien + Manifest.
45/45 Tests grün im entpackten Release-Baum.

## Umfang — fünf Dateien (Erstfassung, siehe Nachtrag oben)

Basis ist das **laufende Live-Artefakt**
`deployments/control/smejj-control-erfassung-erreichbar-2026-08-05.tar.gz`
(Salad-Version 149, 91 Variablen), heruntergeladen und SHA-geprüft. Die drei
geänderten Dateien sind in der Basis byte-identisch mit Repo-HEAD vor der
Änderung — nichts Fremdes zu mergen.

| Datei | Änderung |
| --- | --- |
| `control-server/src/admin/stepUp.js` | neu: Code-Erzeugung, Bestätigung, Fensterverwaltung |
| `control-server/src/routes/adminWriteRoutes.js` | Step-up-Routen + Fenster-Pflicht vor jeder ändernden Aktion |
| `control-server/src/routes/adminWriteRoutes.test.js` | Testaufbau öffnet das Fenster für die Test-Admins |
| `control-server/src/routes/adminStepUp.test.js` | neu: 7 Tests (Abweisung, Listen frei, Vollfluss, Mail-Ausfall, Ablauf, Fehlversuche, Selbstschluss) |
| `control-server/admin-ui/api.js` | zentraler Step-up-Fluss + Fehlertexte |

## Artefakt

- Release-Id: `smejj-control-admin-stepup-2026-08-06`
- sha256: `78b6f6e4784bd766968b70452df9ccfd48dd08001fcea56e7fc6aeb92b2ac688`
- 1022 Dateien, 2.398.319 Bytes, `secretsIncluded: false`

## Nachweise vor dem Upload

- `diff -rq` entpacktes Live-Artefakt ↔ entpacktes neues Artefakt: genau die
  fünf Dateien + Manifest.
- 26/26 Tests grün **im entpackten Release-Baum** (Step-up, Schreibrouten,
  Vortür).

## Nachweise nach dem Ausrollen

Ausgerollt am 2026-08-06 als Salad-Version **150**, 91 Variablen unverändert,
`previousArtifactKey` = `smejj-control-erfassung-erreichbar-2026-08-05`
(sha `f3660899…` — das ist der Rückweg). Upload `created: true`,
`immutable: true`.

**Live gegen die Produktion gemessen** (Sitzungs-Token aus dem Salad-Env,
`method: "local-e2e"`, TTL 5 min):

| Prüfung | Ergebnis |
| --- | --- |
| `GET /api/admin/me` | 200, Rolle `owner`, Stufe 8 — Lesen bleibt frei |
| `GET /api/admin/flags` | 200 — Stufe-4-Lesen bleibt frei |
| `POST …/actions/block` ohne Fenster | **403 `admin_step_up_required`** |
| `POST /api/admin/flags/setzen` ohne Fenster | **403 `admin_step_up_required`** |
| `POST /api/admin/step-up/confirm` ohne Anforderung | 403 |
| Vortür: 160 parallele Anfragen an `/admin` | **70× 429** gedrosselt |

**Mail-Durchstich bewiesen** — die kritische Frage war, ob ein Admin nach
diesem Release überhaupt noch schreiben kann:

- SMTP auf dem Server vollständig gesetzt (`smtp.gmail.com:465`, Absender
  `smejjcom@gmail.com`).
- `POST /api/admin/step-up/request` → **200**, „Code an die Admin-Adresse
  geschickt", `gueltigSek: 600`.
- Im **Live-Audit-Log** steht der Eintrag `step_up.requested` |
  `smejjcom@gmail.com` | `2026-08-06T10:56:26.902Z`.

Ohne diesen Nachweis wäre der Adminbereich schreibunfähig gewesen, ohne dass
es jemand vor dem ersten echten Löschversuch gemerkt hätte.

## Change-Lock

`scripts/check-admin-lock.mjs` (admin lock v1) friert **12 Dateien** der
Adminbereich-Sicherheitskette byte-genau ein. Manifest:
`docs/security/admin-lock-manifest.json`, eingefroren 2026-08-06T10:50:15Z mit
dem Wortlaut des Betreibers. Verdrahtet in `npm run check:all` und in
`tests/dateisperren.test.mjs` als echter Prozess geprüft (die Sperre schlägt
an einer geänderten `stepUp.js` an und nennt die Datei).

## Rücknahme

Zeiger zurück auf `smejj-control-erfassung-erreichbar-2026-08-05.tar.gz`
(Salad-Env `SMEJJ_CONTROL_ARTIFACT_KEY` + `_SHA256`). Kein Datenverlust,
keine Migration.
