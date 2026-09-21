"""Die Umwandlung PEFT -> GGUF.

Der teuerste Fehler, den diese Faelle verhindern sollen, ist nicht ein Absturz,
sondern ein STILLES Durchwinken: eine Umwandlung, die scheitert und trotzdem
eine Beschreibung ablegt, macht den Hausmodell-Dienst auf eine Datei
aufmerksam, die es nicht gibt — oder schlimmer, auf eine falsche.

Keiner dieser Faelle laedt etwas aus dem Netz oder startet den echten Konverter.
"""

import hashlib
import json
import os
import sys
import unittest
from types import SimpleNamespace

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import gguf_adapter  # noqa: E402


class E2Attrappe:
    def __init__(self):
        self.dateien = {}
        self.jsons = {}

    def lade_hoch(self, pfad, key, fortschritt=None):
        with open(pfad, "rb") as f:
            self.dateien[key] = f.read()

    def put_json(self, key, wert):
        self.jsons[key] = wert


def adapter_ordner(tmp, mit_config=True):
    d = os.path.join(tmp, "adapter")
    os.makedirs(d, exist_ok=True)
    if mit_config:
        with open(os.path.join(d, "adapter_config.json"), "w", encoding="utf-8") as f:
            json.dump({"r": 16}, f)
    return d


def konverter_der_schreibt(inhalt=b"GGUF" + b"\x00" * 2000):
    """Ersetzt subprocess.run: legt die Zieldatei an und meldet Erfolg."""
    def lauf(befehl, **kw):
        ziel = befehl[befehl.index("--outfile") + 1]
        with open(ziel, "wb") as f:
            f.write(inhalt)
        return SimpleNamespace(returncode=0, stdout="", stderr="")
    return lauf


class TestWandeln(unittest.TestCase):
    def setUp(self):
        import tempfile
        self.tmp = tempfile.mkdtemp()
        # Den Netzabruf des Konverterskripts ersetzen.
        self.echter_hole = gguf_adapter._hole_konverter
        gguf_adapter._hole_konverter = lambda d, **kw: d

    def tearDown(self):
        gguf_adapter._hole_konverter = self.echter_hole

    def test_gelungene_umwandlung_liefert_groesse_und_pruefsumme(self):
        inhalt = b"GGUF" + b"\x01" * 5000
        r = gguf_adapter.wandle(adapter_ordner(self.tmp), "/basis", os.path.join(self.tmp, "aus"),
                                "smejj-1-8-lora", lauf=konverter_der_schreibt(inhalt))
        self.assertEqual(r["datei"], "smejj-1-8-lora.gguf")
        self.assertEqual(r["sizeBytes"], len(inhalt))
        self.assertEqual(r["sha256"], hashlib.sha256(inhalt).hexdigest())

    def test_ohne_adapter_config_wird_gar_nicht_erst_gestartet(self):
        # Ein leerer Ordner haette den Konverter minutenlang beschaeftigt und
        # eine unverstaendliche Fehlermeldung erzeugt.
        with self.assertRaises(RuntimeError) as f:
            gguf_adapter.wandle(adapter_ordner(self.tmp, mit_config=False), "/basis",
                                os.path.join(self.tmp, "aus"), "x", lauf=konverter_der_schreibt())
        self.assertIn("adapter_unvollstaendig", str(f.exception))

    def test_eine_winzige_datei_gilt_nicht_als_adapter(self):
        # Der Konverter kann mit Code 0 enden und trotzdem Unsinn schreiben.
        with self.assertRaises(RuntimeError) as f:
            gguf_adapter.wandle(adapter_ordner(self.tmp), "/basis", os.path.join(self.tmp, "aus"),
                                "x", lauf=konverter_der_schreibt(b"nix"))
        self.assertIn("gguf_zu_klein", str(f.exception))

    def test_fehlschlag_des_konverters_nennt_den_grund(self):
        def lauf(befehl, **kw):
            return SimpleNamespace(returncode=1, stdout="", stderr="unsupported architecture: Qwen3Foo")
        with self.assertRaises(RuntimeError) as f:
            gguf_adapter.wandle(adapter_ordner(self.tmp), "/basis", os.path.join(self.tmp, "aus"),
                                "x", lauf=lauf)
        self.assertIn("unsupported architecture", str(f.exception))


