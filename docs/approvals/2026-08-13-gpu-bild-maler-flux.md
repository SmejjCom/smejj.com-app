# Freigabe-Zettel: GPU-Bild-Maler in Midjourney-Klasse (FLUX.1-schnell auf Miet-GPU)

**Datum:** 2026-08-13 · **Status: WARTET AUF BETREIBER-FREIGABE** · Autor: Claude (Auftrag: „soll wie Nano Banana, Midjourney … sein")

## Was gebaut wird
Der bestehende Bild-Maler bekommt einen großen Bruder auf einer **Miet-GPU**: dein eigenes
Modell **FLUX.1-schnell** (Apache-2.0-Lizenz = kommerziell frei — wichtig, denn FLUX.1-dev
wäre für smejj.com NICHT frei) erzeugt 1024-Pixel-Bilder in Midjourney-naher Qualität mit
sauberen Gesichtern. Kein Fremd-Bilddienst: gemietete Hardware, dein Modell, dein Endpoint.

## Anbieter und Kosten (recherchiert 2026-08-13)
| Anbieter | GPU | Preis aktiv | Bild warm (~5 s) | Leerlauf |
|---|---|---|---|---|
| **RunPod Serverless (Empfehlung)** | RTX 4090 24 GB | 1,10 $/h | **~0,2 ct** | **0 $** (scale-to-zero) |
| RunPod Serverless (größer) | L40S 48 GB | 1,75 $/h | ~0,3 ct | 0 $ |
| Vast.ai (Preis-Alternative) | 4090 | oft günstiger, aber ohne Serverless-Komfort | — | Instanz läuft durch |

Kaltstart (erster Auftrag nach Pause): ~15–45 s extra GPU-Zeit ≈ +0,5–1,5 ct.
**Realistische Monatskosten bei 500 Bildern: unter 5 $.** Vorschlag: **Kostendeckel 10 $/Monat**
direkt im RunPod-Konto einstellen (hartes Limit, keine Überraschungen).

## Architektur (nichts wird weggeworfen)
- Neuer Worker (Docker-Image mit FLUX.1-schnell eingebacken) als RunPod-Serverless-Endpoint;
  gleicher Vertrag wie heute: `POST {prompt} → {ok, b64: PNG}`.
- Die Brücke schaltet per Env um: `SMEJJ_BILDER_WORKER_URL` = RunPod-Endpoint,
  `SMEJJ_BILDER_WORKER_KEY` = API-Key. **Reserve-Kette bleibt komplett:**
  GPU-Maler → CPU-Maler (Zeabur) → SVG (smejj 1.0) → Text.
- Fortschritts-Anzeige/Übersetzung/Anzeige im Chat: unverändert, alles schon live.

## Was NUR der Betreiber tun kann (Konto-Handlungen sind mir untersagt)
1. RunPod-Konto anlegen (runpod.io), Zahlungsmittel + **Spend-Limit 10 $/Monat** setzen.
2. API-Key erzeugen und in der Zeabur-Brücke als Env-Werte eintragen
   (`smejj.com Zeabur-Schlüssel.command` hilft beim Einfügen).

## Was ich danach baue (~1 Arbeitstag)
Worker-Image + Endpoint-Definition, Brücken-Umschaltung mit Gesundheitsprüfung,
Kaltstart-freundliche Wartelogik (Fortschritt „GPU wacht auf …"), Livetests
(Motive inkl. Menschen/Gesichter), Kostenmessung pro Bild, Dokumentation.

## Freigabe
Mit Antwort „**Freigabe GPU-Bild-Maler, 10 $/Monat**" (oder anderem Deckel) gilt dieser
Zettel als genehmigt im Sinne der Regel „neuer Dienst = schriftliche Freigabe mit
Dienst + Betrag" (Memory smejj-zeabur-expansion-approval — gilt sinngemäß für jeden Anbieter).
