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

ENGINE = os.environ.get("SMEJJ_VIDEO_ENGINE", "parallax")
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

# --- parallax-Engine -------------------------------------------------------
# Tiefenmodell als ONNX (26 MB, quantisiert) statt torch (~800 MB): der Server
# hat 2 Kerne und teilt sich 8 GB mit sechs Diensten. Gemessen 2026-08-12:
# Tiefe 0,5 s, Rendern 1,0 s, Kodieren 0,1 s — die Bildzeit (40-90 s) bleibt
# der Flaschenhals, die Raumwirkung ist praktisch geschenkt.
TIEFE_MODELL_URL = os.environ.get(
    "SMEJJ_VIDEO_TIEFE_URL",
    "https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/main/onnx/model_quantized.onnx",
)
TIEFE_DATEI = os.environ.get("SMEJJ_VIDEO_TIEFE_DATEI", "/tmp/smejj-tiefe.onnx")
# Wie weit die naechste Ebene wandert (Pixel). Mehr wirkt raeumlicher, reisst
# aber groessere Loecher hinter Objekten auf; 26 ist gemessen ein guter Wert.
PARALLAX_STAERKE = float(os.environ.get("SMEJJ_VIDEO_PARALLAX_STAERKE", "26"))
PARALLAX_EBENEN = int(os.environ.get("SMEJJ_VIDEO_PARALLAX_EBENEN", "8"))

# --- Erzählstimme ----------------------------------------------------------
# Derselbe Piper-Dienst, der schon die Premium-Stimme des Chats spricht
# (POST /synthesize {text} -> audio/wav). Der Erzähltext kommt von der Brücke,
# die smejj 1.0 fragt — der Worker hat bewusst keinen Modell-Zugang.
STIMME_URL = os.environ.get("SMEJJ_VOICE_TTS_ORIGIN", "http://smejj-voice-piper.zeabur.internal:8080").rstrip("/")
STIMME_TIMEOUT_S = int(os.environ.get("SMEJJ_VIDEO_STIMME_TIMEOUT_S", "25"))
# Deutsch wird mit rund 15 Zeichen pro Sekunde gesprochen: 200 Zeichen sind
# ~13 s und bleiben damit unter MAX_DAUER_S. Längere Texte würden als Stimme
# verworfen (siehe hole_erzaehlstimme) — lieber vorher kürzen.
MAX_ERZAEHLTEXT = 200
# Das Video richtet sich nach der Sprechdauer, aber nie länger als das:
# jede Sekunde kostet 24 Frames Rechenzeit und Dateigröße.
MAX_DAUER_S = float(os.environ.get("SMEJJ_VIDEO_MAX_DAUER_S", "14"))

app = FastAPI()
zustand = {"bereit": ENGINE == "kenburns", "fehler": "", "laedt_seit": time.time()}
diffusion_pipeline = None
tiefe_sitzung = None
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


def lade_tiefen_modell():
    """Holt das Tiefenmodell (einmalig, 26 MB) und öffnet die ONNX-Sitzung.

    Schlägt das fehl, bleibt der Dienst trotzdem bereit — dann rendert die
    kenburns-Reserve. Lieber eine Kamerafahrt ohne Raum als gar kein Video.
    """
    global tiefe_sitzung
    try:
        import onnxruntime as ort

        if not os.path.exists(TIEFE_DATEI):
            antwort = requests.get(TIEFE_MODELL_URL, timeout=180)
            antwort.raise_for_status()
            with open(TIEFE_DATEI + ".teil", "wb") as datei:
                datei.write(antwort.content)
            # Erst umbenennen, wenn die Datei vollständig ist — ein Neustart
            # mitten im Download hinterlässt sonst eine kaputte "fertige" Datei.
            os.replace(TIEFE_DATEI + ".teil", TIEFE_DATEI)
        # 2 Kerne, geteilt: mehr Threads bringen nichts und stören die Nachbarn.
        optionen = ort.SessionOptions()
        optionen.intra_op_num_threads = 2
        tiefe_sitzung = ort.InferenceSession(
            TIEFE_DATEI, optionen, providers=["CPUExecutionProvider"]
        )
    except Exception as fehler:  # noqa: BLE001 — /health soll die Ursache zeigen
        zustand["fehler"] = f"tiefe: {type(fehler).__name__}: {fehler}"
    finally:
        zustand["bereit"] = True


if ENGINE == "animatediff":
    threading.Thread(target=lade_diffusion_engine, daemon=True).start()
elif ENGINE == "parallax":
    threading.Thread(target=lade_tiefen_modell, daemon=True).start()


