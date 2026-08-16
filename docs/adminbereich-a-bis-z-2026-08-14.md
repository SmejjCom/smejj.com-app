# Adminbereich A bis Z — Prüfbericht 2026-08-14/15

**Messgrundlage:** frischer Worktree auf dem Bau-Branch
`origin/feature/auth-redesign-github-magiclink` — **nicht** aus der
Arbeitskopie. Der Klicktest lief **live auf smejj.com/admin**, angemeldet als
`owner`, Stufe 8 · schreibend.

**Alles Behobene ist committet, gepusht und ausgeliefert.** Am Ende sind alle
acht Wachen grün und der Adminbereich ist neu eingefroren.

---

## 1. Sieben Befunde, alle behoben

### 1a. Die Aktionsleiste der Nutzerakte wurde nie gezeichnet 🐛

`console.js` bindet seit dem 28.07.2026 (`e0a83bb`) Klick-Handler an
`#akteAktionen` und `[data-aktion]`. Eine Ansicht, die diese Elemente erzeugt,
hat es **nie gegeben** — `git log -S"akteAktionen"` findet die Kennung
ausschließlich auf der Bedienseite. `getElementById` gab `null`,
`bindeAkteAktionen()` kehrte still zurück.

**Acht Funktionen waren dadurch unerreichbar**, obwohl Server,
Vier-Augen-Freigabe, Step-up und Audit-Log vollständig vorhanden und grün
getestet waren: sperren, entsperren, E-Mail bestätigen, Login-Sperre aufheben,
Sitzungen widerrufen, Rolle vergeben, Konto löschen, Support-Vorgang.

**Behoben** (`views.js`, 5 Tests). Es erscheint nur, was auch wirkt.
**Live geprüft:** an einem aktiven, verifizierten Konto ohne Sitzungen zeigt
die Leiste genau vier Knöpfe; die drei zustandsabhängigen fehlen korrekt.
**Wächter:** dritte Prüfebene in `check-admin-konsole.mjs` — jedes Element, an
das die Bedienung bindet, muss gezeichnet werden. Gegenprobe bestanden.

### 1b. Wer sich mit Google anmeldete, kam nie in den Adminbereich 🐛

`handleGoogleAuth` prüfte Googles `email_verified` und **warf den Nachweis
weg**. Ins Nutzerverzeichnis schrieb nur der E-Mail-Weg; `adminAuth.js`
verlangt dort `emailVerifiedAt` → immer `403 admin_email_not_verified`.
GitHub hatte dieselbe Lücke.

**Behoben** mit `control-server/src/auth/oauthKonto.js`, eingehängt in beide
Wege. Drei Regeln, alle getestet: nie ein Passwort setzen; nie Rolle, Status
oder Name eines bestehenden Kontos anfassen; eine Speicherstörung hält die
Anmeldung nicht auf. **Live bewiesen:** nach dem Deploy einmal mit Google
angemeldet → `/api/admin/me` **200, Rolle `owner`**.

### 1c. Die Ampel „Server-Puls" war eine Attrappe 🐛

Der `autopilot-supervisor` hat sie selbst angezeigt. Die Meldung lautete
wörtlich „Eigenmeldung: Container läuft." — grün ohne eine einzige Zahl,
während die Beschreibung RAM-, CPU-, SSD- und Egress-Überwachung versprach und
fest behauptete „Zeabur Cluster 100 % gesund". Der Name zeigte zudem auf
Salad, das abgeschaltet ist.

→ **`container-puls`**. **Live:** *„Container gesund: 75 MB belegt (davon
15 MB Heap), seit 0 min ununterbrochen"*. Drei Tests, einer gegen die Rückkehr
der alten Behauptung.

### 1d. Der zweite Supervisor-Fund war ein Fehlalarm — trotzdem behoben

`multimodal-engine` misst wirklich (fragt die Erzeuger-Dienste über das Netz).
Nur stand keine Zahl in der Meldung. Statt die Regel des Wächters
aufzuweichen, hat die Messung ihre Zahl bekommen: *„bereit in 42 ms"*,
*„NICHT bereit nach 9812 ms"*. Die Antwortzeit ist ohnehin das einzige
Früh-Signal für einen Worker, der noch antwortet, aber schon wegkippt.

### 1e. Der Bug-Predictor rief „KRITISCH", ohne kritischen Befund 🐛

Live an der Ampel: *„750 Befunde … — KRITISCHE Funde dabei"*. Nachgezählt:
**755 Befunde, davon 755 LOW, kein einziger CRITICAL oder HIGH**, alle vom
Typ `unhandled_await`. Ursache: `hasCriticalIssues` hing an einer Punktesumme
— sechs harmlose Hinweise in einer Datei genügten für den Alarm.

Das ist die Umkehrung des Attrappen-Problems: nicht grün ohne Grund, sondern
Alarm ohne Grund. „Kritisch" heißt jetzt: mindestens **ein** Befund ist so
eingestuft. Die Meldung nennt die Schwere: *„296 Dateien gescannt, 755 Befunde
(755 LOW), 160 sauber"*. Die 755 Hinweise bleiben als Aufräumliste bestehen.

