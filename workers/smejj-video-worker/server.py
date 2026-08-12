# smejj.com — Video-Maler: eigener Video-Worker für smejj 1.0 (Zeabur, intern).
#
# Betreiber-Entscheidung 2026-08-12: Video-Generierung läuft über EIGENE
# Infrastruktur hinter dem Budget-Gate (FREE_ONLY_MASTER_POLICY), kein
# Fremd-Videoanbieter. Erreichbar NUR intern (smejj-video-worker.zeabur.internal
# :8080, keine Public Domain); die Chat-Brücke (chat-bridge-bilder.js) ist der
# einzige Aufrufer.
#
# Zwei Engines, ehrlich getrennt (Lehre aus der Autopiloten-Ampel: keine
# Attrappen — dieser Endpunkt liefert ein ECHTES MP4 oder einen Fehler):
#   kenburns (Voreinstellung, CPU): der Bild-Maler (SD-Turbo) malt das Motiv,
#     dieser Worker animiert es (Zoom/Schwenk, nahtlose Schleife) und kodiert
#     per ffmpeg ein echtes H.264-MP4. Läuft auf dem 2C/8GB-Flat-Server.
#   animatediff (nur per SMEJJ_VIDEO_ENGINE=animatediff, braucht GPU+torch im
#     Abbild): echte Text-zu-Video-Diffusion (AnimateDiff; Wan2.1 sobald ein
#     GPU-Dienst freigegeben ist). Lädt im Hintergrund, /health zeigt den Stand.
#
# Lehren aus den Nachbardiensten: torch gehört ins ABBILD, nie zur Laufzeit
# nachinstallieren (smejj-trainer-503-geloest); auf 0.0.0.0 binden, Zeaburs
# internes Netz ist IPv4 (Dockerfile.smejj-bild-maler, gemessen 2026-08-12).
import base64
import io
import os
import tempfile
import threading
import time

import requests
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

ENGINE = os.environ.get("SMEJJ_VIDEO_ENGINE", "kenburns")
MODELL = os.environ.get("SMEJJ_VIDEO_MODELL", "smejj/video-engine-v1")
WORKER_KEY = os.environ.get("SMEJJ_VIDEO_WORKER_KEY", "")
BILD_MALER_URL = os.environ.get(
    "SMEJJ_BILDER_WORKER_URL", "http://smejj-bild-maler.zeabur.internal:8080"
).rstrip("/")
BILD_MALER_KEY = os.environ.get("SMEJJ_BILDER_WORKER_KEY", "")
BILD_TIMEOUT_S = int(os.environ.get("SMEJJ_VIDEO_BILD_TIMEOUT_S", "150"))
DAUER_S = float(os.environ.get("SMEJJ_VIDEO_DAUER_S", "4"))
FPS = int(os.environ.get("SMEJJ_VIDEO_FPS", "24"))
GROESSE = int(os.environ.get("SMEJJ_VIDEO_GROESSE", "512"))
SCHRITTE = int(os.environ.get("SMEJJ_VIDEO_SCHRITTE", "4"))  # nur animatediff
MAX_PROMPT = 500
# Deckel wie in der Brücke (VIDEO_MAX_B64): mehr streamen wir nicht durch.
MAX_B64 = 8_000_000

app = FastAPI()
zustand = {"bereit": ENGINE == "kenburns", "fehler": "", "laedt_seit": time.time()}
diffusion_pipeline = None
video_sperre = threading.Lock()
# Der kenburns-Weg steht und fällt mit dem Bild-Maler — /health sagt das
# EHRLICH (Brücke prüft "bereit" und fällt sonst auf die Status-Antwort zurück).
maler_cache = {"bereit": False, "geprueft": 0.0}


