"""Zwischenstaende der Messung — Wiederaufnahme nach einer Verdraengung.

DER ANLASS, in einer Zeile: Am 10.09. stand eine Messung bei 287 von 295
Antworten des zweiten Standes. Salad teilte den Knoten neu zu, und sie begann
wieder bei null.

Das ist nicht nur aergerlich, es ist grundsaetzlich unloesbar ohne
Zwischenstand: kommt die Verdraengung haeufiger als die Messung dauert, wird
sie NIE fertig. Das Training hatte den Schutz von Anfang an (checkpoint alle
15 Minuten), die Messung nicht — weil sie "ja nur ein paar Minuten" dauern
sollte.

Kein Fall hier mietet eine GPU oder stellt eine echte Frage.
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import evalrun  # noqa: E402


class StatusAttrappe:
    def __init__(self):
        self.letzter = {}

    def setze(self, **kw):
        self.letzter.update(kw)


class WegAttrappe:
    """Antwortet mit der Fall-Kennung und zaehlt, wie oft er gefragt wurde."""

    def __init__(self, stirbt_nach=None):
        self.gefragt = []
        self.stirbt_nach = stirbt_nach

    def antworte(self, fall, max_tokens):
        if self.stirbt_nach is not None and len(self.gefragt) >= self.stirbt_nach:
            raise KeyboardInterrupt("verdraengt")
        self.gefragt.append(fall["id"])
        return f"Antwort auf {fall['id']}", 7

    def beschreibung(self):
        return {"art": "attrappe"}


def suite(n, suite_id="s1"):
    return [{"suiteId": suite_id, "version": "1.0", "integrity": {"contentSha256": "abc"},
             "cases": [{"id": f"fall-{i}", "prompt": "?"} for i in range(n)]}]


class TestOhneZwischenstand(unittest.TestCase):
    def test_verhaelt_sich_wie_vorher(self):
        # Ohne `sichere` und `vorherige` darf sich nichts geaendert haben.
        weg = WegAttrappe()
        r = evalrun.fuehre_aus(weg, suite(5), StatusAttrappe())
        self.assertEqual(len(weg.gefragt), 5)
        self.assertEqual(len(r["suiten"][0]["cases"]), 5)
        self.assertEqual(r["leistung"]["antworten"], 5)


class TestSichern(unittest.TestCase):
    def test_zwischenstaende_werden_regelmaessig_abgelegt(self):
        gesichert = []
        evalrun.fuehre_aus(WegAttrappe(), suite(60), StatusAttrappe(),
                           sichere=gesichert.append, sicherungs_abstand=25)
        self.assertGreaterEqual(len(gesichert), 2, "bei 60 Antworten muss mindestens zweimal gesichert werden")

    def test_ein_zwischenstand_ist_vollstaendig_lesbar(self):
        # Er muss dieselbe Form haben wie das Endergebnis — sonst kann ihn
        # niemand wieder einlesen, und die Sicherung waere wertlos.
        gesichert = []
        evalrun.fuehre_aus(WegAttrappe(), suite(30), StatusAttrappe(),
                           sichere=gesichert.append, sicherungs_abstand=25)
        t = gesichert[0]
        self.assertIn("suiten", t)
        self.assertTrue(t.get("unvollstaendig"), "ein Teilstand muss sich als unvollstaendig zu erkennen geben")
        self.assertEqual(len(t["suiten"][0]["cases"]), 30, "auch die noch offenen Faelle stehen drin")
        beantwortet = [c for c in t["suiten"][0]["cases"] if c["runs"]]
        self.assertGreater(len(beantwortet), 0)

    def test_ein_misslungenes_sichern_haelt_die_messung_NICHT_an(self):
        # Die Antworten sind im Speicher; ein e2-Aussetzer darf den Lauf nicht
        # kosten. Genau umgekehrt waere es der teuerste Fehler.
        def wirft(_):
            raise OSError("e2 nicht erreichbar")
        weg = WegAttrappe()
        r = evalrun.fuehre_aus(weg, suite(30), StatusAttrappe(), sichere=wirft, sicherungs_abstand=10)
        self.assertEqual(r["leistung"]["antworten"], 30)


class TestWiederaufnahme(unittest.TestCase):
    def test_beantwortete_faelle_werden_NICHT_neu_gefragt(self):
        # Der eigentliche Zweck. 287 von 295 Antworten sind Stunden Rechenzeit.
        erster = WegAttrappe(stirbt_nach=20)
        gesichert = []
        try:
            evalrun.fuehre_aus(erster, suite(50), StatusAttrappe(),
                               sichere=gesichert.append, sicherungs_abstand=5)
        except KeyboardInterrupt:
            pass
        self.assertTrue(gesichert, "vor dem Abbruch muss gesichert worden sein")

        zweiter = WegAttrappe()
        r = evalrun.fuehre_aus(zweiter, suite(50), StatusAttrappe(), vorherige=gesichert[-1])
        self.assertLess(len(zweiter.gefragt), 50, "der zweite Lauf darf nicht alles neu fragen")
        self.assertEqual(len(r["suiten"][0]["cases"]), 50, "am Ende muessen trotzdem alle 50 Faelle dastehen")
        for fall in r["suiten"][0]["cases"]:
            self.assertTrue(fall["runs"], f"{fall['id']} ist ohne Antwort geblieben")

    def test_die_uebernommenen_Antworten_sind_die_ECHTEN(self):
        # Ein Zwischenstand, der leere Huellen einsetzt, waere schlimmer als
        # keiner: die Messung waere fertig und die Note falsch.
        gesichert = []
        evalrun.fuehre_aus(WegAttrappe(), suite(30), StatusAttrappe(),
                           sichere=gesichert.append, sicherungs_abstand=10)
        r = evalrun.fuehre_aus(WegAttrappe(), suite(30), StatusAttrappe(), vorherige=gesichert[-1])
        for fall in r["suiten"][0]["cases"]:
            self.assertEqual(fall["runs"][0]["text"], f"Antwort auf {fall['id']}")

    def test_ein_leerer_zwischenstand_stoert_nicht(self):
        weg = WegAttrappe()
        r = evalrun.fuehre_aus(weg, suite(10), StatusAttrappe(), vorherige={"suiten": []})
        self.assertEqual(len(weg.gefragt), 10)
        self.assertEqual(r["leistung"]["antworten"], 10)

    def test_die_leistungswerte_zaehlen_weiter_statt_neu(self):
        # Sonst meldete ein wiederaufgenommener Lauf die halbe Tokenzahl und
        # jede Tempo-Aussage waere falsch.
        gesichert = []
        evalrun.fuehre_aus(WegAttrappe(), suite(30), StatusAttrappe(),
                           sichere=gesichert.append, sicherungs_abstand=10)
        vorher = gesichert[-1]["leistung"]["tokensGesamt"]
        r = evalrun.fuehre_aus(WegAttrappe(), suite(30), StatusAttrappe(), vorherige=gesichert[-1])
        self.assertGreaterEqual(r["leistung"]["tokensGesamt"], vorher)


if __name__ == "__main__":
    unittest.main()
