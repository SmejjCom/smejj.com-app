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
# 3 statt 2 Schritte (2026-08-13): sichtbar mehr Detail, ~120 s — unterm 150-s-Budget.
SCHRITTE = int(os.environ.get("SMEJJ_BILD_SCHRITTE", "3"))
GROESSE = int(os.environ.get("SMEJJ_BILD_GROESSE", "512"))
WORKER_KEY = os.environ.get("SMEJJ_BILDER_WORKER_KEY", "")
MAX_PROMPT = 500
# Genauigkeit der Gewichte. Messung 2026-08-13 (Zeabur-Metrics): der Dienst
# spitzt auf 6646 MB von 8 GB, davon sind ~5 GB die fp32-Gewichte von SD-Turbo
# (~1,3 Mrd. Parameter x 4 Byte). "bfloat16" halbiert das auf ~2,6 GB — und
# schafft damit genau den Platz, den der Gesichtsfixer unten sucht.
#
# Warum NICHT einfach umgestellt: bf16 rechnet auf CPU nur dort schnell, wo die
# Hardware AVX512-BF16 oder AMX kann; sonst emuliert PyTorch und wird LANGSAMER
# als fp32. Ob dieser Tencent-Knoten das kann, weiss man erst durch Messen —
# darum ein Schalter statt einer Entscheidung. Standard bleibt fp32, dieser
# Deploy aendert das Verhalten also NICHT von selbst.
#
# Messweg (zum Umschalten kein Deploy noetig, Env-Variablen sind auf der
# Zeabur-Gratis-Stufe schreibbar):
#   1. /health lesen -> "genauigkeit" und "letzteDauerSek" notieren (fp32-Basis)
#   2. Zeabur -> smejj-bild-maler -> Variable: SMEJJ_BILD_GENAUIGKEIT=bfloat16
#   3. Neustart abwarten, ein Bild erzeugen, /health erneut lesen
#   4. Ist "letzteDauerSek" jetzt groesser als vorher -> Variable wieder
#      entfernen. Nur wenn sie gleich bleibt oder faellt, lohnt bf16.
# Das 150-s-Budget der Bruecke ist die harte Grenze (heute ~120 s).
#
# Hier schon auf die zwei erlaubten Werte eindampfen, damit /health meldet, was
# WIRKLICH laeuft, und nicht den rohen Tippfehler aus der Umgebung.
GENAUIGKEIT = (
    "bfloat16"
    if os.environ.get("SMEJJ_BILD_GENAUIGKEIT", "").strip().lower() == "bfloat16"
    else "float32"
)

app = FastAPI()
zustand = {
    "bereit": False,
    "fehler": "",
    "laedt_seit": time.time(),
    # Fuer den bf16-Tempotest: was der letzte echte Lauf gekostet hat.
    "letzte_dauer_sek": 0.0,
    "cpu_kann": "",
}
pipeline = None
mal_sperre = threading.Lock()
# Gesichts-Reparatur (2026-08-13, Betreiber: "Augen Fehler"): GFPGAN als
# Nachschliff NUR fuer fotorealistische Bilder. Dreifach abgesichert: laedt
# erst beim ersten Bedarf, ueberspringt sich bei RAM-Knappheit, und jeder
# Fehler liefert einfach das unreparierte Bild.
GESICHTSFIX = os.environ.get("SMEJJ_BILD_GESICHTSFIX", "1") == "1"
GESICHTSFIX_MIN_FREI_MB = int(os.environ.get("SMEJJ_BILD_GESICHTSFIX_MIN_FREI_MB", "2000"))
GFPGAN_GEWICHTE = os.environ.get("SMEJJ_GFPGAN_GEWICHTE", "/tmp/hf/gfpgan/GFPGANv1.4.pth")
GFPGAN_URL = "https://github.com/TencentARC/GFPGAN/releases/download/v1.3.0/GFPGANv1.4.pth"
gesichtsfixer = None
gesichtsfix_zustand = {"status": "aus" if not GESICHTSFIX else "bereitschaft", "fehler": ""}


