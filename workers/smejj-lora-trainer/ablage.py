#!/usr/bin/env python3
"""smejj.com LoRA-Trainingsdienst — trainierten Adapter sichern
(Single Responsibility: Dateien nach IDrive e2 schreiben).

WARUM ES DIESES MODUL GIBT — am 2026-08-04 gemessen:
Der erste echte Trainingslauf lief acht Minuten durch und legte den Adapter mit
`save_pretrained` unter /tmp/smejj-lora/<kennung> ab. Das ist die CONTAINER-
Platte. Salad ersetzt Instanzen regelmaessig; der Adapter waere beim naechsten
Neustart weg gewesen — und der Loop haette den lokalen Pfad als "bester Stand"
nach IDrive geschrieben, also einen Verweis, der aussieht wie ein Ergebnis und
keines ist.

Ein Dauerbetrieb, der rund um die Uhr trainiert und nichts behaelt, ist teurer
Stillstand. Deshalb wandert der Adapter hier ins Object Brain, und der Loop
bekommt einen IDrive-Schluessel statt eines Containerpfads zurueck.

Nur Standardbibliothek.
"""

import os
import urllib.error
import urllib.request

import s3

# Adapter sind klein (LoRA Rang 8 auf q/k/v/o eines 8B-Modells: wenige MB).
# Die Grenze schuetzt davor, versehentlich ein ganzes Basismodell hochzuladen,
# falls jemand AUSGABE_WURZEL auf ein Modellverzeichnis stellt.
MAX_DATEI_BYTES = int(os.environ.get("SMEJJ_TRAINER_MAX_ADAPTER_BYTES", str(512 * 1024 * 1024)))
VERSUCHE = 3


def _lege_ab(schluessel, inhalt):
    url, koepfe = s3.signiere("PUT", schluessel, inhalt)
    anfrage = urllib.request.Request(url, data=inhalt, method="PUT")
    for name, wert in koepfe.items():
        anfrage.add_header(name, wert)
    anfrage.add_header("content-length", str(len(inhalt)))
    with urllib.request.urlopen(anfrage, timeout=300) as antwort:  # noqa: S310
        return antwort.status


def lege_adapter_ab(verzeichnis, praefix):
    """Laedt alle Dateien des Adapterverzeichnisses hoch.

    Gibt den IDrive-Praefix zurueck, unter dem der Adapter liegt.
    Wirft, wenn auch nach Wiederholungen etwas nicht ankommt — ein halb
    hochgeladener Adapter darf NIE als Erfolg gelten, sonst merkt der Loop sich
    einen Stand, den niemand wiederherstellen kann.
    """
    if not os.path.isdir(verzeichnis):
        raise RuntimeError(f"adapterverzeichnis_fehlt:{verzeichnis}")

    praefix = praefix.rstrip("/")
    dateien = sorted(
        name for name in os.listdir(verzeichnis)
        if os.path.isfile(os.path.join(verzeichnis, name))
    )
    if not dateien:
        raise RuntimeError(f"adapterverzeichnis_leer:{verzeichnis}")

    gesamt = 0
    for name in dateien:
        pfad = os.path.join(verzeichnis, name)
        groesse = os.path.getsize(pfad)
        if groesse > MAX_DATEI_BYTES:
            raise RuntimeError(f"adapterdatei_zu_gross:{name}:{groesse}")
        with open(pfad, "rb") as datei:
            inhalt = datei.read()

        schluessel = f"{praefix}/{name}"
        letzter = None
        for versuch in range(1, VERSUCHE + 1):
            try:
                _lege_ab(schluessel, inhalt)
                letzter = None
                break
            except (urllib.error.URLError, OSError) as fehler:  # noqa: PERF203
                letzter = fehler
                print(
                    f"[smejj-lora-trainer] Upload {name} Versuch {versuch}/{VERSUCHE} "
                    f"fehlgeschlagen: {str(fehler)[:160]}",
                    flush=True,
                )
        if letzter is not None:
            raise RuntimeError(f"adapter_upload_fehlgeschlagen:{name}:{str(letzter)[:160]}")
        gesamt += groesse

    print(
        f"[smejj-lora-trainer] Adapter abgelegt: {praefix} "
        f"({len(dateien)} Dateien, {gesamt} Byte)",
        flush=True,
    )
    return praefix
