# Freigabe: Ein Widerruf war eine Einbahnstrasse (2026-08-08)

## Wortlaut des Betreibers

> Freigabe smejj.com, 2026-08-08:
>
> Behebe, dass nach einem Widerruf keine neue Einwilligung mehr möglich
> ist (HTTP 503). Ein Widerruf soll die alte Einwilligung beenden, aber
> eine spätere neue nicht verhindern. Der Fehlerfall soll ausserdem eine
> lesbare Begründung liefern statt "Dienst nicht verfügbar".
>
> Dafür darfst du die Dateien des Einwilligungs-Locks ändern
> (consent.js, trainingConsentRoutes.js). Alle Schutzstufen bleiben:
> ohne Einwilligung wird nichts erfasst, ein Widerruf wirkt sofort.
>
> Danach live nachmessen und den Change-Lock neu einfrieren.

## Der Fehler

Live gemessen auf einem **frischen** Konto (also nicht Altlast einer
Testkennung): einwilligen → widerrufen → erneut einwilligen ergab **HTTP 503
`consent_request_failed`**.

`consentDecision()` sortierte die Ledger-Eintraege chronologisch — und benutzte
die Sortierung dann **nicht**. Der Code suchte lediglich, ob *irgendwo* ein
Widerruf steht:

```js
const revocation = [...verified].reverse().find((entry) => (
  entry.eventType === "revoke" || entry.eventType === "revocation-sentinel"
));
if (revocation) { /* status: "revoked" */ }
```

Eine spaetere Einwilligung wurde dadurch nie erreicht. Sie wurde geschrieben,
sofort ueberstimmt, und `handleGrant` warf `consent_grant_resolution_failed`.
Dieser Code stand in keiner Fehlerliste und fiel in den Sammelfall — beim
Nutzer kam „Dienst nicht verfuegbar" an, waehrend der Dienst tadellos lief.

Das widersprach zugleich der eigenen Zusage der Oberflaeche: „Jederzeit
widerrufbar" verspricht ein Zurueck.

## Die Behebung

Es entscheidet jetzt der **juengste** Vorgang, nicht die blosse Existenz eines
Widerrufs.

**Fail-closed bleibt, und zwar an der heikelsten Stelle:** Bei **gleichem
Zeitstempel** gewinnt der Widerruf. Sonst entschiede die Sortierung nach
`eventId` — also faktisch der Zufall — darueber, ob personenbezogene Daten
erfasst werden duerfen. Diese Muenze darf nicht geworfen werden.

Der Fehlerfall meldet jetzt **409 `consent_grant_not_effective`** statt 503:
ein Zustandskonflikt ist kein Ausfall, und der Unterschied gehoert gesagt.

## Nachweise

Zwei neue Waechter in `tests/training-consent.test.mjs`. Der erste **faellt
ohne den Fix** (nachgemessen, indem `consent.js` zurueckgenommen wurde):

- „nach einem Widerruf ist eine NEUE Einwilligung wieder moeglich" — prueft
  zusaetzlich, dass der Beleg auf die neue Einwilligung zeigt, und dass die
  Reihenfolge der Eintraege im Ledger egal ist.
- „bei gleichem Zeitstempel gewinnt der Widerruf" — in beiden Anordnungen.

Lokal: `check:training` 135/135, Release-Baum 52/52,
`check:release-imports` OK (191 Dateien transitiv).

**Live gemessen** nach Version 168:

```
1. einwilligen        -> 201
2. widerrufen         -> 200
3. ERNEUT einwilligen -> 201
```

Und die volle Kette (`scripts/diagnose/erfassung-kette.mjs`): **alle sieben
Glieder halten** — Hinweis, Einwilligung, Erfassung, Ablage, Abwehr der
Befehlsform, Widerruf, Sperre danach.

## Change-Lock

Die Sperre hat vor dem Neu-Einfrieren **genau die zwei geaenderten Dateien
gemeldet** und keine andere — der Beleg, dass der Umfang eingehalten wurde.
Neu eingefroren am 2026-08-09T07:33:05.048Z, 7 Dateien.

## Zwei Nebenbefunde

**Das Zeitlimit des Upload-Skripts ist gedeckelt.** `IDRIVE_E2_RELEASE_TIMEOUT_MS`
wird in `upload_control_release_to_idrive.mjs:98` still auf **maximal 120 s**
gekuerzt. Drei Uploads liefen in diese Grenze; der vierte ging durch. Wer 300 s
setzt, bekommt trotzdem 120 — ohne Hinweis. Nicht geaendert (ausserhalb dieser
Freigabe), aber notiert.

**Ein fehlgeschlagener Upload ist per Listing nicht pruefbar.** Der Eimer
`smejj-model-files` hat kein Listenrecht; die Pruefung muss ein gezieltes GET
sein — und zur Kontrolle ein GET auf ein Artefakt, das nachweislich existiert.
Genau so liess sich hier belegen, dass der Upload wirklich fehlte und nicht die
Messung blind war.

## Ruecknahme

Voriger Stand: `smejj-control-ablage-timeout-2026-08-08.tar.gz`.
Achtung: dort ist der Widerruf wieder eine Einbahnstrasse.
