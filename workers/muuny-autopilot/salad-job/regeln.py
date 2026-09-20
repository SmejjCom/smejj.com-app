"""Entscheidungsregeln des Jobs, frei von schweren Abhaengigkeiten.

Absichtlich ohne torch, transformers oder boto3: diese Regeln sollen sich ohne
Grafikkarte und ohne Zugangsdaten pruefen lassen. Sie entscheiden ueber Geld und
Rechenzeit und gehoeren deshalb unter Test.
"""


def bereits_vollstaendig(neue_schritte, global_step, zwischenstand_jobid, job_id):
    """Ist ein Lauf ohne neue Schritte trotzdem in Ordnung?

    Ja, wenn der gefundene Zwischenstand aus DIESEM Job stammt und schon am Ziel
    ist. Salad kann den Rechenknoten mitten im Lauf wechseln; der zweite Anlauf
    findet dann die eigene fertige Arbeit vor. Am 06.09. galt genau das als
    Fehlschlag: der zweite Anlauf von con-1.6 fand seinen eigenen Stand bei
    Schritt 64, plante wegen der kuerzeren Restzeit nur noch 63 Schritte und warf
    zwei Stunden bezahlte Rechenzeit weg.

    Nein, wenn der Zwischenstand von einem fremden Lauf stammt oder seine
    Herkunft unbekannt ist. Einen fremden Adapter unter eigenem Namen zu messen
    waere eine Luege ueber die eigene Arbeit — dieser Schutz bleibt.
    """
    if neue_schritte > 0 or global_step <= 0:
        return False
    return bool(zwischenstand_jobid) and bool(job_id) and zwischenstand_jobid == job_id
