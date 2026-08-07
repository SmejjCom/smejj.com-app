# Freigabe: admin.smejj.com + professionelle Code-Eingabe (2026-08-07)

## Wortlaut des Betreibers

> **„Dann mach professionell. Ich bin im Browser eingeloggt. Bei
> https://www.spaceship.com/ kannst du Domain einrichten und dann Adminbereich
> richtig Stelle packen und komplett fertig machen und live admin.smejj.com
> gehen und checken, ob alles richtig gemacht, ob alles richtig funktioniert."**

Vorausgegangen war die Kritik: „Warum hast du so dumme Linke gemacht? … Und was
von der Code ist das? … Mach anständiger eine Adminbereich Verknüpfung."

Diese Freigabe deckt zugleich die Änderung an `control-server/admin-ui/api.js`,
die unter `admin lock v1` steht. Der Lock wurde danach mit demselben Wortlaut
neu eingefroren.

## Teil 1 — admin.smejj.com

**Warum NICHT Cloudflare** (mein früherer Vorschlag, zurückgezogen): Der Master
Prompt verbietet ausdrücklich „externe CDN-, Proxy- oder Edge-Dienste von
Drittanbietern" und jeden neuen Anbieter ohne schriftliche Freigabe. Cloudflare
wäre beides. Der Vorschlag war mit der eigenen Policy nicht vereinbar.

