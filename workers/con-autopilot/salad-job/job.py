#!/usr/bin/env python3
"""con-Autopilot — Salad-Job-Einstieg (Single Responsibility: Ablauf, Zeitgrenze, Herzschlag, Abschalten).

Ein Job ist die Einheit, in der Geld ausgegeben wird. Darum gilt hier:
  1. /health antwortet SOFORT (Salads Startsonde, gemessen 2026-08-01).
  2. Jede Minute ein Herzschlag nach e2 (con/logs/jobs/<id>/status.json) —
     der Autopilot auf Zeabur sieht daran, ob der Job lebt, und was er tut.
  3. Harte Zeitgrenze CON_JOB_MAX_MINUTEN. Laeuft sie ab: Zustand sichern,
     Ergebnis schreiben, abschalten. Nie einfach weiterrechnen.
  4. Am Ende — Erfolg, Fehler oder Zeitgrenze — schaltet der Job seine
     eigene Salad-Gruppe ab (stop). Klappt das nicht, beendet er sich mit
     Exit-Code; restart_policy=never verhindert den Neustart. Der Autopilot
     stoppt zusaetzlich von aussen (zwei unabhaengige Bremsen).

Betriebsarten (CON_JOB_MODUS):
  spiegel          Basismodell HF -> e2
  messung          Antworten fuer die Suiten (Basis oder Basis+Adapter)
  spiegel+messung  beides in einem Lauf (erster Lauf: con-1.0.0-Messlatte)
  training         QLoRA -> Adapter nach e2 (con/versions/<kandidat>/adapter/)
  training+messung Training, danach Messung des frischen Adapters
"""
import json
import os
import shutil
import sys
import threading
import time
import traceback
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import e2  # noqa: E402

JOB_ID = os.environ.get("CON_JOB_ID") or f"job-{int(time.time())}"
MODUS = os.environ.get("CON_JOB_MODUS", "messung").strip().lower()
MAX_MINUTEN = float(os.environ.get("CON_JOB_MAX_MINUTEN", "170"))
ARBEIT = os.environ.get("CON_ARBEITSVERZEICHNIS", "/work")
LOG_PREFIX = os.environ.get("CON_LOG_PREFIX", "con/logs/jobs") .rstrip("/") + "/" + JOB_ID
START = time.time()
_ABBRUCH = threading.Event()


class Status:
    def __init__(self):
        self.d = {"jobId": JOB_ID, "modus": MODUS, "phase": "start", "gestartet": _iso(START),
                  "deadline": _iso(START + MAX_MINUTEN * 60), "ok": None, "fehler": None, "fertig": False}
        self.lock = threading.Lock()
        self.geaendert = True

    def setze(self, **kw):
        with self.lock:
            self.d.update(kw)
            self.d["aktualisiert"] = _iso(time.time())
            self.d["laufzeitMinuten"] = round((time.time() - START) / 60, 1)
            self.geaendert = True

    def schnappschuss(self):
        with self.lock:
            return dict(self.d)

    def schreibe(self, erzwinge=False):
        with self.lock:
            if not (self.geaendert or erzwinge):
                return
            self.geaendert = False
            d = dict(self.d)
        try:
            e2.put_json(LOG_PREFIX + "/status.json", d)
        except Exception as fehler:  # noqa: BLE001
            print("Herzschlag nach e2 fehlgeschlagen:", str(fehler)[:200], flush=True)


def _iso(t):
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(t))


STATUS = Status()


class Health(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802
        if self.path in ("/health", "/", "/status"):
            body = json.dumps(STATUS.schnappschuss()).encode("utf-8")
            self.send_response(200)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, *a):  # still
        pass


class DualStackServer(ThreadingHTTPServer):
    # Salads Sonden erreichen den Container auch ueber IPv6 (der fruehere Trainer band an "::").
    # Dual-Stack: IPv6-Socket ohne V6ONLY beantwortet IPv4 und IPv6.
    import socket as _socket
    address_family = _socket.AF_INET6

    def server_bind(self):
        try:
            self.socket.setsockopt(self._socket.IPPROTO_IPV6, self._socket.IPV6_V6ONLY, 0)
        except OSError:
            pass
        super().server_bind()


