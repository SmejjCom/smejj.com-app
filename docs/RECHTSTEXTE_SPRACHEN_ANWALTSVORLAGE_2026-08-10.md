# Rechtstexte in 14 Sprachen — Vorlage für die anwaltliche Prüfung

Stand: 2026-08-10. Erstellt für die Kanzlei-Vorlage; ergänzt
[RELEASE_READINESS_RECHT_2026-08-09.md](RELEASE_READINESS_RECHT_2026-08-09.md).

**Was dieses Dokument ist:** eine vollständige, geprüfte Aufstellung aller
Textstellen der Oberfläche mit Zahlungs- und Vertragsbezug, die derzeit **nur
auf Deutsch** existieren — mit Wortlaut, Fundstelle, Anzeigeort und der Frage,
die dazu zu klären ist.

**Was es nicht ist:** eine Rechtsauskunft. Die Texte sind bewusst **nicht**
übersetzt worden. Eine Übersetzung von AGB-Bezeichnungen, Widerrufsbelehrung
und der Schaltfläche nach § 312j Abs. 3 BGB ist eine rechtliche Aussage, keine
Fleißarbeit — deshalb liegt sie hier zur Entscheidung vor, statt gemacht zu
sein.

---

## 1. Ausgangslage

- **Anbieter:** iMild LLC (Oakland, CA, USA), Zielmarkt Deutschland/EU.
- **Zahlungen:** über Stripe, derzeit im **Testmodus** (keine echten
  Abbuchungen). Stripe Tax ist aktiv, die USt wird im Checkout ausgewiesen.
- **Oberfläche:** wählbar in **15 Sprachen**. Deutsch ist die Quellsprache;
  14 Sprachdateien liegen vor (en, zh, es, ar, fr, pt, ru, tr, ja, ko, it, hi,
  id, bn).
- **Technischer Stand:** Die Oberfläche ist vollständig übersetzt — **außer**
  den in Abschnitt 3 aufgeführten Stellen. Diese erscheinen einem Nutzer mit
  türkischer, japanischer, arabischer usw. Oberfläche auf Deutsch.
- Seit dem 2026-08-10 bewacht ein automatischer Test, dass neue Texte
  übersetzt werden (`tests/i18n-ui.test.mjs`); die Stellen aus Abschnitt 3.3
  und 3.4 stehen dort als begründete Ausnahmen und fallen heraus, sobald sie
  übersetzt sind.
- Die Stellen aus 3.1 und 3.2 — darunter die Schaltfläche nach § 312j — waren
  bis zum 2026-08-10 unbemerkt unübersetzt, weil sie nicht als Text im Code
  stehen, sondern als Argument einer Hilfsfunktion übergeben werden; der
  damalige Test sah nur direkte Texte. Gefunden wurden sie beim Erstellen
  dieser Vorlage. Der Test wurde noch am selben Tag um genau diesen Fall
  erweitert und erfasst jetzt **alle** hier gelisteten Stellen.

## 2. Die Fragen, um die es geht

1. **Sprachpflicht:** Müssen die Pflichtangaben (Schaltflächenbeschriftung nach
   § 312j Abs. 3 BGB, Preis-/Laufzeitangaben, AGB, Widerrufsbelehrung) in der
   Sprache vorliegen, in der die Oberfläche dem Verbraucher angezeigt wird —
   oder genügt Deutsch, solange der Vertrag deutschem Recht unterliegt und
   sich das Angebot an den deutschen Markt richtet?
2. **Wenn Übersetzung nötig:** Welche Fassung ist im Streitfall maßgeblich, und
   welcher Vorranghinweis gehört in AGB und Widerrufsbelehrung?
3. **Widerrufsbelehrung:** Ist das gesetzliche Muster in der jeweiligen
   Zielsprache zu verwenden (amtliche Fassungen der EU-Mitgliedstaaten), oder
   ist eine Übersetzung des deutschen Musters zulässig?
4. **Nicht-EU-Sprachen:** Für Sprachen ohne EU-Bezug (z. B. ja, ko, zh, hi, bn,
   id) — soll dort überhaupt ein Zahlungsangebot erscheinen, oder ist der
   Verkauf auf bestimmte Länder zu beschränken?
5. **§ 312j-Schaltfläche:** Genügt eine wörtliche Übersetzung von
   „Zahlungspflichtig abonnieren", oder ist je Sprache eine etablierte
   Formulierung vorgeschrieben bzw. empfohlen?

## 3. Die betroffenen Textstellen (20)

