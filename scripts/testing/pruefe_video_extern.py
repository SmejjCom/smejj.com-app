#!/usr/bin/env python3
"""smejj.com — prueft die externe Video-Engine (Weg C) am VERHALTEN.

Faelle: fail-closed ohne Schluessel, Erfolgsweg (genau 1 POST), Tagesdeckel,
SSRF-Schutz (fremde video_url wird NIE geladen), FAILED-Rueckfall. requests
und fastapi werden gestubbt — laeuft mit System-python3, KEIN echter
API-Aufruf, kein Cent.

Aufruf:  python3 scripts/testing/pruefe_video_extern.py
Eingebunden in tests/video-worker.test.mjs.
"""
import sys, types, os, tempfile
os.environ.setdefault("WORKER_DIR", os.path.join(os.path.dirname(__file__), "..", "..", "workers", "smejj-video-worker"))
os.environ["SMEJJ_VIDEO_ENGINE"] = "kenburns"   # kein Modell-Download
os.environ["SMEJJ_VIDEO_EXTERN_ZAEHLER"] = tempfile.mktemp()
aufrufe = []

requests_stub = types.ModuleType("requests")
class Antwort:
    def __init__(self, js=None, inhalt=b"", ok=True): self._js, self.content, self.ok = js or {}, inhalt, ok
    def json(self): return self._js
    def raise_for_status(self):
        if not self.ok: raise RuntimeError("http")
ANTWORTEN = {}
def post(url, **kw): aufrufe.append(("POST", url)); return ANTWORTEN.get("post", Antwort({"request_id": "r1"}))
def get(url, **kw):
    aufrufe.append(("GET", url))
    if "/status" in url: return ANTWORTEN.get("status", Antwort({"status": "COMPLETED"}))
    if "fal.media" in url or "boese" in url: return ANTWORTEN.get("mp4", Antwort(inhalt=b"\x00\x00\x00 ftypisom" + b"x"*100))
    return ANTWORTEN.get("ergebnis", Antwort({"video": {"url": "https://v3.fal.media/files/x.mp4"}}))
requests_stub.post, requests_stub.get = post, get
sys.modules["requests"] = requests_stub
for n in ("fastapi","fastapi.responses"): sys.modules.setdefault(n, types.ModuleType(n))
sys.modules["fastapi"].FastAPI=lambda: types.SimpleNamespace(get=lambda p:(lambda f:f), post=lambda p:(lambda f:f))
sys.modules["fastapi"].Request=object; sys.modules["fastapi.responses"].JSONResponse=dict
sys.path.insert(0, os.environ["WORKER_DIR"])
import server
from PIL import Image
server.hole_basisbild = lambda prompt: Image.new("RGB", (512,512), (99,99,99))
# Seit dem Budget-Befund 2026-08-13 malt der HANDLER das Bild einmal und
# reicht es an erzeuge_extern UND den parallax-Rueckfall weiter.
testbild = server.hole_basisbild("egal")

fehler = []
def pruefe(name, bedingung):
    print(("  OK " if bedingung else "  FEHLER") + " " + name)
    if not bedingung: fehler.append(name)

# 1) FAIL-CLOSED: ohne Key existiert der Weg nicht
server.EXTERN_KEY = ""
aufrufe.clear()
# (Dispatch prueft EXTERN_KEY — direkter Beleg: erzeuge_extern wird im Handler nur mit Key erreicht)
quelle = open(os.path.join(os.environ["WORKER_DIR"], "server.py")).read()
pruefe("Dispatch prueft EXTERN_KEY vor jedem Aufruf", "if EXTERN_KEY:" in quelle and quelle.index("if EXTERN_KEY:") < quelle.index("mp4, engine = erzeuge_extern"))

# 2) Mit Key: voller Erfolgsweg
server.EXTERN_KEY = "test-key"
mp4, engine = server.erzeuge_extern("a lighthouse in a storm", testbild)
pruefe("liefert MP4 + engine extern:*", mp4[4:8]==b"ftyp" and engine.startswith("extern:"))
pruefe("genau 1 POST an queue.fal.run", sum(1 for a in aufrufe if a[0]=="POST" and "queue.fal.run" in a[1])==1)

# 3) Tagesdeckel
server.EXTERN_MAX_PRO_TAG = 2   # 1 schon verbraucht
server.erzeuge_extern("x", testbild)      # 2. Aufruf ok
try:
    server.erzeuge_extern("x", testbild); pruefe("Tagesdeckel wirft", False)
except RuntimeError as e:
    pruefe("Tagesdeckel wirft nach Limit", "tagesdeckel" in str(e))

# 4) SSRF: fremde Video-URL wird NICHT geladen
server.EXTERN_MAX_PRO_TAG = 99
ANTWORTEN["ergebnis"] = Antwort({"video": {"url": "https://boese.example/x.mp4"}})
try:
    server.erzeuge_extern("x", testbild); pruefe("fremde Adresse abgelehnt", False)
except RuntimeError as e:
    pruefe("fremde Adresse abgelehnt", "unerwartete_video_adresse" in str(e))
pruefe("boese.example wurde NIE angefragt", not any("boese" in a[1] for a in aufrufe))
del ANTWORTEN["ergebnis"]

# 5) FAILED-Status wirft (Aufrufer faellt auf parallax zurueck)
ANTWORTEN["status"] = Antwort({"status": "FAILED"})
try:
    server.erzeuge_extern("x", testbild); pruefe("FAILED wirft", False)
except RuntimeError as e:
    pruefe("FAILED wirft (Rueckfall parallax im Handler)", "extern_failed" in str(e))

print()
sys.exit(1 if fehler else 0)