class TestSichern(unittest.TestCase):
    def setUp(self):
        import tempfile
        self.tmp = tempfile.mkdtemp()
        self.echter_hole = gguf_adapter._hole_konverter
        gguf_adapter._hole_konverter = lambda d, **kw: d
        self.echtes_wandle = gguf_adapter.wandle

    def tearDown(self):
        gguf_adapter._hole_konverter = self.echter_hole
        gguf_adapter.wandle = self.echtes_wandle

    def test_erfolg_legt_datei_UND_beschreibung_ab(self):
        e2 = E2Attrappe()
        inhalt = b"GGUF" + b"\x02" * 4000
        gguf_adapter.wandle = lambda *a, **kw: self.echtes_wandle(*a, **{**kw, "lauf": konverter_der_schreibt(inhalt)})
        r = gguf_adapter.wandle_und_sichere(adapter_ordner(self.tmp), "/basis", self.tmp, "smejj-1-8", e2)
        self.assertEqual(r["sha256"], hashlib.sha256(inhalt).hexdigest())
        self.assertIn("muuny/versions/smejj-1-8/adapter-gguf/smejj-1-8-lora.gguf", e2.dateien)
        beschreibung = e2.jsons["muuny/versions/smejj-1-8/adapter-gguf/adapter.json"]
        # Genau die vier Angaben, ohne die der Hausmodell-Katalog ablehnt.
        for feld in ("datei", "sizeBytes", "sha256", "prefix"):
            self.assertIn(feld, beschreibung)

    def test_ein_fehlschlag_legt_KEINE_beschreibung_ab(self):
        # Der wichtigste Fall: eine Beschreibung ohne Datei wuerde den
        # Hausmodell-Dienst auf einen Adapter zeigen lassen, den es nicht gibt.
        e2 = E2Attrappe()
        def wirft(*a, **kw):
            raise RuntimeError("konverter_fehlgeschlagen: unsupported")
        gguf_adapter.wandle = wirft
        r = gguf_adapter.wandle_und_sichere(adapter_ordner(self.tmp), "/basis", self.tmp, "smejj-1-8", e2)
        self.assertIsNone(r)
        self.assertEqual(e2.dateien, {})
        self.assertNotIn("muuny/versions/smejj-1-8/adapter-gguf/adapter.json", e2.jsons)
        self.assertIn("muuny/versions/smejj-1-8/adapter-gguf/fehlgeschlagen.json", e2.jsons)

    def test_ein_fehlschlag_bringt_den_trainingslauf_NICHT_zum_absturz(self):
        # Der Adapter ist zu diesem Zeitpunkt gesichert. Die Umwandlung kostet
        # die Nutzbarkeit, nicht die Arbeit.
        e2 = E2Attrappe()
        gguf_adapter.wandle = lambda *a, **kw: (_ for _ in ()).throw(MemoryError("kein Speicher"))
        self.assertIsNone(gguf_adapter.wandle_und_sichere(adapter_ordner(self.tmp), "/b", self.tmp, "k", e2))

    def test_auch_ein_kaputtes_e2_haelt_den_lauf_nicht_an(self):
        class KaputtesE2(E2Attrappe):
            def put_json(self, key, wert):
                raise OSError("e2 nicht erreichbar")
        gguf_adapter.wandle = lambda *a, **kw: (_ for _ in ()).throw(RuntimeError("egal"))
        self.assertIsNone(gguf_adapter.wandle_und_sichere(adapter_ordner(self.tmp), "/b", self.tmp, "k", KaputtesE2()))



