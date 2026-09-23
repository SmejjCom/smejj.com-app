# Zweiter Server: Umzugsplan für die rechnenden Dienste

Stand: 2026-08-14. **Server ist gekauft** — aber anders als vorbereitet.

## GEKAUFT WURDE (Ist-Stand, geprüft im Portal)

| | Server 1 | Server 2 (neu) |
| --- | --- | --- |
| Name | Tencent **Ashburn** 2C 8GB | Tencent **Silicon Valley** 2C 8GB |
| Betriebssystem | **ZeaburOS + K3s** ✅ | **Ubuntu 22.04** ❌ |
| Kann Dienste tragen? | ja | **nein** |
| Region | Ashburn, US (Virginia) | Santa Clara, US (Kalifornien) |
| IPv4 | 43.166.240.69 | 170.106.136.102 |
| Preis / Verlängerung | 6 $, 26.08. | 6 $, 13.09. |
| Auto-Renew | ein | ein |
| Auslastung jetzt | CPU ~10 %, RAM ~50 % | CPU 3 %, RAM 6 %, Disk 7 % |

**Blocker 1 — das Betriebssystem.** Der Reiter *Projects* des neuen Servers
sagt wörtlich: „This machine isn't running ZeaburOS. This feature needs
ZeaburOS." Und *Settings → Zeabur deployment node*: „This machine is a standard
VPS … use ‚Reinstall OS' in the Danger Zone below and pick ZeaburOS —
reinstalling wipes the disk". Status: **Not installed**.

Solange das so ist, kann **kein einziger Dienst** dorthin umziehen. Der Fix
kostet nichts und ist gefahrlos, weil die Maschine fabrikneu und leer ist:
**Server 2 → Settings → Danger Zone → Reinstall OS → ZeaburOS.**

**Blocker 2 — die Region: halb so wild, siehe unten.**

## Warum jetzt

Zeabur warnt inzwischen von sich aus:

> „Tencent Ashburn 2C 8GB — CPU usage high (**94 %**), may cause services to
> slow down or malfunction. Suggested action: Upgrade specs or adjust service
> deployment."

Und die kostenlosen Auswege sind **gemessen ausgeschöpft**:

| Hebel | Ergebnis der Messung | Status |
| --- | --- | --- |
| `bfloat16` (halber Speicher) | Knoten hat `avx512f`, aber **kein** `avx512_bf16`, **kein** AMX → PyTorch müsste emulieren, also langsamer | **ausgeschlossen** |
| `OMP_NUM_THREADS=1` (ein Kern frei) | Bild dauert heute 111 s; ein Kern ≈ 222 s gegen ein **150-s-Budget** der Brücke | **reißt das Budget** |
| `enable_vae_slicing()` | eingebaut und live | erledigt, hilft beim Speicher |
| Resource Limits im Portal | „Upgrade needed" — Bezahlplan | gesperrt |
| Server-Alerts | brauchen **Pro, 19 $/Monat** | zu teuer, UptimeRobot gratis |

Damit bleibt nur noch Hardware. Das ist keine Bequemlichkeit, sondern der
letzte verbliebene Hebel.

## Was gekauft wird

Im Assistenten fertig eingestellt (2026-08-14), Stand vor dem Bezahlen:

> **Tencent – Ashburn** · 2 vCPU · 8 GB RAM · 80 GB SSD · ZeaburOS
> **6 $/Monat** (Listenpreis mit −40 %)

Weg dorthin: **Servers → New Server → Server (single machine) → Buy a server
from Zeabur → Go to purchase**, dann Anbieter **Tencent**, Filter *North
America / 2 vCPU / 8 GB*. Es bleiben genau zwei Treffer, beide 6 $:
**Virginia** und California. **Virginia ist Ashburn** — also derselbe Standort
wie der bestehende Server, und genau deshalb der richtige: die Dienste reden
über das interne Netz miteinander, jede andere Region kostet Latenz bei jedem
einzelnen Aufruf. Zeabur bestätigt die Wahl in Schritt 4 selbst mit
„Tencent - Ashburn".

Betriebssystem **ZeaburOS (Latest)** ist vorausgewählt und richtig — der
bestehende Server läuft ebenfalls auf ZeaburOS mit K3s. Ubuntu wäre ein
nackter VPS ohne die Zeabur-Verwaltung.

Der letzte Knopf heißt **„Proceed to Checkout"** und gehört dem Betreiber.

Nebenbefund: Der Kauf verlangte **keinen Plan-Wechsel** — die Sorge wegen
„Manageable own servers: 1" auf der Gratis-Stufe betrifft tatsächlich nur
selbst mitgebrachte Server, nicht bei Zeabur gekaufte.

