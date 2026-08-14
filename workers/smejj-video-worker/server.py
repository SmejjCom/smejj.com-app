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
# Zielgroesse des VIDEOS. Der Bild-Maler liefert 512 px; hier wird vor dem
# Warping hochgezogen. Klingt nach Scheinaufloesung, ist aber gemessen ein
# echter Gewinn: die bilineare Abtastung beim Warping verwischt in 512
# spuerbar mehr. FAIR VERGLICHEN (alle Ergebnisse auf 512 zurueckgerechnet,
# 2026-08-13): 512 -> 103, 768 -> 135 (+31 %), 1024 -> 150 (+46 %).
# 768 ist der Punkt, an dem der Gewinn die Rechenzeit noch wert ist
# (+2,6 s lokal); 1024 kostete das Dreifache fuer wenig mehr.
GROESSE = int(os.environ.get("SMEJJ_VIDEO_GROESSE", "768"))
SCHRITTE = int(os.environ.get("SMEJJ_VIDEO_SCHRITTE", "4"))  # nur animatediff
MAX_PROMPT = 500
# Deckel wie in der Brücke (VIDEO_MAX_B64): mehr streamen wir nicht durch.
MAX_B64 = 8_000_000
# H.264-Qualitaet: 23 statt 26 nach dem Portraet-Befund 2026-08-13 — drei
# CRF-Stufen sind sichtbar weniger Matsch; ein 8-s-Video waechst von ~90 auf
# ~140 KB und bleibt weit unter dem 8-MB-Deckel der Bruecke.
CRF = int(os.environ.get("SMEJJ_VIDEO_CRF", "23"))
# Nachschaerfen des Basisbilds (2026-08-13): SD-Turbo malt weich, und die
# bilineare Abtastung beim Warping glaettet zusaetzlich. EINMAL am Bild
# geschaerft (nicht je Frame — das waere 96x der Aufwand) hebt die
# Detailschaerfe gemessen um ~90 %, ohne sichtbare Halos.
# 0 schaltet ab; ueber ~60 % entstehen helle Saeume an Kanten.
SCHAERFE_PROZENT = int(os.environ.get("SMEJJ_VIDEO_SCHAERFE", "50"))
KONTRAST = float(os.environ.get("SMEJJ_VIDEO_KONTRAST", "1.08"))

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
# Wie weit der nahste Pixel wandert (Pixel). Mehr wirkt raeumlicher; ueber
# ~30 verschmiert das Warping an harten Tiefenkanten. 26 ist gemessen gut.
# Auf 512 px bezogen; wird unten proportional zur Zielgroesse skaliert,
# damit die Fahrt bei 768 gleich stark WIRKT und nicht kleiner.
PARALLAX_STAERKE = float(os.environ.get("SMEJJ_VIDEO_PARALLAX_STAERKE", "26")) * GROESSE / 512
# Eigenbewegung der Szene (Stufe 2, 2026-08-13): Wolken ziehen durch. Ohne das
# steht eine Landschaft trotz Kamerafahrt wie eingefroren.
#
# GEMESSEN, nicht vermutet: Himmel-Zug hebt die Aenderung in der Himmelzone von
# 1,21 auf 2,01 (bei 40 px auf 2,68) — er wirkt und skaliert sauber.
#
# BEWUSST NICHT GEBAUT: eine Wasser-Kraeuselung (zeilenweise Sinus-Verschiebung)
# war fertig und wurde wieder entfernt. Sie zeigte bei 3,5 / 8 / 14 px Ausschlag
# jedes Mal exakt die Werte des ausgeschalteten Zustands — die Wirkung liess sich
# nicht belegen, kostete aber die Haelfte der Renderzeit. Was sich nicht messen
# laesst, gehoert nicht in den Betrieb (Lehre aus der Autopiloten-Ampel).
BEWEGUNG_AN = os.environ.get("SMEJJ_VIDEO_BEWEGUNG", "1") not in ("0", "nein", "no")
HIMMEL_ZUG = float(os.environ.get("SMEJJ_VIDEO_HIMMEL_ZUG", "22"))    # Pixel je Runde

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

