# smejj.com — Bild-Maler: eigenes Bildmodell (SD-Turbo) auf der Zeabur-CPU.
#
# Betreiber-Entscheidung 2026-08-12: Bilder malt die EIGENE Infrastruktur
# (Trennung von Salad, kein Fremd-Bildanbieter). Dieser Dienst laeuft auf dem
# Zeabur-Flat-Server (2C/8GB, KEINE GPU) — darum bewusst klein: SD-Turbo,
# 512 px, 2 Schritte, fp32 mit Attention-Slicing. Erwartung ~40-90 s pro Bild.
#
# Erreichbar NUR intern (smejj-bild-maler.zeabur.internal:8080, keine Public
# Domain) — wie smejj-voice-piper. Die Chat-Bruecke (chat-bridge-bilder.js)
# ist der einzige Aufrufer.
#
# Lehren aus dem Trainer (Memory smejj-trainer-503-geloest): torch gehoert ins
# ABBILD (Dockerfile.smejj-bild-maler), nie zur Laufzeit nachinstallieren.
# Lehre aus der Premium-Stimme: auf "::" binden (IPv6), sonst Gateway-Blindflug.
import base64
import io
import os
import threading
import time

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

MODELL = os.environ.get("SMEJJ_BILD_MODELL", "stabilityai/sd-turbo")
# 3 statt 2 Schritte (2026-08-13): sichtbar mehr Detail/Koherenz, ~120 s gesamt —
# bleibt unter dem 150-s-Budget der Bruecke. 4 Schritte rissen das Budget.
SCHRITTE = int(os.environ.get("SMEJJ_BILD_SCHRITTE", "3"))
GROESSE = int(os.environ.get("SMEJJ_BILD_GROESSE", "512"))
WORKER_KEY = os.environ.get("SMEJJ_BILDER_WORKER_KEY", "")
MAX_PROMPT = 500

app = FastAPI()
zustand = {"bereit": False, "fehler": "", "laedt_seit": time.time()}
pipeline = None
mal_sperre = threading.Lock()


def lade_modell():
    """Laedt SD-Turbo im Hintergrund; /health meldet den Fortschritt."""
    global pipeline
    try:
        import torch
        from diffusers import AutoPipelineForText2Image

        pipe = AutoPipelineForText2Image.from_pretrained(
            MODELL, torch_dtype=torch.float32, low_cpu_mem_usage=True
        )
        pipe.to("cpu")
        # 8-GB-Server, geteilt mit 6 anderen Diensten: Speicher vor Tempo.
        pipe.enable_attention_slicing()
        pipeline = pipe
        zustand["bereit"] = True
    except Exception as fehler:  # noqa: BLE001 — /health soll die Ursache zeigen
        zustand["fehler"] = f"{type(fehler).__name__}: {fehler}"


threading.Thread(target=lade_modell, daemon=True).start()


@app.get("/health")
def health():
    return {
        "ok": True,
        "app": "smejj.com bild-maler",
        "modell": MODELL,
        "bereit": zustand["bereit"],
        "fehler": zustand["fehler"],
        "ladezeitSek": 0 if zustand["bereit"] else round(time.time() - zustand["laedt_seit"]),
        "schritte": SCHRITTE,
        "groesse": GROESSE,
    }


@app.post("/erzeuge")
async def erzeuge(request: Request):
    if WORKER_KEY and request.headers.get("x-smejj-key", "") != WORKER_KEY:
        return JSONResponse({"ok": False, "fehler": "unautorisiert"}, status_code=401)
    if not zustand["bereit"]:
        return JSONResponse({"ok": False, "fehler": "modell_laedt_noch"}, status_code=503)
    try:
        daten = await request.json()
    except Exception:  # noqa: BLE001
        return JSONResponse({"ok": False, "fehler": "kein_json"}, status_code=400)
    prompt = str(daten.get("prompt", "")).strip()[:MAX_PROMPT]
    # Foto-Anreicherung (2026-08-13, "Qualitaet wie Midjourney"-Auftrag): SD-Turbo
    # reagiert stark auf Stil-Anker. Nur ergaenzen, wenn der Prompt selbst keinen
    # Stil nennt — ein gewuenschtes "oil painting" wird nicht uebermalt.
    if prompt and not any(w in prompt.lower() for w in ("painting", "drawing", "sketch", "cartoon", "anime", "illustration", "pixel", "watercolor")):
        prompt = f"{prompt}, photorealistic, highly detailed, sharp focus, professional photography, natural skin texture"[:MAX_PROMPT + 120]
    if not prompt:
        return JSONResponse({"ok": False, "fehler": "prompt_fehlt"}, status_code=400)
    # 2 Kerne: immer nur EIN Bild; ein zweiter Auftrag bekommt sofort 429,
    # die Bruecke faellt dann auf den SVG-Weg zurueck statt zu warten.
    if not mal_sperre.acquire(blocking=False):
        return JSONResponse({"ok": False, "fehler": "beschaeftigt"}, status_code=429)
    try:
        beginn = time.time()
        bild = pipeline(
            prompt=prompt,
            num_inference_steps=SCHRITTE,
            guidance_scale=0.0,  # SD-Turbo-Vorgabe: ohne CFG
            width=GROESSE,
            height=GROESSE,
        ).images[0]
        puffer = io.BytesIO()
        bild.save(puffer, format="PNG")
        return {
            "ok": True,
            "format": "png",
            "b64": base64.b64encode(puffer.getvalue()).decode("ascii"),
            "dauerSek": round(time.time() - beginn, 1),
        }
    except Exception as fehler:  # noqa: BLE001
        return JSONResponse({"ok": False, "fehler": f"{type(fehler).__name__}: {fehler}"}, status_code=500)
    finally:
        mal_sperre.release()
