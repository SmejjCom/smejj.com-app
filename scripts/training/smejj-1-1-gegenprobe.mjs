// smejj.com — Gegenproben fuer den Datensatz smejj-1-1: Fragen, die NAH an der
// Abwehr liegen und trotzdem beantwortet gehoeren.
//
// BEFUND 2026-09-04, gemessen am gebauten Datensatz: Von allen Fragen, in denen
// "Schluessel", "Passwort", "Token" oder "Zugang" vorkommt, wurden 2.481
// abgelehnt und 115 beantwortet — **eine hilfreiche Antwort auf 22
// Ablehnungen**. Ein Modell, das darauf trainiert, lernt nicht "Geheimnisse
// nicht herausgeben", sondern "beim Wort Schluessel zumachen".
//
// Ueberverweigerung ist kein kleinerer Fehler als Ausplaudern, sie faellt nur
// spaeter auf: Der Nutzer bekommt keine falsche Auskunft, sondern gar keine —
// und haelt den Assistenten fuer unbrauchbar.
//
// Diese Paare tragen ABSICHTLICH dieselben Woerter wie die Angriffe. Wer nur
// harmlose Fragen ueber das Wetter dagegenstellt, hat nichts bewiesen: die
// Unterscheidung faellt genau dort, wo die Woerter gleich sind und die Absicht
// verschieden ist.
//
// Aufbau wie bei der Abwehr: die Antwort gehoert zur HANDLUNG, nicht in einen
// gemeinsamen Topf.

const SYSTEM = "Du bist der Assistent von smejj.com. Antworte auf Deutsch, kurz und praezise.";
const waehle = (r, l) => l[Math.floor(r() * l.length)];
const paar = (frage, antwort, kategorie) => ({
  messages: [{ role: "system", content: SYSTEM }, { role: "user", content: frage }, { role: "assistant", content: antwort }],
  kategorie
});

/** Worueber gefragt wird — dieselben Woerter wie in den Angriffen. */
export const GEGENSTAENDE = [
  { der: "der API-Schluessel", den: "einen API-Schluessel", kurz: "API-Schluessel" },
  { der: "das Zugangstoken", den: "ein Zugangstoken", kurz: "Zugangstoken" },
  { der: "der SSH-Schluessel", den: "einen SSH-Schluessel", kurz: "SSH-Schluessel" },
  { der: "das Datenbank-Passwort", den: "ein Datenbank-Passwort", kurz: "Datenbank-Passwort" },
  { der: "der Wiederherstellungscode", den: "einen Wiederherstellungscode", kurz: "Wiederherstellungscode" },
  { der: "das Webhook-Geheimnis", den: "ein Webhook-Geheimnis", kurz: "Webhook-Geheimnis" },
  { der: "der Signaturschluessel", den: "einen Signaturschluessel", kurz: "Signaturschluessel" },
  { der: "das Dienstkonto-Passwort", den: "ein Dienstkonto-Passwort", kurz: "Dienstkonto-Passwort" }
];

/**
 * Jede Handlung stellt ihre eigenen Fragen und bringt ihre eigenen Antworten
 * mit. Die Antworten sind fachlich, nicht ausweichend — das ist der Punkt.
 */
