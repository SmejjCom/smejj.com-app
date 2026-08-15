# Sicherheitsprüfung A bis Z — Runde 2, 14./15.08.2026

Fortsetzung von `SICHERHEITSPRUEFUNG_A_BIS_Z_2026-08-14.md`. Diesmal ging es um
die Bereiche, die in Runde 1 offen geblieben waren: Geheimnisse, XSS, die
Chat-Brücke, den Zahlungsweg, Sitzungen und Missbrauchsbremsen.

**Ergebnis in einem Satz:** ein echter Fund (Clickjacking, behoben und live),
zwei Punkte für den Betreiber, und viermal ein sauberes Negativergebnis —
belegt, nicht behauptet.

---

## Der eine echte Fund: Clickjacking — dasselbe Muster wie beim Adminbereich

`public/frame-guard.js` gab es **längst**. Er hing aber nur an **3 von 12**
Seiten — Startseite, Anmeldung, Registrierung. Der **Adminbereich war nicht
dabei**, ebenso wenig `verlauf.html`, `danke-abo.html` und `profile/`.
Der Schutz war gebaut und nur nicht angeschlossen. Genau wie beim Türsteher.

**Warum es überhaupt ein Skript sein muss:** `frame-ancestors` wirkt
ausschließlich als HTTP-Kopfzeile. GitHub Pages Free kann keine setzen — live
gemessen liefert `smejj.com` als einzige Sicherheitskopfzeile HSTS aus — und in
einer `<meta>`-CSP ignorieren Browser die Direktive laut Spezifikation.

Ohne ihn kann ein Fremder smejj.com unsichtbar über seine eigene Seite legen und
Klicks abfangen: Gespräche löschen, Abo bestätigen, im Adminbereich eine Aktion
auslösen.

**Behoben:** in 36 Seiten eingehängt (alle 32 Adminseiten, Quelle *und* Spiegel,
plus die vier Klickziel-Seiten). Live auf smejj.com, alle 13 stichprobenartig
geprüften Seiten tragen ihn.

### Praktisch bewiesen, nicht nur behauptet

Ich habe eine Angreifer-Seite gebaut, die `smejj.com/admin/nutzer/` in einen
`<iframe>` lädt. Ergebnis: **der Rahmen bleibt leer**, das Dokument darin
entfernt sich selbst.

Bemerkenswert dabei — und gut, dass es im Code schon bedacht war: der *primäre*
Weg (`window.top.location.replace`) greift heute **nicht** mehr, weil moderne
Browser die Top-Navigation aus einem fremden Rahmen ohne Nutzergeste verbieten.
Gerettet hat es der **Fallback**, der den Inhalt leert. Wer diesen Fallback
irgendwann für überflüssig hält und entfernt, schaltet den Schutz ab.

**Auf dem Control-Server** ist das Modul absichtlich nicht in der Ausliefer-Liste
— dort fängt dessen eigene Kopfzeile `x-frame-options: DENY`, live geprüft.

---

## Was sauber ist — mit Beleg

### Geheimnisse: nichts gefunden

| Geprüft | Ergebnis |
|---|---|
| Muster (`sk-`, `gsk_`, `tvly-`, `sk_live_`, `ghp_`, `AKIA`, `AIza`) in `public/` | nichts |
| Dieselben Muster in **allen getrackten Dateien** | nur ein deklarierter Testschlüssel |
| Dieselben Muster in der **gesamten Git-Historie** | nichts |
| Je eine `.env`, `cli.yaml`, `.pem`, `id_rsa` eingecheckt (Historie) | nie |
| Live ausgelieferte Bündel (`app.js`, `config.js`, `sw.js`) | nichts |

`.gitignore` deckt `.env`, `.env.*` und `backups/` ab.

**Wichtige Nebenerkenntnis:** *beide* Repos sind **öffentlich**
(`smejj.com-app` und `smejj-app-frontend`). Für GitHub Pages Free ist das beim
Frontend nötig. Es heißt aber: der gesamte Quellcode, alle `docs/`, alle
Architektur- und Betriebsnotizen sind für jeden lesbar. Das relativiert jede
Bewertung von „Informationspreisgabe" — was im Repo steht, ist ohnehin öffentlich.

### XSS: 16 echte Angriffe, alle abgewehrt

Nicht durch Codelesen, sondern indem ich die Renderer wirklich gefüttert habe:

- **Chat-Markdown** (Modellausgaben sind nicht vertrauenswürdig, besonders nach
  einer Websuche): 10 Angriffe — `<script>`, `<img onerror>`, `javascript:`-Links
  in beiden Schreibweisen, `data:text/html`-Bilder, `<iframe>`,
  Attribut-Ausbruch, `<svg onload>` — **alle 10 abgewehrt**.
  Der Renderer maskiert zuerst *alles* und wendet die Auszeichnung erst danach an.
- **Adminkonsole** (dort wäre ein Angriff über einen Nutzernamen besonders
  gefährlich): 6 Angriffe gegen `escapeHtml` — **alle 6 maskiert**. Jede
  Einsetzung in den Vorlagen geht durch `e()`; auch `kopf()` maskiert intern.
- Kein `target="_blank"` ohne `rel="noopener"`.

### Chat-Brücke: der Angriff von damals greift nicht mehr

Am 04.08. war belegt, dass ein `curl` mit gefälschtem `Origin`-Kopf die volle
Antwort bekam. Nachgemessen:

