"""Wann ist ein Lauf ohne neue Schritte trotzdem in Ordnung?

Am 06.09. warf der con-Autopilot zwei Stunden bezahlte Rechenzeit weg: Salad
wechselte mitten im Lauf den Rechenknoten, der zweite Anlauf fand den EIGENEN
fertigen Zwischenstand bei Schritt 64 vor, plante wegen der kuerzeren Restzeit
nur noch 63 Schritte und meldete "training_ohne_neue_schritte". Der Adapter war
vollstaendig und stammte aus genau diesem Job.
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from regeln import bereits_vollstaendig  # noqa: E402


class TestBereitsVollstaendig(unittest.TestCase):
    def test_eigener_fertiger_stand_ist_in_ordnung(self):
        self.assertTrue(bereits_vollstaendig(0, 64, "job-a", "job-a"))
        self.assertTrue(bereits_vollstaendig(-1, 64, "job-a", "job-a"))

    def test_fremder_stand_bleibt_ein_fehlschlag(self):
        # Der Schutz gegen "fremde Arbeit als eigene messen" muss bestehen bleiben.
        self.assertFalse(bereits_vollstaendig(0, 64, "job-b", "job-a"))

    def test_unbekannte_herkunft_bleibt_ein_fehlschlag(self):
        # Zwischenstaende ohne Herkunftsnotiz stammen aus der Zeit vor dem 06.09.
        self.assertFalse(bereits_vollstaendig(0, 64, "", "job-a"))
        self.assertFalse(bereits_vollstaendig(0, 64, "job-a", ""))

    def test_ohne_jeden_schritt_ist_kein_training(self):
        self.assertFalse(bereits_vollstaendig(0, 0, "job-a", "job-a"))

    def test_echte_neue_schritte_sind_nie_dieser_fall(self):
        self.assertFalse(bereits_vollstaendig(5, 64, "job-a", "job-a"))
        self.assertFalse(bereits_vollstaendig(5, 64, "job-b", "job-a"))


if __name__ == "__main__":
    unittest.main()
