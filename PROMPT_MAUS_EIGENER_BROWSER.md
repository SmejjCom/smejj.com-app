# Auftrag: Die Maus soll in einem eigenen Browser frei arbeiten — wie Codex, Claude, Gemini

Stand dieser Datei: 2026-07-29. Alle Zahlen darin sind **live gemessen**, nicht
geschätzt. Wer sie ändert, misst vorher nach.

Du arbeitest an **smejj.com**. Der Name wird immer genau so geschrieben — nie in
Grossbuchstaben, nie mit grossem Anfangsbuchstaben, in Code, Text und Oberfläche
gleichermassen. Arbeits-Repo `SmejjCom/smejj.com-app`, Branch
`feature/auth-redesign-github-magiclink`.

Lies zuerst `AI_Guidelines.md`, `Memory_Bank.md`, `Project_Goals.md` und
`docs/task-capsules/2026/07/job_maus_kette_beweisen_20260729/CAPSULE.md`.
Die Capsule enthält die vollständige Vorgeschichte mit Messwerten.

---

## Das Ziel in einem Satz

Der Betreiber gibt der Maus eine Aufgabe, die Maus öffnet **einen eigenen
Browser**, arbeitet dort **Schritt für Schritt sichtbar** weiter, **bleibt auf
der Seite stehen** statt nach jedem Auftrag neu zu starten — und kann bei Bedarf
zusätzlich den **echten Chrome** des Betreibers bedienen.

Genau das ist es, was Codex und Claude "frei" wirken lässt. Es ist keine
einzelne Funktion, sondern vier Bausteine in dieser Reihenfolge.

---

## Teil 0 — Sofort-Blocker: zwei Werte, nur der Betreiber (ROTE LISTE)

**Ohne diesen Schritt ist alles Weitere sinnlos.** Die Maus kann heute nicht
arbeiten, obwohl die Engine nachweislich gesund ist.

Gemessen am 2026-07-29:

| Prüfung | Ergebnis |
| --- | --- |
| Engine `/health` | `ok:true`, 0,32 s |
| Direktlauf ohne Control-Server (`selbsttest-smejj-com-v1`) | **30 von 30 Schritten**, 7 Objekte, 6 Screenshots, 9,2 s |
| Lauf über die App | `error:"nicht_autorisiert"`, `plannerCalls:0` |
| Token-Gegenprobe: lokaler Wert an `POST /run` | HTTP **422 — akzeptiert** |
| Token-Gegenprobe: Wert des Control-Servers | HTTP **401 — ABGELEHNT** |
| Artefakt-Schlüssel über `/api/storage/presign` | HTTP **404** |
| Engine schreibt nach | `smejj-model-files` |
| Control-Server liest | `smejj-app` |

**Zu tun (Betreiber, Zugangsdaten):** Salad → Container-Gruppe `smejj-control`
→ `Edit` → Abschnitt *Environment Variables*, **zwei** Zeilen, **ein** Speichern:

1. `IDRIVE_E2_CAPSULES_BUCKET` = `smejj-model-files` — kein Geheimwert
2. `SMEJJ_MAUS_ENGINE_TOKEN` = derselbe Wert wie beim Zeabur-Dienst
   `smejj-maus-engine` (64 Zeichen, ohne Leerzeichen, ohne Zeilenumbruch)

`IDRIVE_E2_BUCKET` bleibt `smejj-app` — daran hängen Nutzer und Anmeldung.
Rückweg dokumentiert in `backups/rollback-2026-07-29-capsules-bucket/STAND.txt`.

**Warum Weg 1 und nicht der Schlüssel-Umzug:** `gatekeeper/presignIdrive.js`,
`resolveBucketForKey()` lenkt **nur** Schlüssel mit dem Prefix
`capsules/maus-engine/` auf `IDRIVE_E2_CAPSULES_BUCKET`. Der Control-Server kann
`smejj-model-files` beweisbar lesen — er lädt sein eigenes Release-Artefakt
daraus (`IDRIVE_E2_DEPLOY_BUCKET`, siehe
`public/deploy/idrive-control-bootstrap.mjs`); er läuft, also hat er Zugang.
Und Task Capsules liegen dort ohnehin schon
(`scripts/agent/upload_capsule_to_idrive.mjs`, `BUCKET_DEFAULT`).
Preis: die 14 Lauf-Ordner vom 14./15. Juli in `smejj-app` sind in der Wiedergabe
nicht mehr auffindbar. Gelöscht wird nichts.