def lade_diffusion_engine():
    """Lädt die Text-zu-Video-Diffusion im Hintergrund (nur GPU-Abbilder)."""
    global diffusion_pipeline
    try:
        import torch
        from diffusers import AnimateDiffPipeline, LCMScheduler, MotionAdapter

        geraet = "cuda" if torch.cuda.is_available() else "cpu"
        adapter = MotionAdapter.from_pretrained(
            "wangfuyun/AnimateLCM", torch_dtype=torch.float16 if geraet == "cuda" else torch.float32
        )
        pipe = AnimateDiffPipeline.from_pretrained(
            "emilianJR/epiCRealism",
            motion_adapter=adapter,
            torch_dtype=torch.float16 if geraet == "cuda" else torch.float32,
        )
        pipe.scheduler = LCMScheduler.from_config(pipe.scheduler.config, beta_schedule="linear")
        pipe.to(geraet)
        if geraet == "cpu":
            pipe.enable_attention_slicing()
        diffusion_pipeline = pipe
        zustand["bereit"] = True
    except Exception as fehler:  # noqa: BLE001 — /health soll die Ursache zeigen
        zustand["fehler"] = f"{type(fehler).__name__}: {fehler}"


if ENGINE == "animatediff":
    threading.Thread(target=lade_diffusion_engine, daemon=True).start()


def bild_maler_bereit():
    """Fragt (höchstens alle 30 s) nach, ob der Bild-Maler wach und geladen ist."""
    if time.time() - maler_cache["geprueft"] < 30:
        return maler_cache["bereit"]
    maler_cache["geprueft"] = time.time()
    try:
        antwort = requests.get(f"{BILD_MALER_URL}/health", timeout=2.5)
        maler_cache["bereit"] = bool(antwort.ok and antwort.json().get("bereit"))
    except Exception:  # noqa: BLE001
        maler_cache["bereit"] = False
    return maler_cache["bereit"]


def hole_basisbild(prompt):
    """Lässt den Bild-Maler das Motiv malen. Liefert PIL-Image oder wirft."""
    from PIL import Image

    antwort = requests.post(
        f"{BILD_MALER_URL}/erzeuge",
        json={"prompt": prompt},
        headers={"x-smejj-key": BILD_MALER_KEY} if BILD_MALER_KEY else {},
        timeout=BILD_TIMEOUT_S,
    )
    antwort.raise_for_status()
    daten = antwort.json()
    if not daten.get("ok") or not daten.get("b64"):
        raise RuntimeError(f"bild_maler: {daten.get('fehler', 'keine_bilddaten')}")
    return Image.open(io.BytesIO(base64.b64decode(daten["b64"]))).convert("RGB")


def kenburns_frames(bild):
    """Animiert das Basisbild: langsamer Zoom mit Schwenk, als nahtlose Schleife.

    Gerendert wird auf dem 2x-Bild, damit der Ausschnitt beim Herauszoomen nie
    an den Rand stößt; cos-Verlauf hin und zurück macht die Schleife nahtlos
    (loop im <video>-Player der App).
    """
    import math

    quelle = bild.resize((GROESSE * 2, GROESSE * 2))
    frames = []
    anzahl = max(2, int(DAUER_S * FPS))
    for i in range(anzahl):
        t = 0.5 - 0.5 * math.cos(2 * math.pi * i / anzahl)  # 0 → 1 → 0, nahtlos
        zoom = 1.0 + 0.25 * t
        breite = int(GROESSE * 2 / zoom)
        x = int((GROESSE * 2 - breite) * (0.5 + 0.3 * t))
        y = int((GROESSE * 2 - breite) * 0.5)
        frames.append(quelle.crop((x, y, x + breite, y + breite)).resize((GROESSE, GROESSE)))
    return frames


