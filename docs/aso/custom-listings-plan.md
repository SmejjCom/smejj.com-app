# Custom Store Listings mit Keyword-Targeting — angelegt 2026-09-20

**Status: fünf Einträge liegen als ENTWURF in der Konsole.** Entwürfe sind nicht veröffentlicht und
nicht Teil einer laufenden Überprüfung — sie gehen erst mit „Speichern" in die
Veröffentlichungs-Übersicht und von dort zur Prüfung.

## Was angelegt wurde

| Referenzname | Keywords | App-Name im Eintrag | Kurzbeschreibung |
|---|---|---|---|
| csl-coding | 25 | smejj.com: AI Coding Agent | Autonomous AI coding agent: writes, runs and tests code until the task is done. |
| csl-browser | 15 | smejj.com: AI Browser Agent | AI agent that works in its own browser: automate web tasks, replay every step. |
| csl-chat | 15 | smejj.com: AI Chat Assistant | AI chat with web search and sources, thinking mode, voice — and it writes code. |
| csl-create | 15 | smejj.com: AI Image & Video | Create images and narrated videos from a text description — plus AI chat. |
| csl-voice | 15 | smejj.com: AI Voice Assistant | Talk to your AI: full voice mode, hands free — plus chat, code and video. |

Zusammen **85 Keywords**. Alle Einträge: Zielgruppe „Keyword für Suchanzeigen", ohne Länderfilter,
ohne Enddatum, **50 % der Zielgruppe**.

## Warum 50 % und nicht 100 %

Google empfiehlt 50 %, und der Prozentsatz lässt sich später **erhöhen, aber nie senken**. Bei
50 % sieht die Hälfte der Suchenden den zugeschnittenen Eintrag, die andere Hälfte den Standard —
genau das macht später messbar, ob der Zuschnitt wirklich besser wandelt. Ein Sprung auf 100 %
wäre unumkehrbar und würde diese Vergleichsmöglichkeit zerstören, bevor auch nur ein Besucher da
war. Sobald Zahlen vorliegen und der Zuschnitt gewinnt, kann man hochsetzen.

## Keine Fremdmarken

Bewusst NICHT als Keyword verwendet: chatgpt, claude, gemini, copilot, cursor, perplexity und
jede andere fremde Marke. Das verstößt gegen die Google-Play-Metadatenrichtlinie.

## Nächste Schritte

1. Freigabe der am 20.09. eingereichten 62 Änderungen abwarten.
2. Danach je Eintrag „Speichern" und zur Überprüfung einreichen.
3. Nach 2–4 Wochen mit echten Besuchern: Conversion je Eintrag vergleichen, Gewinner auf 100 %
   hochsetzen, Verlierer überarbeiten.
4. Erst wenn Impressionen aus einem Land sichtbar sind, lohnen eigene Einträge je Sprache.

## Wie die Konsole dabei zu bedienen war
- Der Assistent ist nur über die direkte Adresse `…/store-listings/custom/create` erreichbar;
  die Knöpfe auf der Übersichtsseite navigieren nicht zuverlässig.
- Das „Eintrag auswählen"-Menü öffnet oft erst beim ZWEITEN echten Klick.
- Keywords: `element.value` per JavaScript zu setzen reicht NICHT — Angular übernimmt den Wert
  nicht, „Keywords hinzufügen" bleibt dann wirkungslos. Der Text muss echt getippt werden.
- Die Zähler-Zeile „Ausgewählte Keywords (n/500)" steht unterhalb des sichtbaren Bereichs;
  ohne Scrollen sieht man fälschlich 0.