**Abnahme, ein Befehl — Exit-Code 0 heisst behoben:**

```
node scripts/diagnose/maus-abgleich.mjs
```

**Der Agent darf diese Werte NICHT selbst setzen.** Am 2026-07-29 dreimal
versucht (Schlüssel lesend nutzen, Salad-API lesen und schreiben,
Bearbeitungsformular untersuchen) — dreimal von der Umgebungssperre abgewiesen.
Nicht erneut versuchen, sondern an den Betreiber übergeben.

---

## Teil 1 — Sitzung am Leben halten (der grösste spürbare Gewinn)

**Heute:** Der Worker ist single-run. `worker.mjs` setzt `running = true` und
lehnt jede zweite Anfrage mit HTTP 429 ab; der Control-Server wartet vor jedem
Dispatch über `waitForWorkerReady()` bis zu **240 Sekunden** auf Bereitschaft.
Ein Auftrag = ein Kaltstart. Damit kann nichts "stehen bleiben".

**Ziel:** Eine Sitzung mit `sessionId` und **Lease + TTL** (Vorschlag: 10 Minuten
Leerlauf, dann Abbau). Der Browser-Kontext bleibt offen, die Seite bleibt stehen,
Folgeschritte laufen in derselben Sitzung weiter.

**Nicht neu bauen — es gibt schon Bausteine:**
- `workers/maus-engine/session-store.mjs` legt `storageState` (Cookies) pro Task
  Capsule auf IDrive e2 ab. Das ist die Grundlage für "angemeldet bleiben".
- `workers/remote-browser/session-engine.js` ist ein bereits vorhandener
  Sitzungs-Motor. **Erst lesen, dann entscheiden**, ob er erweitert oder als
  Vorbild genutzt wird — zwei Sitzungs-Motoren wären zwei Wahrheiten.
- `SMEJJ_MAUS_EXIT_AFTER_RUN=NO` ist auf dem Zeabur-Dienst bereits gesetzt; der
  Prozess überlebt also schon. Es fehlt die Sitzungs-Verwaltung darüber.

**Zustandslos-Pflicht beachten:** Kein Sitzungsstand im Serverspeicher — Lease
und Sitzungsdaten gehören auf IDrive e2, sonst sind 1 und 50 Instanzen nicht
mehr dasselbe (Master-Prompt, "Skalieren auf Zuruf").

**Fertig, wenn:** zwei Aufträge nacheinander ohne Neustart in derselben Sitzung
laufen und die zweite Aufgabe die Seite der ersten vorfindet.

---

## Teil 2 — Sichtbar zuschauen (fast fertig)

`workers/maus-engine/live-publisher.mjs` schreibt bereits **pro Schritt** den
Fortschritt in die Capsule; `public/maus-replay.js` hat einen Live-Modus
(`LIVE_POLL_MS = 1500`), und `public/maus-panel.js` bettet `maus-replay.html`
direkt im rechten Browser-Panel ein.

**Zu tun:** Wenn ein Lauf startet, soll das Panel automatisch in den Live-Modus
gehen, statt dass der Betreiber `capsuleRef` und `planId` von Hand einträgt.
Klein, rein additiv, kein neuer Dienst.

**Achtung Frontend:** Deploy geht über Repo `SmejjCom/smejj-app-frontend`,
Branch `main`, Layout `assets/`, per HTTPS-`git push`. `CACHE_NAME` in `sw.js`
mitbumpen (live war v193) und **immer auf Live-Basis bauen** — die Live-`sw.js`
läuft dem Repo voraus. `public/index.html` und das untere Eingabefeld sind
Design-Lock: nicht anfassen ohne schriftliche Freigabe.

---

## Teil 3 — Der Chrome-Adapter (erst nach Teil 0 und 1)

**Zwei Browser-Arten, strikt getrennt, EIN Handlungs-Vokabular:**