# --- Externe Video-Engine (Weg C, Betreiber-Entscheidung 2026-08-13) -------
# Der Betreiber hat seine fruehere Vorgabe "kein Fremd-Bildanbieter" fuer
# VIDEO ausdruecklich geaendert: echte Motivbewegung gibt es auf 2 CPU-Kernen
# nicht (AnimateDiff ~45 min/2 s; GPU bei Zeabur nicht vorhanden).
#
# Arbeitsteilung, die die eigene Infrastruktur maximal behaelt:
#   1. Das BILD malt weiterhin der eigene Bild-Maler (0 EUR, inkl. dessen
#      Personen-Schutzfilter — blockt der, laeuft auch extern nichts).
#   2. NUR die Bewegung kommt von fal.ai (LTX image-to-video, 0,02 USD pro
#      5-s-Video, Stand 2026-08-13).
#   3. Die Erzaehlstimme bleibt Piper (eigener Dienst).
#
# FAIL-CLOSED: ohne SMEJJ_VIDEO_EXTERN_KEY existiert dieser Weg nicht —
# kein Aufruf, kein Cent, parallax laeuft wie bisher. Der WEICHE Deckel hier
# (Tageslimit) schuetzt gegen Amok; der HARTE Deckel ist das Billing-Limit,
# das der Betreiber im fal.ai-Konto selbst setzt.
EXTERN_KEY = os.environ.get("SMEJJ_VIDEO_EXTERN_KEY", "")
EXTERN_MODELL = os.environ.get("SMEJJ_VIDEO_EXTERN_MODELL", "fal-ai/ltx-video/image-to-video")
EXTERN_QUEUE = "https://queue.fal.run"
# Budgetkette (Befund 2026-08-13): die Bruecke wartet insgesamt nur 180 s.
# Bild (~110 s) + extern-Warten muessen zusammen darunter bleiben, sonst
# stirbt der Auftrag am Bruecken-Timeout, selbst wenn hier alles klappt.
# Darum 60 s statt 110 s Voreinstellung fuers Abfrage-Warten bei fal.
EXTERN_TIMEOUT_S = int(os.environ.get("SMEJJ_VIDEO_EXTERN_TIMEOUT_S", "60"))
# 50 Videos/Tag x 0,02 USD = max ~1 USD/Tag. Der Zaehler liegt in /tmp und
# faellt bei Neustart auf 0 — darum ist das Anbieter-Limit der massgebliche
# Deckel, nicht diese Datei.
EXTERN_MAX_PRO_TAG = int(os.environ.get("SMEJJ_VIDEO_EXTERN_MAX_PRO_TAG", "50"))
EXTERN_ZAEHLER_DATEI = os.environ.get("SMEJJ_VIDEO_EXTERN_ZAEHLER", "/tmp/smejj-extern-zaehler.txt")

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


# Start-Diagnose (2026-08-13): Ein Auftrag lief am extern-Zweig vorbei, ohne
# Fehler und ohne LTX-Ergebnis — der Schluessel war im Prozess LEER, obwohl
# die Variable im Portal existierte. /health ist nur intern erreichbar, darum
# steht die Wahrheit ab jetzt beim START im Log: konfiguriert ja/nein und die
# LAENGE (nie der Wert) — eine leere oder verkuemmerte Variable faellt sofort auf.
print(
    f"extern: {'konfiguriert (Schluessel-Laenge ' + str(len(EXTERN_KEY)) + ')' if EXTERN_KEY else 'OHNE SCHLUESSEL — Weg C inaktiv'}"
    f" | engine={ENGINE} | modell={EXTERN_MODELL}",
    flush=True,
)

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
    bild = Image.open(io.BytesIO(base64.b64decode(daten["b64"]))).convert("RGB")
    return bild_aufbereiten(bild)


def bild_aufbereiten(bild):
    """Holt aus dem SD-Turbo-Bild heraus, was ohne Modellwechsel drin ist.

    Zwei billige Schritte, gemessen 2026-08-13: Nachschaerfen (+~90 %
    Detailschaerfe, Ueberzeichnung unter 40) und ein Hauch Kontrast (+14 %).
    Beides EINMAL auf dem Standbild — pro Frame waere es der 96-fache Aufwand
    fuer dasselbe Ergebnis, weil alle Frames aus diesem einen Bild entstehen.
    """
    from PIL import Image, ImageEnhance, ImageFilter

    try:
        # Erst auf Zielgroesse (LANCZOS haelt Kanten am besten), dann schaerfen.
        # Andersherum wuerde das Hochziehen die Schaerfung gleich wieder
        # wegglaetten.
        if bild.size != (GROESSE, GROESSE):
            bild = bild.resize((GROESSE, GROESSE), Image.LANCZOS)
        if SCHAERFE_PROZENT > 0:
            bild = bild.filter(ImageFilter.UnsharpMask(radius=2.5, percent=SCHAERFE_PROZENT, threshold=3))
        if KONTRAST and abs(KONTRAST - 1.0) > 0.001:
            bild = ImageEnhance.Contrast(bild).enhance(KONTRAST)
    except Exception:  # noqa: BLE001 — Aufbereitung darf nie ein Video kosten
        pass
    return bild


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


