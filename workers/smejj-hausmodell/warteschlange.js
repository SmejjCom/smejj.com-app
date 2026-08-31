// smejj.com Hausmodell — Warteschlange mit hartem Deckel von einer Inferenz.
//
// Warum ueberhaupt eine Schlange: der Server hat 2 Kerne und teilt sich
// 8 GB mit dem Bild-Maler. Zwei Inferenzen gleichzeitig heisst nicht
// "doppelt so schnell", sondern "beide langsam und OOM-Risiko". Also rechnet
// immer genau eine; der Rest wartet der Reihe nach.
//
// Wer zu lange wartet, bekommt eine ehrliche Absage statt einer Anfrage, die
// im Nirgendwo haengt — der Router faellt dann auf die Gratis-Spur zurueck.

export class Warteschlange {
  constructor({ deckel = 1, maxWartend = 24, wartefristMs = 120_000, protokoll = console } = {}) {
    this.deckel = deckel;
    this.maxWartend = maxWartend;
    this.wartefristMs = wartefristMs;
    this.protokoll = protokoll;
    this.laufend = 0;
    this.wartend = [];
    this.zaehler = { angenommen: 0, erledigt: 0, gescheitert: 0, abgewiesen: 0, abgelaufen: 0 };
  }

  bericht() {
    return {
      deckel: this.deckel,
      laufend: this.laufend,
      wartend: this.wartend.length,
      maxWartend: this.maxWartend,
      wartefristMs: this.wartefristMs,
      ...this.zaehler
    };
  }

  /** Fuehrt `arbeit` aus, sobald ein Platz frei ist. */
  async einreihen(arbeit, { kennung = "-" } = {}) {
    if (this.wartend.length >= this.maxWartend) {
      this.zaehler.abgewiesen += 1;
      const fehler = new Error("warteschlange_voll");
      fehler.status = 503;
      throw fehler;
    }

    this.zaehler.angenommen += 1;
    await this.#platzHolen(kennung);
    try {
      const ergebnis = await arbeit();
      this.zaehler.erledigt += 1;
      return ergebnis;
    } catch (fehler) {
      this.zaehler.gescheitert += 1;
      throw fehler;
    } finally {
      this.#platzFreigeben();
    }
  }

  #platzHolen(kennung) {
    if (this.laufend < this.deckel) {
      this.laufend += 1;
      return Promise.resolve();
    }
    return new Promise((loese, verwirf) => {
      const eintrag = { kennung, loese, verwirf, uhr: null };
      eintrag.uhr = setTimeout(() => {
        const stelle = this.wartend.indexOf(eintrag);
        if (stelle >= 0) this.wartend.splice(stelle, 1);
        this.zaehler.abgelaufen += 1;
        const fehler = new Error("wartefrist_abgelaufen");
        fehler.status = 504;
        verwirf(fehler);
      }, this.wartefristMs);
      eintrag.uhr.unref?.();
      this.wartend.push(eintrag);
      this.protokoll.log?.(`[schlange] ${kennung} wartet (${this.wartend.length} vor der Tuer)`);
    });
  }

  #platzFreigeben() {
    const naechster = this.wartend.shift();
    if (!naechster) {
      this.laufend = Math.max(0, this.laufend - 1);
      return;
    }
    clearTimeout(naechster.uhr);
    naechster.loese();
  }
}