Die Zahlungs-Oberfläche existiert **zweimal**: in der Ansicht **Konto →
Abo & Zahlungen** (`public/account-privacy.js`, Abschnitte 3.1 bis 3.4) und im
**Willkommens-Overlay für Neunutzer** (`public/onboarding-welcome.js`,
Abschnitt 3.5). Der Wortlaut ist unverändert aus dem Quellcode übernommen.

### 3.1 Schaltfläche nach § 312j Abs. 3 BGB — höchste Priorität

| | |
|---|---|
| Wortlaut | **Zahlungspflichtig abonnieren** |
| Fundstelle | `account-privacy.js:132` (dreimal: Plus, Pro, Max) |
| Anzeigeort | Beschriftung der Bestellschaltfläche je Tarif |

Das ist die Schaltfläche, an der die Zahlungspflicht erkennbar sein muss. Sie
ist derzeit in allen 14 Fremdsprachen deutsch beschriftet.

### 3.2 Preis-, Laufzeit- und Kündigungsangaben

| Nr. | Wortlaut | Fundstelle |
|---|---|---|
| 1 | Alle Preise sind Gesamtpreise pro Monat inkl. gesetzlicher Umsatzsteuer. Das kostenpflichtige Abo hat eine Laufzeit von einem Monat und verlängert sich automatisch um jeweils einen weiteren Monat, bis du kündigst. Jederzeit zum Ende des bezahlten Monats kündbar. | `:132` |
| 2 | 1 000 Nachrichten, Premium-Stimme, schnellere Antworten. Gesamtpreis 9 € pro Monat inkl. USt. | `:132` |
| 3 | Unbegrenzte Nachrichten, Coding-Agent & Projekte. Gesamtpreis 19 € pro Monat inkl. USt. | `:132` |
| 4 | 5× Limits, früher Zugriff auf Neues, direkter Support. Gesamtpreis 39 € pro Monat inkl. USt. | `:132` |

