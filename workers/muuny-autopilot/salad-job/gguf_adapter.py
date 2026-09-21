"""Wandelt einen trainierten LoRA-Adapter in das Format, das der Hausmodell-
Dienst wirklich laden kann.

WOZU: Bis zum 10.09.2026 lagen neun trainierte Adapter in der Ablage und kein
einziger konnte je benutzt werden. Der Hausmodell-Dienst faehrt llama.cpp und
liest GGUF; das Training legt PEFT-safetensors ab. Zwei Formate, die einander
nicht kennen — und niemandem fiel es auf, weil der Dienst klaglos die nackte
Basis auslieferte.

WAS HIER PASSIERT: `convert_lora_to_gguf.py` aus dem llama.cpp-Projekt liest den
Adapterordner und schreibt eine einzelne .gguf-Datei. Sie wandert nach e2, und
daneben eine kleine Beschreibung mit Groesse und Pruefsumme — genau die Angaben,
die der Katalog des Hausmodell-Dienstes braucht, um sie anzunehmen.

WARUM DAS SCHEITERN DARF: Der Adapter selbst ist zu diesem Zeitpunkt laengst
gesichert. Eine misslungene Umwandlung kostet die Nutzbarkeit, nicht die Arbeit
— sie darf den Trainingslauf darum nicht zum Absturz bringen. Der Grund wird
vermerkt und der Lauf gilt weiter als erfolgreich.
"""

import hashlib
import json
import os
import subprocess
import sys
import io
import tarfile
import urllib.request
from lager import lager  # noqa: E402

# Feste Fassung statt "main": ein Konverter, der sich ueber Nacht aendert, macht
# aus einem reproduzierbaren Lauf ein Gluecksspiel. b6100 ist die Fassung, die
# zur llama.cpp-Version des Hausmodell-Abbilds passt (Dockerfile: b10729 —
# das Konverterskript ist zwischen diesen Staenden unveraendert geblieben).
# FESTE Fassung, aber eine, die Qwen3.5 kennt.
#
# Bis zum 21.09.2026 stand hier b6100. Diese Fassung kennt die Architektur von
# Qwen3.8-27B nicht ("Model Qwen3_5ForConditionalGeneration is not supported") —
# JEDE Umwandlung ist gescheitert, bei muuny-1.7 bis 1.11 ohne Ausnahme, und kein
# einziger trainierter Adapter haette je in der Laufzeit landen koennen.
# b11070 enthaelt die Architektur (conversion/qwen.py).
#
# Und nicht mehr zwei Einzeldateien: ab dieser Fassung ist der Konverter ein
# PAKET (conversion/) und bringt sein eigenes gguf-Modul mit (gguf-py/). Ein pip-
# gguf in anderer Fassung passt nicht zu den Konstanten des Konverters. Geholt
# wird darum der Quellstand des Tags, und zwar nur die Teile, die gebraucht werden.
LLAMA_TAG = os.environ.get("MUUNY_LLAMA_TAG", "b11070")
LLAMA_ARCHIV = f"https://codeload.github.com/ggml-org/llama.cpp/tar.gz/refs/tags/{LLAMA_TAG}"
KONVERTER_TEILE = ("convert_lora_to_gguf.py", "convert_hf_to_gguf.py", "conversion/", "gguf-py/")
# Woran man sieht, dass die Fassung das Grundmodell kennt — geprueft VOR dem Lauf,
# damit ein falscher Tag in Sekunden auffaellt und nicht nach zwei Stunden Training.
ARCHITEKTUR = "Qwen3_5ForConditionalGeneration"
# sentencepiece fuer Tokenizer; transformers liegt im Trainingsjob ohnehin vor.
# gguf kommt bewusst NICHT von pip, sondern aus gguf-py des Tags.
GGUF_PAKETE = ["sentencepiece"]


def sha256_von(pfad):
    h = hashlib.sha256()
    with open(pfad, "rb") as f:
        for stueck in iter(lambda: f.read(1024 * 1024), b""):
            h.update(stueck)
    return h.hexdigest()


def _hole_konverter(ziel_dir, oeffne=urllib.request.urlopen):
    """Holt den Konverter-Quellstand des festen Tags. Gibt das Wurzelverzeichnis zurueck.

    Getrennt, damit ein Test das Netz ersetzen kann.
    """
    wurzel = os.path.join(ziel_dir, f"llama.cpp-{LLAMA_TAG}")
    fertig = os.path.join(wurzel, "convert_lora_to_gguf.py")
    if not os.path.exists(fertig):
        os.makedirs(ziel_dir, exist_ok=True)
        with oeffne(LLAMA_ARCHIV, timeout=300) as antwort:
            inhalt = antwort.read()
        if len(inhalt) < 100_000:
            raise RuntimeError(f"konverter_zu_klein: {len(inhalt)} Bytes von {LLAMA_ARCHIV}")
        with tarfile.open(fileobj=io.BytesIO(inhalt), mode="r:gz") as archiv:
            for teil in archiv.getmembers():
                # "llama.cpp-b11070/conversion/qwen.py" -> "conversion/qwen.py"
                relativ = teil.name.split("/", 1)[1] if "/" in teil.name else ""
                if not relativ or ".." in relativ.split("/") or relativ.startswith("/"):
                    continue
                if not any(relativ == t or relativ.startswith(t) for t in KONVERTER_TEILE):
                    continue
                if not (teil.isfile() or teil.isdir()):
                    continue
                ziel = os.path.join(wurzel, relativ)
                if teil.isdir():
                    os.makedirs(ziel, exist_ok=True)
                    continue
                os.makedirs(os.path.dirname(ziel), exist_ok=True)
                with archiv.extractfile(teil) as quelle, open(ziel, "wb") as f:
                    f.write(quelle.read())
    for pflicht in ("convert_lora_to_gguf.py", "convert_hf_to_gguf.py", "conversion", "gguf-py"):
        if not os.path.exists(os.path.join(wurzel, pflicht)):
            raise RuntimeError(f"konverter_unvollstaendig: {pflicht} fehlt in {LLAMA_TAG}")
    kennt = False
    for datei in os.listdir(os.path.join(wurzel, "conversion")):
        if datei.endswith(".py"):
            with open(os.path.join(wurzel, "conversion", datei), encoding="utf-8", errors="ignore") as f:
                if ARCHITEKTUR in f.read():
                    kennt = True
                    break
    if not kennt:
        raise RuntimeError(f"konverter_kennt_architektur_nicht: {ARCHITEKTUR} fehlt in {LLAMA_TAG}")
    return wurzel


