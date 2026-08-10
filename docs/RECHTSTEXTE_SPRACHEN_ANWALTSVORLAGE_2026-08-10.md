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
- **Einschränkung, die zur Aufstellung gehört:** Die Stellen aus 3.1 und 3.2 —
  darunter die Schaltfläche nach § 312j — erreicht dieser Test **nicht**. Sie
  werden nicht als Text im Code übergeben, sondern als Argument einer
  Hilfsfunktion, und der Test sieht nur direkte Texte. Genau deshalb waren sie
  bis heute unbemerkt unübersetzt; gefunden wurden sie beim Erstellen dieser
  Vorlage durch eine gesonderte Auswertung. Der Test wird entsprechend
  erweitert — für die rechtliche Prüfung ändert das nichts, die Liste unten
  ist vollständig.

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

## 3. Die betroffenen Textstellen (13)

Alle Fundstellen in `public/account-privacy.js`, Ansicht **Konto →
Abo & Zahlungen**. Der Wortlaut ist unverändert aus dem Quellcode übernommen.

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
| 12 | Kündigung: Eine vorbereitete E-Mail wurde geöffnet. Wir bestätigen den Eingang und das Vertragsende in Textform. | `:291` |

Nr. 11 erscheint, sobald der Stripe-Portal-Link hinterlegt ist; Nr. 12 ist der
derzeit aktive Notweg (siehe Abschnitt 4.2).

## 4. Drei Punkte, die über die Textstellen hinausgehen

### 4.1 Die verlinkten Dokumente selbst gibt es nur auf Deutsch

Die Links unter Nr. 6 und 8 zeigen fest auf `/agb.html` und `/widerruf.html` —
**unabhängig von der eingestellten Sprache**. Beide Dokumente existieren
ausschließlich auf Deutsch. Vorhanden sind:

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

### 4.2 Die Kündigungs-E-Mail ist fest deutsch

Solange kein Stripe-Kundenportal-Link hinterlegt ist, öffnet der
Kündigungs-Knopf eine vorformulierte E-Mail (`account-privacy.js:285-290`).
Betreff und Text laufen **nicht** durch die Übersetzung, sie sind fest
verdrahtet:

> Betreff: `Kündigung meines smejj.com Abonnements`
> Text: `Hiermit kündige ich mein kostenpflichtiges smejj.com Abonnement zum
> nächstmöglichen Zeitpunkt.` + Felder für Konto-E-Mail, Name, Datum

Ein Verbraucher mit nicht-deutscher Oberfläche bekommt also eine deutsche
Kündigungserklärung vorgelegt, die er unterschreiben bzw. absenden soll.
**Frage:** Ist das mit der Anforderung vereinbar, dass die Kündigung leicht
zugänglich sein muss?

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
