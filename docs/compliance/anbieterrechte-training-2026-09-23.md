# Anbieterrechte: Dürfen fremde Modellantworten smejj 1 trainieren?

Stand: 2026-09-23 · Auftrag des Betreibers („Anbieterrechte klären, bevor trainiert wird") ·
Alle Seiten am 2026-09-23 abgerufen. Auswertung der Vertragstexte, **keine Rechtsberatung**.

## Ergebnis in einem Satz

**Antworten von Z.ai / GLM dürfen NICHT ins Training. Antworten von Groq dürfen es nur je nach Modell:
gpt-oss ja, Llama nein (Namenspflicht), alles Ungeprüfte nein. Eigene Antworten (smejj 1) ja.**

## Quellen und Urteil

| Antwortquelle (x-smejj-model-id) | Urteil | Maßgebliche Stelle | Beleg |
|---|---|---|---|
| `glm-*` über Z.ai-API | **verboten** | Nutzungsbedingungen III.4.f und API-Zusatz 1.f.xii: Ausgaben dürfen nicht genutzt werden, um konkurrierende Modelle zu entwickeln oder zu trainieren. Dass die Ausgaben dem Nutzer gehören (IV.4), hebt das Verbot nicht auf. | https://docs.z.ai/legal-agreement/terms-of-use (Stand 14.04.2026) |
| `glm-*` über Zhipu BigModel | **verboten** | Nutzervertrag: Ausgaben generell ausgeschlossen für Training, Annotation, Feintuning anderer Modelle. | https://docs.bigmodel.cn/cn/terms/user-agreement (gültig ab 04.09.2026) |
| Groq allgemein | Hoster, entscheidet nicht allein | Rechte an Ein-/Ausgaben beim Kunden; Wettbewerbsverbot nur für Dienste, die dem **Hosting** ähneln. Verweist auf die Lizenz des jeweiligen Modells. | https://console.groq.com/docs/legal/services-agreement (gültig ab 22.06.2026) |
| `openai/gpt-oss-20b`, `-120b` (Groq) | **erlaubt** | Apache-2.0, keine Einschränkung für Ausgaben. | https://huggingface.co/openai/gpt-oss-120b |
| `llama-3.1-*`, `llama-3.3-*`, `llama-4-*` (Groq) | **gesperrt** (Auflage nicht erfüllt) | Llama-Lizenz 1.b.i: Training mit Ausgaben nur, wenn das neue Modell mit „Llama" beginnt und „Built with Llama" zeigt. smejj 1 heißt anders. | https://raw.githubusercontent.com/meta-llama/llama-models/main/models/llama3_3/LICENSE |
| `qwen/qwen3.6-*`, `qwen3.8-*` (Groq) | **gesperrt** bis Einzelprüfung | Qwen3 steht unter Apache-2.0; die konkreten Versionen 3.6/3.8 wurden nicht einzeln geprüft. | – |
| `kimi-*` (Moonshot-API direkt) | **gesperrt** bis Einzelprüfung | Die Kimi-K2-Gewichte stehen unter Modified MIT, die Moonshot-**API**-Bedingungen wurden nicht geprüft. | – |
| `smejj-1*` (eigenes Hausmodell) | **erlaubt** | Eigenes Modell, Basis Qwen3-4B-Instruct-2507 unter Apache-2.0. | https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507 |
| keine Kennung (Geräte-Modell, alte Paare) | **gesperrt** | Herkunft unbekannt = nie erlaubt (fail-closed). | – |

## Was im Code daraus folgt

- **Register:** `ANTWORT_RECHTE` und `antwortQuelleZulaessig()` in `src/training/policy.js`.
  `evaluateTrainingEligibility` wertet Quellen der Art `model-output` gegen dieses Register aus
  (`provider_training_use_denied` bzw. `provider_rights_missing` → Zustand *denied*).
- **Herkunft je Paar:** Der Chat merkt sich die Kopfzeile `x-smejj-model-id` der Antwort und schickt sie
  mit dem Daumen hoch. Das Lernpaar trägt `quelle: { modell, trainingsrecht, rechtGrund, rechtId }`.
- **Getrennte Ablage:** Paare mit Trainingsrecht → `training/fragen/lernpaare/`, ohne →
  `training/fragen/lernpaare-ohne-trainingsrecht/`. Der Zähler „X von 500" (Nr. 65) sieht nur die ersten.
  Gesperrte werden aufbewahrt (der Mensch hat eingewilligt) — ändert sich die Rechtslage, sind sie da.
- **Datensatzbau:** `workers/smejj-lora-loop/lernrunde.js` prüft jedes Paar beim Bau **erneut**
  (Register kann sich ändern) und nimmt zusätzlich alle Paare von Menschen heraus, die ihre
  Einwilligung widerrufen haben. Ist das Einwilligungs-Register nicht lesbar, gilt das Paar als widerrufen.

## Ehrliche Folge

Heute (23.09.) antwortet in den meisten Chats GLM-5.2 (Standardmodell) oder die Groq-Schnellspur. Nur ein
Teil der künftigen Lernpaare wird also verwendbar sein. Das einzige vorhandene Paar (16.09.) hat keine
Herkunft und ist deshalb **nicht verwendbar**: Stand heute **0 von 500** verwendbaren Lernpaaren.

## Wege, mehr verwendbare Paare zu bekommen (Entscheidung des Betreibers)

1. Die Schnellspur und das Standardmodell auf gpt-oss stützen statt auf GLM (Kosten und Qualität messen).
2. GLM-Gewichte (MIT-Lizenz) selbst betreiben — dann gilt die Modell-Lizenz, nicht der API-Vertrag. Großer Umbau.
3. Paare mit smejj 1 als Antwortgeber sammeln (Menüzeile „smejj 1").
4. Llama-Paare nur, wenn das nächste Modell „Llama-smejj …" heißen darf und „Built with Llama" zeigt.

## Nachtrag 26.09.2026: Lernpaare aus dem Internet

Betreiber: „Soll von Internet trainieren". Der Trainings-Autopilot erzeugt jetzt selbst Lernpaare
(`workers/smejj-lora-loop/internetLernpaare.js`):

| Teil | Herkunft | Recht |
|---|---|---|
| Frage + Antwort | gpt-oss-120b über Groq | erlaubt (Apache-2.0, siehe oben) |
| Quellenauszug im Prompt | meistgelesene Wikipedia-Artikel (Wikimedia-Feed) | CC BY-SA 4.0 — Namensnennung steht in jeder Antwort („Quelle: Wikipedia – Titel") und im Paar (`kontext.url`, `kontext.lizenz`) |

- **Keine personenbezogenen Nutzerdaten:** es ist kein Mensch beteiligt, daher keine Einwilligung nötig;
  `pruefePaar` verwirft trotzdem Schlüssel, Kontaktdaten und Anweisungsversuche.
- **Trainiert wird die Fähigkeit, Quellen zu lesen**, nicht das Faktenwissen: das Paar hat genau das
  Format, das smejj 1 im Betrieb bekommt (`src/training/quellenFormat.js`). Aktuelle Fakten holt smejj 1
  weiter zur Laufzeit (Websuche, Radar).
- **Offene Rechtsfrage (ehrlich):** Ob ein mit CC-BY-SA-Auszügen trainiertes Modell selbst unter
  Share-Alike fällt, ist nicht abschließend geklärt; die EU-Ausnahme für Text- und Data-Mining
  (Art. 4 DSM-RL) deckt das Auswerten, Wikipedia hat keinen Nutzungsvorbehalt erklärt. Bei Bedarf lassen
  sich alle Internet-Paare über `herkunft: "internet-synthese"` aus jedem Datensatz entfernen.