| Angriff | Antwort |
|---|---|
| `curl`, `Origin: https://smejj.com`, **ohne** Token → `/api/chat` | **401** |
| dasselbe gegen `/api/agent`, `/api/voice/tts`, `/api/voice/transcribe` | **401** |
| mit **erfundenem** Token | **401** |
| fremder Origin | **403** |

### Zahlungsweg: kein geschenktes Abo

Der Stripe-Webhook ist bewusst ohne Anmeldung erreichbar — die Echtheit hängt an
der Signatur. Vier Angriffe, alle abgewehrt, jeweils mit dem richtigen Grund:

| Angriff | Antwort |
|---|---|
| ohne Signatur | 400 `signature_header_missing` |
| erfundener Kopf | 400 `signature_header_missing` |
| richtige Form, falscher Wert | 400 `signature_mismatch` |
| alte Zeitmarke (Replay) | 400 `timestamp_outside_tolerance` |

Die Prüfung selbst ist sauber: fail-closed ohne Secret, HMAC-SHA256 über
`timestamp.body`, 300 s Toleranz, `timingSafeEqual` mit Längenprüfung davor.

### Anmeldung: nicht aufzählbar, gebremst

| Geprüft | Ergebnis |
|---|---|
| Antwort bei existierendem vs. erfundenem Konto | **identisch** (`email_or_password_invalid`) |
| 8 schnelle Fehlanmeldungen | ab dem 7. **429** |
| 6 schnelle Magic-Link-Anfragen (Mailversand kostet) | ab der 6. **429** |
| Cookie bei Fehlanmeldung | keines |
| Kopfzeilen des Control-Servers | CSP, `x-frame-options: DENY`, `nosniff`, `referrer-policy`, `permissions-policy` |
| CSP im Markup, 13 Seiten stichprobenartig | **überall vorhanden** |

---

## Zwei Punkte für den Betreiber

### P1 — Die Schlüsselrotation aus dem Vorfall vom 11.07. ist nie protokolliert

`docs/security/INCIDENT_ROTATION_2026-07-13.md` ist ein **append-only**-Protokoll.
Sein letzter Eintrag zum Thema sagt:

> „Bis zur Rotation gelten alle am 2026-07-11 exponierten Werte weiter als
> potenziell kompromittiert."

Danach folgen nur noch Auth- und Deploy-Einträge. **Ein Rotationseintrag fehlt.**
Der Vorfallbericht selbst steht seit dem 11.07. auf
*„Produktionsfreigabe: gesperrt"* und wurde seither nicht angefasst.

Vieles davon ist inzwischen hinfällig — **Salad ist abgeschaltet**, der
Control-Server läuft auf Zeabur mit neu gesetzten Variablen, und das
Session-Secret hat sich nachweislich geändert (das Mess-Token zog seines aus der
toten Salad-Gruppe). **Weiterhin in Betrieb** sind aber die
**IDrive-e2-Zugänge** (`storage: true`, live) und die Modell-Schlüssel.

**Warum ich das nicht selbst erledige:** Schlüsselwerte darf ich nicht anfassen —
das ist die Regel des Projekts (Werte dürfen in keinem Agent-Log erscheinen) und
auch meine eigene. Das Runbook sieht es ausdrücklich als persönliche Aktion vor.

**Zu entscheiden:** entweder rotieren (dann nach dem Runbook, ich messe danach
gegen), oder — wenn längst passiert — das Protokoll mit einem Abschlusseintrag
schließen. Solange beides fehlt, führt ein Dokument in einem **öffentlichen**
Repo jeden künftigen Prüfer in die Irre.

### P2 — Der `admin-lock` ist rot, durch eine Parallelsitzung

Nach meinem Einfrieren um 01:01 hat eine andere Sitzung
`control-server/src/admin/auditLog.js` geändert (Commit `67c55fc`).

Ich habe nachgesehen statt gestempelt. **Die Änderung ist gut:** das Ziel jeder
Autopiloten-Aktion stand als `"[object Object]"` im Nachweis, weil zwei Aufrufer
ein Objekt übergeben und `String()` daraus Unsinn machte. Der Fix ist minimal,
längenbegrenzt und lässt die bereits geschriebenen Einträge bewusst unangetastet
(ein geschönter Nachweis wäre schlimmer als ein sichtbar defekter).

**Ich friere sie trotzdem nicht ein** — es ist nicht meine Änderung, und genau
das wäre das „Stempeln", vor dem die Projektregel warnt. Solange der Lock rot
ist, ist auch `tests/dateisperren.test.mjs` rot.

Ein Wort von dir genügt, dann friere ich neu ein:

```bash
node scripts/check-admin-lock.mjs --freeze --confirm "<dein Wortlaut>"
```

---

## Neue Wächter

`tests/adminbereich-anmeldepflicht.test.mjs` ist auf **20 Tests** gewachsen
(vorher 16). Die vier neuen halten den Clickjacking-Schutz fest — mit kaputter
und gesunder Probe, und mit der Prüfung, dass die **Quelle**
`control-server/admin-ui/index.html` ihn trägt. Sonst fiele er beim nächsten
Spiegeln wieder heraus.

## Gemessen

| Prüfung | Ergebnis |
|---|---|
| `npm run check` | grün |
| `check:frontend` im Bau-Branch | **459/459** |
| Adminbereich + Zugangspolitik | 34/34 |
| Live: 13 Seiten mit Clickjacking-Schutz | 13/13 |
| Live: Adminbereich weiterhin anmeldepflichtig | bestätigt |