def kodiere_mp4(frames):
    """Kodiert die Frames als H.264-MP4 (yuv420p + faststart für den Browser)."""
    import imageio.v2 as imageio
    import numpy as np

    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=True) as datei:
        schreiber = imageio.get_writer(
            datei.name,
            format="FFMPEG",
            fps=FPS,
            codec="libx264",
            quality=None,
            ffmpeg_params=["-crf", "26", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-movflags", "+faststart"],
        )
        for frame in frames:
            schreiber.append_data(np.asarray(frame))
        schreiber.close()
        datei.seek(0)
        return datei.read()


def erzeuge_kenburns(prompt):
    bild = hole_basisbild(prompt)
    return kodiere_mp4(kenburns_frames(bild)), "kenburns:sd-turbo"


def erzeuge_animatediff(prompt):
    import numpy as np
    from PIL import Image

    ergebnis = diffusion_pipeline(
        prompt=prompt,
        num_frames=int(DAUER_S * 4),  # AnimateLCM: 16 Frames für ~4 s bei 4 fps-Basis
        num_inference_steps=SCHRITTE,
        guidance_scale=2.0,
        width=GROESSE,
        height=GROESSE,
    )
    frames = [f if isinstance(f, Image.Image) else Image.fromarray(np.asarray(f)) for f in ergebnis.frames[0]]
    # Auf Zieldauer/-fps strecken, damit der Player dieselbe Form bekommt.
    gestreckt = []
    for i in range(int(DAUER_S * FPS)):
        gestreckt.append(frames[min(len(frames) - 1, int(i * len(frames) / (DAUER_S * FPS)))])
    return kodiere_mp4(gestreckt), f"animatediff:{MODELL}"


@app.get("/health")
def health():
    bereit = zustand["bereit"] and (ENGINE != "kenburns" or bild_maler_bereit())
    return {
        "ok": True,
        "app": "smejj.com video-worker",
        "engine": ENGINE,
        "modell": MODELL,
        "bereit": bereit,
        "fehler": zustand["fehler"],
        "ladezeitSek": 0 if zustand["bereit"] else round(time.time() - zustand["laedt_seit"]),
        "dauerS": DAUER_S,
        "fps": FPS,
        "groesse": GROESSE,
    }


@app.post("/erzeuge")
async def erzeuge(request: Request):
    if WORKER_KEY and request.headers.get("x-smejj-key", "") != WORKER_KEY:
        return JSONResponse({"ok": False, "fehler": "unautorisiert"}, status_code=401)
    if not zustand["bereit"]:
        return JSONResponse({"ok": False, "fehler": "engine_laedt_noch"}, status_code=503)
    try:
        daten = await request.json()
    except Exception:  # noqa: BLE001
        return JSONResponse({"ok": False, "fehler": "kein_json"}, status_code=400)

    prompt = str(daten.get("prompt", "")).strip()[:MAX_PROMPT]
    if not prompt:
        return JSONResponse({"ok": False, "fehler": "prompt_fehlt"}, status_code=400)

    # 2 Kerne: immer nur EIN Video; ein zweiter Auftrag bekommt sofort 429,
    # die Brücke antwortet dann mit der ehrlichen Status-Nachricht.
    if not video_sperre.acquire(blocking=False):
        return JSONResponse({"ok": False, "fehler": "beschaeftigt"}, status_code=429)
    try:
        beginn = time.time()
        if ENGINE == "animatediff" and diffusion_pipeline is not None:
            mp4, engine = erzeuge_animatediff(prompt)
        else:
            mp4, engine = erzeuge_kenburns(prompt)
        b64 = base64.b64encode(mp4).decode("ascii")
        if len(b64) > MAX_B64:
            return JSONResponse({"ok": False, "fehler": "video_zu_gross"}, status_code=500)
        return {
            "ok": True,
            "format": "mp4",
            "b64": b64,
            "engine": engine,
            "dauer_sekunden": DAUER_S,
            "fps": FPS,
            "aufloesung": f"{GROESSE}x{GROESSE}",
            "dauerSek": round(time.time() - beginn, 1),
        }
    except Exception as fehler:  # noqa: BLE001
        return JSONResponse({"ok": False, "fehler": f"{type(fehler).__name__}: {fehler}"}, status_code=500)
    finally:
        video_sperre.release()