**Vor dem Kauf zu prüfen:** Die Preisliste nennt „Manageable own servers: 1"
auf der Gratis-Stufe. Das betrifft dem Wortlaut nach **selbst mitgebrachte**
Server, nicht bei Zeabur gekaufte — sollte der Kauf trotzdem einen Plan
verlangen, erst hier nachfragen statt den Plan mitzubuchen.

## STAND 2026-08-14: OS repariert — dafür ein neuer, harter Blocker

**Erledigt:** Server 2 wurde auf **ZeaburOS neu installiert** (Danger Zone →
Reinstall OS; im Dialog war **Ubuntu 24.04 vorausgewählt**, das war die Falle).
Die Serverliste zeigt jetzt für beide Maschinen **ZeaburOS · K3s**. Beide sind
damit identisch und korrekt eingerichtet.

**Neuer Blocker — ein Dienst lässt sich NICHT auf einen anderen Server
verschieben.** Nachgesehen an drei Stellen:

- Dienst → *Overview*: „Server: Tencent Ashburn 2C 8GB" ist reine Anzeige,
  nicht anklickbar.
- *Project Settings*: kein Server-Wechsel. Nur *Clone Project* („copy of this
  project in another region"), Export als YAML, Transfer, Delete.
- Server 2 → *Projects*: bietet ausschließlich **„Create Project"**.

Daraus folgt: **Ein Projekt gehört zu genau einem Server.** Server 2 nutzen
heißt zwingend **zweites Projekt**.

### Warum das die ganze Planung trifft

Die Dienste rufen sich über `*.zeabur.internal` — und dieses interne DNS ist
pro Projekt/Umgebung gültig. Über zwei Projekte hinweg löst es aller
Wahrscheinlichkeit nach **nicht** auf. Betroffen wären:

| Ruft an | Ziel |
| --- | --- |
| chat-bridge | bild-maler |
| video-worker | bild-maler **und** voice-piper |
| control | video-worker, maus-engine, remote-browser |

### Die drei Wege

**A) Zwei Projekte + öffentliche Adressen** *(inkrementell, umkehrbar)*
Die umgezogenen Dienste bekommen je eine Domain, die Aufrufer zeigen dorthin.
**Gute Nachricht:** Die Adressen sind bereits Umgebungsvariablen —
`SMEJJ_VOICE_TTS_ORIGIN` und `BILD_MALER_URL`
(`workers/smejj-video-worker/server.py:67` bzw. Zeile 38 ff.). Es wäre also
überwiegend Env-Arbeit, kein Code.
*Preis:* Bisher rein interne Dienste werden **öffentlich erreichbar**.
Bild-Maler und Video-Worker haben bereits einen Schlüsselschutz
(`SMEJJ_BILDER_WORKER_KEY` / `SMEJJ_VIDEO_WORKER_KEY`, sonst 401);
**für `smejj-voice-piper` ist kein eingehender Schlüsselschutz belegt** — der
müsste vor einer Domain geklärt werden. Dazu ~70 ms je Aufruf und
Ausgangsverkehr zwischen den Servern.

**B) Cluster** *(architektonisch sauber, größter Eingriff)*
Zeabur bietet „Cluster — a Kubernetes cluster spanning multiple machines".
Dann sind beide Maschinen **ein** Cluster, internes DNS gilt überall, ein
Projekt kann beide nutzen. Heute existiert **kein** Cluster; der Umbau träfe
das laufende System.

**C) Clone Project** auf Server 2, danach auf jeder Seite wegräumen, was dort
nicht hingehört. Landet trotzdem bei zwei Projekten, also beim DNS-Problem
von A.

### Weg B ist NICHT billig zu haben (2026-08-14 geprüft)

Der Assistent bietet unter *Cluster* nur zwei Quellen: **„Buy a cluster from
Zeabur"** (ein neuer, mehrknotiger Cluster — die beiden 6-$-Server wären dann
überflüssig) oder **„Connect my own cluster"** (fertiges EKS/GKE/selbstgebautes
Kubernetes per kubeconfig). **Zwei vorhandene Server lassen sich nicht
nachträglich zu einem Cluster verschmelzen.** Damit fällt B als günstiger Weg
aus.

### DER EIGENTLICHE BLOCKER: die Worker sind völlig ungeschützt

