# Live-Abgleich: was gemessen ist und warum er nicht in einem Zug geht

**Stand:** 2026-09-08 · Betreiber-Auftrag: „die 57 restlichen Dateien auch
abgleichen".

## Ausgangslage

`npm run check:deploy-abgleich` meldet **60 Dateien, die live neuer sind** als
im Repo. Der Test *„die echten Manifeste stimmen mit der Auslieferung überein"*
bleibt rot, solange das so ist: Die Sperre bewacht Fassungen, die smejj.com
gar nicht ausliefert.

Verglichen wird gegen einen Klon von **`smejj-app-frontend`** unter
`~/smejj-app-frontend`, nicht gegen `origin/main` dieses Repos.

## Das Werkzeug

`scripts/diagnose/live-abgleich-merge.mjs` macht maschinell, was der Wächter
verlangt: *„Live-Fassung zur Basis nehmen, eigene Änderung daraufsetzen — sonst
verschwindet fremde Arbeit lautlos."* Statt zu kopieren führt es einen echten
**Drei-Wege-Merge**:

| | |
|---|---|
| **Basis** | die Fassung aus der Frontend-Historie, die byte-genau dem lokalen Stand entspricht — dort war das Repo zuletzt gleichauf |
| **Mein** | die lokale Fassung |
| **Andere** | die heutige Auslieferung |

Gibt es keinen byte-gleichen Stand, sucht es die **ähnlichste** Fassung als
Wurzel (mindestens 50 % gemeinsame Zeilen). Das ist eine Schätzung — aber eine
überprüfbare: `git merge-file` meldet jede Stelle, an der sie nicht trägt, als
Konflikt. Geraten wird also nie still.

```bash
SMEJJ_REPO="$(pwd)" node scripts/diagnose/live-abgleich-merge.mjs <datei>::<ziel>
#   ohne --schreiben: Trockenlauf, ändert nichts
#   mit  --schreiben: führt zusammen
```

## Das Messergebnis vom 08.09.

| Lage | Dateien |
|---|---|
| sauber zusammenführbar (Basis byte-gleich) | **18** |
| sauber zusammenführbar (ähnlichste Basis) | **7** |
| **echter Konflikt — Hand anlegen** | **35** |

Die 18 wurden testweise zusammengeführt: 864 Zeilen kamen hinzu, 116 fielen
weg. Kein Verlust eigener Arbeit — bei diesen Dateien war die lokale Fassung
ein **älterer Auslieferungsstand**, die entfallenen Zeilen waren live bewusst
entfernt worden.

## Warum der Teil-Abgleich zurückgenommen wurde

Nach den 18 Dateien war `check:frontend` **rot** — unter anderem
*„?v=-Marken zeigen auf DIESELBE Kopie wie index.html"*. Die übernommenen
Fassungen tragen Cache-Marken, die zu einer `index.html` gehören, die noch
lokal ist.

Das ist exakt die Lehre des Abgleichs vom 07.09.: **abgeleitete Dateien
vertragen keinen Teil-Abgleich.** Entweder der ganze Satz oder keiner.

Da die 35 Konflikte in einem Zug nicht verantwortbar aufzulösen sind — jede
Stelle ist eine inhaltliche Entscheidung über fremde Arbeit —, wurde auf
`15907fed` zurückgerollt. Gegengeprüft: `check:frontend` 654/654, Startgewicht
15/15, Divergenz wieder bei 60.

**Ein halb abgeglichener Stand ist schlechter als ein bekannter alter.**

## Der Weg, wenn es angegangen wird

1. Sicherstellen, dass **niemand sonst an `public/` arbeitet** (am 08.09. lief
   parallel die Mobil-QA).
2. Trockenlauf über alle 60 Dateien, Liste der 35 Konflikte ziehen.
3. Die 25 sauberen zusammenführen — aber **nicht committen**, bis auch die 35
   erledigt sind (siehe Teil-Abgleich oben).
4. Die 35 Konfliktstellen einzeln entscheiden. Faustregel des Wächters: live
   ist die Basis, lokale Arbeit kommt darauf.
5. Bündel neu bauen: `npm run build:start-styles && npm run build:assets`.
6. `check:frontend`, `check:module-queries`, Startgewicht, dann
   `check:deploy-abgleich` muss **OK** melden.
7. Erst danach die Sperre nachziehen — Doppelklick auf
   `smejj.com Schutz nachziehen und Kaskade freigeben.command`. Eine Sitzung
   darf `--freeze` nicht selbst ausführen.

Realistisch ist das ein eigener, mehrstündiger Durchgang mit voller
Aufmerksamkeit — kein Nebenbei-Schritt.
