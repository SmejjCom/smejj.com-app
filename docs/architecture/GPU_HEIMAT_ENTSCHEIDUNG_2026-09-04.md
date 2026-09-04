# Trainings-Heimat für smejj 1.1 — Entscheidungsvorlage, 2026-09-04

Auftrag: „Kaggle als Gratis-GPU prüfen“ (Betreiber-Wahl 04.09.). Geprüft wurden Regeln,
Grenzen und der Weg der Checkpoints. Ergebnis vorweg: **Kaggle scheidet aus — nicht an der
Technik, sondern an den Nutzungsbedingungen.** Die Trainings-Heimat, die bleibt, haben wir
bereits: Salad, mit vorhandenem Guthaben und stehender Gruppe.

## 1. Kaggle — technisch passend, rechtlich nicht

| Punkt | Befund (04.09.2026 gelesen) |
|---|---|
| Grafikkarten | Tesla P100 16 GB oder 2× T4 (32 GB gesamt), gratis |
| Kontingent | rund 30 Stunden je Woche, je Sitzung bis 12 Stunden |
| Reicht das für uns? | **Ja.** Ein QLoRA-Lauf auf Qwen3-4B braucht nach eigener Messung 15–30 Minuten und passt in 16 GB. |
| **Nutzungsbedingungen** | **Nein.** Wortlaut der Terms of Use: „You will only use the Services for your own internal, **personal, non-commercial use**, and not on behalf of or for the benefit of any third party.“ |
| Acceptable Use Policy (Fassung 22.06.2025) | verbietet zusätzlich „to abuse resources offered as part of the Services, including … **server farming** … **activity unrelated to ML data science**“ |

smejj.com ist ein kommerzielles Produkt mit zahlenden Abos (Stripe). Ein Modell, das dort
antwortet, auf Kaggles Gratis-Karten zu trainieren, ist genau die untersagte kommerzielle
Nutzung — und ein automatisierter Trainings-Takt wäre zusätzlich „server farming“.
Das verstößt gegen unsere eigene Charta („Urheberrecht und Nutzungsrechte berücksichtigen“,
fail-closed). **Kaggle ist damit keine Option, auch wenn es technisch reichen würde.**

Dieselbe Frage stellt sich bei jedem anderen Gratis-Notebook-Dienst (Colab & Co.): Vor einer
Nutzung muss der Wortlaut gelesen werden, nicht die Werbung.

## 2. Was wir statt dessen schon haben: Salad

Live geprüft am 04.09.2026 mit dem vorhandenen Schlüssel (`SALAD_API_KEY`, Organisation
`smejjcom`, Projekt `default`):

| Punkt | Befund |
|---|---|
| Zugang | Schlüssel antwortet, API erreichbar (HTTP 200) |
| Laufende Kosten | **0 USD/h** — alle 30 Container-Gruppen stehen auf `stopped` |
| Trainer-Gruppe | `smejj-lora-trainer-batch` existiert, Status `stopped`, Priorität `batch` (günstigste Stufe) |
| Preis | RTX 3090 in Stufe `batch`: 0,09 USD/h (eigene Preistabelle, `workers/smejj-lora-loop/budget.js`) |
| Kosten je Lauf | 15–30 min ≈ **0,02–0,05 USD**; vier Konfigurationen samt Auswertung ≈ 2 USD |
| Guthaben | zuletzt bekannt rund 84 USD (Stand 01.08.), automatische Aufladung aus. Die öffentliche API nennt keinen Kontostand — die Zahl steht im Salad-Portal. |
| Freigabe | **liegt vor**: bestehender Anbieter, keine neue Rote-Liste-Entscheidung nötig |

Damit ist die Rechnung eindeutig: Das vorhandene Guthaben trägt **hunderte** Trainingsläufe.
Für smejj 1.1 muss **kein Geld ausgegeben werden**.

## 3. Die Falle, die 180 USD gekostet hat — und wie sie diesmal zubleibt

Im August lief die Gruppe rund um die Uhr, gerechnet wurde fast nie: Zähler 0,91 USD,
Rechnung rund 180 USD im Monat. Die Regel dagegen steht in der Charta und ist im Code:

1. **Wird nicht trainiert, wird die Gruppe gestoppt** (`workers/smejj-lora-loop/waechter.js`,
   60 Minuten ohne Bereitschaft → Gruppe stoppen).
2. Priorität bleibt `batch` (0,09 statt 0,25 USD/h). Ein `PATCH` auf `priority` antwortet
   200 und ändert nichts — nur Stoppen oder Neuanlegen wirkt.
3. Deckel `SMEJJ_LORA_MAX_USD_GESAMT` und die Freigabe-Werte müssen gesetzt sein, sonst
   startet der Loop nicht (fail-closed).
4. Autopilot Nr. 72 prüft das Kosten-Tor: Monatsbetrag ≤ 10 USD, sonst bleibt das Tor zu.

## 4. Weg der Checkpoints (unverändert gültig)

Gewichte und Datensatz liegen auf IDrive e2, der Trainer lädt sie beim Start und legt den
Adapter samt Messwerten zurück (`SMEJJ_LORA_BASIS_PREFIX`, `SMEJJ_LORA_BESTEN_KEY`).
Kein Modell verlässt den eigenen Speicher, kein Ergebnis lebt nur auf der Miet-Maschine.

## 5. Empfehlung

- **Kaggle nicht nutzen.** Der Wortlaut verbietet es; das Risiko ist die Sperre des Kontos
  und ein Regelverstoß gegen die eigene Charta.
- **Salad bleibt die Trainings-Heimat.** Vorhandenes Guthaben, bestehende Freigabe, stehende
  Gruppe, 0,09 USD/h in Stufe `batch`.
- **Nichts kaufen.** Erst wenn das Guthaben unter etwa 20 USD fällt, ist eine Entscheidung fällig.
- **Zuerst die Daten.** Das Kosten-Tor ist offen, das Daten-Tor nicht: 0 Einwilligungs-Paare,
  Ziel 3.000. Solange das so bleibt, ändert eine GPU-Heimat gar nichts.

Quellen: [Kaggle Terms of Use](https://www.kaggle.com/terms) · [Kaggle Acceptable Use Policy](https://www.kaggle.com/aup) ·
[Kaggle GPU-Kontingent](https://www.kaggle.com/product-feedback/173129) · Salad Public API (live gelesen) ·
`workers/smejj-lora-loop/budget.js` · `docs/policy/AUTOPILOT_TRAINING_CHARTA.md` ·
`docs/architecture/SMEJJ_1_1_TRAININGSPLAN_2026-09-02.md`
