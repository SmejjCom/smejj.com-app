#!/usr/bin/env python3
"""smejj.com — prueft das Stimmen-Verhalten des Video-Workers ECHT, nicht per Textmuster.

Warum es dieses Skript gibt (2026-08-12): Der Piper-http_server beantwortet
Winz-Eingaben mit seiner HTML-Demo-Seite — mit Status 200. Ein Worker, der nur
auf den Status schaut, legt dann eine HTML-Datei als "Tonspur" unter das Video
und der Chat verspricht eine Erzaehlung, die niemand hoert. Dieselbe Klasse von
Fehler entsteht bei stillen WAVs und bei Stimmen, die laenger sind als das
Videobudget (ffmpeg -shortest schneidet dann mitten im Satz ab).

Diese Faelle lassen sich nicht an Textmustern pruefen — nur am Verhalten. Damit
das ohne Zusatzpakete geht (System-python3 hat weder requests noch fastapi),
werden beide gestubbt; der Worker braucht dann nur die Standardbibliothek.

Aufruf (Rueckgabe 0 = alles gut, 1 = Befund):
  python3 scripts/testing/pruefe_video_stimme.py
Eingebunden in tests/video-worker.test.mjs.
"""
import io
import math
import os
import struct
import sys
import types
import wave

WORKER = os.path.join(os.path.dirname(__file__), "..", "..", "workers", "smejj-video-worker")


def stubbe_umgebung():
    """Ersetzt requests und fastapi, damit server.py ohne Zusatzpakete laedt."""
    antworten = {}

    class Antwort:
        def __init__(self, inhalt, ok=True, status=200):
            self.content, self.ok, self.status_code = inhalt, ok, status

        def raise_for_status(self):
            if not self.ok:
                raise RuntimeError(f"status {self.status_code}")

        def json(self):
            return {}

    requests = types.ModuleType("requests")
    requests.post = lambda *a, **k: antworten.get("post", Antwort(b""))
    requests.get = lambda *a, **k: antworten.get("get", Antwort(b""))
    sys.modules["requests"] = requests

    for name in ("fastapi", "fastapi.responses"):
        sys.modules.setdefault(name, types.ModuleType(name))
    sys.modules["fastapi"].FastAPI = lambda: types.SimpleNamespace(
        get=lambda p: (lambda f: f), post=lambda p: (lambda f: f)
    )
    sys.modules["fastapi"].Request = object
    sys.modules["fastapi.responses"].JSONResponse = dict
    return antworten, Antwort


def mach_wav(sekunden, amplitude=6000):
    puffer = io.BytesIO()
    with wave.open(puffer, "wb") as datei:
        datei.setnchannels(1)
        datei.setsampwidth(2)
        datei.setframerate(22050)
        datei.writeframes(b"".join(
            struct.pack("<h", int(amplitude * math.sin(2 * math.pi * 220 * i / 22050)))
            for i in range(int(22050 * sekunden))))
    return puffer.getvalue()


def main():
    antworten, Antwort = stubbe_umgebung()
    os.environ.setdefault("SMEJJ_VIDEO_ENGINE", "kenburns")  # kein Modell-Download
    sys.path.insert(0, os.path.abspath(WORKER))
    import server

    text = "Ein stiller Morgen am Berg. Das Licht wandert langsam ueber die Wiese."
    faelle = [
        ("gueltige Stimme", mach_wav(6.0), True),
        ("HTML-Demo-Seite trotz Status 200", b"<html><body>Piper demo</body></html>", False),
        ("laenger als das Videobudget", mach_wav(server.MAX_DAUER_S + 6), False),
        ("gueltiges WAV, aber still", mach_wav(6.0, amplitude=0), False),
        ("kaputter RIFF-Rumpf", b"RIFFxxxxWAVEnonsense", False),
        ("leere Antwort", b"", False),
    ]

    fehler = []
    for name, inhalt, erwartet_ton in faelle:
        antworten["post"] = Antwort(inhalt)
        ergebnis = server.hole_erzaehlstimme(text)
        hat_ton = ergebnis is not None
        zeichen = "OK " if hat_ton == erwartet_ton else "FEHLER"
        print(f"  {zeichen} {name}: {'Ton' if hat_ton else 'kein Ton'}")
        if hat_ton != erwartet_ton:
            fehler.append(f"{name}: erwartet {'Ton' if erwartet_ton else 'kein Ton'}")

    # Kuerzen darf nie mitten im Wort enden — Piper spricht Bruchstuecke aus.
    lang = "Erster Satz hier. Zweiter Satz folgt. " + "Ein dritter sehr langer Satz der weit hinausgeht. " * 5
    gekuerzt = server.kuerze_auf_satz(lang, 60)
    print(f"  {'OK ' if gekuerzt.endswith('.') and len(gekuerzt) <= 60 else 'FEHLER'} "
          f"Kuerzen endet am Satz ({len(gekuerzt)} Zeichen): {gekuerzt!r}")
    if not gekuerzt.endswith(".") or len(gekuerzt) > 60:
        fehler.append("kuerze_auf_satz: kein sauberes Satzende")
    if server.kuerze_auf_satz("Kurz und gut.", 200) != "Kurz und gut.":
        fehler.append("kuerze_auf_satz: kuerzt, obwohl der Text passt")

    if fehler:
        print("\nBEFUND:\n  - " + "\n  - ".join(fehler))
        return 1
    print(f"\nAlle {len(faelle) + 2} Pruefungen gruen.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
