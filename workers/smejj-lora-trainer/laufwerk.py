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
        # Vollstaendiger Fehlertext und Rueckverfolgung. `ladezustand` wird auf
        # 120 Zeichen gekuerzt, damit /health knapp bleibt — genau diese Kuerzung
        # hat am 2026-08-03 die eigentliche Ursache verborgen ("...because of the
        # following error:\nF"). Hier steht sie ungekuerzt.
        self._fehler_text = ""
        self._fehler_spur = ""

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
            self._pruefe_torch_stimmig()
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
            with self._sperre:
                self._fehler_text = str(fehler)
                self._fehler_spur = traceback.format_exc()
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

    def _pruefe_torch_stimmig(self):
        """Meldet eine MISCHINSTALLATION von torch, bevor sie Folgefehler wirft.

        Am 2026-08-03 stand im Container:
            importlib.metadata.version("torch") == "2.6.0"   (pip-Metadaten)
            torch.__version__                  == "2.4.0"    (wirklich geladen)

        pip hatte die neue Fassung ueber die conda-Installation des Abbilds
        gelegt, ohne die alte entfernen zu koennen. Sichtbar wurde das erst
        drei Ebenen tiefer als "cannot import name 'get_proxy_mode'" und
        "No module named 'torch._C._dynamo.guards'" — Meldungen, die auf
        transformers und bitsandbytes zeigen und nicht auf die Ursache.

        Zwei Zeilen Vergleich ersparen diese Suche.
        """
        from importlib.metadata import PackageNotFoundError, version  # noqa: PLC0415

        import torch  # noqa: PLC0415

        try:
            gemeldet = version("torch")
        except PackageNotFoundError:
            return  # Ohne Metadaten gibt es nichts zu vergleichen.

        # "2.6.0+cu124" und "2.6.0" sind dieselbe Fassung: der Teil hinter dem
        # Pluszeichen benennt nur den CUDA-Bau.
        def basis(fassung):
            return str(fassung).split("+")[0]

        if basis(gemeldet) != basis(torch.__version__):
            raise RuntimeError(
                "torch-Mischinstallation: pip meldet "
                f"{gemeldet}, geladen wird aber {torch.__version__}. "
                "Die torch-Fassung gehoert ins Abbild, nicht in den Startbefehl "
                "(siehe scripts/deploy/lora_trainer_rezept.mjs)."
            )

    # --- Diagnose ------------------------------------------------------

    def diagnose(self):
        """Vollstaendiges Fehlerbild — der Ersatz fuer das Salad-Portalprotokoll.

        Am 2026-08-03 hat genau dieses Loch einen Tag gekostet: der Ladezustand
        in /health ist auf 120 Zeichen gekuerzt, und die oeffentliche Salad-API
        liefert keine Container-Protokolle. Die Ursache stand nur im Portal.
        Diese Route holt sie an die Oberflaeche: ungekuerzte Rueckverfolgung,
        das pip-Protokoll und die tatsaechlich installierten Fassungen.

        Bewusst OHNE Geheimnisse: keine Umgebungswerte, keine Schluessel.
        """
        with self._sperre:
            bericht = {
                "modus": self.modus,
                "bereit": self._bereit,
                "ladezustand": self._ladezustand,
                "fehler": self._fehler_text,
                "spur": self._fehler_spur,
            }
        bericht["modell"] = self._modell_bericht()
        bericht["pip"] = self._pip_bericht()
        bericht["pakete"] = _paketfassungen()
        bericht["bitsandbytes"] = _importprobe("bitsandbytes")
        bericht["cuda"] = _cuda_bericht()
        return bericht

    def _modell_bericht(self):
        """WO liegt das Modell wirklich — Karte oder Hauptspeicher?

        Am 2026-08-04 zeigte die Instanz waehrend eines Laufs 1500 % CPU und
        15,1 GB RAM (von 16 GB), waehrend ein frueherer Lauf mit 0,2 % CPU und
        2 GB auskam. `/diagnose` meldete beide Male brav "CUDA verfuegbar,
        RTX 3090" — die Frage "verfuegbar?" beantwortet eben nicht die Frage
        "benutzt?".

        `device_map="auto"` legt Schichten auf die CPU, sobald ihm der Platz auf
        der Karte knapp erscheint. Das faellt nirgends auf: das Training laeuft
        weiter, nur um ein Vielfaches langsamer und am Rand des Hauptspeichers.
        Deshalb steht die Verteilung jetzt hier.
        """
        motor = self._motor
        modell = getattr(motor, "modell", None)
        if modell is None:
            return {"geladen": False}

        bericht = {"geladen": True, "typ": type(modell).__name__}
        # Beweist, dass die Vorspann-Maskierung greift: ohne sie waeren 100 %
        # der Zeichen Lernziel, mit ihr nur der Antwortanteil.
        quote = getattr(motor, "letzte_ziel_quote", None)
        if quote is not None:
            bericht["zielQuoteProzent"] = quote
        try:
            bericht["dtype"] = str(getattr(modell, "dtype", ""))
        except Exception:  # noqa: BLE001
            pass
        try:
            verteilung = getattr(modell, "hf_device_map", None)
            if isinstance(verteilung, dict) and verteilung:
                zaehler = {}
                for geraet in verteilung.values():
                    schluessel = str(geraet)
                    zaehler[schluessel] = zaehler.get(schluessel, 0) + 1
                bericht["geraete"] = zaehler
                # Die eine Zahl, auf die es ankommt.
                bericht["schichtenAufCpu"] = sum(
                    anzahl for geraet, anzahl in zaehler.items()
                    if geraet in ("cpu", "disk")
                )
        except Exception as fehler:  # noqa: BLE001
            bericht["geraeteFehler"] = str(fehler)[:120]
        try:
            import torch  # noqa: PLC0415

            if torch.cuda.is_available():
                bericht["gpuBelegtMb"] = round(torch.cuda.memory_allocated() / 1e6)
                bericht["gpuReserviertMb"] = round(torch.cuda.memory_reserved() / 1e6)
        except Exception:  # noqa: BLE001
            pass
        return bericht

    def _pip_bericht(self):
        ergebnis = {"marker": PIP_MARKER, "exitCode": None, "protokollSchwanz": ""}
        try:
            with open(PIP_MARKER, encoding="utf-8") as datei:
                ergebnis["exitCode"] = datei.read().strip()
        except OSError:
            pass
        try:
            with open(PIP_PROTOKOLL, encoding="utf-8", errors="replace") as datei:
                # Der Schwanz traegt die Fehlermeldung; der Kopf nur Downloads.
                ergebnis["protokollSchwanz"] = datei.read()[-4000:]
        except OSError:
            pass
        return ergebnis

    # --- Laeufe --------------------------------------------------------

    def aktiver_lauf(self):
        """Die Kennung des gerade laufenden Trainings, sonst None."""
        with self._sperre:
            for kennung, lauf in self._laeufe.items():
                if lauf["zustand"] == "laeuft":
                    return kennung
        return None

    def starte(self, lauf_id, auftrag, oeffentliche_url):
        """Startet einen Lauf. Gibt None zurueck, wenn schon einer laeuft.

        EINE KARTE, EIN LAUF — am 2026-08-05 teuer gelernt. Nach drei
        Neustarts der Schleife in wenigen Minuten liefen mehrere Trainings
        gleichzeitig auf derselben GPU. Folgen, alle gemessen:

        * `trainiere()` arbeitet auf dem GETEILTEN `self.modell`: es streift den
          Adapter ab, ersetzt das Feld und wickelt neu ein. Zwei Threads darin
          nehmen sich gegenseitig den Adapter weg — kein Fehler, sondern ein
          stilles Durcheinander, das erst in den Punktzahlen auftaucht.
        * Die Trainings-Threads hungern den HTTP-Thread aus (Python-GIL):
          `/health` brauchte 0,6-1,4 s statt 0,2-0,3 s, und die Statusabfrage
          der Schleife lief in ihre 20-Sekunden-Grenze. Die Schleife brach den
          Zyklus daraufhin ab — `trainer_zustand_unbekannt:zeitgrenze`.
          Gleichzeitigkeit zerstoert also genau die Messung, fuer die sie da war.

        Fail-closed: im Zweifel NICHT starten. Ein abgewiesener Start kostet
        nichts, ein zweiter paralleler Lauf kostet die Ergebnisse beider.
        """
        with self._sperre:
            for kennung, lauf in self._laeufe.items():
                if lauf["zustand"] == "laeuft":
                    print(
                        f"[smejj-lora-trainer] Start abgewiesen: Lauf {kennung} laeuft noch",
                        flush=True,
                    )
                    return None
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
        return lauf_id

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