Im Reiter *Variable* haben **`smejj-bild-maler`** und **`smejj-video-worker`**
jeweils nur **`PASSWORD`** und **`PORT`**. Weder `SMEJJ_BILDER_WORKER_KEY` noch
`SMEJJ_VIDEO_WORKER_KEY` sind gesetzt. Und der Code prüft nur, *wenn* der
Schlüssel existiert:

```python
if WORKER_KEY and request.headers.get("x-smejj-key", "") != WORKER_KEY:
    return 401
```

Bei leerem Schlüssel entfällt die Prüfung **komplett**. Heute ist das
harmlos, weil beide nur intern erreichbar sind. **Mit einer öffentlichen Domain
wäre es fahrlässig:** Jeder im Internet könnte Bilder erzeugen lassen — 111 s
auf beiden Kernen pro Anfrage. Das ist eine Einladung, den Server lahmzulegen.

**Vor der ersten Domain muss also ein Schlüssel gesetzt sein. Ohne Ausnahme.**

### Gute Nachricht: kein Code muss angefasst werden

Adressen *und* Schlüssel sind bereits Umgebungsvariablen, und die Brücke sendet
den Header schon, sobald der Schlüssel existiert
(`public/chat-bridge-bilder.js:30` und `:216`). Der ganze Umzug ist reine
Portal-Arbeit.

### Kleinstmögliche Fassung — nur EIN Dienst, nur EIN Schlüssel

Es muss gar nicht das ganze Trio umziehen. Der Fresser ist allein der
**Bild-Maler** (203 % CPU); der Video-Worker spitzt nur auf 45 % und kann
bleiben. Damit:

- Projekt 2 (Server 2) enthält **nur `smejj-bild-maler`**
- `voice-piper` und `video-worker` bleiben in Projekt 1 → ihr internes
  Gespräch bleibt unverändert
- Öffentlich wird **ein** Dienst, geschützt durch **einen** Schlüssel
- Aufrufer, die die zwei Variablen bekommen: `smejj-chat-bridge` und
  `smejj-video-worker`

**Reihenfolge ist sicherheitsrelevant:** erst Dienst anlegen, **dann Schlüssel
setzen**, erst danach die Domain vergeben. Nie umgekehrt.

**Empfehlung: A in dieser kleinsten Fassung.** Alles daran kann der Assistent
erledigen — außer dem Schlüssel selbst.

## GEBAUT 2026-08-14: Projekt 2 steht

| | |
| --- | --- |
| Projekt | `untitled-1` — `project-6a7ec20b2b4272705cd1bd96` |
| Server | Tencent Silicon Valley 2C 8GB |
| Dienst | `smejj-bild-maler` — `service-6a7ec3f82b4272705cd1be2f` |
| Quelle | GitHub `SmejjCom/smejj.com-app`, Branch `deploy/smejj-bild-maler` |
| Variablen | nur `PORT=8080` (kein Geheimnis) |
| Domain | **noch keine** — bewusst |

**Die zbpack-Falle ist zugeschnappt und wurde abgewehrt.** Die Build-Vorschau
zeigte trotz korrekt gesetztem Dienstnamen weiterhin `nodejs / pnpm /
pnpm start`. In diesem Repo startet `pnpm start` den **Control Server** — es
wäre also ein zweiter, halbkonfigurierter Control auf Santa Clara entstanden,
mit doppelt laufenden Autopiloten. Gegenmittel: das Dockerfile im Dialog unter
*Advanced Settings → Dockerfile* **direkt eingefügt**. Zeabur bestätigte
daraufhin: „Custom Dockerfile provided — the detected build plan below will not
be used."

**Preis dieser Lösung, bitte im Auge behalten:** Der eingefügte Dockerfile-Text
ist eine **Kopie** und wandert nicht mit, wenn `Dockerfile.smejj-bild-maler` im
Repo geändert wird. Sobald geklärt ist, warum die Namenskonvention hier nicht
griff, sollte das Feld geleert werden.

### Was noch fehlt (Reihenfolge ist sicherheitsrelevant)

1. **Betreiber:** `SMEJJ_BILDER_WORKER_KEY` mit demselben Wert an **drei**
   Stellen setzen — neuer `smejj-bild-maler` (Projekt 2), `smejj-chat-bridge`
   und `smejj-video-worker` (beide Projekt 1).
2. Erst **danach**: Domain für den neuen Bild-Maler vergeben.
3. Dann bei Brücke und Video-Worker `SMEJJ_BILDER_WORKER_URL` auf die neue
   Domain zeigen lassen.
4. Erst wenn ein Bild über den neuen Weg bewiesen ist: alten `smejj-bild-maler`
   in Projekt 1 **suspendieren** (nicht löschen — Rückfall).
