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
        url = f"https://huggingface.co/{repo}/resolve/{revision}/{d['name']}"
        status.setze(phase="spiegel", aktuell=d["name"], schritt="download", fertigDateien=i, vonDateien=len(dateien),
                     fertigBytes=fertig_bytes, gesamtBytes=gesamt)
        _lade_mit_fortsetzung(url, lokal, d["size"], lambda n: status.setze(aktuellBytes=n))
        if d["sha256"]:
            ist = _sha256_datei(lokal)
            if ist != d["sha256"]:
                os.remove(lokal)
                raise RuntimeError(f"SHA-256 falsch fuer {d['name']}: erwartet {d['sha256'][:12]}…, ist {ist[:12]}…")
        status.setze(schritt="upload")
        e2.lade_hoch(lokal, key)
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


def hole_aus_e2(prefix, arbeitsverzeichnis, status):
    """Basismodell (oder Adapter) komplett aus e2 nach lokal. Liefert Manifest oder wirft."""
    manifest = e2.get_json(prefix.rstrip("/") + "/manifest.json")
    if not manifest or not manifest.get("komplett"):
        raise RuntimeError(f"Kein vollstaendiges Manifest unter {prefix} — erst spiegeln")
    n = len(manifest["dateien"])
    for i, d in enumerate(manifest["dateien"]):
        ziel = os.path.join(arbeitsverzeichnis, d["name"])
        status.setze(phase="laden", aktuell=d["name"], fertigDateien=i, vonDateien=n)
        if os.path.exists(ziel) and os.path.getsize(ziel) == d["size"]:
            continue
        e2.lade_herunter(manifest["prefix"] + d["name"], ziel)
        if os.path.getsize(ziel) != d["size"]:
            raise RuntimeError(f"Download unvollstaendig: {d['name']}")
    status.setze(phase="laden", fertigDateien=n, vonDateien=n)
    return manifest
