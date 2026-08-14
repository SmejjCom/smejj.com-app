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
# Genauigkeit der Gewichte. Messung 2026-08-13 (Zeabur-Metrics): der Dienst
# spitzt auf 6646 MB von 8 GB, davon sind ~5 GB die fp32-Gewichte von SD-Turbo
# (~1,3 Mrd. Parameter x 4 Byte). "bfloat16" halbiert das auf ~2,6 GB.
#
# Warum NICHT einfach umgestellt: bf16 rechnet auf CPU nur dort schnell, wo die
# Hardware AVX512-BF16 oder AMX kann; sonst emuliert PyTorch und wird LANGSAMER
# als fp32. Ob dieser Tencent-Knoten das kann, weiss man erst durch Messen —
# darum ein Schalter statt einer Entscheidung. Standard bleibt fp32, also
# unveraendertes Verhalten beim naechsten Deploy.
#
# Messweg (kein Deploy noetig zum Umschalten, Env-Variablen sind auf der
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
        # von 8 GB — der Rest liegt bei ~1,4 GB fuer alle anderen zusammen.
        # Das VAE-Dekodieren am Ende jedes Bildes ist die letzte grosse Spitze
        # obendrauf; scheibenweise dekodieren senkt sie ohne Qualitaetsverlust.
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
        dauer = round(time.time() - beginn, 1)
        # Mitschreiben, damit der bf16-Tempotest ueber /health ablesbar ist,
        # ohne den Rueckgabewert eines echten Auftrags abfangen zu muessen.
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
    finally:
        mal_sperre.release()