- **Eigener Browser im Serverraum** — die heutige Maus-Engine (Playwright im
  Container). Wegwerfbar, reproduzierbar, keine Nutzerdaten. Alles Automatische
  gehört hierher.
- **Der echte Chrome des Betreibers** — nur über eine **Erweiterung** mit
  sichtbarer Erlaubnis pro Seite.

**Verbindliche Sicherheitsregel:** Chrome NIEMALS mit
`--remote-debugging-port` öffnen und fernsteuern. Dann kann jede beliebige
offene Webseite im selben Chrome mitlesen und mitsteuern — inklusive aller
angemeldeten Konten des Betreibers. Das ist der klassische Amateurfehler.

**Wie es sauber geht:** Das Plan-Schema `schemas/maus-action-plan.schema.json`
bleibt unverändert; darunter kommt ein **zweiter Adapter**, der dieselben
Aktionen (`navigate`, `click`, `type`, `assert`, `screenshot`) an die Erweiterung
schickt statt an Playwright. Beide Adapter müssen **durch dasselbe fail-closed
Tor** (`domainAllowlist`, Datei-Grenzen, Secret-Vault, Schritt- und
Zeitbudget) — nicht daneben vorbei.

---

## Teil 4 — Angemeldet bleiben (Codex, Claude, Gemini und andere Seiten)

**Der einzige saubere Weg:** einmalige **Erst-Anmeldung im Beisein des
Betreibers** in einer sichtbaren Sitzung, danach wird der Cookie-Krug
(`storageState`, siehe `session-store.mjs`) verschlüsselt wiederverwendet.
Nie ein Passwort im Plan-JSON, nie im Prompt, nie im Log.

**Ehrliche Warnung, die in den Auftrag gehört:** Die Weboberflächen von
ChatGPT/Codex, Claude und Gemini haben Bot-Erkennung und Nutzungsbedingungen,
die automatisiertes Bedienen einschränken. Solche Automatisierung bricht
regelmässig und kann Konten sperren. **Wo es eine offizielle API gibt, nimm die
API** — der zentrale Modell-Router von smejj.com ist genau dafür da.
Der eigene Browser der Maus ist für das offene Web gedacht, nicht als Ersatz für
API-Zugänge.

---

## Teil 5 — Damit dieser Blocker nie wiederkommt (struktureller Fix)

Heute hält die Engine **eigene IDrive-Zugangsdaten**. Genau daraus entstand der
Eimer-Fehler: zwei Orte, zwei Wahrheiten, unbemerktes Auseinanderlaufen.

**Zielbild:** Die Engine holt sich **signierte Upload-Adressen** beim
Control-Server (der kann das bereits: `/api/storage/presign`) und hält gar keine
IDrive-Schlüssel mehr. Dann gibt es zwischen beiden Diensten **nur noch ein
Geheimnis** (den Engine-Token), und ein Eimer-Unterschied ist strukturell
unmöglich. Der Master-Prompt nennt "Signierte Upload-URLs" ohnehin als Aufgabe
des Control-Servers.

**Warum es noch nicht gebaut ist:** Es braucht einen Deploy **beider** Dienste.
Beide sind heute für den Agenten gesperrt (siehe unten). Bauen lohnt erst,
wenn der Weg zum Ausrollen offen ist — sonst entsteht Code, der nie läuft.

---

## Harte Grenzen und gemessene Fallen

**Was der Agent nicht darf:**
- Keine Zugangsdaten lesen, kopieren, eintippen oder einfügen. Jeder
  Schreibzugriff auf Env-Variablen-Formulare ist gesperrt, unabhängig davon, ob
  der Wert geheim ist. Dreimal geprüft, dreimal blockiert.
- Kein Force-Push, keine Branch-Löschung, kein Merge nach `main`
  (`main` hat eine fremde Wurzel — nie blind mergen).
- Startseite, Eingabefeld und Favicons sind gelockt.
- Nie `git add -A` — es arbeiten parallele Sitzungen im selben Arbeitsbaum.