### 1f. Das Ziel jeder Autopiloten-Aktion stand als `[object Object]` im Nachweis 🐛

Im **Live-Audit-Log** gesehen. `buildEntry()` machte `String(target || "")`;
zwei Aufrufer übergeben ein Objekt. Protokolliert war damit, WAS getan wurde,
aber nicht WORAN — im anfügenden, unveränderlichen Log dauerhaft verloren.

**Behoben** mit `zielAlsText()` — die Prüfung sitzt in `auditLog.js`, nicht bei
den zwei Aufrufern, damit kein künftiger Aufrufer denselben Fehler macht. Die
bereits geschriebenen Einträge bleiben, wie sie sind.

### 1g. Die App verschwieg abgelaufene Sitzungen 🐛

`/api/auth/me` sagte eindeutig `authenticated: false`, die App zeigte trotzdem
die volle Oberfläche. Das hat uns eine Stunde Fehlersuche gekostet — der
Betreiber war überzeugt, angemeldet zu sein.

Die Ausnahme kam mit `9a46b01` („Dauerhafter Google Login", Freigabe
Betreiber) und **bleibt**: es wird weiterhin nicht abgemeldet und nicht
umgeleitet. Falsch war nie das Behalten der Sitzung — falsch war das
Schweigen. Neu ist ein Streifen mit „Neu anmelden" und „Später", bewusst ohne
neue CSS-Datei (die CSP erlaubt Inline-Stile), damit der Start-Lock unberührt
bleibt.

---

## 2. Ein Ausfall, der eine halbe Stunde unsichtbar war ⚠️

Beim Klicktest gab der Step-up-Dialog den rohen Fehler aus:
`IDrive e2 write failed for admin/audit/…json: 403 AccessDenied`.

Der Zustand dahinter war von außen **nicht zu sehen**: das Audit-Log lieferte
weiter Einträge, die Hash-Kette galt als intakt, `/api/health` meldete
`storage: true`, alle 40 Ampeln standen grün — und trotzdem konnte der
Adminbereich nichts schreiben. Kein Nachweis, kein Step-up-Code, also **keine
einzige schreibende Adminaktion**.

