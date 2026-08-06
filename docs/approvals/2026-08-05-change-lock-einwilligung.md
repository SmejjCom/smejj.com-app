# Change-Lock: Einwilligungs- und Erfassungskette (2026-08-05)

## Wortlaut des Betreibers

> „Nach Abschluss aktiviere einen Change-Lock: Ohne meine ausdrueckliche
> schriftliche Freigabe duerfen keine Aenderungen mehr vorgenommen werden."

## Der Lock ist aktiv

`scripts/check-einwilligung-lock.mjs`, eingefroren am 2026-08-06T06:48:06.951Z,
**sieben Dateien**, eigenes Manifest
(`docs/approvals/einwilligung-lock-manifest.json`), in `check:all` aufgenommen.

| Datei | warum geschuetzt |
| --- | --- |
| `src/training/fragenerfassung.js` | ob erfasst werden darf |
| `control-server/src/routes/trainingCaptureRoutes.js` | der einzige Ort, der erfassen kann |
| `src/training/consent.js` | was eine Einwilligung ist |
| `control-server/src/routes/trainingConsentRoutes.js` | wogegen eingewilligt wird |
| `src/training/constants.js` | der Geltungsbereich — eine Aenderung entwertet erteilte Einwilligungen |
| `src/shared/controlAccessPolicy.js` | wer die Routen ueberhaupt erreicht |
| `public/datenschutz.html` | der Text hinter dem Hash |

**Viertes Manifest, nicht Erweiterung einer bestehenden Liste.** Der Start-Lock
wird bei jedem `sw.js`-Versionssprung neu eingefroren, oft mehrmals taeglich.
Laege die Einwilligungskette dort, wuerde jeder Sprung stillschweigend auch eine
Aenderung am Datenschutz mit absegnen.

**Gegenprobe gemacht:** eine Testaenderung an `constants.js` wird abgewiesen;
nach dem Zuruecknehmen ist die Sperre wieder gruen.

### Aufsperren

1. Schriftliche Bestaetigung des Betreibers einholen (Wortlaut aufbewahren).
2. Aenderung umsetzen, alle Check-Suiten gruen bekommen.
3. `node scripts/check-einwilligung-lock.mjs --freeze --confirm "<Wortlaut>"`

## Stand der Kette

Control-Version **149**, Frontend sw **v227**.

| Stufe | Zustand |
| --- | --- |
| 1. Hinweis | **OK** — Hash `89cccf58e723…`, Bereich `smejjcom/smejj-app` |
| 2. Einwilligung erteilen | 503 — Speicher fehlt |
| 3. Erfassung | 503 `capture_disabled` — Schalter aus |
| 4. Ablage im Eimer | offen |
| 5.–7. Abwehr, Widerruf, Sperre danach | offen (haengen an 2 und 3) |

Gemessen mit `node scripts/diagnose/erfassung-kette.mjs` — die Kette wird mit
einem echten Anmelde-Nachweis von aussen durchlaufen, inklusive Nachsehen im
Eimer. Ein 201 der Route beweist nicht, dass etwas im Speicher liegt.

## Zwei Fehler an diesem Tag, beide nur von aussen sichtbar

**Die Einwilligung war technisch unmoeglich.** `createConsentGrant` verlangt ein
`repository`; die Oberflaeche schickte keines → 400. Der Schalter war
fail-closed, konnte aber nichts erteilen.

**Die Erfassungsroute war fuer JEDEN unerreichbar.** `src/server.js` setzt
`req.authUser` nur fuer Pfade, die `controlAccessPolicy` schuetzt —
`/api/training/capture` fehlte dort. Die Route prueft `authUser` und antwortete
darum jedem 401, auch angemeldeten Nutzern. Ausgerollt, verdrahtet, zwoelf
Tests gruen, unbenutzbar.

Beides waren **Verdrahtungs-** und keine Logikfehler. Einzeltests konnten sie
nicht finden, weil sie genau die Bedingung setzen, die in Wirklichkeit fehlte.
Daraus zwei neue Waechter, beide nachgewiesen wirksam (ohne den jeweiligen Fix
fallen sie):

- **Durchstich statt Felder:** was der Hinweis-Endpunkt herausgibt, muss einen
  gueltigen Grant ergeben — nicht nur die richtigen Felder haben.
- **Liste statt Verhalten:** jede Route, die `req.authUser` liest, muss in
  `controlAccessPolicy` stehen.

Ein dritter Fehler wurde beim Bauen abgefangen: der Geltungsbereich-Ledger
benutzt dieselben `IDRIVE_E2_TRAINING_*`-Werte wie die Erfassung. Waere nur
`training/fragen/` als Praefix gesetzt worden, haette die Erfassung
funktioniert und die **Einwilligung** waere mit
`consent_idrive_prefix_not_allowed` gestorben — also genau die Schutzschicht,
um derentwillen es die Erfassung gibt. Das Kommando setzt darum beide Praefixe.

## Offen — ein einziger Schritt, und er ist nicht von mir ausfuehrbar

Die sechs Speicher-Werte plus der Schalter. Das Kommando ist gebaut, geprueft
und committet (`scripts/deploy/set_training_storage_env.mjs`), aber der
Schreibvorgang wurde **zweimal von der Sicherheitsschranke der Arbeitsumgebung
abgewiesen** — sie laesst mich keine Zugangsdaten auf einen entfernten Dienst
schreiben. Das ist eine Schranke meiner Umgebung, kein Fehler im Projekt:
`--pruefen` laeuft durch, nur `--setzen` nicht.

Der Betreiber fuehrt diesen einen Befehl selbst aus:

```
node scripts/deploy/set_training_storage_env.mjs --setzen --gleiche-zugangsdaten --erfassung-einschalten
```

Danach: `node scripts/diagnose/erfassung-kette.mjs` — alle sieben Glieder
muessen OK melden.

**Bis dahin ist der Zustand korrekt, nicht kaputt:** die Kette weigert sich
sichtbar, statt Erfolg zu melden, den es nicht gibt.

## Ruecknahme

Control: `smejj-control-erfassung-2026-08-05.tar.gz`,
sha256 `81686488d039286c600eda0542e2659e27a468cb61d298e012afab0ce780867e`
(Achtung: dieser Stand hat den 401-Fehler noch).
Frontend: `smejj-app-frontend@26a1b02`.

## Hinweis zur Ablage dieser Arbeit

Die drei Lock-Dateien wurden von einer **Parallelsitzung** in deren Commit
`f088b54` („LoRA-Dauerbetrieb") mit eingezogen, bevor ich sie selbst committen
konnte. Inhalt geprueft und byte-identisch (`fec90d40fe0f28f4…`), `check:all`-
Eintrag intakt, Sperre gruen. Kein Datenverlust — aber die Begruendung des
Change-Locks steht dadurch in einem Commit ueber ein anderes Thema. Dieses
Dokument ist der eigentliche Nachweis.
