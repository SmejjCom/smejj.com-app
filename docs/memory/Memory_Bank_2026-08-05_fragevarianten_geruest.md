## 2026-08-05 — Geruest fuer Fragevarianten gebaut (Schritt 2, Empfehlung 1)

`training-fragen/varianten.json` (leer ausgeliefert) +
`src/training/projectcorpus/fragevarianten.js` + `npm run training:fragen-pruefen`,
in `check:training` verdrahtet. 9 Tests.
- **DIE REGEL RICHTET SICH AUCH GEGEN MICH:** ich bin selbst ein Fremdmodell.
  Haette ich die Varianten geschrieben, waeren sie modellerzeugt — genau das,
  was die Trainingsdaten-Policy sperrt. Das Geruest wird darum LEER
  ausgeliefert, und `herkunft` ist Pflichtfeld: nur `hand` und `nutzerfrage`,
  alles andere faellt fail-closed durch (Exit-Code 1, live geprueft).
- Drei Pruefungen: Herkunft, Form (Wortueberlappung < 0,7 zwischen Varianten;
  Antwortverrat; Laenge; Fragezeichen) und ANSCHLUSS an einen real vorhandenen
  Korpusabschnitt.
- **ANTWORTVERRAT braucht ZWEI Bedingungen.** Eine feste Wortzahl allein taugt
  nicht: jede gute Frage nennt ihr Thema, und das Thema steht auch in der
  Antwort. Verraeterisch ist erst eine lange gemeinsame Folge, die zugleich
  ueber die Haelfte der FRAGE ausmacht — dann ist die Frage die umgestellte
  Antwort.
- **STILLER FEHLER, den die eigene Probe fing:** die Korpuszeile hat KEIN Feld
  `ueberschrift`, sondern eine Kennung `pfad#ebene-slug-index`. Der erste
  Anschlusspruefer fand deshalb 0 Fakten und haette jeden Eintrag als verwaist
  gemeldet. MERKREGEL: **ein Pruefer, der nichts findet, ist nicht
  automatisch ein Pruefer, der nichts zu beanstanden hat** — erst gegen echte
  Daten gegenpruefen. Jetzt 705 Fakten erkannt; `slug` wird geteilt statt kopiert.