**Deploy-Lage (Stand 2026-07-29):**
- **Maus-Engine:** läuft aus dem fertigen Abbild `ghcr.io/smejjcom/smejj-maus-engine:v1`.
  Ein `git push` baut sie **nicht** neu. Die Umstellung auf Git-Bau ist
  vorbereitet (`Dockerfile.smejj-maus-engine`,
  `docs/deployment/MAUS_ENGINE_GIT_BAU.md`), aber der Betreiber hat sie
  ausdrücklich zurückgestellt. Ohne neue Freigabe nicht umstellen.
- **Control-Server:** Deploy endet in einem Env-Schreibzugriff auf Salad —
  für den Agenten gesperrt. Ein Release packt zudem `src/` und `control-server/`
  aus der **Arbeitskopie**: vorher `git status -- src control-server` prüfen,
  sonst liefert man fremde, ungeprüfte Arbeit mit aus.
- **Frontend und IDrive e2:** frei nutzbar (grüne Liste).
- Ein `git push` löst Zeabur-Neubauten für die Dienste am Branch aus. Danach
  **nicht** zusätzlich "Redeploy" klicken, sonst brechen beide ab.

**Fallen, die schon Stunden gekostet haben:**
1. **`objects`, nicht `entries`.** Das Manifest in
   `workers/maus-engine/artifact-uploader.mjs` heisst `objects`. Wer `entries`
   liest, meldet einen gelungenen Lauf als "0 Beweise".
2. **403 ist nicht 404.** `403` = anderes Konto, `404` = gleiches Konto ohne
   Objekt. Die Verwechslung führte zur Fehldiagnose "verschiedene Konten".
3. **`gatekeeper/` nicht vergessen.** Die Presign-Logik liegt dort, nicht in
   `control-server/`. Ein `grep` ohne diesen Ordner übersieht den Schalter, der
   den ganzen Umbau überflüssig macht.
4. **Salad flattert während eines Ausrollens.** Einzelne Aufrufe scheitern mit
   "Failed to fetch", direkt danach antworten sie in 136–316 ms. Vor jeder
   Aussage über Erreichbarkeit mehrfach messen.
5. **`?v=`-Query und Service Worker.** Wer `browser-pane.js` ändert, muss die
   Query in `index.html` **und** im Import von `maus-panel.js` gleichzeitig
   erhöhen — zwei Spezifizierer sind zwei Modul-Instanzen.
6. **800 Zeilen pro Datei.** `Memory_Bank.md` läuft ständig ans Limit; alte
   Abschnitte wortgleich nach `docs/memory/` auslagern, nie kürzen.
7. **`pnpm` ist nicht installiert.** Neue Skripte dürfen es nicht aufrufen.

---

## Werkzeuge, die es schon gibt (erst nutzen, dann bauen)

```
node scripts/diagnose/maus-abgleich.mjs      # stimmen beide Seiten überein? Exit 0 = ja
node scripts/diagnose/maus-direktlauf.mjs    # Engine allein prüfen, ohne Control-Server
npm run check:maus-engine                    # 139 Tests
```

`maus-direktlauf.mjs` ist das wichtigste Diagnose-Werkzeug: Es nimmt den
Control-Server aus der Kette. Läuft ein fertiger Plan dort durch, ist die Engine
bewiesen gesund und jeder App-Fehler liegt zwingend davor. Es braucht kein
Modell und erzeugt keine Modellkosten.

---

## Fertig ist der Auftrag, wenn

1. Ein Maus-Auftrag über die App läuft durch: `ok:true`, gefülltes `actionLog`,
   kein `nicht_autorisiert`.
2. Unter `capsules/maus-engine/` erscheint ein neuer Ordner für diesen Lauf.
3. Die Wiedergabe im rechten Panel zeigt den Lauf **mit Screenshots**, live
   mitlaufend.
4. Zwei Aufträge nacheinander laufen in **derselben** Sitzung, ohne Neustart —
   die Seite bleibt stehen.
5. Web-Vitals gemessen und gegen den letzten Benchmark geprüft (LCP, INP, CLS,
   TTFB, API-p95). Keine Verschlechterung.
6. Task Capsule geschrieben, `Memory_Bank.md` aktualisiert, Ergebnis mit Beleg
   berichtet (Live-URL, Messwerte, Screenshot).

Melde **echte Blocker sofort** — insbesondere alles, was Zugangsdaten oder eine
Kostenfreigabe braucht. Rate nicht, sondern miss live.
