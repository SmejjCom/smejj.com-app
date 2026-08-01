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

import datetime
import hashlib
import hmac
import json
import os
import urllib.request

ENDPUNKT = os.environ.get("IDRIVE_E2_ENDPOINT", "")
EIMER = os.environ.get("IDRIVE_E2_MODEL_BUCKET") or os.environ.get("IDRIVE_E2_BUCKET", "")
REGION = os.environ.get("IDRIVE_E2_REGION", "us-west-2")
ZUGRIFF = os.environ.get("IDRIVE_E2_ACCESS_KEY", "")
GEHEIM = os.environ.get("IDRIVE_E2_SECRET_KEY", "")


def _sign(key, msg):
    return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()


def _hole(schluessel):
    if not (ENDPUNKT and EIMER and ZUGRIFF and GEHEIM):
        raise RuntimeError("idrive_konfiguration_unvollstaendig")
    if ".." in schluessel or schluessel.startswith("/"):
        raise RuntimeError("unsicherer_objektschluessel")

    wirt = ENDPUNKT.split("://", 1)[-1].rstrip("/")
    pfad = f"/{EIMER}/{schluessel}"
    jetzt = datetime.datetime.now(datetime.timezone.utc)
    amz = jetzt.strftime("%Y%m%dT%H%M%SZ")
    tag = amz[:8]
    leer = hashlib.sha256(b"").hexdigest()

    kanonisch = (
        f"GET\n{pfad}\n\nhost:{wirt}\nx-amz-content-sha256:{leer}\n"
        f"x-amz-date:{amz}\n\nhost;x-amz-content-sha256;x-amz-date\n{leer}"
    )
    bereich = f"{tag}/{REGION}/s3/aws4_request"
    zu_signieren = (
        f"AWS4-HMAC-SHA256\n{amz}\n{bereich}\n"
        f"{hashlib.sha256(kanonisch.encode('utf-8')).hexdigest()}"
    )
    key = _sign(_sign(_sign(_sign(f"AWS4{GEHEIM}".encode("utf-8"), tag), REGION), "s3"), "aws4_request")
    signatur = hmac.new(key, zu_signieren.encode("utf-8"), hashlib.sha256).hexdigest()

    anfrage = urllib.request.Request(f"{ENDPUNKT.rstrip('/')}{pfad}")
    anfrage.add_header("x-amz-date", amz)
    anfrage.add_header("x-amz-content-sha256", leer)
    anfrage.add_header(
        "Authorization",
        f"AWS4-HMAC-SHA256 Credential={ZUGRIFF}/{bereich}, "
        f"SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature={signatur}",
    )
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