def starte_health():
    port = int(os.environ.get("PORT", "8080"))
    try:
        srv = DualStackServer(("::", port), Health)
    except OSError:
        srv = ThreadingHTTPServer(("0.0.0.0", port), Health)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    print(f"health-server auf Port {port} ({type(srv).__name__})", flush=True)


def herzschlag():
    while True:
        # Jede Minute ein frischer Stand, auch wenn sich fachlich nichts geaendert hat —
        # sonst sieht ein 20-Minuten-Upload von aussen wie ein toter Job aus.
        STATUS.setze(herzschlag=_iso(time.time()))
        STATUS.schreibe()
        if time.time() - START > MAX_MINUTEN * 60 and not _ABBRUCH.is_set():
            STATUS.setze(hinweis="zeitgrenze_erreicht")
            _ABBRUCH.set()
        time.sleep(60)


def salad_stop():
    """Eigene Container-Gruppe abschalten. Ohne Zugang: nur Exit."""
    org, proj, grp, key = (os.environ.get(n, "") for n in
                           ("SALAD_ORGANIZATION_NAME", "SALAD_PROJECT_NAME", "SALAD_CONTAINER_GROUP_NAME", "SALAD_API_KEY"))
    if not (org and proj and grp and key):
        return "kein_salad_zugang"
    url = f"https://api.salad.com/api/public/organizations/{org}/projects/{proj}/containers/{grp}/stop"
    for versuch in range(5):
        try:
            req = urllib.request.Request(url, method="POST", headers={"Salad-Api-Key": key, "accept": "application/json"})
            with urllib.request.urlopen(req, timeout=20) as r:
                return f"http_{r.status}"
        except Exception as fehler:  # noqa: BLE001
            zuletzt = str(fehler)[:120]
            time.sleep(5 * (versuch + 1))
    return "stop_fehlgeschlagen: " + zuletzt


