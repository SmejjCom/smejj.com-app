# Play-Console-Konto A bis Z — 20.09.2026 (nach der Ablehnung)

Konto 8686155781561156147 (iMild LLC), App `com.smejj.app`.

## Konto-Ebene

| Bereich | Stand |
|---|---|
| Richtlinienstatus Konto | „Es wurden keine Probleme mit deinem Entwicklerkonto festgestellt." |
| Identitätsbestätigung für Android-Entwickler | „Alle deine Apps wurden registriert" — erfüllt |
| Nutzer und Berechtigungen | 1 Nutzer, 0 Berechtigungsgruppen, 0 E-Mail-Empfänger |

## App-Ebene

| Bereich | Stand |
|---|---|
| Richtlinienstatus App | Verstoß (KI-Inhalte) noch gelistet, Google meldet aber: „Du hast Änderungen vorgenommen, durch die einige dieser Verstöße möglicherweise behoben werden" |
| Veröffentlichungen | **6 Änderungen am 20.09. zur Überprüfung eingereicht** (Titel, Kurz-, Langbeschreibung, Screenshots Telefon/7"/10") |
| App-Inhalte | „Alles erledigt" |
| Produktion | Release 1 (1.0.0.0) aktiv, 177 Länder, 100 % Einführung, **0 Installationen** |
| Formfaktoren | Smartphones, Tablets, Chrome OS, Android XR |
| Android Vitals | keine Daten (keine Installationen) |
| Bewertungen | keine |
| Store-Einträge | nur der Standardeintrag, **0 benutzerdefinierte Einträge** |
| Besucher / Klicks (28 Tage) | 0 / 0 |

## Mit Google Play geschützt — „Guter Schutz"

| Gruppe | Stand |
|---|---|
| App-Signaturschlüssel / inoffizielle Versionen | 1 von 1 aktiv |
| Sichere Apps + Store-Präsenz | 6 von 7 aktiv — **aus: „Installationen auf riskanten Geräten verhindern"** |
| Verdächtige Geräte erkennen (Play Integrity API) | **0 von 7 aktiv** |
| Betrug und Missbrauch | **0 von 4 aktiv** |

Play App Signing, Play-Protect-Scan, SDK-Scan, Spamschutz, Anomalieschutz und Fairness-Schutz sind fest an.

## Befund mit dem größten ASO-Hebel

**Nur en-US trägt den neuen Titel.** Die übrigen 27 Sprachen stehen weiter auf dem alten Stand,
Beispiel Deutsch: „smejj.com: KI-Chat & Coding" / „KI-Coding-Agent & Chat-Assistent — suchen,
coden, browsen, erstellen." Wer in Deutschland sucht, sieht also den alten Auftritt.

Nicht jetzt geändert: Jede Metadaten-Änderung bricht die laufende Überprüfung ab und startet sie
neu. Erst nach der Freigabe nachziehen.

## Offen, nach Priorität

1. Freigabe der 6 Änderungen abwarten (bis 7 Tage).
2. Danach: Titel und Kurzbeschreibung in den 27 Sprachen nachziehen (Markenname `smejj.com` in
   jeder Sprache zurücksetzen — Koreanisch machte daraus schon einmal „스메지닷컴").
3. Danach: Custom Store Listings anlegen (`docs/aso/custom-listings-plan.md`).
4. Screenshots zeigen die deutsche Oberfläche im englischen Eintrag — neu aufnehmen.
5. Entscheidung Betreiber: „Installationen auf riskanten Geräten verhindern" einschalten?
   Erhöht die Sicherheit, verringert aber die Reichweite — steht gegen das Ziel „möglichst viele
   Installationen". Darum nicht eigenmächtig aktiviert.
6. Entscheidung Betreiber: Play Integrity API (0/7) und Betrugsschutz (0/4) brauchen Aufrufe IN
   der App. Die App ist eine TWA — das ginge nur mit einem nativen Rebuild (Keystore nötig).

## Nachtrag 20.09. abends — Sprachen nachgezogen und alles eingereicht

Der Verstoß gegen die KI-Inhalte-Richtlinie steht seit **20.09. 16:27 auf „Verstoß behoben"**.
Die Einreichung um 16:02 war noch abgelehnt worden, weil die Beanstandung zu dem Zeitpunkt
offen war — nicht wegen eines neuen Mangels.

Danach alle Sprachen nachgezogen: **29 Store-Einträge** (en-US + 28 Übersetzungen) tragen jetzt
Titel und Kurzbeschreibung im neuen Schnitt. Beim Durchgehen kam eine Sprache dazu, die in der
ersten Zählung fehlte: **Spanisch (Lateinamerika), es-419**.

Eingereicht: **62 Änderungen** = 29 Titel + 29 Kurzbeschreibungen + Langbeschreibung +
Screenshots Telefon/7"/10". Vor dem Absenden geprüft: **keine einzige Zeile „Sprache entfernen"**.

Texte liegen in `docs/aso/sprachen-titel-kurz.json` (Titel ≤ 30, Kurzbeschreibung ≤ 80,
Markenname `smejj.com` in jedem Titel unübersetzt).

### Wie die Konsole dabei zu bedienen war
- Der Sprachwechsel reagiert **nicht** auf `element.click()` aus JavaScript (Material-Menü).
  Was geht: echter Mausklick auf den Sprach-Chip, dann `Up`×32 (ganz nach oben) und `Down`×N
  auf die Zielsprache, dann `Enter`.
- Bildschirm- und Seitenkoordinaten unterscheiden sich um den Faktor 1,201 (1219 / innerWidth).
- „Als Entwurf speichern" hält Änderungen aus der Veröffentlichungs-Übersicht heraus. Erst ein
  einziges „Speichern" am Ende übernimmt den gesamten Entwurf **aller** Sprachen auf einmal —
  aus 6 Zeilen wurden so 62.