def mem_verfuegbar_mb():
    try:
        for zeile in open("/proc/meminfo"):
            if zeile.startswith("MemAvailable"):
                return int(zeile.split()[1]) // 1024
    except Exception:  # noqa: BLE001
        pass
    return 99999


def lade_gesichtsfixer():
    """Lazy: GFPGAN erst beim ersten Portraet. Gewichte landen im hf-Volume."""
    global gesichtsfixer
    if gesichtsfixer is not None:
        return gesichtsfixer
    # basicsr nutzt das aus torchvision entfernte functional_tensor-Modul —
    # bekannter Shim, bevor gfpgan importiert wird.
    import sys
    import types
    import torchvision.transforms.functional as F  # noqa: N812
    shim = types.ModuleType("torchvision.transforms.functional_tensor")
    shim.rgb_to_grayscale = F.rgb_to_grayscale
    sys.modules.setdefault("torchvision.transforms.functional_tensor", shim)
    import urllib.request
    from gfpgan import GFPGANer
    os.makedirs(os.path.dirname(GFPGAN_GEWICHTE), exist_ok=True)
    if not os.path.exists(GFPGAN_GEWICHTE):
        urllib.request.urlretrieve(GFPGAN_URL, GFPGAN_GEWICHTE)
    gesichtsfixer = GFPGANer(model_path=GFPGAN_GEWICHTE, upscale=1, arch="clean",
                             channel_multiplier=2, bg_upsampler=None)
    return gesichtsfixer


def repariere_gesichter(bild):
    """PIL -> PIL; bei jedem Problem kommt das Original zurueck."""
    import numpy as np
    if not GESICHTSFIX:
        return bild
    frei = mem_verfuegbar_mb()
    if frei < GESICHTSFIX_MIN_FREI_MB:
        gesichtsfix_zustand["status"] = f"uebersprungen (nur {frei} MB frei)"
        return bild
    try:
        fixer = lade_gesichtsfixer()
        bgr = np.asarray(bild)[:, :, ::-1]
        _, _, repariert = fixer.enhance(bgr, has_aligned=False, only_center_face=False, paste_back=True)
        gesichtsfix_zustand["status"] = "aktiv"
        if repariert is None:
            return bild
        from PIL import Image
        return Image.fromarray(repariert[:, :, ::-1])
    except Exception as fehler:  # noqa: BLE001
        gesichtsfix_zustand["status"] = "fehler"
        gesichtsfix_zustand["fehler"] = f"{type(fehler).__name__}: {fehler}"
        return bild


