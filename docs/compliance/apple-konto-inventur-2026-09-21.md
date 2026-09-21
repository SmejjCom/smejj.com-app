# Apple-Konto A bis Z (Stand 21.09.2026, im Browser nachgemessen)

Nicht aus dem Gedächtnis, sondern Feld für Feld in App Store Connect und im
Entwicklerportal abgelesen.

## Der Kernbefund

**Apple prüft gerade nichts.** Die Version steht auf „In Vorbereitung zur
Übermittlung", die Einsendung vom 20.09. (Kennung f696cf68…) steht auf
„Nicht behobene Probleme / Abgelehnt". Die App liegt also bei UNS, nicht bei
Apple. Warten bringt nichts — erst wenn wir antworten und „Prüfung
aktualisieren" drücken, läuft wieder eine Uhr bei Apple.

## Grün — von unserer Seite fertig

| Bereich | Stand |
|---|---|
| Entwicklerkonto | iMild LLC, Team 443R27FNHX, aktiv bis 18.09.2027, Rolle Accountinhaber |
| Vereinbarungen | Developer Program License + Developer Agreement akzeptiert; **Vertrag für kostenlose Apps aktiv** (17.09.2026–17.09.2027) |
| Preis | kostenlos, 175 Länder, Steuerkategorie „App Store-Software" |
| App-Informationen | Name, Untertitel, Bundle-ID `com.smejj.app`, Kategorien Produktivität / Entwickler-Tools, Inhaltsrechte bejaht, DSA-Händler ausgewiesen |
| Altersfreigabe | 16+ (173 Regionen), Brasilien 16, Südkorea 15+, Fragebogen vollständig |
| App-Datenschutz | vor 3 Tagen **veröffentlicht**, 4 Datentypen, Datenschutz-URL `https://smejj.com/en/privacy` liefert 200 |
| Version 1.0 | Beschreibung 1.793 Z., Werbetext 166 Z., Schlüsselwörter 100/100 Z. voll, Copyright, Marketing-URL, Support-URL gesetzt |
| Screenshots | 4 Stück, iPhone 6,5", zeigen die App in Benutzung (2.3.3 erfüllt) |
| Build | **1.0 (2)** hängt an der Version und an der Einsendung |
| Anmerkungen für die Prüfung | 3.124 Zeichen, Punkte 2–6 vollständig |
| Demo-Konto | Haken „Anmeldung erforderlich" ist **aus** — korrekt, unsere Anmeldung ist passwortlos |
| TestFlight | Gruppe „Intern", Build 1 und 2 „Bereit zur Übermittlung" |

## Rot — was noch offen ist

**1. Das Video vom echten iPhone.** Apples Punkt 1, der einzige echte Blocker.
Simulator ist ausdrücklich nicht erlaubt. Drehbuch:
`docs/compliance/apple-video-drehbuch-2026-09-21.md`. Nur am Gerät machbar.

**2. Die Antwort an die App-Prüfung ist noch nicht abgeschickt.** Unter
Nachrichten steht genau eine Nachricht: die von Apple. Der Text liegt fertig in
`docs/compliance/apple-antwort-2.1-fertig.txt` und wartet auf das Video als Anhang.

**3. „Erneut zur App-Prüfung übermitteln" wurde nie gedrückt.** Nach Antwort +
Video ist das der Knopf, der die App wieder in Apples Schlange stellt.

**4. TestFlight zeigt 0 Installationen.** Apple schreibt in der Ablehnung
wörtlich, man solle den eingereichten Build vorher auf einem echten Gerät
testen. Beides erschlägt derselbe Handgriff: TestFlight-App aufs iPhone,
Build 2 laden, durchspielen, dabei filmen.

**5. Richtlinie 4.8 „Mit Apple anmelden" fehlt weiterhin.** Live nachgemessen:
`https://api.smejj.com/api/auth/config` meldet `"apple": false`, während
`google` und `github` auf `true` stehen. Wer Google und GitHub anbietet, muss
auch Apple anbieten. Es gibt keinen toten Knopf (der Server meldet ehrlich
`false`), aber es ist der wahrscheinlichste Grund für eine zweite
Ablehnungsrunde. Fertig gebaut, Schlüssel `AuthKey_5833LBVT26.p8` liegt in
Downloads — es fehlen vier Zeabur-Variablen: **Doppelklick
„smejj.com Apple-Login fertigstellen.command"**.

## Gelb — Hinweise, kein Blocker

* **Support-URL zeigt auf `https://imild.com`** — die Firmen-Startseite, ohne
  ein Wort über smejj.com. Apple erwartet unter der Support-URL Hilfe zu
  *dieser* App (Richtlinie 1.5). `smejj.com/support` und `smejj.com/en/support`
  sind 404. Kleines Risiko, billig zu beheben.
* **Veröffentlichung steht auf „automatisch, frühestens 21.09.2026 19:00"**.
  Da der Termin bis zur Genehmigung längst vorbei ist, wird sofort
  veröffentlicht — kein Fehler, aber „automatisch nach der App-Prüfung" wäre
  sauberer.
* **Fragebogen: „Benutzergenerierte Inhalte = Nein"**. Vertretbar (Chats sind
  privat), aber wir haben Teilen-Links (`/m/…`) und eine Melde-Funktion. Wenn
  ein Prüfer das anders sieht, ist es ein Widerspruch. Bewusst nicht geändert —
  eine Änderung hebt womöglich die Altersfreigabe.
* **Vertrag für gebührenpflichtige Apps: „Neu"** (nicht unterschrieben). Für
  eine kostenlose App ohne In-App-Käufe nicht nötig.

## Reihenfolge

1. Doppelklick „smejj.com Apple-Login fertigstellen.command" → 4.8 ist damit zu.
2. TestFlight aufs iPhone, Build 2 installieren, durchspielen **und dabei filmen**.
3. In ASC → App-Prüfung → „Auf App-Prüfung antworten": Text aus
   `apple-antwort-2.1-fertig.txt`, Video anhängen.
4. „Erneut zur App-Prüfung übermitteln".