class Besetzt(Exception):
    """Eine Stufe der Kette ist gerade beschaeftigt — kein Defekt, nur voll.

    Wird als HTTP 429 beantwortet, damit die Bruecke wartet statt abzusagen.
    """


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
    # Der Bild-Maler kann auch nur EINS zugleich. Sein 429 muss als "besetzt"
    # durchgereicht werden, sonst haelt die Bruecke es fuer einen Defekt und
    # sagt ab, statt zu warten (Warteschlange in chat-bridge-bilder.js).
    if antwort.status_code == 429:
        raise Besetzt("bild_maler_beschaeftigt")
    antwort.raise_for_status()
    daten = antwort.json()
    if not daten.get("ok") or not daten.get("b64"):
        raise RuntimeError(f"bild_maler: {daten.get('fehler', 'keine_bilddaten')}")
    return Image.open(io.BytesIO(base64.b64decode(daten["b64"]))).convert("RGB")


def kenburns_frames(bild, dauer=None):
    """Animiert das Basisbild: langsamer Zoom mit Schwenk, als nahtlose Schleife.

    Gerendert wird auf dem 2x-Bild, damit der Ausschnitt beim Herauszoomen nie
    an den Rand stößt; cos-Verlauf hin und zurück macht die Schleife nahtlos
    (loop im <video>-Player der App).
    """
    import math

    quelle = bild.resize((GROESSE * 2, GROESSE * 2))
    frames = []
    anzahl = max(2, int((dauer or DAUER_S) * FPS))
    for i in range(anzahl):
        t = 0.5 - 0.5 * math.cos(2 * math.pi * i / anzahl)  # 0 → 1 → 0, nahtlos
        zoom = 1.0 + 0.25 * t
        breite = int(GROESSE * 2 / zoom)
        x = int((GROESSE * 2 - breite) * (0.5 + 0.3 * t))
        y = int((GROESSE * 2 - breite) * 0.5)
        frames.append(quelle.crop((x, y, x + breite, y + breite)).resize((GROESSE, GROESSE)))
    return frames


def schaetze_tiefe(bild):
    """Tiefenkarte 0 (fern) .. 1 (nah) in Bildgröße. None = Modell nicht da."""
    if tiefe_sitzung is None:
        return None
    import numpy as np
    from PIL import Image

    # Depth-Anything arbeitet auf Vielfachen von 14; 518 ist die Trainingsgröße.
    eingang = bild.resize((518, 518), Image.BILINEAR)
    x = np.asarray(eingang, dtype=np.float32) / 255.0
    mittel = np.array([0.485, 0.456, 0.406], dtype=np.float32)
    streuung = np.array([0.229, 0.224, 0.225], dtype=np.float32)
    x = ((x - mittel) / streuung).transpose(2, 0, 1)[None]
    roh = tiefe_sitzung.run(None, {"pixel_values": x})[0][0]
    karte = Image.fromarray(roh).resize(bild.size, Image.BILINEAR)
    tiefe = np.asarray(karte, dtype=np.float32)
    spanne = float(tiefe.max() - tiefe.min())
    if spanne < 1e-6:
        return None  # flache Karte (z. B. Farbfläche) — Parallax brächte nichts
    return (tiefe - tiefe.min()) / spanne


def parallax_frames(bild, tiefe, dauer=None):
    """Kamerafahrt durch die Szene: nahe Ebenen wandern weiter als ferne.

    Umsetzung als Ebenenstapel (Multi-Plane): die Tiefenkarte zerlegt das Bild
    in PARALLAX_EBENEN Schichten, jede wird um ihren eigenen Betrag verschoben
    und von hinten nach vorne übereinandergelegt. Löcher hinter Objekten füllt
    eine weichgezeichnete Grundierung — echtes Inpainting wäre auf 2 Kernen zu
    teuer und fällt bei 24 fps ohnehin nicht auf.
    """
    import math

    import numpy as np
    from PIL import Image, ImageFilter

    # Grundierung: weich und leicht vergrößert, damit an den Rändern nichts fehlt.
    grund = np.asarray(
        bild.filter(ImageFilter.GaussianBlur(24))
        .resize((int(GROESSE * 1.08), int(GROESSE * 1.08)))
        .crop((0, 0, GROESSE, GROESSE)),
        dtype=np.float32,
    )
    rgb = np.asarray(bild, dtype=np.float32)

    ebenen = []
    for i in range(PARALLAX_EBENEN):
        lo, hi = i / PARALLAX_EBENEN, (i + 1) / PARALLAX_EBENEN
        maske = ((tiefe >= lo) & (tiefe < hi)).astype(np.float32)
        if maske.sum() < 50:  # leere Tiefenscheibe überspringen
            continue
        # Weiche Kanten: harte Ebenengrenzen sähen wie ausgeschnittenes Papier aus.
        weich = np.asarray(
            Image.fromarray((maske * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.5)),
            dtype=np.float32,
        ) / 255.0
        ebenen.append(((lo + hi) / 2, weich[..., None]))

    anzahl = max(2, int((dauer or DAUER_S) * FPS))
    rand = int(PARALLAX_STAERKE * 1.2)
    frames = []
    for i in range(anzahl):
        # Nahtlose Schleife: einmal hin und zurück, mit leichtem Bogen nach oben.
        w = 2 * math.pi * i / anzahl
        vx, vy = math.sin(w), 0.35 * (1 - math.cos(w)) - 0.35
        leinwand = grund.copy()
        for mitteltiefe, alpha in ebenen:
            dx = int(round(PARALLAX_STAERKE * mitteltiefe * vx))
            dy = int(round(PARALLAX_STAERKE * mitteltiefe * vy))
            rgb_v = np.roll(np.roll(rgb, dx, axis=1), dy, axis=0)
            a_v = np.roll(np.roll(alpha, dx, axis=1), dy, axis=0)
            leinwand = leinwand * (1 - a_v) + rgb_v * a_v
        # Zuschnitt kaschiert die Ränder, die das Verschieben freilegt.
        frame = Image.fromarray(np.clip(leinwand, 0, 255).astype(np.uint8))
        frames.append(
            frame.crop((rand, rand, GROESSE - rand, GROESSE - rand)).resize(
                (GROESSE, GROESSE), Image.BILINEAR
            )
        )
    return frames


