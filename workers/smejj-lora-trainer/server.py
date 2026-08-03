#!/usr/bin/env python3
"""smejj.com LoRA-Trainingsdienst — HTTP-Vertrag (Single Responsibility: Routen).

DIE WICHTIGSTE ZEILE DIESES DIENSTES steht ganz unten in main(): der HTTP-Server
wird gestartet, BEVOR irgendein Modellgewicht geladen wird.

Grund, live gemessen am 2026-08-01: llama.cpp laedt seine Gewichte beim Start
und antwortet erst danach. Salads startup_probe laeuft maximal rund 60 Minuten
(initial_delay 1200 s + 20 x 120 s, hoehere Werte weist die API mit HTTP 400
ab). Ein 17,7-GB-Abbild wurde darin zweimal nicht fertig — danach beginnt der
Download von vorn, und der Dienst antwortet nie. Salad meldet dabei RUNNING und
1/1 Replica, nur ready bleibt false; von aussen nicht von einem normalen
Hochlauf zu unterscheiden.

Hier laedt deshalb nichts im Startpfad. Der Server antwortet binnen Sekunden auf
/health, das Modell kommt im Hintergrund, und der Zustand sagt ehrlich
'vorbereitung', solange er nicht bereit ist.
"""

import json
import os
import socket
import threading
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from laufwerk import Laufwerk

MODUS = os.environ.get("SMEJJ_TRAINER_MODUS", "attrappe").strip().lower()
PORT = int(os.environ.get("PORT", "8080"))
# "::" statt "0.0.0.0": Salads Gateway und Sonden erreichen den Container nur
# ueber IPv6 (gemessen am Sprachserver, Control v103). Ein reiner IPv4-Bind
# laesst jede Anfrage von aussen scheitern, waehrend der Prozess gesund wirkt —
# Fehlbild: Gateway 503, Instanz pendelt running -> creating.
HOST = os.environ.get("SMEJJ_HOST", "::")
# Adresse, unter der der Loop diesen Dienst zum Messen erreicht. Muss von aussen
# gueltig sein; im Container ist sie nicht ableitbar.
OEFFENTLICHE_URL = os.environ.get("SMEJJ_TRAINER_PUBLIC_URL", "").rstrip("/")

laufwerk = Laufwerk(modus=MODUS)


class Handler(BaseHTTPRequestHandler):
    # Standard-Zugriffsprotokoll aus: es schreibt jede Health-Abfrage der
    # Startsonde mit, und die kommt alle 120 Sekunden.
    def log_message(self, *_args):
        return

    def _antworte(self, status, koerper):
        rohdaten = json.dumps(koerper).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(rohdaten)))
        self.end_headers()
        self.wfile.write(rohdaten)

    def _koerper(self):
        laenge = int(self.headers.get("content-length") or 0)
        if laenge <= 0:
            return {}
        try:
            return json.loads(self.rfile.read(laenge).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return {}

    def do_GET(self):  # noqa: N802 (von BaseHTTPRequestHandler vorgegeben)
        pfad = self.path.split("?")[0]

        # /health antwortet IMMER 200, sobald der Prozess lebt. Das ist der
        # ganze Trick gegen die Startsonde. Der Ladezustand steht im Koerper,
        # nicht im Statuscode — sonst wuerde Salad den Container toeten,
        # waehrend er noch legitim laedt.
        if pfad == "/health":
            return self._antworte(200, {
                "ok": True,
                "modus": MODUS,
                "bereit": laufwerk.ist_bereit(),
                "ladezustand": laufwerk.ladezustand(),
            })

        if pfad.startswith("/training/status/"):
            lauf_id = pfad[len("/training/status/"):]
            zustand = laufwerk.zustand(lauf_id)
            if zustand is None:
                return self._antworte(404, {"ok": False, "error": "lauf_unbekannt"})
            return self._antworte(200, zustand)

        return self._antworte(404, {"ok": False, "error": "not_found"})

    def do_POST(self):  # noqa: N802
        pfad = self.path.split("?")[0]

        if pfad == "/training/start":
            if not laufwerk.ist_bereit():
                # Kein Fehler, sondern ein ehrliches Nein: der Loop wertet alles
                # ausser einer laufId als Fehlschlag und startet keinen Zyklus.
                return self._antworte(409, {
                    "ok": False,
                    "error": "nicht_bereit",
                    "ladezustand": laufwerk.ladezustand(),
                })
            auftrag = self._koerper()
            lauf_id = uuid.uuid4().hex[:16]
            laufwerk.starte(lauf_id, auftrag, OEFFENTLICHE_URL)
            return self._antworte(200, {"laufId": lauf_id})

        if pfad.startswith("/training/abort/"):
            lauf_id = pfad[len("/training/abort/"):]
            beendet = laufwerk.brich_ab(lauf_id)
            return self._antworte(200 if beendet else 404, {"ok": beendet})

        if pfad == "/v1/chat/completions":
            anfrage = self._koerper()
            try:
                antwort = laufwerk.chat(anfrage)
            except Exception as fehler:  # noqa: BLE001 - nie den Dienst reissen
                return self._antworte(503, {"error": {"message": str(fehler)[:200]}})
            return self._antworte(200, antwort)

        return self._antworte(404, {"ok": False, "error": "not_found"})


class DualStackServer(ThreadingHTTPServer):
    address_family = socket.AF_INET6

    def server_bind(self):
        try:
            self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        except OSError:
            pass  # Kernel ohne Dual-Stack: reines IPv6 genuegt fuer Salad
        super().server_bind()


def main():
    server_klasse = DualStackServer if ":" in HOST else ThreadingHTTPServer
    server = server_klasse((HOST, PORT), Handler)
    print(f"[smejj-lora-trainer] hoert auf {HOST}:{PORT} (modus={MODUS})", flush=True)

    # ERST horchen, DANN laden. Die Reihenfolge ist der Kern dieses Dienstes.
    threading.Thread(target=laufwerk.lade_basismodell, daemon=True).start()

    server.serve_forever()


if __name__ == "__main__":
    main()
