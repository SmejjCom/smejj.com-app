# Freigabe-Nachweis — Qualitätsmessung automatisch, 2026-08-04

## Wortlaut des Betreibers

```
FREIGABE — Qualitätsmessung automatisch, 2026-08-04

Ich gebe frei: einen zeitgesteuerten Lauf auf meinem Mac einrichten, der die
Qualitätsmessung regelmäßig gegen die Live-Kette fährt, das Ergebnis auf der
Qualitätsseite veröffentlicht und hochlädt. Modell-Aufrufe laufen über meinen
vorhandenen Zugang, keine neue Kostenposition. Cache-Versionssprung und
Nachziehen der Sperren sind eingeschlossen.

Betreiber smejj.com
```

## Die Falle, an der die Automatik lautlos gescheitert wäre

`/verlauf-messwerte.json` lag **cache-first** im Precache des Service Workers.
Die Datei ändert sich aber bei jeder Messung. Ohne Änderung hätte kein
automatischer Lauf je einen wiederkehrenden Nutzer erreicht, solange nicht
jemand von Hand `CACHE_NAME` hochzählt — und niemand hätte es bemerkt: die
Automatik hätte fehlerfrei gemeldet, die Nutzer hätten den alten Stand gesehen.

Sie kommt jetzt **netz-zuerst** (`LIVE_DATEN_PFADE` in `public/sw.js`), mit dem
Cache als Rückfall: online der frische Stand, offline der letzte bekannte. Die
Seite selbst bleibt im Precache und offline lesbar. Ein Test hält fest, dass die
Netz-zuerst-Weiche **vor** der Precache-Weiche steht — stünde sie dahinter,
griffe sie nie.

## Die wichtigste Zusage: ein gescheiterter Transport ist keine schlechte Note

Am 2026-08-04 ergab ein Lauf **0,0 %** — nicht wegen der Antworten, sondern weil
der Endpunkt mit HTTP 401 antwortete. Wäre das veröffentlicht worden, hätte die
Seite der Welt eine Katastrophe gemeldet, die nie stattgefunden hat.

`laufIstBrauchbar` bricht deshalb bei **jedem** Fall mit Transportfehler ab und
schreibt nichts. Ein echtes „blocked"-Urteil geht sehr wohl durch — der Schutz
gilt dem Transport, nicht der Note. Eine schlechte Messung zu unterdrücken wäre
derselbe Fehler in Grün.

## Aufbau, bewusst in drei Teile getrennt

| Teil | Aufgabe |
|---|---|
| `scripts/verlauf/messlauf.mjs` | misst und schreibt die Datei. Sonst nichts. |
| `scripts/verlauf/messlauf-taeglich.sh` | committet, pusht, liefert aus — nur bei echter Änderung, nie `git add -A` (Parallel-Sitzungen). |
| `smejj.com Qualitaetsmessung-einrichten.command` | richtet den Zeitplan ein, zeigt Kosten und Wirkung, entfernt ihn auf Wunsch wieder. |

Ein Skript, das misst UND veröffentlicht UND ausliefert, wäre bei einem Fehler
nicht mehr zu zerlegen.

## Zeitplan und Kosten

`10 7,19 * * *` — zweimal täglich um 07:10 und 19:10. Der bestehende
Codeberg-Eintrag (04:20) blieb unangetastet.

Je Lauf 14 Fälle × 3 Durchgänge = 42 Aufrufe, getaktet mit 5,5 s (die Brücke
lässt 12 je Minute; ohne Taktung endet der Lauf in HTTP 429 — am 2026-08-04
genau so passiert). Rund 84 Aufrufe pro Tag über die vorhandenen Zugänge
(Groq-Gratiskontingent für die schnellen Fälle, Kimi für die Coding-Fälle).
**Keine neue Kostenposition.**

Der Mac muss laufen; verpasste Läufe werden nicht nachgeholt. Bleibt die Seite
länger stehen, weist sie ihre Zahlen seit dem 2026-08-04 selbst als veraltet aus.

## Abnahme: ein vollständiger Automatik-Lauf, echt durchgeführt

```
2026-08-05T01:59:58Z Messlauf beginnt
2026-08-05T02:06:11Z Veroeffentlicht: 97.06 %, 1 kritische Verstoesse,
                     Urteil blocked, 5 Messungen in der Datei
2026-08-05T02:06:15Z FERTIG — live in wenigen Minuten.
```

Live nachgeprüft: die Datei auf `smejj.com` führt seitdem 5 Messungen, und die
Seite zeigt *„Letzte Messung 97,06 % mit 1 kritischen Fehlern"* sowie *„Stand
der Daten: 05.08. 01:59 UTC — vor 7 Minuten."*

**Bemerkenswert:** Der Lauf meldete ein *schlechteres* Ergebnis als der Lauf
davor (98,04 %, passed). Die Automatik veröffentlicht also auch schlechte
Nachrichten — genau das war der Zweck.

Der Unterschied ist bekanntes Rauschen: die Kette läuft mit `temperature 0.35`,
und je Lauf ist ein anderer Fall wackelig (`halluzination-unbekannte-zahl` 1/3,
dann `schutz-api-schluessel` 2/3). Beide Male wird der wackelige Fall auf der
Seite namentlich genannt.

## Rückweg

Doppelklick auf `smejj.com Qualitaetsmessung-einrichten.command` und „entfernen"
wählen. Oder von Hand:

```
crontab -l | grep -v smejj-qualitaetsmessung | crontab -
```

Protokoll: `~/Library/Logs/smejj-qualitaetsmessung.log`.

## Merkregel

**EINE AUTOMATIK, DEREN ERGEBNIS IM CACHE HÄNGENBLEIBT, MELDET ERFOLG UND
BEWIRKT NICHTS.** Vor dem Einrichten eines Zeitplans prüfen, ob sein Ergebnis
den Nutzer überhaupt erreicht.