def kuerze_auf_satz(text, deckel):
    """Kürzt am letzten Satzende vor dem Deckel — nie mitten im Wort.

    Ein abgeschnittenes Wort spricht Piper als Bruchstück aus ("Das Licht wan"),
    was schlimmer klingt als ein Satz weniger.
    """
    sauber = " ".join(str(text or "").split())
    if len(sauber) <= deckel:
        return sauber
    schnitt = sauber[:deckel]
    ende = max(schnitt.rfind(". "), schnitt.rfind("! "), schnitt.rfind("? "))
    if ende > deckel // 3:
        return schnitt[: ende + 1]
    luecke = schnitt.rfind(" ")
    return (schnitt[:luecke] if luecke > 0 else schnitt).rstrip(",;: ") + "."


def hole_erzaehlstimme(text):
    """Lässt Piper den Erzähltext sprechen. Liefert (wav_bytes, dauer_s) oder None.

    Fail-safe: bei jedem Fehler gibt es das Video eben stumm — eine fehlende
    Stimme darf nie das ganze Video kosten.
    """
    import array
    import wave

    try:
        antwort = requests.post(
            f"{STIMME_URL}/synthesize",
            json={"text": kuerze_auf_satz(text, MAX_ERZAEHLTEXT)},
            timeout=STIMME_TIMEOUT_S,
        )
        # RIFF-Kopf statt Content-Type raten: der Piper-http_server beantwortet
        # Winz-Eingaben mit seiner HTML-Demo-Seite — und zwar mit Status 200.
        if not antwort.ok or antwort.content[:4] != b"RIFF":
            return None
        with wave.open(io.BytesIO(antwort.content)) as datei:
            dauer = datei.getnframes() / float(datei.getframerate() or 1)
            breite, rate = datei.getsampwidth(), datei.getframerate()
            probe = datei.readframes(min(datei.getnframes(), rate * 3))
        if dauer < 0.3:
            return None
        # Länger als das Videobudget: ffmpeg -shortest würde die Erzählung
        # mitten im Satz abschneiden. Lieber ehrlich stumm als halbiert.
        if dauer > MAX_DAUER_S:
            return None
        # Gültiges WAV, das nur Stille enthält, wäre eine Lüge: das Video
        # hätte eine Tonspur, der Chat verspräche eine Erzählung, und der
        # Nutzer hörte nichts.
        if breite == 2 and probe:
            werte = array.array("h")
            werte.frombytes(probe[: len(probe) - (len(probe) % 2)])
            if werte and max(abs(wert) for wert in werte) < 200:
                return None
        return antwort.content, dauer
    except Exception:  # noqa: BLE001 — stummes Video ist der akzeptable Rückfall
        return None


