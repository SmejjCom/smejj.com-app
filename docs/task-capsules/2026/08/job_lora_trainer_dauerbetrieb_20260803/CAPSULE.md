# Task Capsule — job_lora_trainer_dauerbetrieb_20260803

**Status:** in Arbeit — Fix deployed (Salad-Gruppe Version 16), Laufzeitbeweis steht aus.
**Rollback:** `backups/salad/smejj-lora-trainer-2026-08-03-vor-sonden.json` plus
`CONFIRM_TRAINER_GROUP=YES` mit dem Stand vor diesem Commit.

## Ziel

smejj 1.0 im Dauerbetrieb 24/7 trainieren lassen. Der eine ungeloeste Fehler:
Trainer-Container laeuft, Gateway antwortet dauerhaft HTTP 503. Zwei Hypothesen
waren bereits widerlegt (Token-Budget, fehlende Sonde).

## Befund (Container-Protokoll aus dem Salad-Portal, 2026-08-03 05:57 UTC)

Erstmals das Portal-Protokoll gelesen (Tab "Container Logs", Zeitraum 1 day) —
es zeigt die Wurzel eindeutig, ZWEI Fehler uebereinander:

1. **Pip-Wettlauf.** Der Server startete korrekt ("hoert auf 0.0.0.0:8080
   (modus=echt)") — die PATH-Hypothese aus dem Vorfenster ist damit widerlegt.
   Direkt danach: `laufwerk.py:62 lade_basismodell` → `motor.py:32` →
   `from transformers import …` → **ModuleNotFoundError: No module named
   'transformers'** → `ladezustand=fehler`. Der Startbefehl installiert die
   torch-Pakete im **Hintergrund** (`pip install … &`), waehrend der
   Hintergrund-Lader sofort importiert. Der Import verliert den Wettlauf immer.
2. **IPv4-Bind.** Auch mit lebendem Prozess und `/health`=200 von innen blieb
   das Gateway 503 und die Instanz pendelte `running → creating`. Gleiche
   Wurzel wie beim Sprachserver (Control v103, bewiesen): Salads Gateway und
   Sonden sprechen **nur IPv6**, der Server band `0.0.0.0` (nur IPv4).

## Umsetzung

- `workers/smejj-lora-trainer/server.py` — Dual-Stack-Bind: `SMEJJ_HOST`
  Standard `::`, `DualStackServer` (AF_INET6, `IPV6_V6ONLY=0`); bei IPv4-Host
  weiter das alte Verhalten.
- `workers/smejj-lora-trainer/laufwerk.py` — `_warte_auf_pakete()`: wartet vor
  dem Motor-Import auf die Markerdatei `/tmp/smejj-pip.rc` (Exit-Code der
  Hintergrund-Installation), neuer Ladezustand `wartet-auf-pakete`; pip-Fehler
  wird als `fehler:pip-exit=N: <pip.log-Schwanz>` sichtbar. Ohne Marker (alter
  Startbefehl) nach Frist ehrlicher Importversuch statt stummen Haengens.
- `scripts/deploy/create_lora_trainer_group.mjs` — Startbefehl schreibt den
  Marker (`( pip install … ; echo $? > /tmp/smejj-pip.rc ) &`), `SMEJJ_HOST="::"`,
  PATH-Export dokumentiert uebernommen.

## Verifikation

1. Lokal: Dual-Stack bedient 127.0.0.1 UND ::1 (beide 200, gemessen).
2. Lokal: Marker-Logik — pip-exit=7 → `fehler:pip-exit=7`; Marker 0 → Import
   laeuft an; kein Marker → nach Frist Importversuch (3 Faelle gemessen).
3. Pflichtpruefungen gruen: check:guidelines, check:lora-loop (52 Tests),
   check:training-loop, check:architecture.
4. Deploy: `CONFIRM_TRAINER_GROUP=YES SMEJJ_TRAINER_MODUS=echt
   SMEJJ_LORA_BASIS_HF_REPO=Qwen/Qwen3-8B IDRIVE_E2_MODEL_BUCKET=smejj-model-files
   node scripts/deploy/create_lora_trainer_group.mjs` → Version 16,
   zurueckgelesen: `SMEJJ_HOST="::"`, Marker im Befehl, Sonden unveraendert da.
5. Laufzeit: Selbst-Stopp-Waechter aktiv (60 min ohne /health=200 → Gruppe
   stoppen, als Code). Gateway-Monitor laeuft. ERGEBNIS: (offen)

## Messfallen dieses Fensters

- Bündellaenge ist KEIN Inhaltsbeweis: altes und neues Buendel haben exakt
  13656 base64-Zeichen (tar-Blockpadding). Inhalt nur per Entpacken/Laufzeit
  pruefbar.
- Salad-Ruecklesen direkt nach PATCH zeigt noch den ALTEN Stand (verzoegerte
  Konsistenz) — erst nach ~20 s gegenlesen.
- Portal-Logs koennen HISTORISCH abgefragt werden (1 day) — der Trainer muss
  fuer die Diagnose nicht laufen. Das widerlegt die Annahme aus dem Vorfenster.

## Offen / Betreiber

- Zeabur `smejj-training-loop`: IDRIVE_E2_ACCESS_KEY, IDRIVE_E2_SECRET_KEY,
  SMEJJ_LORA_TRAINER_KEY ergaenzen + REDEPLOY (nur Betreiber; ohne sie startet
  die Schleife fail-closed keinen Zyklus).
- ZEABUR_API_TOKEN in ~/.config/smejj.com/env.local (fuer Bridge-Deploys).

---

# Fortsetzung 2026-08-03 (spaetes Fenster) — die fuenfte Wurzel

**Status:** **Trainer-Blocker GELOEST und live bewiesen** (Version 22).
`bereit: true`, echtes 4-Bit auf einer RTX 3090, Start-/Status-/Messvertrag
gegen den echten Dienst gemessen. Offen bleibt allein die Schleife: sie braucht
fuenf Werte im Zeabur-Dienst, die nur der Betreiber setzen kann (unten).

## Ausgangslage korrigiert

Der Auftrag beschrieb den Trainer als GESTOPPT mit dauerhaftem Gateway-503.
Nachgemessen war beides anders:

- Die Gruppe **lief** (Version 19, seit 22:00 UTC).
- `/health` gab **403**, nicht 503 — das Gateway steht auf `auth: true`.
  Mit Kopf `Salad-Api-Key` antwortete es **200**.

**Merkregel: 403 am Salad-Gateway heisst „Schluessel fehlt", nicht „Dienst tot".**
Der 503 aus dem Auftrag ist Salads Nicht-bereit-Seite; sie erscheint immer,
wenn die Anwendung nicht bedient, und sagt nichts ueber die Ursache.

## Das Loch, das die Diagnose blockiert hat

`ladezustand` in `/health` ist auf 120 Zeichen gekuerzt. Die Meldung endete
mitten im Satz: `"...because of the following error:\nF"`. Die oeffentliche
Salad-API liefert keine Container-Protokolle — die Ursache war von aussen
schlicht nicht lesbar.

**Neue Route `GET /diagnose`** (nur mit Salad-Api-Key erreichbar, ohne
Geheimnisse): ungekuerzte Rueckverfolgung, `/tmp/pip.log`-Schwanz, pip-Exitcode,
tatsaechlich installierte Fassungen, CUDA-Zustand und ein gezielter
Direktimport von bitsandbytes. Damit ist das Portal fuer diese Klasse von
Fehlern nicht mehr noetig.

## Die Wurzel: eine MISCHINSTALLATION von torch

`/diagnose` zeigte den Widerspruch in einer einzigen Antwort:

```
pakete.torch  = "2.6.0"    <- importlib.metadata (was pip geschrieben hat)
cuda.torch    = "2.4.0"    <- torch.__version__  (was wirklich geladen wird)
```

Der Startbefehl installierte `torch==2.6.0` per pip **ueber** die
conda-Installation des Abbilds `pytorch:2.4.0`. pip legt die neuen Metadaten
ab, kann die conda-Dateien aber nicht sauber entfernen. Zurueck bleibt eine
Mischung aus neuen Python-Dateien und alten Binaerteilen (`torch._C`).

Diese eine Ursache erklaert BEIDE Fehlermeldungen:

- `cannot import name 'get_proxy_mode' from 'torch.fx.experimental.proxy_tensor'`
  (beim Qwen3-Import ueber `transformers.modeling_utils`)
- `No module named 'torch._C._dynamo.guards'` (beim bitsandbytes-Import)

Und rueckblickend auch die Wurzeln 3 und 4 des frueheren Fensters (DTensor,
torchvision::nms): alle vier waren Symptome desselben Fehlers im Startbefehl.

**MERKREGEL: Die torch-Fassung gehoert ins ABBILD, nie in den Startbefehl.**
Nur ein Abbild garantiert, dass torch, torchvision und die CUDA-Bibliotheken
zueinander passen.

## Umsetzung

- **`scripts/deploy/lora_trainer_rezept.mjs` (neu)** — Abbild und Startbefehl
  als eine gemeinsame Quelle fuer beide Deploy-Skripte. Abbild jetzt
  `pytorch/pytorch:2.6.0-cuda12.4-cudnn9-runtime` (bringt torchvision 0.21.0
  passend mit); per pip kommen nur noch transformers/peft/accelerate/
  bitsandbytes/safetensors dazu. `torch==2.6.0` steht als Festhalter in der
  pip-Zeile, damit keine Abhaengigkeit sie ersetzt.
- **`workers/smejj-lora-trainer/laufwerk.py`** — `/diagnose`-Bericht
  (`diagnose()`, `_pip_bericht()`, `_paketfassungen()`, `_importprobe()`,
  `_cuda_bericht()`); voller Fehlertext und Rueckverfolgung werden gemerkt;
  neuer Waechter `_pruefe_torch_stimmig()` meldet eine Mischinstallation als
  KLARTEXT, bevor sie drei Ebenen tiefer als sinnloser Importfehler auftaucht.
- **`workers/smejj-lora-trainer/server.py`** — Route `GET /diagnose`.
- **`workers/smejj-lora-trainer/motor.py`** — zwei echte Fehler behoben:
  1. `except ImportError` fing den bitsandbytes-Ausfall NIE, weil transformers
     ihn in ein `RuntimeError` verpackt. Der vorgesehene bf16-Ersatzweg war
     damit toter Code. Jetzt `except Exception` mit Protokollzeile.
  2. `dtype=` ist erst ab transformers 4.56 gueltig, gepinnt ist 4.51.3 — der
     Wert waere unbemerkt in den Konfigurations-kwargs gelandet und das Modell
     in fp32 (~32 GB) auf einer 24-GB-Karte geladen. Jetzt `torch_dtype=`.
     Bei Qwen3-8B traegt der bf16-Weg wirklich (~16 GB), der Ersatzweg ist
     also keine Feigenblatt-Loesung.
- **`scripts/deploy/update_lora_trainer_bundle.mjs` (neu)** — erneuert Code,
  Abbild und Startbefehl nach der Regel LESEN — ERGAENZEN — GANZ SCHREIBEN —
  GEGENLESEN. Prueft, dass KEINE andere Variable verlorenging.
- **`workers/smejj-lora-loop/waechter.js` (neu) + Verdrahtung in `worker.mjs`**
  — der Selbst-Stopp als Code (siehe unten).

## Die sechste Wurzel: kein C-Uebersetzer im Laufzeit-Abbild

Nach dem Abbildwechsel meldete `/diagnose` erstmals eine **stimmige**
Installation:

```
pakete.torch = "2.6.0+cu124"
cuda.torch   = "2.6.0+cu124"     <- kein Widerspruch mehr
torchvision  = "0.21.0+cu124"
```

Der bitsandbytes-Import scheiterte trotzdem — jetzt aber aus einem ganz anderen,
endlich eindeutigen Grund:

```
RuntimeError: Failed to find C compiler. Please specify via CC environment variable.
```

bitsandbytes zieht beim Import **triton**, und triton uebersetzt sich beim
ersten Zugriff ein kleines CUDA-Hilfsmodul SELBST — zur Laufzeit. Das
`-runtime`-Abbild enthaelt keinen Uebersetzer. Nach aussen sah das wieder aus
wie „bitsandbytes kaputt".

**Behoben:** `gcc` wird im Startbefehl per apt nachinstalliert (rund 50 MB,
guenstiger als das `-devel`-Abbild mit rund 7 statt 3,3 GB).

Zwei Haerteschritte dazu, beide aus dem Fehlerbild abgeleitet:

- Die apt-Zeilen tragen `|| true`. `set -eu` gilt auch in der Unterschale:
  ohne Auffangklausel haette ein fehlgeschlagenes apt die Unterschale beendet,
  pip waere nie gelaufen, die Markerdatei nie entstanden — und `laufwerk.py`
  haette die vollen 30 Minuten gewartet, bevor ueberhaupt ein Fehler erscheint.
- **Der bf16-Ersatzweg lag an der falschen Stelle.** `BitsAndBytesConfig(...)`
  ist nur ein Datenobjekt und gelingt auch ohne bitsandbytes; gebraucht wird die
  Bibliothek erst INNERHALB von `from_pretrained`
  (`hf_quantizer.validate_environment`). Der Ausfall schlug deshalb an der
  Absicherung vorbei. Der Ersatzweg sitzt jetzt um das Laden selbst: schlaegt
  4-Bit fehl, wird bf16 nachgeholt (Qwen3-8B rund 16 GB auf einer 24-GB-Karte).
  Faellt auch das aus, bleibt der Dienst 'nicht bereit' — kein stiller
  Teilbetrieb.

## Der Selbst-Stopp — jetzt als Code

Regel des Betreibers: nichts startet ohne eingebaute Abbruchbedingung.

`bewerteWacht()` entscheidet ohne Netz und ist mit 16 Tests belegt; bleibt der
Trainer laenger als die Frist (Standard 60 min) nicht bereit, wird die
Container-Gruppe ueber die Salad-API gestoppt.

Bewusst im **Loop** und nicht im Trainer: der Trainer koennte sich nur selbst
beenden, und `restart_policy: always` startete ihn sofort wieder — eine
Schleife zum selben Preis wie der Stillstand. Ein echtes Stoppen braucht den
Salad-Schluessel, und der gehoert nicht auf eine fremde Community-GPU.

Gehaertet gegen die Arten, wie eine Bremse still ausfaellt:
- nur das klare Wort `AUS` schaltet ab (nicht "false", "0", Tippfehler),
- die Frist ist auf 6 h gedeckelt (eine zusaetzliche Null hebelt sie nicht aus),
- ein laufender Zyklus wird nie abgeraeumt (dafuer ist der Laufzeitdeckel da),
- ein fehlgeschlagener Stopp wird NICHT als erledigt verbucht, sondern laut
  gemeldet,
- fehlen die Salad-Koordinaten, meldet der Loop beim Start ausdruecklich, dass
  der Waechter nur zusehen kann.

## Verifikation

1. `/diagnose` live abgefragt, HTTP 200 — Route traegt, CUDA sichtbar
   (`RTX 3090`, `verfuegbar: true`). Damit ist der Diagnoseweg bewiesen.
2. Volle Rueckverfolgung gelesen; Mischinstallation eindeutig belegt (siehe oben).
3. Deploy zurueckgelesen: Abbild `2.6.0-cuda12.4`, Startbefehl ohne
   torchvision-Upgrade, 12 Variablen unveraendert, alle drei Sonden erhalten,
   Stufe weiterhin `batch` (0,09 USD/h).
4. Pflichtpruefungen: `check:lora-loop` **69/69 gruen**, `check:training-loop`
   **34/34**, `check:architecture` **7/7**.
   `check:guidelines` meldet zwei Verstoesse in `public/app.js` (817 Zeilen) und
   `public/chat-bridge.js` (805) — **beide aus einer parallelen Sitzung**, im
   HEAD-Stand sind es 798 und 800 Zeilen. Von diesem Fenster nicht beruehrt.
5. **Laufzeitbeweis erbracht (Version 22, 00:02 UTC).** Der Trainer meldet
   `{"ok": true, "modus": "echt", "bereit": true, "ladezustand": "bereit"}`.
   Anlauf vom Start bis bereit: **rund 4 Minuten** (Protokoll des Waechters:
   `http_404` → `http_503` → `laedt-gewichte` → `bereit`).

   `/diagnose` nach dem Anlauf — alles stimmig:
   ```
   torch (pip)  = 2.6.0+cu124
   torch (real) = 2.6.0+cu124     <- kein Widerspruch mehr
   bitsandbytes = 0.45.5, Import ok: true   <- gcc wirkt, echtes 4-Bit
   GPU          = NVIDIA GeForce RTX 3090, verfuegbar: true
   pip exit     = 0
   ```

6. **Vertrag gegen den ECHTEN Dienst gemessen** (statt gegen eine Attrappe):
   - `POST /training/start` → `{"laufId": "4375b60d56bb4fbe"}` — die frueheren
     409 `nicht_bereit` sind weg.
   - `GET /training/status/…` → `zustand: "fehlgeschlagen"`,
     `adapterSchluessel: null`, `gelaufeneMinuten: 0.14`. Bewusst mit LEEREM
     Datensatzschluessel gemessen: der Lauf muss fail-closed in Sekunden enden
     und darf keinen Adapter erzeugen. Genau das tut er.
   - `messEndpunkt` zeigt korrekt auf `…/api/chat`.
   - Der Dienst bleibt danach `bereit: true` — ein gescheiterter Lauf reisst ihn
     nicht mit.

7. **Messweg beweisbar echt.** `POST /api/chat` liefert SSE-Frames mit
   generiertem Text und den Koepfen
   `x-smejj-model-backend: smejj-lora-trainer` und
   `x-smejj-model-id: smejj-1-0` — der Beweis, dass die Pruefsuite spaeter das
   trainierte Modell misst und nicht den Notfall-Assistenten.

   Anmerkung: kein Trainingslauf mit ECHTEM Datensatz von Hand gestartet. Der
   Datensatzschluessel liegt in einem Eimer, den der lokale Schluessel nicht
   sieht (lokal ≠ Server, bekannt), und ein Start von Hand umginge genau die
   Budgetbremsen, die fuer diesen Zweck gebaut wurden. Das Starten echter Zyklen
   ist Aufgabe der Schleife — sie braucht dafuer die fuenf Zeabur-Werte unten.

## Messfallen dieses Fensters

- **403 ≠ tot.** Das Gateway steht auf `auth: true`; ohne `Salad-Api-Key` sieht
  ein gesunder Dienst wie ein toter aus.
- **Ein PATCH auf `image`/`command` bei LAUFENDER Gruppe wird stillschweigend
  verworfen** (HTTP 2xx, keine Wirkung). Erst nach `POST /stop` greift er.
- Die verzoegerte Ruecklese-Konsistenz (aus dem Vorfenster) erneut getroffen:
  das Gegenlesen meldete faelschlich „NICHT uebernommen", obwohl der Schreib-
  vorgang gelungen war. Jetzt mit Wiederholung, bis der Abdruck erscheint.
- **Ein leeres Listing beweist NICHTS.** `signedS3List` liefert auf dem Eimer
  `smejj-model-files` 0 Objekte — sogar auf der Wurzel — waehrend `signedS3Get`
  denselben Eimer problemlos liest und PUT ebenfalls erlaubt ist. Die
  Zugangsdaten haben Lese- und Schreibrecht, aber kein Listenrecht. Beinahe
  haette ich daraus geschlossen, der Datensatz fehle. Immer gezielt per GET
  gegen einen bekannten Schluessel gegenpruefen.
- **Buendellaenge bleibt kein Inhaltsbeweis** — `tar czf -` in eine Pipe fuellt
  blockweise auf (hier konstant 20480 Byte). Deshalb jetzt der Quelltext-
  Fingerabdruck `SMEJJ_TRAINER_CODE_ABDRUCK` in der Container-Umgebung: er
  sagt jederzeit, welcher Stand wirklich laeuft.

## Erstes echtes Training — und der Fund dahinter

Am 2026-08-04 lief der **erste echte LoRA-Trainingslauf** dieses Projekts durch:
`laufId 78ec2b5a915949ff`, Qwen3-8B 4-Bit auf RTX 3090, Rang 8, lr 5e-5,
1 Epoche ueber 1494 Zeilen Projektwissen — **fertig nach 8,74 Minuten**. Der
Dienst blieb dabei durchgehend `bereit: true`.

**Die Wirkung ist am STIL belegt, nicht am Inhalt.** Dieselbe Frage zweimal:
ohne Systemprompt ~1900 Zeichen englischer `<think>`-Block und eine erfundene
Antwort; mit dem Systemprompt der Trainingsdaten ein **9 Zeichen** langer
Denkblock und knappes Deutsch. Den Namen nennt der Systemprompt selbst — daraus
laesst sich nichts ableiten. Aber der Zusammenbruch des Denkblocks und der
Sprachwechsel sind die Form der Trainingsdaten; das Basismodell gruebelt von
sich aus lang und englisch.

**MESSFALLE:** `max_tokens: 64` schneidet mitten im Denkblock ab — man sieht nur
Gruebeln und haelt es fuer eine falsche Antwort. Bei einem Reasoning-Modell
genug Budget geben und erst den Teil hinter `</think>` bewerten.

### DER FUND: der Adapter ueberlebte den Container nicht

`motor.py` legte den Adapter mit `save_pretrained` unter `/tmp/smejj-lora/<kennung>`
ab — Container-Platte. Kein Upload (per `grep` belegt). Der Loop haette diesen
lokalen Pfad als `adapterSchluessel` in `bester-stand.json` auf IDrive
geschrieben: ein Verweis, der aussieht wie ein Ergebnis und keines ist.

**Der Dauerbetrieb haette rund um die Uhr trainiert und nichts behalten** —
Salad ersetzt Instanzen regelmaessig. Genau die Art stiller Fehlschlag, die
dieses Projekt schon zweimal Tage gekostet hat; sichtbar wurde sie erst, weil
das Training wirklich lief.

### Behoben

- **`s3.py` (neu)** — SigV4 an einer Stelle, benutzt von Lesen UND Schreiben.
  Zwei Kopien der Signaturlogik waeren zwei Stellen fuer denselben Sonderfall,
  und Signaturfehler melden sich als nichtssagendes HTTP 403.
- **`ablage.py` (neu)** — laedt das Adapterverzeichnis nach IDrive, mit
  Wiederholungen und Groessengrenze. Ein halb hochgeladener Adapter gilt NIE
  als Erfolg.
- **`datenlader.py`** — nutzt jetzt `s3.py`; der Lesepfad wurde gegen die
  echten Daten gegengeprueft (1494 Zeilen, unveraendert).
- **`motor.py`** — laedt nach `save_pretrained` hoch und gibt den
  IDrive-Schluessel als `adapterSchluessel` zurueck statt des Containerpfads.
  Schlaegt der Upload fehl, WIRFT es und der Lauf gilt als fehlgeschlagen:
  ohne dauerhaftes Artefakt kein dauerhafter Eintrag.

Vorher gepruefte Voraussetzung: die Zugangsdaten duerfen **schreiben**
(PUT + Zuruecklesen gegen `ops/smejj-lora-trainer/selbsttest/` bestaetigt) —
obwohl sie NICHT auflisten duerfen (siehe Messfalle unten).

## Karte laeuft durch (Entscheidung des Betreibers)

Kurz gestoppt, auf ausdrueckliche Weisung des Betreibers **sofort wieder
gestartet und dauerhaft laufen gelassen**: Kosten sind kein Kriterium, die Karte
soll bereitstehen, sobald die Schleife sie steuern darf.

Damit kostet der Leerlauf 0,09 USD/h ≈ 2,16 USD/Tag in der Stufe `batch` — das
ist bewusst so gewollt und ersetzt die frueher hier empfohlene Abwaegung.

Der Anlauf ist mit **rund 4 Minuten** gemessen. Abbild, Startbefehl und alle 12
Variablen ueberstehen einen Stopp unveraendert (Abdruck `35d6c93a070a3ef9:4`,
Stufe `batch`) — ein Stopp ist also jederzeit gefahrlos. Wiederanlauf:

```
curl -X POST -H "Salad-Api-Key: $SALAD_API_KEY" \
  https://api.salad.com/api/public/organizations/smejjcom/projects/default/containers/smejj-lora-trainer/start
```

Danach den Waechter mitlaufen lassen, damit keine Karte unbeaufsichtigt bleibt:

```
node scripts/deploy/lora_trainer_waechter.mjs
```

## BLOCKER: der Browser ist im FALSCHEN Zeabur-Konto angemeldet

Am 2026-08-04 im Browser nachgesehen (Auftrag: „Portale sind offen und
eingeloggt"). Befund, dreifach belegt:

1. Das angemeldete Zeabur-Konto heisst **„iMild Com"**.
2. Es enthaelt genau EIN Projekt (`untitled`, Projekt-ID
   `6a6201f74d439e41ee4e1e1a`) mit genau ZWEI Diensten: `imild-platform`
   (Quelle `iMildcom/imild-platform`, Domains `api.imild.com`) und `postgresql`.
   **Einen Dienst `smejj-training-loop` gibt es dort nicht.**
3. `scripts/deploy/deploy_chat_bridge_zeabur.mjs` erwartet die Projekt-ID
   **`6a6666899949111176cddefb`**. Der direkte Aufruf dieses Projekts antwortet
   im angemeldeten Konto mit **„Project not found"**.

Das ist ein anderes Konto und ein anderes Produkt. Die fuenf Werte lassen sich
von hier aus also nicht setzen — unabhaengig davon, dass drei davon
Zugangsdaten sind, die ein KI-Assistent ohnehin nicht in Formulare eintraegt.

**Zwei Wege, beide nur vom Betreiber:**
- im Browser in das smejj.com-Zeabur-Konto wechseln und die Werte dort setzen, ODER
- `ZEABUR_API_TOKEN` in `~/.config/smejj.com/env.local` eintragen; danach kann
  das Setzen und Gegenlesen skriptgesteuert erfolgen.

**Nebenbefund, ungeprueft gelassen:** Der Zeabur-Server ist mit
`Tencent Frankfurt 2C 2GB` ausgewiesen, die Policy nennt 2 vCPU / 8 GB.
Nicht angefasst — gehoert zu einem fremden Produkt auf demselben Server.

## Die Schleife LAEUFT — es fehlt genau EIN Wert

Gemessen am 2026-08-04 an `ops/smejj-lora-loop/zustand.json` (IDrive e2,
Eimer `smejj-model-files`), zwei Stichproben im Abstand von zwoelf Minuten:

```
Probe 1: letzterZyklusAm 2026-08-04T00:45:49Z   letzteGruende ["trainer_nicht_erreichbar"]
Probe 2: letzterZyklusAm 2026-08-04T00:56:19Z   letzteGruende ["trainer_nicht_erreichbar"]
```

Der Zeitstempel wandert um exakt einen Zyklusabstand. **Es laeuft also eine
LoRA-Schleife im Dauerbetrieb** — nicht lokal (kein Prozess in `ps`), nicht auf
Salad (keine solche Gruppe), und nicht im angemeldeten Zeabur-Konto.

Aus dieser einen Datei folgt der gesamte Konfigurationsstand, ohne Zugang zum
Dienst:

* Sie wird GESCHRIEBEN → `IDRIVE_E2_ACCESS_KEY` und `IDRIVE_E2_SECRET_KEY`
  sind gesetzt und gueltig. Die Annahme des Auftrags, sie fehlten, ist widerlegt.
* `letzteGruende` enthaelt **ausschliesslich** `trainer_nicht_erreichbar` —
  also KEIN `keine_schriftliche_freigabe`, `kostengrenze_fehlt:*`,
  `kein_basismodell`, `kein_datensatz` oder `keine_trainer_adresse`. Alle
  Budget-, Freigabe- und Datentore sind demnach erfuellt.

Bleibt genau eine Erklaerung: die Schleife ruft `/health` des Trainers **ohne**
`Salad-Api-Key` auf. Das Gateway steht auf `auth: true` und antwortet dann 403,
`trainerErreichbar()` liefert false — und der Zyklus wird nicht gestartet.

> **Zwischen jetzt und dem laufenden 24/7-Training steht EIN Wert:
> `SMEJJ_LORA_TRAINER_KEY` (= `SALAD_API_KEY`).**

Zusaetzlich, aber NICHT trainingsblockierend: `SALAD_ORGANIZATION_NAME=smejjcom`
und `SALAD_PROJECT_NAME=default` — ohne sie kann der eingebaute Waechter eine
haengende Karte melden, aber nicht stoppen.

### Bewusst NICHT getan

Die Sperre liesse sich technisch auch aufheben, indem man am Salad-Gateway
`networking.auth` auf `false` setzt — dann antwortet `/health` ohne Schluessel
und die Schleife liefe sofort los. **Nicht gemacht:** damit waeren
`/training/start` und `/api/chat` oeffentlich ohne Authentifizierung erreichbar,
also fremde Rechenlaeufe auf einer bezahlten GPU. Das ist eine
Sicherheitsherabstufung an einem kostenpflichtigen Dienst und gehoert auf die
Rote Liste — nur mit schriftlicher Freigabe.

## Offen / Betreiber (aktualisiert)

`ZEABUR_API_TOKEN` fehlt weiterhin in `~/.config/smejj.com/env.local`. Ohne ihn
laesst sich die Zeabur-Umgebung weder lesen noch setzen — und der Browser ist im
falschen Konto angemeldet (siehe Blocker oben). Der Chat-Fix bleibt ebenfalls
unausgeliefert.
