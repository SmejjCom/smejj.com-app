# Freigabe: `smejj-fast-1` gestoppt (2026-08-09)

## Wortlaut des Betreibers

> Freigabe smejj.com, 2026-08-09: Stoppe die Container-Gruppe smejj-fast-1.

`smejj-remote-browser-live` blieb ausdruecklich unangetastet.

## Was gemessen wurde, bevor gestoppt wurde

| | `smejj-fast-1` | `smejj-remote-browser-live` |
| --- | --- | --- |
| Laufzeit | 7,6 Tage | 19,2 Tage |
| Preisspanne | 0,08–0,30 USD/h (7 GPU-Klassen) | 0,015–0,02 USD/h |
| bisher aufgelaufen | **15–55 USD** | 7–9 USD |
| pro Monat | **58–219 USD** | 11–15 USD |
| Zustand | gesund, 0 Fehlschlaege | gesund, wartet auf Auftraege |
| Rolle | `standard: false` — nur bei aktiver Auswahl | `SMEJJ_REMOTE_BROWSER_WORKER_URL`, echt verdrahtet |

Der Unterschied ist **Faktor 15**. Die Browser-Gruppe ist Kleingeld und
nachweislich eingebunden; `smejj-fast-1` war die eigentliche Position.

**Was nicht messbar war, und das gehoert dazu:** ob jemand `smejj-fast-1`
jemals ausgewaehlt hat. Es gibt keinen Nutzungszaehler. Der Gesundheitseintrag
wird von der Sonde im Minutentakt gesetzt und sagt darum nichts ueber echte
Anfragen. Die Entscheidung fiel also auf Basis von *belegter Bereitschaft ohne
belegte Arbeit* — dieselbe Signatur wie beim LoRA-Trainer, der am 2026-08-06
aus genau diesem Grund gestoppt wurde.

Dazu die unbequeme Nachbarschaft: am selben Tag wurde gemessen, dass der
Eigenbau-Weg qualitativ hinter RAG liegt (36,60 % gegen 96 %).

## Ausgefuehrt und nachgemessen

- `POST …/containers/smejj-fast-1/stop` → HTTP 202
- Zustand nach 20 s: **`stopped`**
- Abbild bleibt erhalten (`ghcr.io/ggml-org/llama.cpp:server-cuda`) — ein
  Neustart dauert Minuten
- Chat unveraendert gesund: `ok: true`, aktives Modell `kimi-k2-7`
- Erfassungskette: **alle sieben Glieder halten**
- Laufende Gruppen: **4 von 29** (nur noch eine davon mit GPU)

## Nebenbefund: die neue Sonde meldet in BEIDE Richtungen ehrlich

Der Stopp wurde zum Gegentest des Fixes vom selben Tag:

| Zeitpunkt | Registereintrag |
| --- | --- |
| vor dem Stopp | `erreichbar=true`, `status=ready` |
| nach dem Stopp | `erreichbar=false`, **`status=degraded`** |

Der Unterschied zu `configured-unverified` (glm-5-2, kimi-k3) ist der Punkt:
**`degraded` heisst „gemessen und ausgefallen", `configured-unverified` heisst
„nie geprueft".** Vor dem Fix waren beide ununterscheidbar — eine laufende,
bezahlte, gesunde GPU sah vier Tage lang genauso aus wie ein toter Dienst.

## Ruecknahme

`POST …/containers/smejj-fast-1/start`. Umgebung, Abbild und Modell bleiben
unveraendert; die Sonde meldet den Dienst nach spaetestens 60 s wieder als
`ready`.
