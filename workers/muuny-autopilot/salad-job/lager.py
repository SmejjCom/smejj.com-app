"""muuny AI — Lager und Umgebung im GPU-Job (Gegenstueck zu lager.js).

Zwei Dinge sind beim Umzug von "con" auf "muuny" umgezogen, und nur zwei:
das e2-Prefix (con/ -> muuny/) und die Namen der Umgebungsvariablen
(CON_* -> MUUNY_*). Beides steht hier an einer Stelle.

Der Rueckfall auf die alten CON_*-Namen ist kein Schoenheitsfehler, sondern
Pflicht: ein Job, der gerade auf einem Salad-Knoten laeuft, wurde mit den alten
Namen gestartet. Ein Wiederanlauf nach einem Knotenwechsel darf nicht daran
scheitern, dass der Autopilot inzwischen neue Namen schickt.
"""
import os


def umg(name, standard=None):
    """Ein Wert aus der Umgebung, neuer Name zuerst, alter als Rueckfall.

    `name` ohne Praefix, also umg("JOB_MODUS") liest MUUNY_JOB_MODUS und
    faellt auf CON_JOB_MODUS zurueck.
    """
    wert = os.environ.get("MUUNY_" + name)
    if wert is not None and str(wert).strip() != "":
        return wert
    wert = os.environ.get("CON_" + name)
    return standard if wert is None else wert


def pflicht(name):
    """Wie umg, aber ohne Wert ist es ein Fehler — kein stiller Standardwert."""
    wert = umg(name)
    if wert is None or str(wert).strip() == "":
        raise KeyError("MUUNY_" + name + " fehlt")
    return wert


def lager():
    """Das e2-Prefix, immer mit Schraegstrich am Ende."""
    roh = str(umg("LAGER_PREFIX", "muuny")).strip()
    return roh.strip("/") + "/"