def _paketfassungen():
    """Welche Fassungen liegen wirklich im Container?

    Ueber importlib.metadata statt ueber einen Import: das Ablesen einer Fassung
    darf nicht dieselbe schwere Bibliothek laden, deren Import gerade untersucht
    wird — sonst diagnostiziert die Diagnose sich selbst kaputt.
    """
    from importlib.metadata import PackageNotFoundError, version  # noqa: PLC0415

    fassungen = {}
    for name in (
        "torch", "torchvision", "transformers", "peft",
        "accelerate", "bitsandbytes", "safetensors", "numpy",
    ):
        try:
            fassungen[name] = version(name)
        except PackageNotFoundError:
            fassungen[name] = None
        except Exception as fehler:  # noqa: BLE001
            fassungen[name] = f"fehler:{str(fehler)[:80]}"
    return fassungen


def _importprobe(modulname):
    """Importiert ein Modul GEZIELT und gibt die ungekuerzte Rueckverfolgung zurueck.

    transformers verpackt Importfehler seiner Zusatzmodule in ein RuntimeError
    mit dem Text 'look up to see its traceback' — die eigentliche Meldung geht
    dabei verloren. Der direkte Import zeigt sie im Klartext.
    """
    import importlib  # noqa: PLC0415

    try:
        importlib.import_module(modulname)
        return {"ok": True, "spur": ""}
    except BaseException:  # noqa: BLE001 - auch ein exit() im Modul darf nicht durchschlagen
        return {"ok": False, "spur": traceback.format_exc()}


def _cuda_bericht():
    """Sieht torch ueberhaupt eine Karte? Ein 'nein' erklaert die meisten Ladefehler."""
    try:
        import torch  # noqa: PLC0415

        verfuegbar = torch.cuda.is_available()
        return {
            "torch": torch.__version__,
            "gebautMitCuda": torch.version.cuda,
            "verfuegbar": verfuegbar,
            "karten": torch.cuda.device_count() if verfuegbar else 0,
            "name": torch.cuda.get_device_name(0) if verfuegbar else "",
        }
    except Exception as fehler:  # noqa: BLE001
        return {"fehler": str(fehler)[:300]}


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