def himmel_bereich(bild, tiefe):
    """Findet den Himmel — die Fläche, die in echt nie stillsteht.

    Die Kamerafahrt allein lässt eine Szene starr wirken: Wolken stehen wie
    eingefroren. Der Himmel lässt sich ohne Modell erkennen, aus Tiefe, Lage
    und Farbe (oben, sehr fern, bläulich oder sehr hell) — das kostet
    Millisekunden statt Diffusion.

    Liefert die Maske als 0..1-Feld oder None, wenn die Erkennung unsicher ist.
    """
    import numpy as np
    from PIL import Image, ImageFilter

    rgb = np.asarray(bild, dtype=np.float32) / 255.0
    hoehe, breite = tiefe.shape
    rot, gruen, blau = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    blaustich = blau - (rot + gruen) / 2

    zeilen = np.arange(hoehe)[:, None] / hoehe

    # Fern (kleine Tiefe), oben, und entweder blau oder sehr hell.
    himmel = ((tiefe < 0.28) & (zeilen < 0.55) & ((blaustich > 0.04) | (rgb.mean(axis=2) > 0.72)))

    anteil = himmel.mean()
    # Zu klein = Rauschen, zu gross = die Erkennung hat danebengegriffen
    # (z. B. ein blaues Motiv fuellt das Bild). Beides lieber lassen.
    if anteil < 0.04 or anteil > 0.85:
        return None
    return np.asarray(
        Image.fromarray((himmel.astype(np.float32) * 255).astype(np.uint8))
        .filter(ImageFilter.GaussianBlur(6)),
        dtype=np.float32,
    ) / 255.0


def welle(rgb, maske, versatz_je_zeile):
    """Verschiebt jede Bildzeile innerhalb der Maske um ihren eigenen Betrag.

    Damit zieht der Himmel gleichmässig durch das Bild — reine Indexarithmetik,
    kein Modell, wenige Millisekunden.
    """
    import numpy as np

    hoehe, breite = maske.shape
    spalten = np.arange(breite)[None, :]
    quelle = (spalten - versatz_je_zeile[:, None]).astype(np.int32) % breite
    verschoben = np.take_along_axis(rgb, quelle[..., None].repeat(3, axis=2), axis=1)
    alpha = maske[..., None]
    return rgb * (1 - alpha) + verschoben * alpha


