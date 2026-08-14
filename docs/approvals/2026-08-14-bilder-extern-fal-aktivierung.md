# Externer Bild-Maler aktivieren (Weg 0) — Anleitung für den Betreiber

Stand: 2026-08-14. Der Code ist gebaut, geprüft und ausgeliefert. Er tut
**nichts**, solange der Schlüssel fehlt — genau ein Handgriff fehlt noch, und
den kann nur der Betreiber machen (Agenten-Sitzungen dürfen keine API-Keys
eintragen).

## Warum überhaupt

Der eigene Bild-Maler ist hardware-gedeckelt und wird das Ziel nie erreichen:

| | eigener Maler heute | externer Maler (FLUX schnell) |
| --- | --- | --- |
| Modell | SD-Turbo, 3 Schritte | FLUX.1 schnell |
| Auflösung | 512 px | 1024 px |
| Dauer je Bild | ~120 s | ~2-3 s |
| Serverlast | 203 % CPU, 6,6 von 8 GB | keine |
| Kosten je Bild | 0 € | ~0,025 USD |

Die naheliegenden Verbesserungen am eigenen Maler wurden am 2026-08-14
**gemessen und zurückgenommen**: bfloat16 machte ihn 70 % langsamer, 640 px
sprengte das Zeitbudget. Das ist keine Feinabstimmungsfrage, sondern die
Grenze der Maschine.

Der Nebengewinn ist groß: Der Maler steht im Verdacht, mit seinen 6,6 GB die
Wurzel der stillen Control-Abstürze zu sein. Läuft er nur noch als Rückfall,
verschwindet diese Last aus dem Alltag.

## Der eine Handgriff

1. Konto auf <https://fal.ai> anlegen (dasselbe, das für den Video-Weg
   ohnehin gebraucht wird — ein Konto reicht für beides).
2. **Ausgabenlimit im fal-Konto setzen.** Das ist der harte Deckel. Der
   Tagesdeckel im Code (200 Bilder) liegt im Arbeitsspeicher und fällt bei
   jedem Neustart auf 0 — er bremst Amok, er begrenzt keine Rechnung.
3. Im Zeabur-Portal beim Dienst **smejj-chat-bridge** die Variable setzen:
   `SMEJJ_BILDER_EXTERN_KEY=<der fal-Schlüssel>`
   (Einzel-Bearbeitung per Stift — **nie** "Edit Raw Variables", das zeigt
   alle Geheimnisse im Klartext.)
4. Dienst neu starten. Zeabur startet nach einer Variablen-Änderung **nicht**
   von selbst neu.

Danach im Chat "Zeichne ein Bild von …" — die Antwort kommt in Sekunden statt
Minuten, und der Kopf der Antwort trägt `x-smejj-profile: bilder-foto-extern`.

## Was der Code tut, wenn etwas schiefgeht

Jede Störung fällt lautlos eine Stufe zurück, der Nutzer bekommt immer ein Bild:

```
Weg 0  externer Maler (fal.ai)        <- neu, beste Qualität
  |    scheitert, Deckel erreicht oder gar kein Schlüssel
Weg 1  eigener Bild-Maler (SD-Turbo)  <- wie bisher, ~2 min
  |    scheitert oder Modell lädt noch
Weg 2  SVG-Vektorgrafik von smejj 1.0 <- wie bisher
```

## Was abgesichert ist (tests/chat-bridge-extern-maler.test.mjs, 7 Prüfungen)

- **Ohne Schlüssel wird das Netz nicht einmal angefasst** — kein Aufruf, kein Cent.
- **SSRF:** Aus der Antwort wird nur eine echte fal-Adresse geladen. Abgewiesen
  werden Bindestrich-Tricks (`evil-fal.run`), Suffix-Tricks
  (`fal.run.angreifer.com`), `http://` und der Metadaten-Dienst `169.254.169.254`.
- **Magic-Bytes:** Liegt unter der Bildadresse eine HTML-Fehlerseite statt eines
  Bildes, fällt der Weg durch, statt Müll in den Chat zu schreiben.
- **Tagesdeckel** bremst nachweislich.
- Der **Personen-Schutzfilter** greift unverändert *vor* dem externen Aufruf —
  reale, benennbare Personen erreichen fal nie.

## Eine Messung, die die Formatwahl bestimmt hat

Der externe Weg liefert **JPEG, nicht PNG**. Grund: Ein Chat darf 512 KB groß
werden (`MAX_CHAT_BYTES`), sonst verwirft der Verlauf-Sync ihn **still**. Ein
1024er-PNG liegt bei 1-2 MB und würde jeden Chat mit Bild unsichtbar zerstören;
dasselbe Bild als JPEG bleibt bei 150-250 KB. Der Renderer nimmt beides
(`chat-medien.js` akzeptiert jedes `data:image/`).

## Umschalten auf ein anderes Modell

Alles hängt an Variablen, kein Code-Eingriff nötig:

| Variable | Vorgabe | wofür |
| --- | --- | --- |
| `SMEJJ_BILDER_EXTERN_KEY` | *(leer = Weg aus)* | der fal-Schlüssel |
| `SMEJJ_BILDER_EXTERN_MODELL` | `fal-ai/flux/schnell` | z. B. `fal-ai/flux-pro` für mehr Qualität |
| `SMEJJ_BILDER_EXTERN_GROESSE` | `square_hd` | Bildformat |
| `SMEJJ_BILDER_EXTERN_FORMAT` | `jpeg` | **nicht auf png stellen** (siehe oben) |
| `SMEJJ_BILDER_EXTERN_MAX_PRO_TAG` | `200` | weicher Tagesdeckel |
| `SMEJJ_BILDER_EXTERN_TIMEOUT_MS` | `45000` | Geduld je Aufruf |

Preise 08/2026 je Bild: FLUX schnell 0,025 · FLUX Pro 0,05 · Nano Banana 2
0,045-0,067 · Nano Banana Pro 0,134 USD.