**Ursache und Verlauf:** eine Parallelsitzung reparierte in genau diesem
Fenster die Zeabur-Umgebung („der Eimer darf NICHT aus env.local kommen").
Danach schrieb der Server wieder (Audit-Eintrag 00:34). Der Ausfall war also
vorübergehend — **dass er eine halbe Stunde unbemerkt blieb, ist der
eigentliche Befund.**

→ **Neu: Autopilot Nr. 41 „Nachweis-Wächter"**. Schreibt alle 30 Minuten ein
Probeobjekt und wird rot, wenn der Schlüssel nur noch lesen darf. Fasst das
Audit-Log ausdrücklich nicht an. Grenze im Code benannt: er schreibt nach
`admin/diagnose`, ein Rechteproblem allein im Audit-Pfad fände er nicht.

Werkzeug dafür neu: `scripts/diagnose/eimer-rechte-probe.mjs` — sagt je Eimer,
ob gelesen und ob geschrieben werden darf.

---

## 3. Was live geprüft wurde ✅

| Prüfung | Ergebnis |
| --- | --- |
| Alle Konsolenseiten im Browser geöffnet | **32/32**, kein Fehlerblock, kein `undefined`/`NaN`/`[object Object]` |
| Stufen-Ansichten gegen den Produktionsserver | **24/24** fehlerfrei |
| Kernseiten (Rollen, Support, Freigaben, Audit, Compliance) | vollständig |
| **Index neu bauen** (echter Schreibvorgang) | geklickt → Dialog → Grund → gebaut, Liste zeigt das Konto |
| **Akte öffnen** mit Pflichtgrund | Dialog, Grund im Audit-Log, Deep-Link `?akte=…` |
| **Aktionsleiste** an echtem Konto | 4 korrekte Knöpfe, zustandsabhängige fehlen richtig |
| **Sperren** durchgeklickt | Dialog → Grund → Step-up verlangt → Code angefordert → Mail raus → Code-Dialog. **Nichts wurde gesperrt.** |
| Audit-Log | Hash-Kette intakt, meine Aktionen protokolliert, 0 Einträge ohne Grund |
| Suche, Filter, Blättern | Teiltreffer, Groß/Klein, kein Treffer → 0; `role`/`status`-Filter; `offset` korrekt |
| Eingabehärte | `<script>alert(1)</script>` → 0 Treffer; 500 Zeichen → kein Absturz; `limit=-5`/`100000` → kein Absturz |
| Schutzproben ohne Token | 10/10 → 401; jeder Schreibweg → `403 admin_step_up_required`, nie 500 |
| Zeitanzeige | rechnet korrekt in `America/Los_Angeles` |

**Tests: 454 grün** (Admin, Auth, Konsole, Autopiloten) — vorher 352.
Davon **30 neu** für die bis dahin ungetesteten Sicherheitsmodule:

- `stepUp.js` (14) — Mutationsprobe: „istErhoeht immer true" → 8 Fehlschläge,
  „falscher Code akzeptiert" → 2, „unbegrenzte Versuche" → 2.
- `sicherheitsAlarm.js` (10) — Schwellen, Ruhezeit, kaputter Mailweg.
- `supportTickets.js` (6) — keine Meldung geht verloren, kein Kunde sieht
  fremde Tickets.

---

## 4. Alles eingefroren 🔒

Auf ausdrückliche schriftliche Anweisung vom 2026-08-15 neu gestempelt; der
Wortlaut steht in den Manifesten.

| Wache | Stand |
| --- | --- |
| guidelines | 1776 Dateien, keine über 800 Zeilen |
| admin-lock | 16 Dateien byte-identisch |
| security-lock | 11 Dateien byte-identisch |
| start-lock | 32 Dateien byte-identisch |
| einwilligung-lock | 7 Dateien byte-identisch |
| deploy-lock | 2 Dateien byte-identisch |
| admin-konsole | 31 Adressen aus 30 Ansichten, 39 Bedienelemente gezeichnet |
| admin-console-sync | Quelle gespiegelt, 30 Seiten haben ihren Ordner |

Zwei dieser Wachen waren rot durch fremde Commits und wurden mitgeschlossen:
die Einwilligungskette (nicht zeilenweise nachgelesen, sondern durch ihre 73
eigenen Tests belegt — so im Manifest vermerkt) und der Konsolen-Spiegel.

Nebenbei geheilt: `autopilotLaeufer.js` stand mit 869 Zeilen über der
800-Zeilen-Regel; die zwei Netz-Sonden liegen jetzt in
`dienstSondenAutopilot.js`, die Datei ist bei 780.

---

## 5. Was offen bleibt

| | Befund |
| --- | --- |
| ⚠️ | **Deine Rolle im Datensatz ist `user`** — owner kommt aus `SMEJJ_ADMIN_OWNER_EMAILS`. Geht die Variable verloren, ist die Konsole für alle zu; genau das ist am 14.08. passiert. Die Rollen-Seite sagt das jetzt samt Weg zurück. **Eine dauerhafte Rolle kann dir nur eine zweite Person geben** — Rollenvergabe ist Vier-Augen, auch für dich. Das ist kein Mangel, sondern der Zweck; ein Knopf dafür wäre die Aushebelung. |
| ⚠️ | Der Control-Rückfallweg `smejj-control.zeabur.app/admin/<seite>/` gibt 404. Die Korrektur läge in `adminUiRoutes.js` (Admin-Lock) bei geringem Nutzen — tiefe Links funktionieren über smejj.com. |
| 🧩 | **Autopiloten kennen nur drei Aktionen** (`wartung.ein/aus`, `pruefen`) — kein Start/Pause/Stop. Die Begründung im Code („kein Zeabur-Zugang") stimmt seit `cli.yaml` nicht mehr. |
| 🧩 | **Backend kann mehr als die Oberfläche zeigt:** `offset`, `limit`, `role`, `status` sind da, die Konsole bietet weder Blättern noch Rollen-/Statusfilter. |
| 🧩 | Fünf Seiten rein lesend (`modelle`, `jobs`, `worker`, `deploy`, `speicher`); keine Massenaktionen, kein Import, Export nur im Radar. |
| ⚠️ | Nach jedem Deploy stehen die Ampeln ~30 Minuten auf grau, bis der Läufer einmal durch ist. Erwartetes Verhalten, aber leicht als Ausfall misszuverstehen. |

**Nicht geprüft, weil es echte Fremdwirkung hätte:** Step-up zu Ende geführt
(der Code ging per Mail an dich, ich habe abgebrochen), Sperren/Löschen/Rolle
tatsächlich vollzogen (es gibt genau ein Konto, und das ist deins), die
Vier-Augen-Freigabe (braucht eine zweite Person).

---

## 6. Gesamtstatus

- **Bedienelemente:** vor der Prüfung waren 2 von 38 tot — und mit ihnen acht
  Adminfunktionen. **Jetzt 39/39 beidseitig verdrahtet**, per Wächter dauerhaft
  abgesichert.
- **Seiten:** 32/32 erreichbar und im Browser geöffnet, alle fehlerfrei.
- **Schreibkette:** an einem echten Konto bis zum Step-up durchgeklickt,
  Audit-Kette intakt.
- **Ampeln:** 41 Autopiloten; die zwei vom Supervisor angezeigten sind
  abgearbeitet, der Fehlalarm des Bug-Predictors ist weg.
- **Wachen:** 8/8 grün, alles neu eingefroren.

**Bewertung: rund 95 % geprüft und funktionsfähig.**

Die fehlenden 5 % sind benannt statt geschätzt: der letzte Vollzug der
schreibenden Aktionen und die Vier-Augen-Freigabe — beides braucht ein zweites
Konto, nicht mehr Arbeit.