def bildart(tiefe):
    """Zentrales Motiv oder weite Szene? Entscheidet ueber die Kamerabahn.

    GEMESSEN 2026-08-13 an Portraet und Landschaft: der Unterschied zwischen
    mittlerer Tiefe in der BILDMITTE und am RAND trennt beide sauber.
    Portraet +0,09 (Kopf naeher als der Hintergrund ringsum), Landschaft
    -0,17 (der Vordergrund liegt unten und aussen).

    Ein seitlicher Schwenk laesst ein Portraet unruhig wirken; eine
    Vorwaertsfahrt (Zoom) passt dort besser — und umgekehrt.
    """
    import numpy as np

    hoehe, breite = tiefe.shape
    mitte = tiefe[hoehe // 3:2 * hoehe // 3, breite // 3:2 * breite // 3].mean()
    rand = np.concatenate([
        tiefe[:hoehe // 6].ravel(), tiefe[-hoehe // 6:].ravel(),
        tiefe[:, :breite // 6].ravel(), tiefe[:, -breite // 6:].ravel(),
    ]).mean()
    return "zentral" if float(mitte - rand) > 0.03 else "weit"


def parallax_frames(bild, tiefe, dauer=None):
    """Kamerafahrt durch die Szene: jeder Pixel wandert nach SEINER Tiefe.

    Frueher stapelten hier 8 Tiefen-EBENEN (Multi-Plane). Das zerriss
    Portraets sichtbar: ein Gesicht faellt in mehrere Scheiben, an den
    Grenzen entstehen Geisterraender ("Papierschnitt"). GEMESSEN 2026-08-13
    an einer Portraet-Szene: +0,32 Kantenenergie im Gesicht (36 % mehr als
    das Original) — der Betreiber sah genau das live und nannte es zu Recht
    sehr schlecht.

    Jetzt: kontinuierliches Depth-Warping mit bilinearer Abtastung — jeder
    Pixel bekommt seinen eigenen Versatz aus der (geglaetteten) Tiefenkarte.
    GEMESSEN: +0,01 Kantenenergie (artefaktfrei), gleiche Rechenzeit
    (25 ms/Frame), Parallax bleibt kraeftig (nah/fern 14,8x). Die Glaettung
    der Karte verhindert Riss-Kanten an harten Tiefenspruengen; Loecher gibt
    es beim Rueckwaerts-Abtasten prinzipbedingt nicht.
    """
    import math

    import numpy as np
    from PIL import Image, ImageFilter

    rgb = np.asarray(bild, dtype=np.float32)
    hoehe, breite = tiefe.shape

    # Geglaettete Karte: weiche Uebergaenge statt Scheibengrenzen.
    glatt = np.asarray(
        Image.fromarray((tiefe * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(5)),
        dtype=np.float32,
    ) / 255.0

    art = bildart(tiefe)
    # Wolkenzug nur bei weiten Szenen: hinter einem Kopf zieht sonst der
    # unscharfe Hintergrund vorbei, was unruhig statt lebendig wirkt.
    himmel = himmel_bereich(bild, tiefe) if (BEWEGUNG_AN and art == "weit") else None

    yy, xx = np.mgrid[0:hoehe, 0:breite].astype(np.float32)

    # Radiale Richtung fuer die Vorwaertsfahrt (vom Bildmittelpunkt weg).
    rx = (xx - breite / 2) / (breite / 2)
    ry = (yy - hoehe / 2) / (hoehe / 2)

    def warp(quelle, vx, vy, vz=0.0):
        qx = xx - PARALLAX_STAERKE * glatt * (vx + rx * vz)
        qy = yy - PARALLAX_STAERKE * glatt * (vy + ry * vz)
        x0 = np.clip(np.floor(qx).astype(np.int32), 0, breite - 2)
        y0 = np.clip(np.floor(qy).astype(np.int32), 0, hoehe - 2)
        fx = (qx - x0)[..., None]
        fy = (qy - y0)[..., None]
        return (quelle[y0, x0] * (1 - fx) * (1 - fy)
                + quelle[y0, x0 + 1] * fx * (1 - fy)
                + quelle[y0 + 1, x0] * (1 - fx) * fy
                + quelle[y0 + 1, x0 + 1] * fx * fy)

    anzahl = max(2, int((dauer or DAUER_S) * FPS))
    rand = int(PARALLAX_STAERKE * 1.2)
    frames = []
    for i in range(anzahl):
        # Nahtlose Schleife: jeder Verlauf beginnt und endet bei 0.
        w = 2 * math.pi * i / anzahl
        if art == "zentral":
            # Vorwaertsfahrt: der Versatz zeigt radial nach aussen, nahe
            # Bildteile wandern staerker — das wirkt wie ein Hineingehen.
            # Dazu ein Hauch Seitwaerts, damit es nicht mechanisch aussieht.
            vz = 0.5 - 0.5 * math.cos(w)
            vx, vy = 0.18 * math.sin(w), 0.0
        else:
            vz = 0.0
            vx, vy = math.sin(w), 0.35 * (1 - math.cos(w)) - 0.35
        # Eigenbewegung VOR dem Warp: die Wolken ziehen gleichmaessig durch
        # und stehen nach einer Runde wieder am Anfang.
        rgb_bewegt = rgb
        if himmel is not None:
            zug = np.full(hoehe, HIMMEL_ZUG * i / anzahl, dtype=np.float32)
            rgb_bewegt = welle(rgb_bewegt, himmel, zug)
        leinwand = warp(rgb_bewegt, vx, vy, vz)
        # Zuschnitt kaschiert die Raender, die das Verschieben freilegt.
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
            ffmpeg_params=["-crf", str(CRF), "-preset", "veryfast", "-pix_fmt", "yuv420p", "-movflags", "+frag_keyframe+empty_moov+default_base_moof"],
        )
        for frame in frames:
            schreiber.append_data(np.asarray(frame))
        schreiber.close()
        datei.seek(0)
        return datei.read()


def extern_budget_frei():
    """Weicher Tagesdeckel. True = ein weiterer externer Aufruf ist erlaubt."""
    import datetime

    heute = datetime.date.today().isoformat()
    stand = 0
    try:
        tag, zahl = open(EXTERN_ZAEHLER_DATEI).read().split(":")
        if tag == heute:
            stand = int(zahl)
    except Exception:  # noqa: BLE001 — fehlende/kaputte Datei = Zaehler 0
        pass
    if stand >= EXTERN_MAX_PRO_TAG:
        return False
    with open(EXTERN_ZAEHLER_DATEI, "w") as datei:
        datei.write(f"{heute}:{stand + 1}")
    return True


def erzeuge_extern(prompt, bild):
    """Echte Motivbewegung: eigenes Bild + fal.ai-Animation.

    Wirft bei jedem Problem — der Aufrufer faellt dann auf parallax zurueck,
    der Nutzer bekommt IMMER ein Video. Der Aufrufer stellt sicher, dass
    EXTERN_KEY gesetzt ist; hier schuetzt zusaetzlich der Tagesdeckel.

    Das Basisbild kommt vom AUFRUFER (einmal gemalt, ~110 s): schlaegt fal
    fehl, rendert der parallax-Rueckfall DASSELBE Bild, statt den Maler ein
    zweites Mal zu bezahlen — die zweite Malrunde sprengte am 2026-08-13 das
    180-s-Budget der Bruecke.
    """
    import base64 as b64mod

    if not extern_budget_frei():
        raise RuntimeError("extern_tagesdeckel_erreicht")

    puffer = io.BytesIO()
    bild.save(puffer, format="PNG")
    daten_uri = "data:image/png;base64," + b64mod.b64encode(puffer.getvalue()).decode("ascii")

    kopf = {"Authorization": f"Key {EXTERN_KEY}", "Content-Type": "application/json"}
    start = requests.post(
        f"{EXTERN_QUEUE}/{EXTERN_MODELL}",
        json={"image_url": daten_uri, "prompt": prompt[:MAX_PROMPT]},
        headers=kopf, timeout=30,
    )
    start.raise_for_status()
    anfrage = start.json().get("request_id")
    if not anfrage:
        raise RuntimeError("extern_keine_request_id")

    basis = f"{EXTERN_QUEUE}/{EXTERN_MODELL}/requests/{anfrage}"
    frist = time.time() + EXTERN_TIMEOUT_S
    while time.time() < frist:
        lage = requests.get(f"{basis}/status", headers=kopf, timeout=15).json()
        if lage.get("status") == "COMPLETED":
            break
        if lage.get("status") in ("FAILED", "CANCELLED"):
            raise RuntimeError(f"extern_{lage.get('status', 'fehler').lower()}")
        time.sleep(3)
    else:
        raise RuntimeError("extern_zeitueberschreitung")

    ergebnis = requests.get(basis, headers=kopf, timeout=30).json()
    video_url = ((ergebnis.get("video") or {}).get("url")) or ""
    # Nur von fal selbst laden (SSRF-Schutz): die Antwort kam zwar per TLS
    # von fal, aber eine fremde Adresse darin laden wir trotzdem nicht.
    if not video_url.startswith("https://") or ".fal." not in video_url.split("/")[2]:
        raise RuntimeError("extern_unerwartete_video_adresse")
    mp4 = requests.get(video_url, timeout=60).content
    if mp4[4:8] != b"ftyp":
        raise RuntimeError("extern_kein_mp4")
    return mp4, f"extern:{EXTERN_MODELL.split('/')[-2]}"


def erzeuge_kenburns(prompt, dauer=None, bild=None):
    if bild is None:
        bild = hole_basisbild(prompt)
    return kodiere_mp4(kenburns_frames(bild, dauer)), "kenburns:sd-turbo"


def erzeuge_parallax(prompt, dauer=None, bild=None):
    """Bild malen, Tiefe schätzen, räumlich durchfahren.

    Fällt auf kenburns zurück, wenn keine brauchbare Tiefe herauskommt — die
    Antwort nennt dann auch ehrlich "kenburns", damit die Brücke den richtigen
    Hinweis setzt. Ein schon gemaltes Bild (extern-Rueckfall) wird
    wiederverwendet statt neu bezahlt.
    """
    if bild is None:
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
        # Die Minutenarbeit gehoert in den Threadpool, NICHT in die Event-Loop:
        # der Bild-Maler blockiert seine Loop waehrend des Malens, und gemessen
        # am 2026-08-13 stauen sich dann alle Anfragen (auch /health) am Socket,
        # bis der Job fertig ist — das sofortige 429 wird zur Luege. Hier bleibt
        # die Loop frei, damit /health und das 429 auch waehrend eines Renderns
        # ehrlich antworten.
        from fastapi.concurrency import run_in_threadpool

        return await run_in_threadpool(erzeuge_blockierend, prompt, erzaehltext)
    finally:
        video_sperre.release()


def erzeuge_blockierend(prompt, erzaehltext):
    """Die eigentliche Videoarbeit — laeuft im Threadpool, Sperre haelt der Aufrufer."""
    try:
        beginn = time.time()
        # Stimme ZUERST: erst ihre Länge sagt, wie lang das Video werden muss.
        # Sie kostet nur wenige Sekunden, das Bild danach die Minute.
        # Extern liefert FIX 5 s — dort den Text vorab auf ~70 Zeichen kuerzen
        # (am Satzende), sonst schnitte -shortest die Erzaehlung mitten im
        # Satz ab (die Falle von 98e7ec8, nur durch die Hintertuer).
        if erzaehltext and EXTERN_KEY:
            erzaehltext = kuerze_auf_satz(erzaehltext, 70)
        stimme = hole_erzaehlstimme(erzaehltext) if erzaehltext else None
        dauer = min(MAX_DAUER_S, stimme[1] + 0.6) if stimme else DAUER_S

        if EXTERN_KEY:
            # Weg C (Betreiber 2026-08-13): echte Motivbewegung. Bei JEDEM
            # Fehler ehrlich zurueck auf die eigene Engine — der Nutzer
            # bekommt immer ein Video. LTX liefert fix 5 s; die Stimme wird
            # bei Bedarf vom Mischer gekuerzt statt das Video zu strecken.
            #
            # Das Bild EINMAL malen und fuer extern UND Rueckfall verwenden:
            # zweimal malen (je ~110 s) sprengte das 180-s-Budget der Bruecke.
            bild = hole_basisbild(prompt)
            print(f"basisbild nach {time.time() - beginn:.0f}s", flush=True)
            try:
                mp4, engine = erzeuge_extern(prompt, bild)
            except Besetzt:
                raise
            except Exception as fehler:  # noqa: BLE001
                # flush: Container-stdout ist blockgepuffert — ohne flush erschien
                # diese Zeile NIE im Zeabur-Log (Befund 2026-08-13).
                print(f"extern fehlgeschlagen, parallax uebernimmt: {type(fehler).__name__}: {fehler}", flush=True)
                mp4, engine = erzeuge_parallax(prompt, dauer, bild=bild)
        elif ENGINE == "animatediff" and diffusion_pipeline is not None:
            mp4, engine = erzeuge_animatediff(prompt)
        elif ENGINE == "parallax":
            mp4, engine = erzeuge_parallax(prompt, dauer)
        else:
            mp4, engine = erzeuge_kenburns(prompt, dauer)

        # Passt die Stimme nicht ins (externe 5-s-)Video, lieber ehrlich
        # stumm als ein abgehackter Satz.
        if stimme and engine.startswith("extern:") and stimme[1] > 5.5:
            stimme = None
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
        # Auch der Fehlweg gehoert ins Log: die Bruecke zeigt dem Nutzer nur
        # ihren generischen Satz, der Ausnahme-Typ stand bisher NIRGENDS
        # (Befund 2026-08-13: der 500er um 23:18Z war im Log typlos).
        print(f"erzeuge fehlgeschlagen: {type(fehler).__name__}: {fehler}", flush=True)
        return JSONResponse({"ok": False, "fehler": f"{type(fehler).__name__}: {fehler}"}, status_code=500)
