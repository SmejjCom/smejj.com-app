# Nacht-Wächter: warum sie abbrachen und was dagegen hilft

**Befund 18.09.2026** (im A-bis-Z-Test gefunden): Die Autopiloten-Ampel meldete
vier Automatiken als „Ausfall" — Code-Sicherung, Betriebswache, Test-Wächter,
Web-Vitals-Wache. Ihr jeweils letzter Lauf war aber **grün**. Die Wächter waren
nicht kaputt, sie kamen gar nicht erst zum Messen.

## Die Ursache

Alle fünf Nacht-Skripte prüfen zu Beginn einmal, ob github.com erreichbar ist,
und brechen bei Fehlschlag sofort ab:

```sh
if ! curl -sS -m 15 -o /dev/null -I "https://github.com/SmejjCom/smejj.com-app"; then
  echo "ABBRUCH: github.com ueber HTTPS nicht erreichbar (Netz aus?)."
  exit 1
fi
```

Cron und launchd starten sie zwischen 3:15 und 5:45 Uhr Mac-Zeit. Zu dieser Zeit
ist der Mac oft gerade erst aufgewacht — das WLAN ist dann noch nicht verbunden.
Die Anfrage scheitert, der ganze Tageslauf ist verloren.

Gemessen in den Protokollen der sieben Tage davor: **13 verlorene Läufe**
(Codeberg-Spiegel 2, Oberflächenwache 2, Qualitätsmessung 3, Test-Wächter 4,
Web-Vitals 2) — jedes Mal mit derselben Meldung.

## Was geändert wurde

Aus der einen Anfrage wurde eine Warteschleife: bis zu zehn Versuche im Abstand
von 30 Sekunden, also **bis zu fünf Minuten warten**, bevor aufgegeben wird. Ein
wartender Lauf kostet nichts; ein abgebrochener kostet den ganzen Tag.

Betroffen sind die fünf Kopien auf dem Mac des Betreibers:

- `~/.local/share/smejj-oberflaeche/wache.sh`
- `~/.local/share/smejj-qualitaet/messlauf.sh`
- `~/.local/share/smejj-qualitaet/spiegel.sh`
- `~/.local/share/smejj-tests/wache.sh`
- `~/.local/share/smejj-webvitals/wache.sh`

Die Originale liegen unverändert in
`~/.local/share/smejj-waechter-sicherung-2026-09-18/`.

## Wichtig für später

Diese fünf Skripte sind **nicht** mit den Vorlagen im Repo identisch
(`scripts/deploy/codeberg_spiegel_geplant.sh`,
`scripts/testing/oberflaechenwache-geplant.sh`). Die Netzprüfung steht nur in den
Mac-Kopien. Wer die Vorlagen neu ausrollt, überschreibt diesen Fix — dann muss
die Warteschleife erneut hinein.

## Nachweis nach der Änderung

- Test-Wächter: 794 Tests bestanden, 0 rot, Urteil grün
- Web-Vitals-Wache: grün — LCP 1076 ms, TTFB 168 ms, CLS 0.001, Gewicht 320 KB,
  gemessen am ausgelieferten Stand f6cdc2f1 (SW v900)

## Offen, braucht den Betreiber

Im Protokoll der Web-Vitals-Wache stand am 17.09. zusätzlich:
`You have not agreed to the Xcode license agreements` → jeder `git`-Aufruf
scheitert. Das lässt sich nur mit Administratorrechten lösen:
`sudo xcodebuild -license`. Beim Lauf am 18.09. trat es nicht mehr auf, es kann
aber nach einem Xcode-Update jederzeit wiederkommen.