def llama_archiv(tag, *, mit_architektur=True, polster=150_000, boeser_pfad=False):
    """Ein tar.gz wie codeload.github.com es liefert: alles unter llama.cpp-<tag>/."""
    import io
    import tarfile
    puffer = io.BytesIO()
    with tarfile.open(fileobj=puffer, mode="w:gz") as archiv:
        def datei(name, inhalt):
            info = tarfile.TarInfo(f"llama.cpp-{tag}/{name}")
            info.size = len(inhalt)
            archiv.addfile(info, io.BytesIO(inhalt))
        datei("convert_lora_to_gguf.py", b"from conversion import ModelBase\n")
        datei("convert_hf_to_gguf.py", b"from conversion import *\n")
        datei("conversion/__init__.py", b"")
        qwen = b"class Qwen3_5ForConditionalGeneration: pass\n" if mit_architektur else b"class Qwen2: pass\n"
        datei("conversion/qwen.py", qwen)
        datei("gguf-py/gguf/__init__.py", b"")
        datei("gguf-py/polster.bin", os.urandom(polster))  # zufaellig: gzip kann es nicht schrumpfen
        datei("src/llama.cpp", b"nicht gebraucht")
        if boeser_pfad:
            info = tarfile.TarInfo(f"llama.cpp-{tag}/../../ausgebrochen.txt")
            info.size = 4
            archiv.addfile(info, io.BytesIO(b"boes"))
    return puffer.getvalue()


class Antwort:
    def __init__(self, inhalt):
        self.inhalt = inhalt

    def read(self):
        return self.inhalt

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class TestKonverterHolen(unittest.TestCase):
    def setUp(self):
        import tempfile
        self.tmp = tempfile.mkdtemp()

    def test_holt_den_festen_tag_und_nur_die_gebrauchten_teile(self):
        geholt = []

        def oeffne(url, timeout=None):
            geholt.append(url)
            return Antwort(llama_archiv(gguf_adapter.LLAMA_TAG))

        wurzel = gguf_adapter._hole_konverter(self.tmp, oeffne=oeffne)
        self.assertTrue(geholt[0].endswith(f"/refs/tags/{gguf_adapter.LLAMA_TAG}"), "eine FESTE Fassung, nicht main")
        for pflicht in ("convert_lora_to_gguf.py", "convert_hf_to_gguf.py", "conversion/qwen.py", "gguf-py/gguf/__init__.py"):
            self.assertTrue(os.path.exists(os.path.join(wurzel, pflicht)), pflicht)
        self.assertFalse(os.path.exists(os.path.join(wurzel, "src")), "nur was der Konverter braucht")
        # Ein zweiter Aufruf holt nicht erneut.
        gguf_adapter._hole_konverter(self.tmp, oeffne=oeffne)
        self.assertEqual(len(geholt), 1)

    def test_die_alte_fassung_ist_es_nicht_mehr(self):
        # b6100 kannte Qwen3_5ForConditionalGeneration nicht; jede Umwandlung scheiterte.
        self.assertNotEqual(gguf_adapter.LLAMA_TAG, "b6100")

    def test_eine_fassung_ohne_die_architektur_faellt_SOFORT_auf(self):
        with self.assertRaises(RuntimeError) as f:
            gguf_adapter._hole_konverter(self.tmp, oeffne=lambda url, timeout=None: Antwort(
                llama_archiv(gguf_adapter.LLAMA_TAG, mit_architektur=False)))
        self.assertIn("konverter_kennt_architektur_nicht", str(f.exception),
                      "sonst faellt es erst nach zwei Stunden bezahltem Training auf")

    def test_eine_verdaechtig_kleine_antwort_wird_abgelehnt(self):
        with self.assertRaises(RuntimeError) as f:
            gguf_adapter._hole_konverter(self.tmp, oeffne=lambda url, timeout=None: Antwort(b"404: Not Found"))
        self.assertIn("konverter_zu_klein", str(f.exception))

    def test_ein_pfad_aus_dem_archiv_heraus_wird_ignoriert(self):
        gguf_adapter._hole_konverter(self.tmp, oeffne=lambda url, timeout=None: Antwort(
            llama_archiv(gguf_adapter.LLAMA_TAG, boeser_pfad=True)))
        self.assertFalse(os.path.exists(os.path.join(os.path.dirname(self.tmp), "ausgebrochen.txt")))


if __name__ == "__main__":
    unittest.main()
