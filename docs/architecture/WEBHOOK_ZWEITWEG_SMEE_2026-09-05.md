# Webhooks: der zweite Weg (Smee)

Stand: 2026-09-05. Betreiber-Auftrag: „Smee / Webhook-Proxy muss in unserem
System sein."

## Die Lage, bevor etwas gebaut wurde

Gemessen am 05.09.:

| Punkt | Befund |
|---|---|
| `api.smejj.com` | öffentlich erreichbar, HTTP 200 in 1,27 s |
| Stripe-Webhook | öffentlich erreichbar, antwortet (HTTP 400 ohne gültigen Body) |
| Eigener Linux-Server | **keiner** — alles läuft in Zeabur-Containern, 14 Worker-Dienste |
| systemd | nicht vorhanden |
| Vorhandener Webhook-Proxy | keiner |

**Das ist nicht die Lage, die jede Smee-Anleitung beschreibt.** Dort steht ein
Entwicklungsrechner hinter einer Firewall, den der Anbieter nicht erreicht.
Bei smejj.com erreicht Stripe den Server direkt.

Ein Smee-Kanal als **Hauptweg** wäre deshalb ein Rückschritt: ein öffentlicher
Kanal ohne Zusage, ohne Wiederholung, ausdrücklich für Entwicklung gedacht.

## Was gebaut wurde: ein zweiter Weg

```
Stripe ──────────────────────────────►  api.smejj.com/api/billing/…   (Hauptweg)
   └───► smee.io/<kanal> ──► smejj-smee ──► api.smejj.com/api/webhooks/relay
                                                  └──► derselbe Endpunkt (Zweitweg)
```

- Der Anbieter stellt weiter **direkt** zu. Daran ändert sich nichts.
- Derselbe Webhook geht **zusätzlich** an den Smee-Kanal.
- Fällt der Hauptweg aus, kommt das Ereignis über den Zweitweg an.
- Kommt es zweimal an, wirkt es **einmal**.

## Die drei Sicherungen

Ein Smee-Kanal ist **öffentlich beschreibbar**. Wer die Adresse kennt, kann
dort etwas hineinlegen. Der Eingang ist damit ein Tor, das ein Fremder
erreichen kann — also gilt fail-closed:

1. **Ohne `SMEJJ_SMEE_RELAY_SECRET` ist die Route AUS** (503). Nicht
   eingerichtet heißt geschlossen, nicht offen.
2. **Der Relay-Beweis wird zeitkonstant verglichen.** Ein Unterschied in der
   Länge darf nicht schneller antworten als einer im letzten Zeichen — sonst
   ließe sich das Geheimnis Zeichen für Zeichen raten.
3. **Die Signaturprüfung des Anbieters bleibt beim echten Handler.** Der Relay
   fälscht keine Signatur und legt keine an; er reicht die Kopfzeilen
   unverändert weiter und ruft **denselben Endpunkt** über einen internen
   HTTP-Aufruf auf. Keine Abkürzung am Handler vorbei — die wäre schneller und
   würde genau das umgehen, was vor dem Handler steht.

Ein Ereignis **ohne bekannte Signaturkopfzeile** wird gar nicht erst
weitergereicht (HTTP 422).

## Gegen doppelte Verarbeitung

Die Ereignis-Kennung wird 15 Minuten gemerkt (Deckel 5.000 Einträge, damit der
Speicher nicht mit der Ereigniszahl mitwächst). Eine Wiederholung bekommt
**200, nicht 409** — für den Absender *ist* es erledigt, und ein Fehler würde
ihn zu weiteren Versuchen veranlassen.

Fehlt eine Kennung, dient der Rumpf-Hash als Kennung.

## Warum kein systemd-Service

Die Anleitung im Auftrag beschreibt `/etc/systemd/system/smee.service` mit
`Restart=on-failure`, `MemoryMax`, eigenem Benutzer `smee`. Das setzt einen
eigenen Linux-Server voraus. **Den gibt es hier nicht.**

Was systemd dort leistet, leistet hier die Plattform:

| systemd | bei uns |
|---|---|
| `Restart=on-failure` | Zeabur startet einen abgestürzten Dienst neu |
| `MemoryMax` | Speichergrenze am Dienst + `NODE_OPTIONS=--max-old-space-size=64` |
| eigener Benutzer `smee` | `USER node` im Abbild, nie root |
| `ProtectSystem`, `PrivateTmp` | Container-Isolation |

Eine systemd-Datei wäre hier eine Datei, die nie jemand ausführt.

## Ressourcen

Der schlankeste Dienst im Haus: **keine einzige Abhängigkeit**, zwei Dateien,
Node-Bordmittel. Er hält einen Datenstrom offen und reicht jeden Körper sofort
weiter (Deckel 512 KB je Ereignis). Heap-Grenze 64 MB — der Wert aus der
Anleitung, und er passt, weil nichts zwischengespeichert wird.

## Autopilot Nr. 84 — Webhook- und Smee-Wache

| Ampel | Wann |
|---|---|
| ⚪ grau | nicht eingeschaltet — ein Zustand, kein Fehler |
| 🟡 gelb | eingeschaltet, aber Kanal nicht verbunden |
| 🔴 rot | Dienst tot **oder der eigene Eingang lässt Fremde durch** |
| 🟢 grün | Dienst gesund, Kanal verbunden, Eingang weist ab |

Die Wache klopft bei jedem Lauf am eigenen `/api/webhooks/relay` — **ohne
gültigen Beweis**. Er muss abweisen. Ein offenes Tor ist schlimmer als ein
ausgefallener Zweitweg und wird sofort rot.

**Sie schickt keine Testereignisse durch den Kanal.** Der Weg endet bei Stripe
in der Zahlungslogik; ihn mit erfundenen Ereignissen zu füllen hieße, den Weg
zu beschädigen, den man messen will. Geprüft wird die Strecke, nicht der Inhalt.

## Einschalten

Neuer Zeabur-Dienst **smejj-smee**, Abbild `Dockerfile.smejj-smee`:

```
SMEJJ_SMEE_ENABLED=YES
SMEJJ_SMEE_KANAL=https://smee.io/<kanal>
SMEJJ_SMEE_RELAY_SECRET=<langes Zufallsgeheimnis>
```

Beim Dienst **smejj-control** derselbe Wert:

```
SMEJJ_SMEE_RELAY_SECRET=<dasselbe Geheimnis>
SMEJJ_SMEE_DIENST_URL=<interne Adresse des Dienstes smejj-smee>
```

Dann beim Webhook-Anbieter den Smee-Kanal als **zusätzliches** Ziel eintragen —
das bestehende Ziel bleibt.

Ohne diese Werte ist alles aus: der Dienst leitet nichts weiter, die Route
antwortet 503, und die Wache steht auf grau.