def lade_modell():
    """Laedt SD-Turbo im Hintergrund; /health meldet den Fortschritt."""
    global pipeline
    try:
        import torch
        from diffusers import AutoPipelineForText2Image

        # Unbekannte Werte fallen auf fp32 zurueck — ein Tippfehler in der
        # Env-Variablen darf den Dienst nicht lahmlegen.
        typ = torch.bfloat16 if GENAUIGKEIT == "bfloat16" else torch.float32
        try:
            zustand["cpu_kann"] = str(torch.backends.cpu.get_cpu_capability())
        except Exception:  # noqa: BLE001 — nur Diagnose, nie startentscheidend
            zustand["cpu_kann"] = "unbekannt"

        pipe = AutoPipelineForText2Image.from_pretrained(
            MODELL, torch_dtype=typ, low_cpu_mem_usage=True
        )
        pipe.to("cpu")
        # 8-GB-Server, geteilt mit 6 anderen Diensten: Speicher vor Tempo.
        pipe.enable_attention_slicing()
        # Gemessen 2026-08-13 (Zeabur-Metrics): dieser Dienst spitzt auf 6646 MB
        # von 8 GB — fuer alle anderen Dienste zusammen bleiben ~1,4 GB. Das
        # VAE-Dekodieren am Ende jedes Bildes ist die letzte grosse Spitze
        # obendrauf; scheibenweise dekodieren senkt sie ohne Qualitaetsverlust
        # und laesst mehr Luft fuer den Gesichtsfixer (der bei <2000 MB frei
        # aussetzt).
        pipe.enable_vae_slicing()
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
        "gesichtsfix": gesichtsfix_zustand,
        # Die drei Felder sind der Tempotest fuer bfloat16 (siehe GENAUIGKEIT
        # oben): Was laeuft gerade, was kann die CPU, wie lange dauerte zuletzt
        # ein echtes Bild. 0.0 heisst: seit dem Start noch keins erzeugt.
        "genauigkeit": GENAUIGKEIT,
        "cpuKann": zustand["cpu_kann"],
        "letzteDauerSek": zustand["letzte_dauer_sek"],
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
    # Foto-Anreicherung (2026-08-13): SD-Turbo reagiert stark auf Stil-Anker;
    # nur ergaenzen, wenn der Prompt keinen eigenen Stil nennt. Der Zusatz
    # triggert zugleich die Gesichts-Reparatur ("photorealistic" im Prompt).
    if prompt and not any(w in prompt.lower() for w in ("painting", "drawing", "sketch", "cartoon", "anime", "illustration", "pixel", "watercolor")):
        prompt = f"{prompt}, photorealistic, highly detailed, sharp focus, professional photography, natural skin texture"[:MAX_PROMPT + 120]
    if not prompt:
        return JSONResponse({"ok": False, "fehler": "prompt_fehlt"}, status_code=400)
    # 2 Kerne: immer nur EIN Bild; ein zweiter Auftrag bekommt sofort 429,
    # die Bruecke wartet dann geduldig auf einen freien Platz (SVG-Reserve
    # erst, wenn ihr Geduldsbudget aufgebraucht ist).
    if not mal_sperre.acquire(blocking=False):
        return JSONResponse({"ok": False, "fehler": "beschaeftigt"}, status_code=429)
    try:
        # Die Minutenarbeit gehoert in den Threadpool, NICHT in die Event-Loop:
        # blockierend gemalt beantwortete der Prozess waehrend eines Jobs NICHTS
        # mehr — neue Anfragen (auch GET /health) stauten sich am Socket bis zum
        # Jobende, das Sofort-429 feuerte praktisch nie, und der Video-Worker
        # lief in sein 150-s-Timeout (gemessen 2026-08-13,
        # docs/video/BEFUND_500_UM_2318Z_KEIN_EXTERN_KEY.md). Hier bleibt die
        # Loop frei, damit /health und das 429 auch waehrend des Malens ehrlich
        # antworten.
        from fastapi.concurrency import run_in_threadpool

        return await run_in_threadpool(erzeuge_blockierend, prompt)
    finally:
        mal_sperre.release()


def erzeuge_blockierend(prompt):
    """Die eigentliche Malarbeit — laeuft im Threadpool, die Sperre haelt der Aufrufer."""
    try:
        beginn = time.time()
        bild = pipeline(
            prompt=prompt,
            num_inference_steps=SCHRITTE,
            guidance_scale=0.0,  # SD-Turbo-Vorgabe: ohne CFG
            width=GROESSE,
            height=GROESSE,
        ).images[0]
        if "photorealistic" in prompt:
            bild = repariere_gesichter(bild)
        # Gleiche Bedeutung wie bisher (Erzeugung inklusive Gesichtsfix), nur
        # zusaetzlich mitgeschrieben, damit der bf16-Tempotest ueber /health
        # ablesbar ist, ohne die Antwort eines echten Auftrags abzufangen.
        dauer = round(time.time() - beginn, 1)
        zustand["letzte_dauer_sek"] = dauer
        puffer = io.BytesIO()
        bild.save(puffer, format="PNG")
        return {
            "ok": True,
            "format": "png",
            "b64": base64.b64encode(puffer.getvalue()).decode("ascii"),
            "dauerSek": dauer,
        }
    except Exception as fehler:  # noqa: BLE001
        return JSONResponse({"ok": False, "fehler": f"{type(fehler).__name__}: {fehler}"}, status_code=500)
