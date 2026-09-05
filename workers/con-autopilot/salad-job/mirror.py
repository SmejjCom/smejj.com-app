"""con-Autopilot — Basismodell von Hugging Face nach e2 spiegeln (Single Responsibility: Spiegel).

Warum ueberhaupt: Das Qwen3.8-27B in e2 (model-files/Qwen3.8-27B-MLX-4bit) ist
das Apple-MLX-4-Bit-Format — auf einer NVIDIA-Karte laesst sich darauf kein
QLoRA rechnen. Die bf16-Originalgewichte (55,6 GB) laedt der Salad-Knoten
direkt von Hugging Face und legt sie EINMAL nach e2. Danach kommt jedes
Training und jede Messung nur noch aus e2.

Wiederaufnahme: Jede Datei wird einzeln geprueft (Groesse in e2 == Groesse bei
Hugging Face -> ueberspringen). Ein Abbruch durch Salad kostet damit hoechstens
die gerade laufende Datei. Beim Herunterladen wird mit HTTP-Range fortgesetzt.

Pruefung: Fuer LFS-Dateien liefert Hugging Face den SHA-256; er wird nach dem
Herunterladen nachgerechnet. Eine Datei mit falscher Summe wird NICHT
hochgeladen.
"""
import hashlib
import json
import os
import threading
import time
import urllib.request

import e2

HF_API = "https://huggingface.co/api/models/"


def _http_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "smejj-con-autopilot/1"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def dateiliste(repo, revision="main"):
    meta = _http_json(f"{HF_API}{repo}/revision/{revision}?blobs=true")
    out = []
    for s in meta.get("siblings", []):
        out.append({
            "name": s["rfilename"],
            "size": int(s.get("size") or 0),
            "sha256": (s.get("lfs") or {}).get("sha256"),
        })
    return {"sha": meta.get("sha"), "dateien": out}