Die Tarifnamen selbst („Plus — 9 € / Monat" usw.) **sind** übersetzt; nur die
Beschreibungen mit der Preis- und Umsatzsteuerangabe sind es nicht.

### 3.3 Stripe-Hinweis und Rechtstext-Verweise

| Nr. | Wortlaut | Fundstelle |
|---|---|---|
| 5 | Mit „Zahlungspflichtig abonnieren" wirst du zum Zahlungsdienstleister Stripe weitergeleitet und schließt dort ein kostenpflichtiges Abo ab. Kartendaten liegen ausschließlich bei Stripe, nie auf smejj-Servern. Es gelten unsere | `:132` |
| 6 | AGB | `:132` (Linktext auf `/agb.html`) |
| 7 | und die | `:132` (Bindeglied) |
| 8 | Widerrufsbelehrung | `:132` (Linktext auf `/widerruf.html`) |
| 9 | Aktuell Stripe-TESTMODUS: Buchungen sind Proben ohne echte Abbuchung (Testkarte 4242 4242 4242 4242). Echt geschaltet wird nach der Stripe-Konto-Aktivierung. | `:132` |

**Technischer Hinweis, der die Übersetzung betrifft:** Nr. 5 bis 8 ergeben im
Browser **einen zusammenhängenden Satz**, sind im Code aber vier getrennte
Bausteine, weil zwei davon Links sind:

> [5] *Es gelten unsere* → **[6] AGB** → [7] *und die* → **[8]
> Widerrufsbelehrung**.

Eine wortweise Übersetzung der Bausteine ergibt in Sprachen mit anderer
Wortstellung keinen brauchbaren Satz. Für die Übersetzung sollte der
**Gesamtsatz** vorgegeben werden; die technische Umsetzung wird dann so
angepasst, dass die Reihenfolge je Sprache frei wählbar ist.

### 3.4 Kündigungswege (§ 312k BGB)

| Nr. | Wortlaut | Fundstelle |
|---|---|---|
| 10 | Verträge hier kündigen | `:132` (Beschriftung des Kündigungs-Elements) |
| 11 | Kündigung: Im Stripe-Kundenportal kannst du dein Abo sofort kündigen. | `:282` |
| 12 | Kündigung: Eine vorbereitete E-Mail wurde geöffnet. Wir bestätigen den Eingang und das Vertragsende in Textform. | `:300` |
| 13 | Kündigung meines smejj.com Abonnements *(Betreff der E-Mail)* | `:292` |
| 14 | Hiermit kündige ich mein kostenpflichtiges smejj.com Abonnement zum nächstmöglichen Zeitpunkt. *(Text der E-Mail)* | `:296` |

Nr. 11 erscheint, sobald der Stripe-Portal-Link hinterlegt ist; Nr. 12 bis 14
gehören zum derzeit aktiven Notweg (siehe Abschnitt 4.2).

### 3.5 Willkommens-Overlay (Onboarding) — zweite Zahlungs-Oberfläche

Das Overlay erscheint Neunutzern beim ersten Besuch — also **vor** der
Konto-Ansicht. Es trägt dieselbe Schaltfläche und einen **eigenen, abweichend
formulierten** Fineprint (`public/onboarding-welcome.js`):

| Nr. | Wortlaut | Fundstelle |
|---|---|---|
| 15 | Zahlungspflichtig abonnieren *(dreimal: Plus, Pro, Max — identisch mit 3.1)* | `:66-68` |
| 16 | Alle Preise sind Gesamtpreise pro Monat inkl. gesetzlicher Umsatzsteuer. Monatliche Laufzeit, verlängert sich automatisch, jederzeit zum Monatsende kündbar. Zahlung über Stripe; es gelten | `:70` |
| 17 | AGB *(Linktext auf `/agb.html`)* | `:70` |
| 18 | und *(Bindeglied — hier „und", im Konto „und die")* | `:70` |
| 19 | Widerrufsbelehrung *(Linktext auf `/widerruf.html`)* | `:70` |

**Wortlaut-Divergenz, die die Kanzlei kennen sollte:** Der Onboarding-Fineprint
(Nr. 16) und die Konto-Fassung (Nr. 1) beschreiben dasselbe Abo mit
unterschiedlichen Kündigungsformulierungen — „jederzeit zum Monatsende
kündbar" gegenüber „jederzeit zum Ende des **bezahlten** Monats kündbar".
**Zusatzfrage:** Sollen beide Oberflächen auf einen einheitlichen Wortlaut
gebracht werden, und welcher ist der richtige?

Dieser Abschnitt fehlte in der ersten Fassung dieser Vorlage: das Overlay war
weder vom Übersetzungs-Wächter erfasst noch in der Aufstellung — gefunden bei
der Gegenprüfung am 2026-08-10. Der Wächter deckt die Datei seither ab; die
reinen Bedientexte des Overlays (Begrüßung, Free-Hinweise, Tarif-Kurzformen
ohne Preisangabe) sind übersetzt, die fünf obigen Stellen warten auf die
Kanzlei.

## 4. Drei Punkte, die über die Textstellen hinausgehen

### 4.1 Die verlinkten Dokumente selbst gibt es nur auf Deutsch

Die Links unter Nr. 6/8 und 17/19 zeigen fest auf `/agb.html` und
`/widerruf.html` — **unabhängig von der eingestellten Sprache**. Beide
Dokumente existieren ausschließlich auf Deutsch, und beide sind **derzeit
nicht öffentlich erreichbar**: die Seiten liegen im Repository, ihr Deploy
steht noch aus — live antworten beide Adressen mit 404, während die
verweisenden Links bereits ausgeliefert sind. Wer die Links heute prüft,
findet also tote Ziele; das ist ein bekannter Zwischenzustand des laufenden
Rechts-Pakets, kein Versehen dieser Vorlage. Vorhanden (im Repository) sind:

| Dokument | Sprachen |
|---|---|
| AGB (`agb.html`) | nur Deutsch |
| Widerrufsbelehrung (`widerruf.html`) | nur Deutsch |
| Impressum (`impressum.html`, `/en/legal-notice.html`) | Deutsch, Englisch |
| Datenschutz (`datenschutz.html`, `/en/privacy.html`) | Deutsch, Englisch |

Ein Nutzer mit türkischer Oberfläche klickt also auf einen türkisch
beschrifteten Link (nach der Übersetzung) und landet auf einem deutschen
Dokument. Die Frage nach der Sprachpflicht betrifft damit nicht nur die
Beschriftungen, sondern vor allem diese vier Dokumente.

### 4.2 Die Kündigungs-E-Mail — Technik vorbereitet, Wortlaut offen

Solange kein Stripe-Kundenportal-Link hinterlegt ist, öffnet der
Kündigungs-Knopf eine vorformulierte E-Mail (`account-privacy.js:292-298`):

> Betreff: `Kündigung meines smejj.com Abonnements`
> Text: `Hiermit kündige ich mein kostenpflichtiges smejj.com Abonnement zum
> nächstmöglichen Zeitpunkt.` + Felder für Konto-E-Mail, Name, Datum

Ein Verbraucher mit nicht-deutscher Oberfläche bekommt damit eine deutsche
Kündigungserklärung vorgelegt, die er absenden soll. **Frage:** Ist das mit der
Anforderung vereinbar, dass die Kündigung leicht zugänglich sein muss?

Betreff und Text sind seit dem 2026-08-10 **technisch übersetzbar** (Nr. 13 und
14 in Abschnitt 3.4): sie laufen durch dieselbe Übersetzungsschicht wie der
Rest der Oberfläche, es gibt bis auf Weiteres nur die deutsche Fassung, und
ohne Übersetzung fällt die Anzeige auf Deutsch zurück. Der heutige Zustand ist
also unverändert — sobald die Kanzlei Wortlaute liefert, ist nur noch ein
Eintrag je Sprache nötig, keine Codeänderung. Die **Feldnamen** (Konto-E-Mail,
Name, Datum) sind bereits in alle 14 Sprachen übersetzt; sie sind
Formularbezeichnungen, keine rechtliche Aussage.

### 4.3 Der Testmodus-Hinweis ist zeitlich begrenzt

Nr. 9 beschreibt den Stripe-Testbetrieb. Wird Stripe scharf geschaltet, muss
dieser Satz aus allen Sprachen wieder verschwinden. **Empfehlung:** ihn nicht
mitübersetzen, sondern beim Livegang ersatzlos entfernen — sonst steht ein
falscher Hinweis in 14 Sprachfassungen.

## 5. Zielsprachen

Deutsch ist Quellsprache. Zu klären ist die Übersetzung für:

| Amtssprache in der EU | Keine EU-Amtssprache |
|---|---|
| Englisch (en), Französisch (fr), Spanisch (es), Italienisch (it), Portugiesisch (pt) | Chinesisch (zh), Arabisch (ar), Russisch (ru), Türkisch (tr), Japanisch (ja), Koreanisch (ko), Hindi (hi), Indonesisch (id), Bengalisch (bn) |

Die Aufteilung ist ein Vorschlag zur Priorisierung, keine rechtliche
Einordnung — Frage 4 aus Abschnitt 2 gehört dazu. Weitere EU-Amtssprachen
(etwa Polnisch, Niederländisch, Bulgarisch) bietet die Oberfläche derzeit
nicht an; falls die Prüfung ergibt, dass die Sprache des Verbrauchers
maßgeblich ist, wäre auch das eine Frage der Marktabgrenzung.

## 6. Ablauf nach der Freigabe

1. Kanzlei liefert je Textstelle und Sprache den freigegebenen Wortlaut
   (Gesamtsatz für 3.3, siehe Hinweis dort).
2. Eintragung in `public/i18n/<sprache>.js`; der deutsche Text bleibt der
   Schlüssel und wird **nicht** verändert — schon ein abweichendes
   Anführungszeichen würde die Zuordnung stillschweigend lösen.
3. Für 3.3 zusätzlich eine kleine Codeänderung, damit die Satzreihenfolge je
   Sprache frei ist.
4. Übersetzte Fassungen von AGB und Widerrufsbelehrung als eigene Seiten, mit
   sprachabhängiger Verlinkung.
5. Die betroffenen Einträge fallen aus der Ausnahmeliste in
   `tests/i18n-ui.test.mjs`; der Test bewacht sie danach automatisch.
6. Auslieferung über den üblichen Weg (Cache-Version hochzählen, sonst sehen
   Bestandsnutzer die alten Fassungen).

## 7. Anhang: was ohne anwaltliche Prüfung übersetzt wurde

Am 2026-08-10 wurden 11 Meldungen in alle 14 Sprachen übersetzt, weil sie
reine Bedienhinweise ohne Vertragsbezug sind: Anmeldelink (wird gesendet /
gesendet / nicht erreichbar), GitHub-Login (startet / fehlgeschlagen),
Apple-Login-Hinweis sowie fünf Meldungen zur **Datenschutz-Einwilligung**
(erteilt, widerrufen, derzeit nicht möglich, Hinweis geändert, vom Server
abgelehnt).

Die fünf Einwilligungs-Meldungen sind Statusmeldungen der Oberfläche, keine
Einwilligungserklärung selbst — der erklärende Text stammt aus dem
Datenschutzhinweis. Falls die Kanzlei das anders sieht, ist die Rücknahme
einzelner Übersetzungen jederzeit möglich.
