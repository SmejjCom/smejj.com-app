# Video-Engine von smejj 1.0 — Betriebsanleitung

Stand: 2026-08-13. Für den Betreiber geschrieben, nicht für Entwickler.

## Was sie tut

Wer im Chat *„Erstelle ein Video von …"* schreibt, bekommt ein kurzes,
vertontes MP4 — erzeugt auf der eigenen Infrastruktur, ohne Fremdanbieter und
ohne GPU.

Die Kette in vier Schritten:

1. **Bild-Maler** (`smejj-bild-maler`) malt das Motiv mit SD-Turbo (40–90 s).
2. **Tiefenschätzung** erkennt, was vorn und was hinten ist (26-MB-Modell, ~1 s).
3. **Kamerafahrt** durch die Szene: nahe Dinge wandern weiter als ferne, der
   Himmel zieht dabei durch. Nahtlose Schleife.
4. **Erzählstimme**: smejj 1.0 schreibt zwei Sätze, Piper spricht sie, die
   Tonspur kommt unter das Video. Die Länge richtet sich nach der Sprechdauer.

## Was sie NICHT tut — und warum

Das Video zeigt eine **bewegte Szene, kein bewegtes Motiv**. Wer „ein Video von
einem fliegenden Adler" eingibt, bekommt eine Kamerafahrt durch eine
Adler-Szene — der Adler schlägt nicht mit den Flügeln. Der Chat sagt das
jedes Mal dazu, damit niemand etwas anderes erwartet.

Echte Motivbewegung bräuchte Video-Diffusion (AnimateDiff/Wan2.1) und damit
eine GPU. Gemessen am 2026-08-13:

| | Zeit für 2 s Video | Arbeitsspeicher |
|---|---|---|
| heutige Engine | ~90 s (fast alles davon Bildmalen) | ~1 GB |
| AnimateDiff auf 2 Kernen | **~45 Minuten** | 10–14 GB |

Zeabur bietet **keine GPU** an (geprüft: Preisliste, Doku, Server-Auswahl
1–32 vCPU, 2–64 GB, keine Grafikkarte). Diffusion-Video ist hier also nicht
teuer, sondern versperrt.

## Voraussetzungen im Betrieb

| Dienst | Rolle | Ohne ihn |
|---|---|---|
| `smejj-video-worker` | erzeugt das Video | Chat antwortet: Engine nicht erreichbar |
| `smejj-bild-maler` | malt das Motiv | Video-Worker meldet sich als nicht bereit |
| `smejj-voice-piper` | spricht die Erzählung | Video kommt trotzdem, nur stumm |

Der Video-Worker meldet sich in `/health` **nur dann bereit, wenn auch der
Bild-Maler bereit ist**. Das ist Absicht: Eine grüne Ampel, hinter der nichts
funktioniert, wäre schlimmer als eine rote.

## Wenn etwas nicht stimmt

**„Die eigene Video-Engine ist gerade nicht erreichbar."**
Der Dienst läuft nicht oder der Bild-Maler schläft. Prüfen:
`/health` des Video-Workers — steht dort `bereit: false`, sagt das Feld
`fehler`, woran es liegt.

**Video kommt, aber stumm.**
Piper hat nichts Brauchbares geliefert. Der Worker verwirft eine Tonspur in
drei Fällen, statt zu lügen: HTML-Demo-Seite statt Ton (das passiert bei
kurzen Eingaben wirklich), stilles WAV, oder eine Stimme, die länger ist als
das Videobudget. Das Feld `ton` in der Antwort sagt immer die Wahrheit.

**„Gerade werden schon mehrere Videos erzeugt."**
Drei Aufträge sind gleichzeitig unterwegs. Der Server hat zwei Kerne — mehr
wäre eine Schlange, die niemand abarbeitet.

**Zweiter Nutzer wartet lange.**
Normal: Der Worker macht immer nur ein Video. Die Brücke wartet bis zu zwei
Minuten auf einen freien Platz und zeigt dabei „wartet auf freien Platz …".

## Stellschrauben (Umgebungsvariablen)

| Variable | Vorgabe | Wirkung |
|---|---|---|
| `SMEJJ_VIDEO_ENGINE` | `parallax` | `kenburns` = flacher Zoom ohne Tiefenmodell |
| `SMEJJ_VIDEO_DAUER_S` | `4` | Grundlänge ohne Erzählung |
| `SMEJJ_VIDEO_MAX_DAUER_S` | `14` | Obergrenze, auch mit langer Erzählung |
| `SMEJJ_VIDEO_PARALLAX_STAERKE` | `26` | mehr = räumlicher, aber größere Löcher |
| `SMEJJ_VIDEO_HIMMEL_ZUG` | `22` | wie weit die Wolken je Runde ziehen |
| `SMEJJ_VIDEO_BEWEGUNG` | `1` | `0` schaltet die Wolkenbewegung ab |
| `SMEJJ_VIDEO_ANDRANG_MAX` | `3` | ab wie vielen gleichzeitigen Aufträgen abgesagt wird |

Ein Wechsel auf GPU später ist vorbereitet: `SMEJJ_VIDEO_ENGINE=animatediff`
schaltet auf echte Video-Diffusion um, sobald ein GPU-Dienst existiert. Dann
entfällt auch der Hinweis „das Motiv selbst bleibt ruhig" automatisch.

## Was gemessen wurde

Alles hier steht auf Messung, nicht auf Vermutung:

- Ende-zu-Ende im Docker-Container mit Ersatz-Nachbarn: 81-KB-MP4,
  h264 512×512 + AAC-Tonspur, 401 ohne Schlüssel.
- Parallax: nahe Bildbereiche bewegen sich **20,8-mal** stärker als ferne.
- Himmel-Zug: Änderung in der Himmelzone 1,21 → 2,01 (+66 %) für +0,5 s.
- Piper-Fallen: sechs Antwortarten gegen den echten Worker-Code
  (`scripts/testing/pruefe_video_stimme.py`).
- Videospur der Brücke: zwölf Ende-zu-Ende-Prüfungen
  (`tests/chat-bridge-video-e2e.test.mjs`).

Eine **Wasser-Kräuselung war gebaut und wurde wieder entfernt** — sie zeigte
bei jedem Ausschlag exakt die Werte des ausgeschalteten Zustands. Was sich
nicht messen lässt, gehört nicht in den Betrieb.
