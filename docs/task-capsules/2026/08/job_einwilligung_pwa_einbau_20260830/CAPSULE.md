# Task Capsule — job_einwilligung_pwa_einbau_20260830

**Status:** FERTIG — Trainings-Einwilligung fuer den smejj-1-1-Weg:
Befund "bereits gebaut" belegt, die EINE echte Text-Luecke (Modellreihe)
geschlossen, einwilligung-lock regelkonform neu gefroren. Alle Checks gruen.
**Rollback:** Backup `backups/einwilligung-lock/2026-08-30T18-57-36-842Z/`,
`git revert` des Commits; danach Lock erneut --freeze mit dem Wortlaut aus
docs/approvals/2026-08-30-einwilligung-pwa-text-update.md.

## Auftrag (Betreiber-Freigabe 2026-08-30, schriftlich)

"Ich finde deinen Vorschlag gut. Kannst Du umsetzen / Ich gebe dir alle Rechte
von A bis z. Mach hundert Prozent fertig. Lass nicht offen." — bezogen auf:
Einwilligungstext freigeben + Einbau der Trainings-Einwilligung in die PWA
(einziger offener Code-Schritt des smejj-1-1-Wegs).

## Der Befund, der den Auftrag veraendert hat

Recherche ergab: Die Einwilligung war BEREITS vollstaendig in die PWA gebaut
(produktiv seit ~2026-08-05/08, abgenommen):

| Schicht | Ort | Zustand |
|---|---|---|
| Oberflaeche | Konto → Datenschutz (public/account-privacy.js importiert die Consent-Funktionen aus public/account-sessions.js) | vorhanden |
| Logik | account-sessions.js: Notice-Laden (Hash-Validierung), Grant mit ALLEN drei Teil-Einwilligungen, Widerruf mit withdrawalId (Art. 7 Abs. 3 DSGVO), Decision-Abfrage | vorhanden |
| Endpunkte | control-server trainingConsentRoutes (notice/grant/revoke/decision), fail-closed, Mount geprueft | vorhanden |
| Text | datenschutz.html Abschnitt 11, dreifach getrennt, wortgleich zur Route (umfang-Feld) | vorhanden |
| Tests | tests/training-consent.test.mjs (+ check:training 135/135) | gruen |
| Schutz | einwilligung-lock v1 pinnt die ganze Kette | aktiv |
| Deploy-Hash | scripts/deploy/set_training_consent_env.mjs, Reihenfolge-Garantie (Frontend ERST, Hash DANACH, sonst Abbruch) | vorhanden |

Der gebilligte Entwurf (SMEJJ_1_1_EINWILLIGUNG_TRAINING_ENTWURF) deckt sich
inhaltlich mit Abschnitt 11; der produktive Text ist VOLLSTAENDIGER (dreifach
getrennte Einwilligung, Sanitization-Details, AES-256-GCM, Loeschregeln).
Der Entwurf wurde darum NICHT ueber den Produktivtext gelegt — das waere ein
Rueckschritt und ein Hash-Sprung ohne Nutzen gewesen.

## Tatsaechliche Aenderung (minimal)

Abschnitt 11: "smejj 1.0" → "die smejj-Modellreihe, z. B. smejj 1.0" +
ausdruecklicher Satz, dass die Einwilligung fuer die Modellreihe inklusive
kuenftiger Versionen gilt. Ohne dies wuerde smejj-1-1 (Phase 1/2 dieses
Tages) nicht von der erteilten Einwilligung gedeckt. Beide Spiegel geaendert
(public/datenschutz.html + public/assets/datenschutz.html, 276 Zeilen,
inhaltsgleich).

## Verifikation

1. `npm run check:einwilligung-lock` — OK, 7 Dateien byte-identisch zum
   NEU eingefrorenen Stand (Freeze 2026-08-30T18:57:36Z mit Freigabe-Wortlaut
   als --confirm; Backup backups/einwilligung-lock/2026-08-30T18-57-36-842Z/).
2. `npm run check:training` — 135/135 (inkl. training-consent-Kette).
3. `npm run check:frontend` — OK (172 Module, Precache vollstaendig).
4. `npm run check:architecture` — 7/7.
5. `npm run check:guidelines` — OK, 2024 Dateien.

## Messfallen dieses Fensters

- Die Einwilligungs-UI lebt NICHT in account-privacy.js' eigenem Code, sondern
  ruft account-sessions.js — und account-sessions.js wird von KEINER HTML-
  Seite geladen, sondern dynamisch importiert (profile-dock-menu.js,
  account-privacy.js mit ?v=b46-Query). Ein Datei-Grep auf HTML allein fuehrt
  zum Fehlschluss "nicht eingebaut".
- account-privacy.js/.css stehen in einer PARALLELEN Sitzung im Umbau
  (468 CSS-Zeilen geloescht). Ich habe diese Dateien bewusst NICHT angeruehrt
  und nicht committet — fremde uncommitted Arbeit wird nicht mitverschickt.
- Der Notice-Hash bezieht sich auf die GESAMTE live abrufbare
  datenschutz.html (sha256 ueber den Response-Body), nicht nur auf Abschnitt 11.

## Offen / Betreiber

- Frontend-Deploy der neuen datenschutz.html (DEPLOYMENT_PLAN.md), DANACH
  Hash-Nachzug: set_training_consent_env.mjs. HINWEIS: das Skript spricht die
  stillzulegende Salad-Gruppe an — Zeabur-Entsprechung nötig (open).
- sw.js-Stempel: Nutzer erhalten die neue Fassung mit dem naechsten
  Service-Worker-Sprung (bewusst nicht hier angefasst — sw.js divergiert in
  der Parallelsitzung).
- "Dezente Chat-Frage" aus dem Entwurf: bewusst NICHT gebaut (Chat-Dateien
  divergieren parallel; Einwilligung ist ohne sie voll erreichbar ueber Konto
  → Datenschutz und die Datenschutzerklaerung).
