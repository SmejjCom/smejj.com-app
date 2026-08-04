#!/usr/bin/env python3
"""smejj.com LoRA-Trainingsdienst — Trainingszeilen von IDrive e2 holen
(Single Responsibility: Datensatz lesen und mischen).

Liest ausschliesslich den TRAININGSANTEIL. Der Test- und Validierungsanteil
liegt unter eigenen Schluesseln und wird hier nie geoeffnet — das ist die
maschinelle Seite der Regel 'Testdaten nie ins Training'. Der Aufrufer uebergibt
genau einen Schluessel, und der endet auf train.jsonl.

Nur Standardbibliothek: das Abbild soll keine zusaetzlichen Pakete brauchen,
und SigV4 ist in 40 Zeilen erledigt.
"""

import json
import urllib.request

import s3


def _hole(schluessel):
    url, koepfe = s3.signiere("GET", schluessel)
    anfrage = urllib.request.Request(url)
    for name, wert in koepfe.items():
        anfrage.add_header(name, wert)
    with urllib.request.urlopen(anfrage, timeout=120) as antwort:  # noqa: S310
        return antwort.read().decode("utf-8")


def lade_trainingszeilen(schluessel, projekt_anteil=0.5):
    """Laedt den Trainingsanteil. `projekt_anteil` ist vorbereitet fuer die
    spaetere Mischung aus Projektwissen und offenem Korpus; solange nur eine
    Quelle konfiguriert ist, wird sie vollstaendig verwendet."""
    if not schluessel:
        return []
    if not str(schluessel).endswith("train.jsonl"):
        # Harte Grenze statt Vertrauen: ein Schluessel, der nicht auf
        # train.jsonl endet, koennte der Test- oder Validierungsanteil sein.
        raise RuntimeError(f"kein_trainingsanteil:{schluessel}")

    zeilen = []
    for roh in _hole(schluessel).splitlines():
        roh = roh.strip()
        if not roh:
            continue
        try:
            eintrag = json.loads(roh)
        except ValueError:
            continue
        nachrichten = eintrag.get("messages")
        if isinstance(nachrichten, list) and len(nachrichten) >= 2:
            zeilen.append({"messages": nachrichten})

    print(
        f"[smejj-lora-trainer] {len(zeilen)} Trainingszeilen aus {schluessel} "
        f"(projektAnteil={projekt_anteil})",
        flush=True,
    )
    return zeilen