5. Danach messen: CPU-Warnung „94 %" auf Server 1 muss verschwinden.

## DER EIGENTLICHE FIX — ohne Umzug, ohne Geheimnis, ohne Domain

Der Umzug scheiterte am Schlüssel, den der Assistent nicht setzen darf. Also
wurde das **ursprüngliche Problem** direkt gelöst: Der Bild-Maler bekommt einen
CPU-Deckel per Umgebungsvariable — kein Geheimnis, jederzeit rückgängig zu
machen, und **auf der Gratis-Stufe erlaubt**.

**Gesetzt am 2026-08-14:**

| Dienst | Variable | Wert | Wirkung |
| --- | --- | --- | --- |
| `smejj-bild-maler` (Server 1) | `OMP_NUM_THREADS` | `1` | torch nutzt statt beider Kerne nur noch einen |
| `smejj-bild-maler` (Server 1) | `MKL_NUM_THREADS` | `1` | dasselbe für den Intel-Mathekern |
| `smejj-chat-bridge` | `SMEJJ_BILDER_FOTO_TIMEOUT_MS` | `300000` | Bild-Budget 2,5 min → 5 min |
| `smejj-chat-bridge` | `SMEJJ_VIDEO_TIMEOUT_MS` | `420000` | Video-Budget 3 min → 7 min |

**Warum die Budgets mitwachsen mussten:** Mit einem Kern statt zwei dauert ein
Bild rund doppelt so lang — aus gemessenen **111 s** werden grob **220 s**.
Das alte 150-s-Budget hätte jedes Bild abgebrochen. Die Brücke wurde deshalb
**zuerst** umgestellt und neu gestartet, erst danach der Maler.

### NACHGEMESSEN — und deutlich besser als befürchtet

Echtes Bild im Container erzeugt, nach dem Neustart:

```
OMP=1 MKL=1
torch nutzt 1 Thread(s)
OK True | dauerSek 120.8 | PNG-Bytes 605300
real    2m1.047s
```

**Der zweite Kern brachte fast nichts.** Mit zwei Threads dauerte ein Bild
111 s, mit einem Thread **120,8 s** — nur **+9 %**. Die Erzeugung ist also
nicht rechen-, sondern speicherbandbreiten-begrenzt; der zweite Kern hat
hauptsächlich den Rest des Servers blockiert, ohne das Bild nennenswert zu
beschleunigen.

**Und die CPU-Kurve bestätigt es:** Im 2-Stunden-Fenster zeigen die Spitzen vor
der Umstellung ~165–180 %, der Testlauf danach bleibt **unter 100 %**.

Damit ist die Rechnung eindeutig gut: **CPU halbiert, Bildzeit praktisch
gleich.** Die erhöhten Budgets (300 s / 420 s) sind jetzt reine Reserve — die
120 s hätten sogar ins alte 150-s-Budget gepasst. Sie bleiben als Puffer für
kalten Start und Gesichtsreparatur stehen.

**Rückweg:** Die beiden `*_NUM_THREADS`-Variablen beim Maler löschen und neu
starten. Dann ist alles wie vorher.

**Messfalle dabei:** Nach dem Speichern der Variablen war im Container noch
`OMP= MKL=` und `torch nutzt 2 Thread(s)` zu sehen — Variablen wirken erst
nach einem **Neustart**. Immer im Container nachsehen, nie der Erfolgsmeldung
allein glauben.

## Zur Region: der eigene Wohnort ist der falsche Maßstab

Die naheliegende Überlegung „wir sitzen in Kalifornien, also gehört der Server
nach Kalifornien" führt bei einem öffentlichen Dienst in die Irre. Der
Betreiber ist **eine** Person; die Nutzer sind viele. Entscheidend sind zwei
ganz andere Abstände:

1. **Nutzer → heiße Dienste.** smejj.com ist deutschsprachig. Von Frankfurt
   nach Ashburn sind es rund 90 ms, nach Santa Clara rund 160 ms. Für die
   Nutzer ist Ashburn also **fast doppelt so gut**. Control und Brücke gehören
   deshalb dorthin, wo sie sind — sie nach Kalifornien zu holen, würde die App
   für jeden echten Nutzer langsamer machen, damit sie für den Betreiber
   schneller wird.
2. **Server ↔ Server.** Ashburn–Santa Clara sind rund 4 000 km, etwa 70 ms hin
   und zurück.

