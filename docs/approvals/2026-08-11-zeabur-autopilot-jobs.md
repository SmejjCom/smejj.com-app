# Freigabe: Neuer Zeabur-Dienst "smejj-autopilot-jobs"

**Datum:** 2026-08-11
**Betreiber:** per Klick-Antwort in der Claude-Code-Sitzung

## Wortlaut

Auf die Frage „Sollen die zwei Mac-Cron-Autopiloten auf Zeabur umziehen?" hat
der Betreiber die Option **„Ja, beide (Empfehlung)"** gewaehlt, mit dem
angekuendigten Umfang:

> Freigabe fuer EINEN neuen Zeabur-Dienst "smejj-autopilot-jobs" (0 EUR extra
> auf dem bestehenden Server): Codeberg-Spiegel sofort, Qualitaetsmessung
> danach.

## Dienst und Betrag (Policy-Pflichtangaben)

- **Dienst:** smejj-autopilot-jobs (Docker, `Dockerfile.smejj-autopilot-jobs`,
  gleiches Muster wie der Bruecken-Waechter)
- **Betrag:** 0 EUR zusaetzlich — laeuft auf dem bereits bezahlten
  dedizierten Server (Tencent Ashburn 2C 8GB) im bestehenden Zeabur-Projekt.

## Zweck

Der Mac ist kein 24-Stunden-Server: Im Schlaf laesst cron Laeufe KOMPLETT aus
(am 2026-08-11 gemessen: 4:20- und 7:10-Lauf uebersprungen). Die
Herzschlag-Warteschlange rettet Meldungen, nicht verpasste Laeufe. Der Dienst
uebernimmt schrittweise:

1. **Codeberg-Spiegel** (sofort): taeglicher Repo-Spiegel, 11:20 UTC
   (= 4:20 Mac-Zeit), Herzschlag `codeberg-spiegel` an den Zeabur-Control.
2. **Qualitaetsmessung** (Folgeschritt, noch nicht Teil dieses Umbaus).

Die Mac-Cron-Eintraege bleiben aktiv, bis der jeweilige Zeabur-Job live
bewiesen ist, und werden dann stillgelegt.
