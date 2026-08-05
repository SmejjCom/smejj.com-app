# Freigabe: Control-Release — Einwilligungs-Endpunkt und Fragen-Erfassung

**Datum:** 2026-08-05
**Erteilt von:** Wof Kadavanich (Betreiber)

## Wortlaut

> „Freigabe Control-Release: Einwilligungs-Endpunkt und Fragen-Erfassung,
> 2026-08-05"

Zusaetzlich zuvor erteilt: „Ja, der Env-Wert steht" — Bestaetigung, dass
`SMEJJ_TRAINING_PRIVACY_NOTICE_SHA256` auf den neuen Hash gesetzt wurde.

## Was freigegeben ist

1. **Control-Release** mit `GET /api/training/consent/notice`. Der Endpunkt
   veroeffentlicht den geltenden Datenschutzhinweis (Hash und Ort) ohne
   Anmeldung. Ohne ihn ist eine Einwilligung technisch unerreichbar: der
   Grant-Endpunkt vergleicht den vom Klienten gesendeten Hash und antwortet
   sonst 409.
2. **Auslieferung der geaenderten Datenschutzerklaerung.** Abschnitt 10 nennt
   jetzt ausdruecklich die an den Assistenten gerichteten Fragen — ohne die
   Antworten, da diese von Fremdmodellen stammen.

       alter Hash  d0172df62819934b0f8a0610985b5026185b86d527635bc596f54785019aeeb2
       neuer Hash  89cccf58e723113c0b9a4e17290e3136885f082bf9094238f69f6236258d4c8b

3. **Oberflaechen-Schalter**, der eine echte, serverseitig signierte
   Einwilligung erteilt und widerruft.

## Was NICHT freigegeben ist

* Die Erfassung selbst laeuft weiter nicht: `SMEJJ_TRAINING_CAPTURE_ENABLED`
  bleibt aus, und die Erfassungs-Route ist noch nicht gebaut.
* Kein Rueckbau bestehender Funktionen, keine neuen laufenden Kosten.

## Folge fuer bestehende Einwilligungen

Sie sind an den alten Hash gebunden und werden mit der Umstellung ungueltig.
Nutzer muessen neu einwilligen. Das ist gewollt: eine Einwilligung gilt fuer den
Text, den der Nutzer gelesen hat.

## Rueckweg

Zwei Werte am Salad-Container `smejj-control`: `SMEJJ_CONTROL_ARTIFACT_KEY` und
`SMEJJ_CONTROL_ARTIFACT_SHA256` auf den vorherigen Stand zuruecksetzen. Die
Container-Beschreibung wird vor dem PATCH gesichert.