def wandle(adapter_dir, basis_dir, ausgabe_dir, name, status=None, pip=None, lauf=subprocess.run):
    """PEFT-Adapter -> GGUF. Gibt die Beschreibung zurueck, die der Katalog braucht.

    adapter_dir  Ordner mit adapter_model.safetensors und adapter_config.json
    basis_dir    das Basismodell (der Konverter braucht seine Architektur)
    ausgabe_dir  wohin die .gguf geschrieben wird
    name         Dateiname ohne Endung, z. B. "smejj-1-8-lora"
    """
    for pflicht in ("adapter_config.json",):
        if not os.path.exists(os.path.join(adapter_dir, pflicht)):
            raise RuntimeError(f"adapter_unvollstaendig: {pflicht} fehlt in {adapter_dir}")

    if status:
        status.setze(phase="gguf_umwandlung")
    if pip:
        pip(GGUF_PAKETE)

    os.makedirs(ausgabe_dir, exist_ok=True)
    wurzel = _hole_konverter(ausgabe_dir)
    konverter = os.path.join(wurzel, "convert_lora_to_gguf.py")
    ziel = os.path.join(ausgabe_dir, f"{name}.gguf")

    # Das Paket conversion/ und das passende gguf aus gguf-py/ muessen VOR jedem
    # pip-gguf gefunden werden — daher beide an den Anfang des Suchpfads.
    umgebung = {**os.environ, "PYTHONPATH": os.pathsep.join(
        [wurzel, os.path.join(wurzel, "gguf-py"), os.environ.get("PYTHONPATH", "")])}
    r = lauf(
        [sys.executable, konverter, adapter_dir, "--base", basis_dir, "--outfile", ziel, "--outtype", "f16"],
        capture_output=True, text=True, timeout=1800, cwd=wurzel, env=umgebung
    )
    if r.returncode != 0:
        # Die letzten Zeilen genuegen: der Konverter schreibt seinen Grund ans Ende.
        raise RuntimeError("konverter_fehlgeschlagen: " + (r.stderr or r.stdout or "")[-800:])
    if not os.path.exists(ziel):
        raise RuntimeError("konverter_ohne_datei")

    groesse = os.path.getsize(ziel)
    if groesse < 1024:
        raise RuntimeError(f"gguf_zu_klein: {groesse} Bytes — das kann kein Adapter sein")

    return {
        "datei": os.path.basename(ziel),
        "pfad": ziel,
        "sizeBytes": groesse,
        "sha256": sha256_von(ziel),
    }


def wandle_und_sichere(adapter_dir, basis_dir, arbeit_dir, kandidat, e2, status=None, pip=None):
    """Der ganze Weg: umwandeln, nach e2 legen, Beschreibung ablegen.

    Wirft NICHT. Gibt bei Erfolg die Beschreibung zurueck, sonst None — der
    Adapter ist zu diesem Zeitpunkt gesichert, und eine misslungene Umwandlung
    darf den Lauf nicht kosten.
    """
    prefix = f"{lager()}versions/{kandidat}/adapter-gguf"
    try:
        beschreibung = wandle(
            adapter_dir, basis_dir, os.path.join(arbeit_dir, "gguf"), f"{kandidat}-lora",
            status=status, pip=pip
        )
    except Exception as fehler:  # noqa: BLE001 — jeder Grund ist hier gleich harmlos
        print(f"[gguf] Umwandlung uebersprungen: {fehler}", flush=True)
        try:
            e2.put_json(f"{prefix}/fehlgeschlagen.json", {"grund": str(fehler)[:900], "kandidat": kandidat})
        except Exception:  # noqa: BLE001
            pass
        return None

    e2.lade_hoch(beschreibung["pfad"], f"{prefix}/{beschreibung['datei']}")
    # Die Beschreibung ist das, was der Hausmodell-Katalog braucht: ohne
    # Pruefsumme und Groesse lehnt er den Adapter ab (und das zu Recht).
    eintrag = {
        "datei": beschreibung["datei"],
        "sizeBytes": beschreibung["sizeBytes"],
        "sha256": beschreibung["sha256"],
        "prefix": prefix,
        "version": kandidat,
    }
    e2.put_json(f"{prefix}/adapter.json", eintrag)
    print(f"[gguf] {beschreibung['datei']} nach {prefix} gelegt "
          f"({beschreibung['sizeBytes'] / 1e6:.1f} MB)", flush=True)
    return eintrag