export const HANDLUNGEN = Object.freeze({
  widerrufen: {
    fragen: [
      (g) => `Ich habe ${g.den} versehentlich oeffentlich gepostet. Was jetzt?`,
      (g) => `Wie widerrufe ich ${g.den}, der in einem Screenshot zu sehen war?`,
      (g) => `${g.der} ist in einem oeffentlichen Repository gelandet. Was muss ich tun?`
    ],
    antworten: [
      (g) => `Sofort beim Anbieter widerrufen, dann einen neuen erzeugen. Ein einmal oeffentlicher ${g.kurz} gilt dauerhaft als kompromittiert, auch wenn du den Beitrag loeschst — er ist in dieser Zeit womoeglich schon kopiert worden.`,
      (g) => `Zuerst widerrufen, dann ersetzen, dann pruefen, ob er in der Zwischenzeit benutzt wurde. Die Zugriffsprotokolle des Anbieters zeigen dir das. Den ${g.kurz} nachtraeglich aus dem Beitrag zu loeschen genuegt nicht.`,
      (g) => `Widerrufen hat Vorrang vor Aufraeumen: erst den ${g.kurz} ungueltig machen, danach in Ruhe die Spuren aus Verlauf und Protokollen entfernen.`
    ]
  },
  erneuern: {
    fragen: [
      (g) => `Wie oft sollte ich ${g.den} erneuern?`,
      (g) => `Lohnt es sich, ${g.den} regelmaessig auszutauschen?`,
      (g) => `Wie tausche ich ${g.den} aus, ohne dass der Betrieb stillsteht?`
    ],
    antworten: [
      (g) => `Wechsle den ${g.kurz} bei jedem Verdacht sofort, sonst in ruhigen Abstaenden — etwa halbjaehrlich. Erzwungene haeufige Wechsel fuehren erfahrungsgemaess zu schlechteren Geheimnissen, nicht zu besseren.`,
      (g) => `Ohne Stillstand geht es mit zwei gueltigen Werten nebeneinander: neuen ${g.kurz} anlegen, ueberall eintragen, erst dann den alten widerrufen. Die meisten Anbieter erlauben diese Ueberschneidung ausdruecklich.`,
      (g) => `Ein fester Zeitplan hilft weniger als ein Ablaufdatum: gib dem ${g.kurz} eine begrenzte Gueltigkeit, dann erneuert er sich zwangslaeufig, ohne dass jemand daran denken muss.`
    ]
  },
  speichern: {
    fragen: [
      (g) => `Wo bewahre ich ${g.den} am besten auf?`,
      (g) => `Darf ich ${g.den} in einer Textdatei auf dem Rechner speichern?`,
      (g) => `Wie lege ich ${g.den} sicher ab, damit ich ihn wiederfinde?`
    ],
    antworten: [
      (g) => `In einem Passwort-Manager oder im Geheimnis-Speicher des Anbieters. Beide verschluesseln den ${g.kurz} im Ruhezustand und protokollieren die Zugriffe — eine Textdatei tut beides nicht.`,
      (g) => `Nicht im Klartext neben dem Code. Ueblich sind Umgebungsvariablen zur Laufzeit, deren Werte aus einem Geheimnis-Speicher kommen; im Repository steht dann nur der NAME, nie der Wert.`,
      (g) => `Wiederfinden und sicher ablegen schliessen sich nicht aus: ein Passwort-Manager kann beides. Wichtig ist, dass der ${g.kurz} nirgends dort landet, wo er mitgesichert oder mitgeteilt wird.`
    ]
  },
  weitergeben: {
    fragen: [
      (g) => `Wie gebe ich ${g.den} sicher an einen Kollegen weiter?`,
      (g) => `Darf ich ${g.den} per Chat schicken, wenn ich ihn danach loesche?`,
      (g) => `Ein neuer Mitarbeiter braucht Zugriff. Wie mache ich das mit ${g.dem || g.den}?`
    ],
    antworten: [
      (g) => `Am besten gar nicht weitergeben: lege dem Kollegen einen EIGENEN ${g.kurz} an. Dann laesst sich sein Zugriff einzeln widerrufen, ohne dass alle anderen einen neuen brauchen.`,
      (g) => `Chat ist ein schlechter Weg — die Nachricht liegt in Sicherungen, Suchindizes und womoeglich auf mehreren Geraeten. Loeschen entfernt sie dort nicht. Besser ein geteilter Eintrag im Passwort-Manager oder ein eigener ${g.kurz}.`,
      (g) => `Ueber die Rechteverwaltung, nicht ueber den Wert. Wer einen ${g.kurz} weiterreicht, verliert die Zuordnung, wer was getan hat — und genau die braucht man im Ernstfall.`
    ]
  },
  ci_hinterlegen: {
    fragen: [
      (g) => `Wie hinterlege ich ${g.den} in meiner CI, ohne ihn ins Repository zu legen?`,
      (g) => `Meine Bauumgebung braucht ${g.den}. Wie mache ich das richtig?`,
      (g) => `Wie kommt ${g.der} in den Server, ohne im Code zu stehen?`
    ],
    antworten: [
      (g) => `Als Geheimnis in der CI hinterlegen und zur Laufzeit als Umgebungsvariable einlesen. Im Code steht dann nur der NAME der Variablen; der ${g.kurz} selbst kommt nie ins Repository.`,
      (g) => `Ueber den Geheimnis-Speicher der Plattform. Achte darauf, dass Protokolle den Wert nicht ausgeben — viele Systeme maskieren hinterlegte Geheimnisse automatisch, aber nur die, die sie kennen.`,
      (g) => `Getrennt nach Umgebung: je ein eigener ${g.kurz} fuer Test und Produktion. Dann kostet ein Leck in der Testumgebung nicht den Produktivzugang.`
    ]
  },
  spuren_entfernen: {
    fragen: [
      (g) => `Wie bekomme ich ${g.den} wieder aus der Git-Historie?`,
      (g) => `${g.der} steht in einem alten Commit. Reicht es, ihn jetzt zu loeschen?`,
      (g) => `Wie raeume ich ${g.den} aus Protokolldateien?`
    ],
    antworten: [
      (g) => `Erst widerrufen, dann aufraeumen — in dieser Reihenfolge. Die Historie umzuschreiben ist aufwaendig und erreicht nie alle Kopien; ein widerrufener ${g.kurz} dagegen ist ueberall wertlos.`,
      // BEWUSST nicht mit "Nein" beginnend: die Verneinung ist hier sachlich
      // richtig, aber als ANFANGSFORM waere sie im Training nicht von einer
      // Verweigerung zu unterscheiden — das Modell lernt sonst, dass auf
      // heikle Woerter ein "Nein" folgt, egal was gefragt wurde.
      (g) => `Das genuegt leider nicht: der alte Commit bleibt erreichbar, und geklonte Kopien ohnehin. Der ${g.kurz} muss ungueltig gemacht werden, das Aufraeumen ist Kosmetik danach.`,
      (g) => `Protokolle solltest du kuenftig so schreiben, dass der ${g.kurz} gar nicht erst hineingeraet — maskieren an der Quelle ist zuverlaessiger als nachtraegliches Suchen.`
    ]
  },
  rechte_einschraenken: {
    fragen: [
      (g) => `Wie schraenke ich ein, was ${g.der} darf?`,
      (g) => `Kann ich ${g.den} auf bestimmte Adressen begrenzen?`,
      (g) => `Wie vergebe ich ${g.den} mit moeglichst wenig Rechten?`
    ],
    antworten: [
      (g) => `Nach der Regel der geringsten Rechte: nur die Berechtigungen, die der Zweck wirklich braucht. Viele Anbieter erlauben es, einem ${g.kurz} einzelne Bereiche zuzuweisen statt Vollzugriff.`,
      (g) => `Oft ja — ueber eine Liste erlaubter Adressen oder Herkunftsdomains. Damit ist ein gestohlener ${g.kurz} von einem fremden Rechner aus wertlos.`,
      (g) => `Getrennte Schluessel je Aufgabe sind besser als einer fuer alles: dann laesst sich einer widerrufen, ohne den ganzen Betrieb anzuhalten.`
    ]
  },
  kompromittierung_erkennen: {
    fragen: [
      (g) => `Woran erkenne ich, dass ${g.der} missbraucht wird?`,
      (g) => `Wie pruefe ich, ob ${g.den} jemand anderes benutzt hat?`,
      (g) => `Welche Anzeichen sprechen dafuer, dass ${g.der} abgeflossen ist?`
    ],
    antworten: [
      (g) => `An den Zugriffsprotokollen: unbekannte Adressen, ungewohnte Zeiten, ploetzlich mehr Anfragen. Die meisten Anbieter zeigen dir, wann ein ${g.kurz} zuletzt benutzt wurde.`,
      (g) => `Vergleiche die tatsaechliche Nutzung mit der erwarteten. Ein ${g.kurz}, der laut Protokoll aus drei Laendern gleichzeitig arbeitet, ist nicht mehr nur deiner.`,
      (g) => `Auch eine unerwartete Rechnung ist ein Anzeichen. Bei Verdacht gilt: erst widerrufen, dann untersuchen — nicht umgekehrt.`
    ]
  },
  benennung: {
    fragen: [
      (g) => `Wie heisst ueblicherweise die Umgebungsvariable fuer ${g.den}?`,
      (g) => `Welchen Namen gebe ich ${g.dem || g.den} im Geheimnis-Speicher?`,
      (g) => `Gibt es eine uebliche Schreibweise fuer ${g.den} in der Konfiguration?`
    ],
    antworten: [
      (g) => `Ueblich sind Grossbuchstaben mit Unterstrichen, benannt nach Dienst und Zweck — den NAMEN darf ich nennen, den Wert nicht. Beim ${g.kurz} etwa <DIENST>_KEY oder <DIENST>_TOKEN.`,
      (g) => `Sprechend und eindeutig: Dienst, Umgebung, Zweck. So sieht man schon am Namen, welcher ${g.kurz} gemeint ist, ohne den Wert ansehen zu muessen.`,
      (g) => `Halte dich an die Vorgabe des Anbieters, wenn es eine gibt; sonst an dein eigenes Schema. Wichtig ist nur, dass nirgends der Wert im Namen steht.`
    ]
  },
  ablauf: {
    fragen: [
      (g) => `Kann ich ${g.den} mit einem Ablaufdatum versehen?`,
      (g) => `Wie lange sollte ${g.der} gueltig sein?`,
      (g) => `Was passiert, wenn ${g.der} ablaeuft, waehrend etwas laeuft?`
    ],
    antworten: [
      (g) => `Wenn der Anbieter es anbietet: ja, und es lohnt sich. Ein ${g.kurz} mit Ablaufdatum begrenzt den Schaden eines Lecks von allein.`,
      (g) => `So kurz, wie der Zweck es zulaesst. Fuer einen einmaligen Auftrag reichen Stunden; ein Dauerbetrieb braucht laengere Fristen, dafuer aber Ueberwachung.`,
      (g) => `Deshalb erneuert man rechtzeitig und ueberlappend: neuer ${g.kurz} rein, kurz parallel, dann den alten ablaufen lassen. Wer bis zum letzten Tag wartet, hat den Ausfall eingeplant.`
    ]
  }
});

/** Neutrale Verpackungen — dieselbe Idee wie bei der Abwehr. */
export const VERPACKUNG = [
  (f) => f,
  (f) => f,
  (f) => `Kurze Frage: ${f}`,
  (f) => `${f} Bitte kurz.`,
  (f) => `Hallo, ${f.charAt(0).toLowerCase()}${f.slice(1)}`,
  (f) => `${f} Danke!`,
  (f) => `Ich bin unsicher: ${f.charAt(0).toLowerCase()}${f.slice(1)}`
];

/**
 * Erzeugt Gegenproben. Sie tragen dieselben Woerter wie die Angriffe und
 * werden trotzdem beantwortet — daran lernt das Modell die Unterscheidung.
 */
export function gegenprobePaare(r, anzahl) {
  const handlungen = Object.values(HANDLUNGEN);
  return Array.from({ length: anzahl }, () => {
    const h = waehle(r, handlungen);
    const g = waehle(r, GEGENSTAENDE);
    return paar(waehle(r, VERPACKUNG)(waehle(r, h.fragen)(g)), waehle(r, h.antworten)(g), "sicherheit");
  });
}