def pip_installieren(pakete):
    import subprocess
    STATUS.setze(phase="installation", pakete=pakete)
    r = subprocess.run([sys.executable, "-m", "pip", "install", "--no-cache-dir", "-q", *pakete],
                       capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError("pip scheitert: " + (r.stderr or r.stdout)[-800:])


def gpu_bericht():
    try:
        import torch
        if not torch.cuda.is_available():
            return {"cuda": False}
        p = torch.cuda.get_device_properties(0)
        return {"cuda": True, "name": p.name, "vramMiB": int(p.total_memory // (1024 * 1024)), "torch": torch.__version__}
    except Exception as fehler:  # noqa: BLE001
        return {"cuda": False, "fehler": str(fehler)[:120]}


def freier_platz_gb(pfad):
    try:
        st = shutil.disk_usage(pfad)
        return round(st.free / 1e9, 1)
    except Exception:  # noqa: BLE001
        return None


def lauf():
    import mirror
    ergebnis = {"jobId": JOB_ID, "modus": MODUS}
    os.makedirs(ARBEIT, exist_ok=True)
    basis_repo = os.environ.get("CON_BASIS_REPO", "Qwen/Qwen3.8-27B")
    basis_prefix = os.environ.get("CON_BASIS_PREFIX", "con/base/qwen3.8-27b")
    version = os.environ.get("CON_VERSION", "con-1.0.0")
    modell_dir = os.path.join(ARBEIT, "basis")
    STATUS.setze(phase="vorbereitung", basisRepo=basis_repo, basisPrefix=basis_prefix, version=version,
                 freiGb=freier_platz_gb(ARBEIT))

    braucht_gpu = any(t in MODUS for t in ("messung", "training")) and os.environ.get("CON_MESSWEG", "transformers") == "transformers"
    if braucht_gpu:
        pip_installieren(os.environ.get("CON_PIP_PAKETE", "transformers>=5.8 peft>=0.18 accelerate bitsandbytes>=0.48 safetensors").split())
        ergebnis["gpu"] = gpu_bericht()
        STATUS.setze(gpu=ergebnis["gpu"])
        if not ergebnis["gpu"].get("cuda"):
            raise RuntimeError("Keine CUDA-Karte im Job")

    if "spiegel" in MODUS:
        manifest = mirror.spiegle(basis_repo, basis_prefix, modell_dir, STATUS,
                                  behalte_lokal=("messung" in MODUS or "training" in MODUS), abbruch=_ABBRUCH.is_set)
        ergebnis["spiegel"] = {"komplett": manifest["komplett"], "dateien": len(manifest["dateien"]),
                               "gesamtBytes": manifest["gesamtBytes"], "commit": manifest["commit"]}
        if not manifest["komplett"]:
            ergebnis["ok"] = False
            ergebnis["grund"] = "spiegel_unvollstaendig_zeitgrenze"
            return ergebnis
    elif braucht_gpu:
        mirror.hole_aus_e2(basis_prefix, modell_dir, STATUS)

    adapter_dir = None
    adapter_prefix = os.environ.get("CON_ADAPTER_PREFIX", "").strip()
    if "training" in MODUS:
        import train
        datensatz_prefix = os.environ["CON_DATENSATZ_PREFIX"].rstrip("/")
        kandidat = os.environ.get("CON_KANDIDAT", version)
        konfig = json.loads(os.environ.get("CON_TRAIN_KONFIG", "{}"))
        # Restzeit bis zur Frist, gemessen JETZT — nach dem Laden, nicht davor.
        konfig.setdefault("restMinuten", max(5.0, MAX_MINUTEN - (time.time() - START) / 60.0))
        daten_dir = os.path.join(ARBEIT, "daten")
        e2.lade_verzeichnis_herunter(datensatz_prefix, daten_dir, lambda n: STATUS.setze(phase="daten", aktuell=n))
        train_pfad = os.path.join(daten_dir, "train.jsonl")
        if not os.path.exists(train_pfad):
            raise RuntimeError(f"{datensatz_prefix}/train.jsonl fehlt")
        ausgabe = os.path.join(ARBEIT, "training")
        checkpoint_prefix = f"{os.environ.get('CON_CHECKPOINT_PREFIX', 'con/checkpoints').rstrip('/')}/{kandidat}"
        t = train.trainiere(modell_dir, train_pfad, ausgabe, checkpoint_prefix, STATUS, konfig, abbruch=_ABBRUCH.is_set)
        ergebnis["training"] = {k: v for k, v in t.items() if k != "adapterPfad"}
        adapter_prefix = f"con/versions/{kandidat}/adapter"
        # Auch ein an der Zeitgrenze abgebrochener Lauf hinterlaesst einen brauchbaren Adapter.
        # Der Pfad gehoert ins Ergebnis, damit der Autopilot ihn ohne Suchen wiederfindet.
        ergebnis["training"]["adapterPrefix"] = adapter_prefix
        ergebnis["training"]["kandidat"] = kandidat
        STATUS.setze(phase="adapter_sichern")
        e2.lade_verzeichnis_hoch(t["adapterPfad"], adapter_prefix)
        e2.put_json(f"con/versions/{kandidat}/training.json", {**ergebnis["training"], "basisPrefix": basis_prefix,
                                                                "datensatzPrefix": datensatz_prefix, "jobId": JOB_ID,
                                                                "konfig": konfig, "stand": _iso(time.time())})
        adapter_dir = t["adapterPfad"]
        if t.get("abgebrochen"):
            ergebnis["ok"] = False
            ergebnis["grund"] = "training_abgebrochen_zeitgrenze"
            return ergebnis
        version = kandidat

    if "messung" in MODUS and "training" in MODUS and not _ABBRUCH.is_set():
        # Nach dem Training bleibt Grafikspeicher belegt, den kein del und kein empty_cache
        # zuverlaessig freigibt (accelerate haelt Geraete-Haken, peft haelt Verweise).
        # Gemessen 04.09.: das Modell fuer die Messung fiel deshalb auf CPU/Platte zurueck
        # ("Some modules are dispatched on the CPU or the disk") und der Lauf starb NACH
        # erfolgreichem Training. Ein eigener Prozess startet mit leerer Karte — das ist
        # die einzige Freigabe, die immer wirkt.
        rest = max(5.0, MAX_MINUTEN - (time.time() - START) / 60.0)
        umgebung = dict(os.environ)
        umgebung.update({
            "CON_JOB_MODUS": "messung",
            "CON_JOB_MAX_MINUTEN": str(int(rest)),
            "CON_VERSION": version,
            "CON_ADAPTER_PREFIX": adapter_prefix or "",
            "CON_SELBST_STOP": "NO",           # das Abschalten macht der Elternprozess
            "PORT": str(int(os.environ.get("PORT", "8080")) + 1),
            "CON_KIND_PROZESS": "ja"
        })
        STATUS.setze(phase="messung_eigener_prozess", rest=round(rest, 1))
        import subprocess
        lauf = subprocess.run([sys.executable, os.path.abspath(__file__)], env=umgebung,
                              capture_output=True, text=True, timeout=max(300, int(rest * 60)))
        print((lauf.stdout or "")[-2000:], flush=True)
        if lauf.returncode != 0:
            raise RuntimeError("Messung im eigenen Prozess scheitert: " + ((lauf.stderr or lauf.stdout)[-500:]))
        eval_prefix = f"{os.environ.get('CON_EVAL_PREFIX', 'con/evals').rstrip('/')}/{version}/{JOB_ID}"
        antworten = e2.get_json(eval_prefix + "/antworten.json")
        if not antworten:
            raise RuntimeError("Messung lieferte keine antworten.json")
        ergebnis["messungen"] = [{"version": version, "adapterPrefix": adapter_prefix, "prefix": eval_prefix,
                                  "leistung": antworten.get("leistung"), "modell": antworten.get("modell"),
                                  "suiten": [s["suiteId"] for s in antworten.get("suiten", [])],
                                  "abgebrochen": False}]
        ergebnis["messung"] = ergebnis["messungen"][0]
    elif "messung" in MODUS and not _ABBRUCH.is_set():
        import evalrun
        suiten = evalrun.lade_suiten(os.path.join(os.path.dirname(os.path.abspath(__file__)), "suites"))
        if not suiten:
            raise RuntimeError("Keine Suiten im Job-Buendel")
        messweg = os.environ.get("CON_MESSWEG", "transformers")
        # Mehrere Staende in EINEM Job: das Modell wird einmal geladen, die Adapter danach
        # angehaengt. Ein zweiter Job haette das 55-GB-Fundament erneut geholt (16 min + Miete).
        auftraege = json.loads(os.environ.get("CON_MESS_VERSIONEN", "[]") or "[]")
        if not auftraege:
            auftraege = [{"version": version, "adapterPrefix": adapter_prefix or None}]
        # Fundament zuerst — ein angehaengter Adapter laesst sich nicht mehr sauber abnehmen.
        auftraege.sort(key=lambda a: 1 if a.get("adapterPrefix") else 0)
        if messweg == "openai":
            if len(auftraege) > 1:
                raise RuntimeError("Der openai-Messweg kann nur EINEN Stand messen")
            weg = evalrun.OpenAiWeg(os.environ["CON_MESS_ENDPUNKT"], os.environ.get("CON_MESS_MODELL", "default"),
                                    os.environ.get("CON_MESS_KEY", ""))
        else:
            erster = auftraege[0]
            erster_adapter = None
            if erster.get("adapterPrefix"):
                erster_adapter = adapter_dir or os.path.join(ARBEIT, "adapter-0")
                if not (adapter_dir and os.path.isdir(adapter_dir)):
                    e2.lade_verzeichnis_herunter(erster["adapterPrefix"], erster_adapter,
                                                 lambda n: STATUS.setze(phase="adapter_laden", aktuell=n))
            STATUS.setze(phase="modell_laden")
            weg = evalrun.TransformersWeg(modell_dir, erster_adapter, STATUS)
        wdh = int(os.environ.get("CON_WIEDERHOLUNGEN", "1"))
        ergebnis["messungen"] = []
        for i, auftrag in enumerate(auftraege):
            if _ABBRUCH.is_set():
                break
            stand = auftrag.get("version") or version
            praefix = auftrag.get("adapterPrefix")
            if i > 0 and praefix and messweg != "openai":
                ziel = os.path.join(ARBEIT, f"adapter-{i}")
                STATUS.setze(phase="adapter_laden", stand=stand)
                e2.lade_verzeichnis_herunter(praefix, ziel, lambda n: STATUS.setze(aktuell=n))
                weg.haenge_adapter_an(ziel)
            STATUS.setze(phase="messung", stand=stand, standNr=i + 1, staende=len(auftraege))
            antworten = evalrun.fuehre_aus(weg, suiten, STATUS, abbruch=_ABBRUCH.is_set, wiederholungen=wdh)
            antworten.update({"jobId": JOB_ID, "version": stand, "adapterPrefix": praefix,
                              "basisPrefix": basis_prefix, "stand": _iso(time.time()),
                              "abgebrochen": _ABBRUCH.is_set()})
            eval_prefix = f"{os.environ.get('CON_EVAL_PREFIX', 'con/evals').rstrip('/')}/{stand}/{JOB_ID}"
            e2.put_json(eval_prefix + "/antworten.json", antworten)
            ergebnis["messungen"].append({"version": stand, "adapterPrefix": praefix, "prefix": eval_prefix,
                                          "leistung": antworten["leistung"], "modell": antworten["modell"],
                                          "suiten": [s["suiteId"] for s in antworten["suiten"]],
                                          "abgebrochen": _ABBRUCH.is_set()})
        # Rueckwaertsvertraeglich: aeltere Auswertung liest ergebnis["messung"].
        if ergebnis["messungen"]:
            ergebnis["messung"] = ergebnis["messungen"][-1]
    ergebnis["ok"] = not _ABBRUCH.is_set()
    if _ABBRUCH.is_set():
        ergebnis["grund"] = "zeitgrenze"
    return ergebnis


def main():
    starte_health()
    STATUS.schreibe(erzwinge=True)
    threading.Thread(target=herzschlag, daemon=True).start()
    ergebnis = None
    try:

        ergebnis = lauf()
        STATUS.setze(phase="fertig", ok=bool(ergebnis.get("ok")), fertig=True, ergebnis=ergebnis)
    except Exception as fehler:  # noqa: BLE001
        text = "".join(traceback.format_exception(fehler))[-3000:]
        print(text, flush=True)
        ergebnis = {"jobId": JOB_ID, "modus": MODUS, "ok": False, "grund": "ausnahme", "fehler": str(fehler)[:500]}
        STATUS.setze(phase="fehler", ok=False, fertig=True, fehler=str(fehler)[:500], traceback=text[-1500:])
    ergebnis["laufzeitMinuten"] = round((time.time() - START) / 60, 1)
    ergebnis["beendet"] = _iso(time.time())
    try:
        e2.put_json(LOG_PREFIX + "/ergebnis.json", ergebnis)
    except Exception as f2:  # noqa: BLE001
        print("Ergebnis nach e2 fehlgeschlagen:", str(f2)[:200], flush=True)
    STATUS.schreibe(erzwinge=True)
    if os.environ.get("CON_SELBST_STOP", "YES") == "YES":
        antwort = salad_stop()
        STATUS.setze(saladStop=antwort)
        STATUS.schreibe(erzwinge=True)
    time.sleep(5)
    os._exit(0 if ergebnis.get("ok") else 3)


if __name__ == "__main__":
    main()