**Gewählt:** Spaceship-Subdomain-Weiterleitung mit kostenlosem SSL („Secure
redirect powered by FreeSSL"). Spaceship ist bereits der freigegebene
Domain-/DNS-Anbieter, es entsteht keine neue Kostenposition und kein neuer
Dienst.

    admin.smejj.com  →  302  →  https://redbean-caesar-…salad.cloud/admin

Angelegt als ein einziger DNS-Eintrag in der Gruppe „URL Redirect":
`admin A 15.197.162.184`, TTL 5 min. Alle 11 bestehenden Einträge unberührt
(Bestand: `docs/infrastruktur/DNS_SMEJJ_COM_BESTAND_2026-08-06.md`).

**Ein Beinahe-Fehler, der festgehalten gehört:** Beim Ausfüllen des
Subdomain-Dialogs landete der Zieltext gleichzeitig im **domainweiten**
Weiterleitungsfeld darüber (gemeinsamer Formularzustand in Spaceships
Oberfläche). Gespeichert hätte das **ganz smejj.com** auf die Admin-Konsole
umgeleitet — die Website wäre weg gewesen. Das Feld wurde verworfen und
anschließend geprüft: `https://smejj.com/` antwortet weiter 200, `www` leitet
wie zuvor auf die Hauptdomain, `smejj.com/admin` unverändert.

**Merkregel:** Nach jeder Änderung in einem Registrar-Formular die Hauptdomain
sofort messen, nicht nur den neuen Eintrag.

**Ehrliche Einordnung:** Die Adressleiste endet weiterhin bei salad.cloud —
eine Weiterleitung ist keine Maskierung. Für eine Adressleiste, die dauerhaft
`admin.smejj.com` zeigt, müsste die Konsole von einem Host mit Zertifikat für
diesen Namen ausgeliefert werden (GitHub Pages). Das ginge und wäre sogar
Static-First-konform, verlangt aber einen eigenen Anmeldeweg auf der Subdomain
(der Token liegt pro Herkunft getrennt im Browser-Speicher). Das ist ein
Eingriff in die Auth-Kette und wurde bewusst NICHT im selben Durchgang gemacht,
direkt nachdem die Bestätigungspflicht scharf geschaltet wurde.

## Teil 2 — Code-Eingabe ohne Browser-Popup

`window.prompt` zeigt immer den rohen Hostnamen („Auf redbean-…salad.cloud wird
Folgendes angezeigt") und sieht damit aus wie die Aufforderung einer fremden
Seite. Bei einer Abfrage, die einen Sicherheitscode will, ist das die falsche
Optik — der Betreiber hat genau daran Anstoß genommen.

Neu: ein Dialog, der sichtbar zur Konsole gehört.

- 6-stelliges Zahlenfeld, `autocomplete="one-time-code"`, nur Ziffern (filtert
  Leerzeichen aus der Zwischenablage).
- Nennt die Zieladresse, sofern die Konsole sie kennt; sonst neutraler Text.
- Fehler stehen **im** Dialog, nicht in einem zweiten Popup. Ein falscher Code
  schließt nicht: der Server erlaubt fünf Versuche, also darf man sich auch
  fünfmal vertippen, ohne die Aktion neu zu starten.
- Bei verbranntem oder abgelaufenem Code wird der Dialog zur Meldung mit
  „Schließen".
- Enter bestätigt, Escape bricht ab (Listener am ganzen Dialog, nicht nur am
  Feld — sonst wirkt Escape nur bei Fokus im Eingabefeld).
- `try/finally` räumt das Overlay auf **jedem** Rückgabeweg ab; bliebe es
  stehen, wäre die Konsole unbedienbar. (Dieser Fehler war im ersten Entwurf
  drin und wurde vor dem Deploy gefunden.)
- Styles in `console.css`, weil die CSP `style-src 'self'` kein style-Attribut
  erlaubt.

## Umfang

Basis: laufendes Live-Artefakt `smejj-control-admin-verify-alarm-2026-08-06`
(Salad 151). Alle drei Dateien in der Basis byte-identisch mit Repo-HEAD.

| Datei | Änderung |
| --- | --- |
| `control-server/admin-ui/api.js` | Dialog statt `window.prompt`/`window.alert` |
| `control-server/admin-ui/console.css` | Styles des Dialogs |
| `control-server/admin-ui/console.js` | setzt `data-admin-email`, damit der Dialog die Zieladresse nennen kann |

- Release-Id: `smejj-control-admin-dialog-2026-08-07`
- sha256: `916295fe0d524a64b3d4bc7b558306a4af52eff50a8fcdb988b164dff7e1aba7`
- 1024 Dateien, 2.404.167 Bytes, `secretsIncluded: false`

## Nachweise

**Vor dem Deploy — echter Browsertest gegen eine Server-Attrappe:**

| Fall | Ergebnis |
| --- | --- |
| Falscher Code | „Der Code stimmt nicht.", Feld geleert, Dialog bleibt offen |
| Danach richtiger Code | Aktion läuft durch, Overlay entfernt (0 im DOM), 2 Versuche |
| Abbrechen | Overlay entfernt, Aktion abgebrochen |
| Escape | Overlay entfernt, Aktion abgebrochen |

405/406 Tests grün im entpackten Release-Baum (der eine Fehlschlag ist der
vorbestehende zeitabhängige `opsExperimente`-Test).
`diff -rq` gegen Live: genau die drei Dateien + Manifest.

**Nach dem Deploy — Salad-Version 152, 91 Variablen unverändert:**

| Prüfung | Ergebnis |
| --- | --- |
| `https://admin.smejj.com` | **302** auf die Konsole, gültiges Zertifikat |
| `http://admin.smejj.com` | 302, ebenfalls abgesichert |
| `https://smejj.com/` | **200** — unverändert |
| `https://smejj.com/admin` | 200 — unverändert |
| Konsole über admin.smejj.com im Browser | neuer Dialog erscheint, **kein** Browser-Popup |
| `admin/console.css` live | 13 Treffer `stepup` |
| `admin/api.js` live | `baueStepUpDialog`, `stepup-eingabe` vorhanden |

Rückweg: `smejj-control-admin-verify-alarm-2026-08-06.tar.gz` /
`b0fee7598c845bd57de206f3007a6ea1dbeaaabbbca35aeb59ee9b1c781d5fa3`.

## Offen und bewusst nicht mitgemacht

- **Neun weitere `window.prompt`-Aufrufe** in `console.js`, `console-stage4.js`,
  `console-stage6.js`, `console-stage8.js` (Grund-Eingaben, Rollenwahl,
  Index-Neubau, Antrag ablehnen). Dieselbe unschöne Optik, andere Stellen.
  Sie brauchen einen generischen Konsolen-Dialog und einen eigenen
  Deploy-Durchgang.
- **Adressleiste dauerhaft auf admin.smejj.com** — siehe Einordnung in Teil 1.
