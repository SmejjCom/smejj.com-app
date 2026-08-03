#!/usr/bin/env python3
"""smejj.com LoRA-Trainingsdienst — Laufverwaltung (Single Responsibility: Zustand eines Laufs).

Kennt zwei Betriebsarten:

  attrappe  Kein torch, kein Modell, keine GPU. Erfuellt den vollstaendigen
            Vertrag mit sofortigen Scheinlaeufen. Zweck: den Vertrag gegen den
            ECHTEN Loop pruefen, ohne eine Karte zu mieten. Das ist keine
            Spielerei — es ist die einzige Art, die Schnittstelle zu
            verifizieren, bevor Geld fliesst.
  echt      Laedt torch/transformers/peft und trainiert wirklich.

Fail-closed: alles ausser einem ausdruecklichen 'echt' faellt auf 'attrappe'
zurueck. Ein Tippfehler in der Umgebung darf nie versehentlich eine GPU belegen.

Dieses Modul trifft KEINE Geldentscheidung und kennt kein Budget. Alle Bremsen
liegen im Loop (workers/smejj-lora-loop/budget.js). Zwei Stellen, die beide
abbrechen duerfen, waeren zwei Stellen, an denen man es vergessen kann.
"""

import os
import threading
import time
import traceback

# Der Startbefehl installiert die torch-Pakete im Hintergrund und schreibt
# danach ihren Exit-Code in diese Markerdatei. Gemessen am 2026-08-03: ohne
# Warten darauf verliert der Motor-Import den Wettlauf gegen pip
# (ModuleNotFoundError: transformers) und der Trainer bleibt dauerhaft
# im Zustand 'fehler'.
PIP_MARKER = os.environ.get("SMEJJ_TRAINER_PIP_MARKER", "/tmp/smejj-pip.rc")
PIP_PROTOKOLL = "/tmp/pip.log"
PIP_WARTEZEIT_S = int(os.environ.get("SMEJJ_TRAINER_PIP_WARTEZEIT_S", "1800"))