def _sha256_datei(pfad):
    h = hashlib.sha256()
    with open(pfad, "rb") as f:
        for block in iter(lambda: f.read(8 * 1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def _lade_mit_fortsetzung(url, ziel, erwartet, melde):
    os.makedirs(os.path.dirname(ziel) or ".", exist_ok=True)
    versuch = 0
    while True:
        vorhanden = os.path.getsize(ziel) if os.path.exists(ziel) else 0
        if erwartet and vorhanden >= erwartet:
            return
        versuch += 1
        req = urllib.request.Request(url, headers={"User-Agent": "smejj-con-autopilot/1"})
        if vorhanden:
            req.add_header("Range", f"bytes={vorhanden}-")
        try:
            with urllib.request.urlopen(req, timeout=120) as r, open(ziel, "ab" if vorhanden else "wb") as f:
                if vorhanden and r.status != 206:
                    # Server ignoriert Range -> von vorn
                    f.close()
                    open(ziel, "wb").close()
                    continue
                letzte = time.time()
                while True:
                    block = r.read(4 * 1024 * 1024)
                    if not block:
                        break
                    f.write(block)
                    if time.time() - letzte > 20:
                        melde(os.path.getsize(ziel))
                        letzte = time.time()
            if not erwartet or os.path.getsize(ziel) >= erwartet:
                return
        except Exception as fehler:  # noqa: BLE001 — jeder Netzfehler ist hier ein Wiederholungsgrund
            if versuch >= 30:
                raise RuntimeError(f"Download scheitert dauerhaft: {url}: {fehler}") from fehler
            time.sleep(min(60, 5 * versuch))


def spiegle(repo, prefix, arbeitsverzeichnis, status, revision="main", behalte_lokal=True, abbruch=lambda: False):
    """Spiegelt alle Dateien von repo nach e2 unter prefix. Liefert Manifest."""
    info = dateiliste(repo, revision)
    dateien = info["dateien"]
    gesamt = sum(d["size"] for d in dateien)
    manifest_key = prefix.rstrip("/") + "/manifest.json"
    fertig_bytes = 0
    ergebnis = []
    def _braucht_download(d):
        key = prefix.rstrip("/") + "/" + d["name"]
        in_e2 = e2.groesse(key)
        return not (in_e2 is not None and in_e2 == d["size"])

    def _lade(d):
        lokal = os.path.join(arbeitsverzeichnis, d["name"])
        url = f"https://huggingface.co/{repo}/resolve/{revision}/{d['name']}"
        _lade_mit_fortsetzung(url, lokal, d["size"], lambda n: status.setze(aktuellBytes=n))

    vorab = {}  # name -> Thread, der die Datei schon herunterlaedt

    def _vorab_starten(ab_index):
        for d in dateien[ab_index:ab_index + 1]:
            if d["name"] in vorab or abbruch():
                continue
            if _braucht_download(d):
                t = threading.Thread(target=_lade, args=(d,), daemon=True)
                t.start()
                vorab[d["name"]] = t

    for i, d in enumerate(dateien):
        if abbruch():
            status.setze(phase="spiegel", hinweis="abbruch_gewuenscht", fertigDateien=i, vonDateien=len(dateien))
            break
        key = prefix.rstrip("/") + "/" + d["name"]
        lokal = os.path.join(arbeitsverzeichnis, d["name"])
        in_e2 = e2.groesse(key)
        if in_e2 is not None and in_e2 == d["size"]:
            fertig_bytes += d["size"]
            ergebnis.append({"name": d["name"], "size": d["size"], "sha256": d["sha256"], "quelle": "bereits_in_e2"})
            status.setze(phase="spiegel", fertigDateien=i + 1, vonDateien=len(dateien),
                         fertigBytes=fertig_bytes, gesamtBytes=gesamt, aktuell=d["name"])
            if behalte_lokal and not (os.path.exists(lokal) and os.path.getsize(lokal) == d["size"]):
                e2.lade_herunter(key, lokal)
            continue
        status.setze(phase="spiegel", aktuell=d["name"], schritt="download", fertigDateien=i, vonDateien=len(dateien),
                     fertigBytes=fertig_bytes, gesamtBytes=gesamt)
        t = vorab.pop(d["name"], None)
        if t is not None:
            t.join()
        if not (os.path.exists(lokal) and os.path.getsize(lokal) >= (d["size"] or 1)):
            _lade(d)
        # Naechste Datei schon laden, waehrend diese geprueft und hochgeladen wird (Leitung doppelt genutzt).
        _vorab_starten(i + 1)
        if d["sha256"]:
            status.setze(schritt="pruefen")
            ist = _sha256_datei(lokal)
            if ist != d["sha256"]:
                os.remove(lokal)
                raise RuntimeError(f"SHA-256 falsch fuer {d['name']}: erwartet {d['sha256'][:12]}…, ist {ist[:12]}…")
        status.setze(schritt="upload", aktuellBytes=0)
        hochgeladen = [0, time.time()]

        def _upload_fortschritt(n):
            hochgeladen[0] += n
            if time.time() - hochgeladen[1] > 20:
                hochgeladen[1] = time.time()
                status.setze(aktuellBytes=hochgeladen[0])

        e2.lade_hoch(lokal, key, fortschritt=_upload_fortschritt)
        if e2.groesse(key) != os.path.getsize(lokal):
            raise RuntimeError(f"Upload unvollstaendig: {key}")
        fertig_bytes += d["size"]
        ergebnis.append({"name": d["name"], "size": d["size"], "sha256": d["sha256"], "quelle": "huggingface"})
        status.setze(fertigDateien=i + 1, fertigBytes=fertig_bytes)
        if not behalte_lokal:
            os.remove(lokal)
    komplett = len(ergebnis) == len(dateien)
    manifest = {
        "repo": repo, "revision": revision, "commit": info["sha"], "prefix": prefix.rstrip("/") + "/",
        "dateien": ergebnis, "gesamtBytes": gesamt, "komplett": komplett,
        "geprueft": "sha256 (LFS) + Groesse", "stand": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    e2.put_json(manifest_key, manifest)
    return manifest


def hole_aus_e2(prefix, arbeitsverzeichnis, status, parallel=None):
    """Basismodell (oder Adapter) komplett aus e2 nach lokal. Liefert Manifest oder wirft.

    Parallel, weil es der Zeitfresser jedes Mess-Jobs ist: 55,6 GB nacheinander
    brauchen bei rund 10 MB/s ueber 90 Minuten und fressen damit die Zeitgrenze
    auf, bevor ueberhaupt gemessen wird. Mehrere Dateien gleichzeitig nutzen die
    Leitung des Knotens aus; boto3 laedt jede Datei zusaetzlich in Teilen.
    Bereits vollstaendig vorhandene Dateien werden uebersprungen (Wiederaufnahme).
    """
    manifest = e2.get_json(prefix.rstrip("/") + "/manifest.json")
    if not manifest or not manifest.get("komplett"):
        raise RuntimeError(f"Kein vollstaendiges Manifest unter {prefix} — erst spiegeln")
    dateien = manifest["dateien"]
    n = len(dateien)
    if parallel is None:
        parallel = int(os.environ.get("CON_E2_DATEIEN_PARALLEL", "4"))
    parallel = max(1, min(8, parallel))

    offen = []
    fertig = [0]
    for d in dateien:
        ziel = os.path.join(arbeitsverzeichnis, d["name"])
        if os.path.exists(ziel) and os.path.getsize(ziel) == d["size"]:
            fertig[0] += 1
        else:
            offen.append(d)
    status.setze(phase="laden", fertigDateien=fertig[0], vonDateien=n, parallel=parallel)

    sperre = threading.Lock()
    fehler = []

    def _hole(d):
        ziel = os.path.join(arbeitsverzeichnis, d["name"])
        # Netzfehler beim Holen sind normal, nicht endgueltig: am 05.09. starb ein ganzer
        # Trainingslauf an einem einzelnen "[SYS] unknown error (_ssl.c:2580)" mitten in
        # 55 GB. Ein zweiter und dritter Versuch kostet Sekunden, ein neuer Lauf Stunden.
        letzter = None
        for versuch in range(1, 5):
            try:
                e2.lade_herunter(manifest["prefix"] + d["name"], ziel)
                if os.path.getsize(ziel) != d["size"]:
                    raise RuntimeError(f"Download unvollstaendig: {d['name']}")
                break
            except Exception as f:  # noqa: BLE001 — Fehler eines Strangs darf die anderen nicht verschlucken
                letzter = f
                if versuch < 4:
                    time.sleep(min(30, 5 * versuch))
        else:
            letzter = letzter or RuntimeError("unbekannt")
        if letzter is not None and not (os.path.exists(ziel) and os.path.getsize(ziel) == d["size"]):
            with sperre:
                fehler.append(f"{d['name']}: {str(letzter)[:200]}")
            return
        with sperre:
            fertig[0] += 1
            status.setze(phase="laden", aktuell=d["name"], fertigDateien=fertig[0], vonDateien=n)

    for start in range(0, len(offen), parallel):
        gruppe = offen[start:start + parallel]
        straenge = [threading.Thread(target=_hole, args=(d,), daemon=True) for d in gruppe]
        for t in straenge:
            t.start()
        for t in straenge:
            t.join()
        if fehler:
            raise RuntimeError("Laden aus e2 gescheitert: " + " | ".join(fehler[:3]))

    status.setze(phase="laden", fertigDateien=n, vonDateien=n)
    return manifest
