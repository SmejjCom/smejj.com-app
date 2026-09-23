# Der eine Handgriff: Bilder-Worker-Schlüssel einfügen

Stand: 2026-08-14. **Das ist der einzige Schritt, den der Assistent nicht
selbst machen darf** (Geheimnisse in Formulare tippen ist ihm verboten).
Danach macht er den Rest allein fertig.

## Der neue Bild-Maler läuft bereits — bewiesen

Im Container von Server 2 gemessen (2026-08-14):

```
BEREIT True | DTYPE float32 | CPU AVX512 | GESICHTSFIX bereitschaft | FEHLER ''
```

Das beweist gleich vier Dinge: Das SD-Turbo-Modell ist geladen, das
eingefügte Dockerfile hat korrekt gebaut (kein pnpm/Control-Server), die
GFPGAN-Gesichtsreparatur ist scharf, und der Code ist die richtige Fassung —
die Felder `genauigkeit`/`cpuKann` gibt es nur im Stand vom Bau-Branch.

Nebenbefund: Server 2 hat **dieselbe CPU-Klasse (AVX512, kein BF16)** wie
Server 1. `SMEJJ_BILD_GENAUIGKEIT=bfloat16` bleibt also auch dort aus.

**Aktueller Zustand ist sicher:** Der neue Dienst hat **keine Domain**, ist
also von außen nicht erreichbar. Der alte Bild-Maler auf Server 1 bedient
weiterhin alles. Es ist nichts kaputt und nichts offen.

## Der Wert liegt schon bereit

Ein zufälliger 32-Byte-Schlüssel wurde erzeugt und liegt in:

```
~/.config/smejj.com/bilder-worker-key.txt
```

Öffnen, Inhalt kopieren (eine Zeile, 43 Zeichen). Prüfsumme zum Abgleich:
`e4e9cb7a…` — die verrät den Wert nicht, hilft aber beim Vergleichen.

Im Terminal geht es auch:

```bash
cat ~/.config/smejj.com/bilder-worker-key.txt | pbcopy
```

Danach liegt der Wert in der Zwischenablage, ohne dass er auf dem Bildschirm
steht.

## Dreimal einfügen — überall derselbe Wert

Jedes Mal: Dienst → Reiter **Variable** → **Add** → Key eintippen, Value
einfügen → speichern.

| # | Projekt | Dienst | Key |
| --- | --- | --- | --- |
| 1 | `untitled-1` (Silicon Valley) | **smejj-bild-maler** (der neue) | `SMEJJ_BILDER_WORKER_KEY` |
| 2 | `untitled` (Ashburn) | **smejj-chat-bridge** | `SMEJJ_BILDER_WORKER_KEY` |
| 3 | `untitled` (Ashburn) | **smejj-video-worker** | `SMEJJ_BILDER_WORKER_KEY` |

Direktlinks:

- Neuer Bild-Maler:
  `https://zeabur.com/projects/6a7ec20b2b4272705cd1bd96/services/6a7ec3f82b4272705cd1be2f`
- Chat-Brücke:
  `https://zeabur.com/projects/6a6666899949111176cddefb/services/6a6680070d0b094201bb9ce4`
- Video-Worker:
  `https://zeabur.com/projects/6a6666899949111176cddefb/services/6a7d496af6f33e269eb37158`

## Warum das nötig ist

Beide Worker prüfen den Schlüssel **nur, wenn er gesetzt ist**:

```python
if WORKER_KEY and request.headers.get("x-smejj-key", "") != WORKER_KEY:
    return 401
```

Heute ist keiner gesetzt — die Prüfung entfällt also komplett. Das ist
harmlos, solange die Dienste nur intern erreichbar sind. Der neue Bild-Maler
auf Server 2 braucht aber eine **öffentliche Domain**, weil zwischen zwei
Zeabur-Projekten kein internes Netz existiert (am 2026-08-14 im Container
gemessen: alle vier `*.zeabur.internal`-Namen von Projekt 1 → **KEIN DNS**).

Ohne Schlüssel wäre der Bild-Maler ein offener Bildgenerator: **111 Sekunden
auf beiden CPU-Kernen pro Anfrage, für jeden im Internet.**

## Was danach automatisch passiert

1. Domain für den neuen Bild-Maler vergeben
2. `SMEJJ_BILDER_WORKER_URL` bei Brücke und Video-Worker auf diese Domain
   zeigen lassen
3. Ein echtes Bild über den neuen Weg beweisen
4. Alten Bild-Maler auf Server 1 **suspendieren** (nicht löschen — Rückfall
   bleibt offen)
5. Nachmessen: Die CPU-Warnung „94 %" auf Server 1 muss verschwinden

## Die verworfene Alternative

Server 2 hat einen **Firewall**-Reiter, mit dem sich der Zugang auf die IP von
Server 1 (`43.166.240.69`) einschränken ließe — dann bräuchte es keinen
Schlüssel. Dagegen sprechen zwei Dinge: Die einzige bestehende Regel lautet
`ALL / ALL / 0.0.0.0/0`, und wer daran dreht, kann sich und Zeaburs eigene
Verwaltung aussperren. Außerdem ist unbewiesen, dass ausgehender Verkehr von
Server 1 wirklich mit `43.166.240.69` ankommt. Ein Schlüssel ist harmloser und
jederzeit rückgängig zu machen.