class Laufwerk:
    def __init__(self, modus="attrappe"):
        self.modus = "echt" if str(modus).strip().lower() == "echt" else "attrappe"
        self._sperre = threading.Lock()
        self._laeufe = {}
        self._bereit = False
        self._ladezustand = "vorbereitung"
        self._motor = None

    # --- Ladezustand ---------------------------------------------------

    def ist_bereit(self):
        with self._sperre:
            return self._bereit

    def ladezustand(self):
        with self._sperre:
            return self._ladezustand

    def _setze_ladezustand(self, text, bereit=False):
        with self._sperre:
            self._ladezustand = text
            self._bereit = bereit
        print(f"[smejj-lora-trainer] ladezustand={text} bereit={bereit}", flush=True)

    def lade_basismodell(self):
        """Laeuft im Hintergrund, NIE im Startpfad des HTTP-Servers."""
        if self.modus == "attrappe":
            self._setze_ladezustand("attrappe-bereit", bereit=True)
            return
        try:
            self._warte_auf_pakete()
            self._setze_ladezustand("laedt-motor")
            from motor import Motor  # noqa: PLC0415 - torch bewusst spaet laden

            motor = Motor()
            self._setze_ladezustand("laedt-gewichte")
            motor.lade()
            self._motor = motor
            self._setze_ladezustand("bereit", bereit=True)
        except Exception as fehler:  # noqa: BLE001
            # Nicht bereit ist ein gueltiger Dauerzustand: der Loop startet dann
            # keinen Zyklus und es entstehen keine Trainingskosten. Der Prozess
            # bleibt am Leben, damit /health weiter antwortet und Salad den
            # Container nicht in eine Neustartschleife schickt.
            self._setze_ladezustand(f"fehler:{str(fehler)[:120]}")
            traceback.print_exc()

    def _warte_auf_pakete(self):
        """Wartet, bis die Hintergrund-Installation ihren Exit-Code gemeldet hat.

        Fehlt die Markerdatei (alter Startbefehl ohne Marker), wird nach Ablauf
        der Wartezeit trotzdem importiert — dann meldet der Import selbst einen
        ehrlichen Fehler statt eines stummen Haengens.
        """
        frist = time.time() + PIP_WARTEZEIT_S
        self._setze_ladezustand("wartet-auf-pakete")
        while time.time() < frist:
            if os.path.exists(PIP_MARKER):
                with open(PIP_MARKER, encoding="utf-8") as datei:
                    code = datei.read().strip()
                if code != "0":
                    schwanz = ""
                    try:
                        with open(PIP_PROTOKOLL, encoding="utf-8", errors="replace") as datei:
                            schwanz = datei.read()[-300:]
                    except OSError:
                        pass
                    raise RuntimeError(f"pip-exit={code}: {schwanz}")
                return
            time.sleep(5)

    # --- Laeufe --------------------------------------------------------

    def starte(self, lauf_id, auftrag, oeffentliche_url):
        with self._sperre:
            self._laeufe[lauf_id] = {
                "zustand": "laeuft",
                "beginn": time.time(),
                "adapterSchluessel": None,
                "messEndpunkt": oeffentliche_url or None,
                "abbruch": False,
            }
        threading.Thread(
            target=self._fuehre_aus, args=(lauf_id, auftrag), daemon=True
        ).start()

    def zustand(self, lauf_id):
        with self._sperre:
            lauf = self._laeufe.get(lauf_id)
            if lauf is None:
                return None
            return {
                "zustand": lauf["zustand"],
                "adapterSchluessel": lauf["adapterSchluessel"],
                "messEndpunkt": lauf["messEndpunkt"],
                "gelaufeneMinuten": round((time.time() - lauf["beginn"]) / 60.0, 2),
            }

    def brich_ab(self, lauf_id):
        with self._sperre:
            lauf = self._laeufe.get(lauf_id)
            if lauf is None:
                return False
            lauf["abbruch"] = True
            if lauf["zustand"] == "laeuft":
                lauf["zustand"] = "fehlgeschlagen"
        print(f"[smejj-lora-trainer] Lauf {lauf_id} abgebrochen", flush=True)
        return True

    def _abbruch_gewuenscht(self, lauf_id):
        with self._sperre:
            lauf = self._laeufe.get(lauf_id)
            return bool(lauf and lauf["abbruch"])

    def _abschluss(self, lauf_id, zustand, adapter=None):
        with self._sperre:
            lauf = self._laeufe.get(lauf_id)
            if lauf is None or lauf["abbruch"]:
                return
            lauf["zustand"] = zustand
            lauf["adapterSchluessel"] = adapter

    def _fuehre_aus(self, lauf_id, auftrag):
        try:
            if self.modus == "attrappe":
                # Kurz, aber nicht sofort: der Loop soll den Zustand 'laeuft'
                # mindestens einmal wirklich sehen.
                time.sleep(0.2)
                if self._abbruch_gewuenscht(lauf_id):
                    return
                kennung = str((auftrag or {}).get("kennung") or lauf_id)
                self._abschluss(lauf_id, "fertig", f"attrappe/adapter-{kennung}.safetensors")
                return

            if self._motor is None:
                self._abschluss(lauf_id, "fehlgeschlagen")
                return

            adapter = self._motor.trainiere(
                auftrag or {}, abbruch=lambda: self._abbruch_gewuenscht(lauf_id)
            )
            if self._abbruch_gewuenscht(lauf_id):
                return
            self._abschluss(lauf_id, "fertig" if adapter else "fehlgeschlagen", adapter)
        except Exception:  # noqa: BLE001
            traceback.print_exc()
            self._abschluss(lauf_id, "fehlgeschlagen")

    # --- Messen --------------------------------------------------------

    def chat(self, anfrage):
        """OpenAI-kompatible Antwort fuer den Messlauf der Pruefsuite."""
        if self.modus == "attrappe":
            # Bewusst eine feste, erkennbar unbrauchbare Antwort. Sie soll den
            # Vertrag beweisen, nicht eine Messung vortaeuschen — eine Attrappe,
            # die plausibel klingt, wuerde irgendwann als echtes Ergebnis
            # missverstanden.
            return _openai_huelle("attrappe", "[attrappe] kein Modell geladen")
        if self._motor is None:
            raise RuntimeError("motor_nicht_bereit")
        nachrichten = (anfrage or {}).get("messages") or []
        text = self._motor.antworte(
            nachrichten,
            max_tokens=int((anfrage or {}).get("max_tokens") or 512),
            temperature=float((anfrage or {}).get("temperature") or 0.35),
        )
        return _openai_huelle("smejj-1-0", text)


def _openai_huelle(modell, text):
    return {
        "id": "chatcmpl-smejj",
        "object": "chat.completion",
        "model": modell,
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": text},
                "finish_reason": "stop",
            }
        ],
    }
