// smejj ai radar — Vorrang fuer die Nutzerfunktionen (Auftrag Punkt 7).
//
// Der Radar laeuft im selben Prozess wie Chat, Coding, Stimme und
// Bildschirmfreigabe. Eine Recherche ist Hintergrundarbeit: sie darf warten,
// eine Nutzerantwort nicht. Dieses Modul ist die kleinste ehrliche Form davon —
// ein Zaehler, den die Anfragewege beim Betreten erhoehen und beim Verlassen
// senken. Steht er ueber null, verschiebt der Radar seinen Lauf.
//
// Bewusst KEIN Lastmodell: Prozentwerte von CPU-Last sagen auf einem geteilten
// Container wenig, und eine Zahl, die man nicht erklaeren kann, ist als
// Entscheidungsgrundlage wertlos.
let laufendeNutzeranfragen = 0;
let letzteNutzung = 0;

/** Eine Nutzeranfrage beginnt (Chat, Code, Stimme, Bildschirm). */
export function nutzeranfrageBeginnt() {
  laufendeNutzeranfragen += 1;
  letzteNutzung = Date.now();
}

/** Eine Nutzeranfrage ist fertig — auch im Fehlerfall aufrufen. */
export function nutzeranfrageEndet() {
  laufendeNutzeranfragen = Math.max(0, laufendeNutzeranfragen - 1);
  letzteNutzung = Date.now();
}

/** Nur fuer Tests. */
export function vorrangZuruecksetzen() {
  laufendeNutzeranfragen = 0;
  letzteNutzung = 0;
}

/**
 * Darf Hintergrundarbeit jetzt laufen?
 * @param {{schonfristMs?: number, jetztMs?: number}} optionen
 *   schonfristMs: so lange nach der letzten Nutzeranfrage bleibt der Radar
 *   weg — eine Antwort ist selten allein, meist folgt gleich die naechste Frage.
 */
export function darfHintergrundLaufen({ schonfristMs = 20_000, jetztMs = Date.now() } = {}) {
  if (laufendeNutzeranfragen > 0) return { erlaubt: false, grund: "nutzer_hat_vorrang", laufende: laufendeNutzeranfragen };
  if (letzteNutzung && jetztMs - letzteNutzung < schonfristMs) {
    return { erlaubt: false, grund: "schonfrist_nach_nutzeranfrage", restMs: schonfristMs - (jetztMs - letzteNutzung) };
  }
  return { erlaubt: true, grund: null, laufende: 0 };
}

/**
 * Fuehrt eine Nutzeranfrage aus und meldet Anfang und Ende — eine Zeile am
 * Aufrufort statt eines try/finally quer durch den Anfrageweg.
 */
export async function mitVorrang(arbeit) {
  nutzeranfrageBeginnt();
  try {
    return await arbeit();
  } finally {
    nutzeranfrageEndet();
  }
}

/** Fuer die Ampel und den Adminbereich. */
export function vorrangStand({ jetztMs = Date.now() } = {}) {
  return {
    laufendeNutzeranfragen,
    letzteNutzungVorMs: letzteNutzung ? jetztMs - letzteNutzung : null
  };
}
