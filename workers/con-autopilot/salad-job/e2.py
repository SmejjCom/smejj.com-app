"""con-Autopilot — iDrive-e2-Zugriff fuer den Salad-Job (Single Responsibility: S3-I/O).

Alles Bleibende liegt in e2. Dieses Modul kennt nur Schluessel unter dem
Bucket, keine Modelle, keine Trainingslogik. Fail-closed: ohne vollstaendige
Zugangsdaten startet kein Job (siehe konfiguration()).

Keine Zugangsdaten werden je protokolliert.
"""
import json
import os
import threading

import boto3
from boto3.s3.transfer import TransferConfig
from botocore.config import Config
from botocore.exceptions import ClientError

_LOCK = threading.Lock()
_CLIENT = None
_BUCKET = None

# 16 MiB-Teile, wenige parallele Teile: passt zu Salad-Knoten mit schwankender
# Leitung und haelt den Speicherbedarf klein.
# Gemessen 03.09.: 4 Teile x 16 MiB ergaben nur ~5 MB/s vom Salad-Knoten nach e2.
_TRANSFER = TransferConfig(multipart_threshold=64 * 1024 * 1024,
                           multipart_chunksize=32 * 1024 * 1024,
                           max_concurrency=int(os.environ.get("CON_E2_PARALLEL", "10")),
                           use_threads=True)


def konfiguration():
    fehlend = [n for n in ("IDRIVE_E2_ENDPOINT", "IDRIVE_E2_BUCKET",
                           "IDRIVE_E2_ACCESS_KEY", "IDRIVE_E2_SECRET_KEY") if not os.environ.get(n)]
    if fehlend:
        raise RuntimeError("e2-Zugang unvollstaendig: " + ", ".join(fehlend))
    return {
        "endpoint": os.environ["IDRIVE_E2_ENDPOINT"].rstrip("/"),
        "region": os.environ.get("IDRIVE_E2_REGION", "us-west-2"),
        "bucket": os.environ["IDRIVE_E2_BUCKET"],
    }


def client():
    global _CLIENT, _BUCKET
    with _LOCK:
        if _CLIENT is None:
            k = konfiguration()
            _BUCKET = k["bucket"]
            _CLIENT = boto3.client(
                "s3",
                endpoint_url=k["endpoint"],
                region_name=k["region"],
                aws_access_key_id=os.environ["IDRIVE_E2_ACCESS_KEY"],
                aws_secret_access_key=os.environ["IDRIVE_E2_SECRET_KEY"],
                config=Config(retries={"max_attempts": 10, "mode": "adaptive"},
                              connect_timeout=30, read_timeout=300,
                              s3={"addressing_style": "path"}),
            )
        return _CLIENT, _BUCKET


def groesse(key):
    """Groesse in Bytes oder None, wenn der Schluessel fehlt."""
    c, b = client()
    try:
        return int(c.head_object(Bucket=b, Key=key)["ContentLength"])
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") in ("404", "NoSuchKey", "NotFound"):
            return None
        raise


def liste(prefix):
    c, b = client()
    out = []
    token = None
    while True:
        kw = {"Bucket": b, "Prefix": prefix}
        if token:
            kw["ContinuationToken"] = token
        r = c.list_objects_v2(**kw)
        for o in r.get("Contents", []):
            out.append({"key": o["Key"], "size": int(o["Size"]), "modified": o["LastModified"].isoformat()})
        if not r.get("IsTruncated"):
            return out
        token = r.get("NextContinuationToken")


def lade_hoch(pfad, key, fortschritt=None):
    c, b = client()
    c.upload_file(pfad, b, key, Config=_TRANSFER, Callback=fortschritt)


def lade_herunter(key, pfad, fortschritt=None):
    os.makedirs(os.path.dirname(pfad) or ".", exist_ok=True)
    c, b = client()
    c.download_file(b, key, pfad, Config=_TRANSFER, Callback=fortschritt)


def put_json(key, wert):
    c, b = client()
    c.put_object(Bucket=b, Key=key, Body=json.dumps(wert, ensure_ascii=False, indent=2).encode("utf-8"),
                 ContentType="application/json")


def get_json(key, standard=None):
    c, b = client()
    try:
        return json.loads(c.get_object(Bucket=b, Key=key)["Body"].read().decode("utf-8"))
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") in ("404", "NoSuchKey", "NotFound"):
            return standard
        raise


def put_text(key, text, content_type="text/plain; charset=utf-8"):
    c, b = client()
    c.put_object(Bucket=b, Key=key, Body=text.encode("utf-8"), ContentType=content_type)


def lade_verzeichnis_hoch(verzeichnis, prefix, fortschritt=None):
    """Alle Dateien eines Verzeichnisses rekursiv unter prefix ablegen. Liefert Manifest."""
    manifest = []
    for wurzel, _, dateien in os.walk(verzeichnis):
        for name in sorted(dateien):
            voll = os.path.join(wurzel, name)
            rel = os.path.relpath(voll, verzeichnis).replace(os.sep, "/")
            key = prefix.rstrip("/") + "/" + rel
            lade_hoch(voll, key)
            manifest.append({"key": key, "size": os.path.getsize(voll)})
            if fortschritt:
                fortschritt(rel)
    return manifest


def lade_verzeichnis_herunter(prefix, verzeichnis, fortschritt=None):
    eintraege = liste(prefix.rstrip("/") + "/")
    for e in eintraege:
        rel = e["key"][len(prefix.rstrip("/")) + 1:]
        ziel = os.path.join(verzeichnis, rel)
        if os.path.exists(ziel) and os.path.getsize(ziel) == e["size"]:
            continue
        lade_herunter(e["key"], ziel)
        if fortschritt:
            fortschritt(rel)
    return eintraege