**Und genau deshalb ist der Fehlkauf hier verkraftbar:** Nach Kalifornien
ziehen ausschließlich die **langsamen** Dienste. Ein Bild braucht heute
gemessene **111 s**, ein Video rund **135 s**. Zusätzliche 70 ms pro internem
Aufruf sind davon **0,06 %** — messbar, aber bedeutungslos. Ein Rückkauf lohnt
nicht.

**Die eine harte Regel, die daraus folgt:** Dienste, die sich **während** eines
Auftrags gegenseitig rufen, müssen auf **derselben** Maschine liegen. Konkret:
`smejj-video-worker` ruft `smejj-voice-piper` (TTS, `SMEJJ_VOICE_TTS_ORIGIN`,
`workers/smejj-video-worker/server.py:67`) **und** `smejj-bild-maler`. Diese
drei wandern zusammen, nicht einzeln und nicht dauerhaft getrennt.

## Wer umzieht — und wer bleibt

Aufgeteilt wird nach **Antwortzeit-Anspruch**, nicht nach Funktion
(Begründung: `SERVER_ZIELBILD_2026-08-13.md`).

**Bleibt auf Server 1 (heiß + kalt):**
`smejj-control`, `smejj-chat-bridge`, `brueckenwaechter`,
`smejj-training-loop` (suspendiert, kostet nichts)

**Zieht auf Server 2 (warm, rechnet):**
`smejj-bild-maler`, `smejj-video-worker`, `smejj-voice-piper`,
`ghcriosmejjcomsmejj-maus-enginev1`, `smejj-remote-browser`

Damit hat der Chat die zwei Kerne von Server 1 für sich allein, und der
Bild-Maler darf auf Server 2 weiter 203 % ziehen, ohne jemanden zu stören.

## Ablauf

1. **Server kaufen** (Betreiber), Region Ashburn, 2C/8GB.
2. **Einen Dienst zuerst umziehen — `smejj-voice-piper`.** Er ist der
   ungefährlichste: läuft auf einem nackten Python-Abbild, hat keine Domain
   und niemand hängt sichtbar daran. Wenn der Umzugsweg damit klappt, klappt
   er auch mit den anderen.
3. **Dann `smejj-bild-maler`** — der eigentliche Grund für die Übung.
   Danach messen: Server 1 CPU muss deutlich fallen.
4. **Dann `smejj-video-worker`**, danach Maus-Engine und Remote-Browser.
5. **Nach jedem einzelnen Umzug** die interne Erreichbarkeit prüfen, siehe
   unten. Nicht alle auf einmal verschieben.

## Die Falle, die diesen Umzug kaputtmachen wird

Die Dienste rufen sich über **`*.zeabur.internal`** an — der Bild-Maler unter
`smejj-bild-maler.zeabur.internal:8080`, und der Video-Worker fragt beim
Bild-Maler an (`workers/smejj-video-worker/server.py`, `BILD_MALER_URL`).
Ebenso spricht die Brücke den Maler an.

**Ob dieser interne Name über zwei Server hinweg noch auflöst, ist NICHT
geprüft.** Zu dem Thema gibt es bereits einen dokumentierten Reinfall:
Memory `smejj-control-videospur-anschluss` hält fest, dass die ClusterIP tot
war und nur die Pod-IP funktionierte. Über Servergrenzen hinweg kann das
erneut zuschlagen.

**Darum Schritt 2 mit dem Stimmdienst als Probelauf** — und direkt nach dem
ersten Umzug diese Prüfung, aus einem Dienst auf Server 1 heraus
(Zeabur → Dienst → *Command*; **`curl` fehlt in den Abbildern**, deshalb
Python nehmen):

```
python -c "import urllib.request;print(urllib.request.urlopen('http://smejj-voice-piper.zeabur.internal:8080/health',timeout=5).read()[:200])"
```

Antwortet das nicht, ist der Umzug **nicht** einfach „Dienst verschieben",
sondern braucht zusätzlich einen Weg über öffentliche Domains oder Wonder
Mesh — dann vorher hier festhalten und neu entscheiden.

## Rückfall

Jeder Dienst lässt sich im Portal wieder auf Server 1 zurückstellen; die
Umgebungsvariablen hängen am Dienst, nicht an der Maschine, und die Bau-
Branches ändern sich nicht. Der zweite Server kann zum Monatsende auslaufen.

## Danach messen, nicht hoffen

- Server 1: CPU-Spitze muss sichtbar unter die heutigen 94 % fallen
- `smejj-bild-maler` → `/health` → `letzteDauerSek` sollte **gleich bleiben
  oder besser werden** (111 s heute); wird es schlechter, ist Server 2
  schwächer als gedacht
- Der Warnbanner „1 server needs attention" muss verschwinden
