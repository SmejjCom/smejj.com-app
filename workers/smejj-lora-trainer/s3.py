#!/usr/bin/env python3
"""smejj.com LoRA-Trainingsdienst — SigV4 fuer IDrive e2
(Single Responsibility: eine Anfrage signieren).

Gemeinsame Grundlage von datenlader.py (liest den Datensatz) und ablage.py
(schreibt den Adapter). Zwei Kopien derselben Signaturlogik waeren zwei Stellen,
an denen ein Sonderfall vergessen wird — und Signaturfehler melden sich als
nichtssagendes HTTP 403.

Nur Standardbibliothek: das Abbild soll dafuer kein Paket nachladen muessen.
"""

import datetime
import hashlib
import hmac
import os

LEERER_HASH = hashlib.sha256(b"").hexdigest()


def konfiguration():
    """Die fuenf Werte, ohne die keine Anfrage moeglich ist.

    Wirft, statt mit leeren Zeichenketten zu signieren: eine Anfrage mit leerem
    Schluessel wird mit HTTP 403 abgewiesen, und man sucht den Fehler dann in
    der Signatur statt in der Umgebung.
    """
    endpunkt = os.environ.get("IDRIVE_E2_ENDPOINT", "")
    eimer = os.environ.get("IDRIVE_E2_MODEL_BUCKET") or os.environ.get("IDRIVE_E2_BUCKET", "")
    region = os.environ.get("IDRIVE_E2_REGION", "us-west-2")
    zugriff = os.environ.get("IDRIVE_E2_ACCESS_KEY", "")
    geheim = os.environ.get("IDRIVE_E2_SECRET_KEY", "")
    if not (endpunkt and eimer and zugriff and geheim):
        raise RuntimeError("idrive_konfiguration_unvollstaendig")
    return endpunkt, eimer, region, zugriff, geheim


def _sign(key, msg):
    return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()


def pruefe_schluessel(schluessel):
    """Ein Objektschluessel darf nicht aus dem vorgesehenen Bereich ausbrechen."""
    if not schluessel or ".." in schluessel or schluessel.startswith("/"):
        raise RuntimeError(f"unsicherer_objektschluessel:{schluessel}")
    return schluessel


def signiere(methode, schluessel, nutzlast=b"", jetzt=None):
    """Signiert eine S3-Anfrage und gibt (url, koepfe) zurueck.

    `nutzlast` wird fuer den Kopf x-amz-content-sha256 gehasht. Bei GET ist sie
    leer; bei PUT MUSS es der Hash des tatsaechlichen Inhalts sein — ein
    Platzhalter dort ergibt HTTP 403 mit einer Meldung ueber die Signatur, was
    in eine voellig falsche Richtung weist.
    """
    endpunkt, eimer, region, zugriff, geheim = konfiguration()
    pruefe_schluessel(schluessel)

    wirt = endpunkt.split("://", 1)[-1].rstrip("/")
    pfad = f"/{eimer}/{schluessel}"
    jetzt = jetzt or datetime.datetime.now(datetime.timezone.utc)
    amz = jetzt.strftime("%Y%m%dT%H%M%SZ")
    tag = amz[:8]
    inhalt_hash = hashlib.sha256(nutzlast).hexdigest()

    kanonisch = (
        f"{methode}\n{pfad}\n\nhost:{wirt}\nx-amz-content-sha256:{inhalt_hash}\n"
        f"x-amz-date:{amz}\n\nhost;x-amz-content-sha256;x-amz-date\n{inhalt_hash}"
    )
    bereich = f"{tag}/{region}/s3/aws4_request"
    zu_signieren = (
        f"AWS4-HMAC-SHA256\n{amz}\n{bereich}\n"
        f"{hashlib.sha256(kanonisch.encode('utf-8')).hexdigest()}"
    )
    key = _sign(_sign(_sign(_sign(f"AWS4{geheim}".encode("utf-8"), tag), region), "s3"), "aws4_request")
    signatur = hmac.new(key, zu_signieren.encode("utf-8"), hashlib.sha256).hexdigest()

    koepfe = {
        "x-amz-date": amz,
        "x-amz-content-sha256": inhalt_hash,
        "Authorization": (
            f"AWS4-HMAC-SHA256 Credential={zugriff}/{bereich}, "
            f"SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature={signatur}"
        ),
    }
    return f"{endpunkt.rstrip('/')}{pfad}", koepfe
