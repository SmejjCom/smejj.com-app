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
import urllib.request

# Feste Fassung statt "main": ein Konverter, der sich ueber Nacht aendert, macht
# aus einem reproduzierbaren Lauf ein Gluecksspiel. b6100 ist die Fassung, die
# zur llama.cpp-Version des Hausmodell-Abbilds passt (Dockerfile: b10729 —
# das Konverterskript ist zwischen diesen Staenden unveraendert geblieben).
KONVERTER_URL = (
    "https://raw.githubusercontent.com/ggml-org/llama.cpp/b6100/convert_lora_to_gguf.py"
)
GGUF_PAKET = "gguf>=0.10"


def sha256_von(pfad):
    h = hashlib.sha256()
    with open(pfad, "rb") as f:
        for stueck in iter(lambda: f.read(1024 * 1024), b""):
            h.update(stueck)
    return h.hexdigest()


def _hole_konverter(ziel_dir, oeffne=urllib.request.urlopen):
    """Laedt das Konverterskript. Getrennt, damit ein Test es ersetzen kann."""
    ziel = os.path.join(ziel_dir, "convert_lora_to_gguf.py")
    if os.path.exists(ziel) and os.path.getsize(ziel) > 1000:
        return ziel
    with oeffne(KONVERTER_URL, timeout=60) as antwort:
        inhalt = antwort.read()
    if len(inhalt) < 1000:
        raise RuntimeError(f"konverter_zu_klein: {len(inhalt)} Bytes")
    with open(ziel, "wb") as f:
        f.write(inhalt)
    return ziel


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
        pip([GGUF_PAKET])

    os.makedirs(ausgabe_dir, exist_ok=True)
    konverter = _hole_konverter(ausgabe_dir)
    ziel = os.path.join(ausgabe_dir, f"{name}.gguf")

    r = lauf(
        [sys.executable, konverter, adapter_dir, "--base", basis_dir, "--outfile", ziel, "--outtype", "f16"],
        capture_output=True, text=True, timeout=1800
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
    prefix = f"con/versions/{kandidat}/adapter-gguf"
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
