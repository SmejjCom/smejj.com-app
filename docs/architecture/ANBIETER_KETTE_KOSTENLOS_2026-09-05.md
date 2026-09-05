# Die Anbieterkette verlängern — ohne Geld auszugeben

Stand: 2026-09-05. Betreiber-Auftrag „A bis Z", Punkte 4, 5 und 26.

## Der Befund

Live gemessen am 05.09.:

| | |
|---|---|
| Anbieter, die der Router kennt | **16** |
| Modelle in der Registry | 6 |
| **Davon aktiv** | **1** — `glm-5-2` bei Zhipu |
| Anbieter mit Schlüssel | **2** (Zhipu, Groq) |

**Die Fallback-Technik ist fertig und geprüft.** `executeWithFallback` probiert
die Kette der Reihe nach durch, merkt sich Fehlschläge und liefert am Ende eine
Versuchsliste — dafür gibt es 13 grüne Tests. Es fehlt nicht die Mechanik.

**Es fehlen Glieder.** Eine Kette mit zwei Gliedern ist kein Netz, sondern ein
Seil. Am 2. September ist Zhipu zweimal ausgefallen; der Chat stand stundenlang,
bei 64 grünen Ampeln.

## Was ein Glied kostet: nichts

Jeder dieser Anbieter hat eine dauerhaft kostenlose Stufe. Ein Schlüssel
genügt — der Router nimmt ihn automatisch in die Kette auf, sobald die
Umgebungsvariable gesetzt ist. **Kein Abo, keine Karte, kein Vertrag.**

| Anbieter | Umgebungsvariable | Wofür er gut ist |
|---|---|---|
| **Groq** | `SMEJJ_LLM_GROQ_API_KEY` | schon gesetzt — sehr schnell, gpt-oss |
| **Zhipu** | `SMEJJ_LLM_ZHIPU_API_KEY` | schon gesetzt — GLM-5.2, das Qualitätsmodell |
| **Google Gemini** | `SMEJJ_LLM_GEMINI_API_KEY` | großzügige Gratisstufe, lange Kontexte |
| **Cerebras** | `SMEJJ_LLM_CEREBRAS_API_KEY` | sehr schnell, Llama 3.3 |
| **Mistral** | `SMEJJ_LLM_MISTRAL_API_KEY` | Gratisstufe, europäischer Anbieter |
| **OpenRouter** | `SMEJJ_LLM_OPENROUTER_API_KEY` | Sammelzugang, einige Modelle gratis |
| **Together** | `SMEJJ_LLM_TOGETHER_API_KEY` | Startguthaben |
| **NVIDIA** | `SMEJJ_LLM_NVIDIA_API_KEY` | Gratis-Kontingent |
| **SambaNova** | `SMEJJ_LLM_SAMBANOVA_API_KEY` | Gratisstufe |

> **Ehrlich dazu:** Konditionen ändern sich. Diese Liste sagt, welche Anbieter
> der Router *kennt* und dass sie zum Stand 05.09.2026 eine Gratisstufe hatten.
> Beim Anmelden steht die aktuelle Grenze auf der Seite des Anbieters — bitte
> dort nachsehen und **keine Zahlungsdaten hinterlegen**. Ohne hinterlegte Karte
> kann keine Rechnung entstehen.

## So verlängerst du die Kette

Für jeden Anbieter, den du hinzunehmen willst:

1. Beim Anbieter anmelden, in den Einstellungen einen API-Schlüssel erzeugen.
2. **Keine Zahlungsdaten hinterlegen.**
3. Im Zeabur-Portal beim Dienst **smejj-control** die Variable aus der Tabelle
   setzen.
4. Dienst **neu bauen** — ein Neustart zieht keine neue Umgebung.

Mehr ist nicht nötig. Der Router prüft beim Start, welche Schlüssel da sind,
und baut die Kette daraus. Es gibt keine zweite Stelle, an der etwas
eingetragen werden muss.

## Woran du siehst, dass es gewirkt hat

Die Umgebungs-Wache (Autopilot Nr. 71) nennt die Kettenlänge in **jeder**
Meldung:

```
… Kette 5/14 Anbieter besetzt (groq, zhipu, gemini, mistral, cerebras)
```

Unter drei Gliedern steht dort stattdessen:

```
… ACHTUNG: nur 2 von 14 Anbietern hat einen Schlüssel — fällt einer aus, steht der Chat
```

## Was NICHT hilft

- **Mehr Modelle beim selben Anbieter.** Fällt der Anbieter aus, fallen alle
  seine Modelle mit. Ein Glied ist ein *Anbieter*, kein Modell.
- **Kostenpflichtige Stufen.** Die Kette wird davon nicht länger, nur teurer.
- **Ein eigenes Modell allein.** Es ist ein wertvolles letztes Glied, aber es
  braucht eine GPU und ist damit langsamer und teurer als eine fremde
  Gratis-API. Es gehört ans Ende der Kette, nicht an den Anfang.

## Was das eigene Modell dabei ist

`smejj-1-1` ist trainiert und liegt auf e2. Sobald es die Messung besteht,
hängt der Versions-Takt (Nr. 83) den Alias `smejj` darauf. Es wird damit ein
weiteres Glied — das einzige, das niemandem sonst gehört.
