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

---

## NACHTRAG 2026-08-05: Ausrollen angehalten — Konfiguration fehlt vollstaendig

Die Freigabe wurde erteilt und das Artefakt gebaut und hochgeladen:

    deployments/control/consent-endpunkt-2026-08-05.tar.gz
    sha256 af8ca7992f920a7016c5b9bd2e2fcbcb484d558bbeb27d9b14da3c927a90d9dd
    2.417.115 Bytes, 1031 Dateien, secretsIncluded: false, immutable

**Der Salad-PATCH wurde NICHT ausgefuehrt.** Die Pruefung der Container-Umgebung
(85 Werte, Sicherung unter /tmp/smejj-control-sicherung.json) ergab:

    FEHLT   SMEJJ_TRAINING_CONSENT_API_ENABLED
    FEHLT   SMEJJ_TRAINING_PRIVACY_NOTICE_SHA256
    FEHLT   SMEJJ_TRAINING_CONSENT_SIGNING_KEY_ID
    FEHLT   SMEJJ_TRAINING_CONSENT_SIGNING_KEY_B64
    FEHLT   SMEJJ_TRAINING_CONSENT_BINDING_KEY_ID
    FEHLT   SMEJJ_TRAINING_CONSENT_BINDING_KEY_B64

Es ist KEIN einziger `SMEJJ_TRAINING_*`-Wert gesetzt. Die Einwilligungs-API war
auf diesem Container nie konfiguriert — es fehlt nicht nur der neue Hash.

Ein Ausrollen haette einen Endpunkt geliefert, der dauerhaft 503
`consent_configuration_incomplete` antwortet (fail-closed, wie gebaut), und eine
Oberflaeche, die jedem Nutzer "Einwilligung derzeit nicht moeglich" zeigt. Das
waere kein ausgeliefertes Feature, sondern ein sichtbarer Fehlzustand.

**Die beiden Schluesselpaare kann und darf der Agent nicht erzeugen:** das ist
Schluesselmaterial (Zugangs-Lock, Rote Liste). Sie muessen zudem VERSCHIEDEN
sein — `trainingConsentConfig` prueft die Schluesseltrennung und meldet sonst
`ready: false`.

Das Artefakt bleibt unveraendert liegen und ist jederzeit ausrollbar, sobald die
sechs Werte gesetzt sind.