def mische_ton(mp4_bytes, wav_bytes):
    """Legt die Erzählstimme unter das Video (AAC). Bei Fehler: stummes Video."""
    import subprocess

    from imageio_ffmpeg import get_ffmpeg_exe

    try:
        with tempfile.TemporaryDirectory() as ordner:
            stumm = os.path.join(ordner, "stumm.mp4")
            ton = os.path.join(ordner, "ton.wav")
            ziel = os.path.join(ordner, "fertig.mp4")
            with open(stumm, "wb") as datei:
                datei.write(mp4_bytes)
            with open(ton, "wb") as datei:
                datei.write(wav_bytes)
            lauf = subprocess.run(
                [get_ffmpeg_exe(), "-y", "-i", stumm, "-i", ton,
                 "-c:v", "copy", "-c:a", "aac", "-b:a", "96k",
                 "-shortest", "-movflags", "+frag_keyframe+empty_moov+default_base_moof", ziel],
                capture_output=True, timeout=60,
            )
            if lauf.returncode != 0 or not os.path.exists(ziel):
                return mp4_bytes
            with open(ziel, "rb") as datei:
                return datei.read()
    except Exception:  # noqa: BLE001
        return mp4_bytes


def kodiere_mp4(frames):
    """Kodiert die Frames als fragmentiertes H.264-MP4 (yuv420p; fMP4 spielt
    progressiv UND via MediaSource — der browserfeste Wiedergabepfad)."""
    import imageio.v2 as imageio
    import numpy as np

    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=True) as datei:
        schreiber = imageio.get_writer(
            datei.name,
            format="FFMPEG",
            fps=FPS,
            codec="libx264",
            quality=None,
            ffmpeg_params=["-crf", "26", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-movflags", "+frag_keyframe+empty_moov+default_base_moof"],
        )
        for frame in frames:
            schreiber.append_data(np.asarray(frame))
        schreiber.close()
        datei.seek(0)
        return datei.read()


def erzeuge_kenburns(prompt, dauer=None):
    bild = hole_basisbild(prompt)
    return kodiere_mp4(kenburns_frames(bild, dauer)), "kenburns:sd-turbo"


def erzeuge_parallax(prompt, dauer=None):
    """Bild malen, Tiefe schätzen, räumlich durchfahren.

    Fällt auf kenburns zurück, wenn keine brauchbare Tiefe herauskommt — die
    Antwort nennt dann auch ehrlich "kenburns", damit die Brücke den richtigen
    Hinweis setzt.
    """
    bild = hole_basisbild(prompt)
    tiefe = schaetze_tiefe(bild)
    if tiefe is None:
        return kodiere_mp4(kenburns_frames(bild, dauer)), "kenburns:sd-turbo"
    return kodiere_mp4(parallax_frames(bild, tiefe, dauer)), "parallax:depth-anything-v2-small"


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
    erzaehltext = str(daten.get("erzaehltext", "")).strip()[:MAX_ERZAEHLTEXT]

    # 2 Kerne: immer nur EIN Video; ein zweiter Auftrag bekommt sofort 429,
    # die Brücke antwortet dann mit der ehrlichen Status-Nachricht.
    if not video_sperre.acquire(blocking=False):
        return JSONResponse({"ok": False, "fehler": "beschaeftigt"}, status_code=429)
    try:
        beginn = time.time()
        # Stimme ZUERST: erst ihre Länge sagt, wie lang das Video werden muss.
        # Sie kostet nur wenige Sekunden, das Bild danach die Minute.
        stimme = hole_erzaehlstimme(erzaehltext) if erzaehltext else None
        dauer = min(MAX_DAUER_S, stimme[1] + 0.6) if stimme else DAUER_S

        if ENGINE == "animatediff" and diffusion_pipeline is not None:
            mp4, engine = erzeuge_animatediff(prompt)
        elif ENGINE == "parallax":
            mp4, engine = erzeuge_parallax(prompt, dauer)
        else:
            mp4, engine = erzeuge_kenburns(prompt, dauer)

        if stimme:
            mp4 = mische_ton(mp4, stimme[0])

        b64 = base64.b64encode(mp4).decode("ascii")
        if len(b64) > MAX_B64:
            return JSONResponse({"ok": False, "fehler": "video_zu_gross"}, status_code=500)
        return {
            "ok": True,
            "format": "mp4",
            "b64": b64,
            "engine": engine,
            # Die Brücke sagt dem Nutzer nur dann "mit Erzählstimme", wenn hier
            # wirklich Ton drin ist — eine stumme Piper-Panne darf nicht lügen.
            "ton": bool(stimme),
            "dauer_sekunden": round(dauer, 1),
            "fps": FPS,
            "aufloesung": f"{GROESSE}x{GROESSE}",
            "dauerSek": round(time.time() - beginn, 1),
        }
    except Besetzt as fehler:
        return JSONResponse({"ok": False, "fehler": str(fehler)}, status_code=429)
    except Exception as fehler:  # noqa: BLE001
        return JSONResponse({"ok": False, "fehler": f"{type(fehler).__name__}: {fehler}"}, status_code=500)
    finally:
        video_sperre.release()
