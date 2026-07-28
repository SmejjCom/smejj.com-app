// smejj.com Operations Console — Bedienung der Stufe-4-Ansichten.
//
// Eigene Datei, damit console.js unter der 800-Zeilen-Regel bleibt. Registriert
// sich beim Kern ueber window.adminStage4 — console.js kennt nur die Schnittstelle,
// nicht die Einzelheiten.
(function () {
  "use strict";
  const A = window.adminApi;
  const S = window.adminViewsStage4;

  function frage(text, vorgabe) {
    const wert = window.prompt(text, vorgabe || "");
    return wert === null ? null : String(wert).trim();
  }

  const seiten = {
    moderation: {
      id: "K", gruppe: "Sicherheit", name: "Missbrauch & Moderation",
      async laden(ctx) {
        const a = await A.moderation();
        if (!a.ok) return ctx.fehler(a.fehler);
        ctx.zeichne(S.moderation(a.data));
        binde(ctx, "data-modJa", async (id) => entscheiden(ctx, id, "bestaetigt"));
        binde(ctx, "data-modNein", async (id) => entscheiden(ctx, id, "entwarnung"));
      }
    },
    dsgvo: {
      id: "M", gruppe: "Recht", name: "DSGVO-Vorgänge",
      async laden(ctx) {
        const a = await A.dsgvo();
        if (!a.ok) return ctx.fehler(a.fehler);
        ctx.zeichne(S.dsgvo(a.data));
        const neu = document.getElementById("dsgvoNeu");
        if (neu) neu.addEventListener("click", async () => {
          const art = frage("Art der Anfrage:\n\nauskunft, loeschung, uebertrag, berichtigung, widerspruch", "auskunft");
          if (!art) return;
          const email = frage("E-Mail der betroffenen Person:");
          if (!email) return;
          const eingang = frage("Eingegangen am (JJJJ-MM-TT).\n\nWICHTIG: das echte Eingangsdatum — die Frist läuft ab da, nicht ab heute.",
            new Date().toISOString().slice(0, 10));
          if (eingang === null) return;
          const ergebnis = await A.dsgvoErfassen({ art, betroffeneEmail: email, eingegangenAm: eingang });
          if (!ergebnis.ok) return ctx.meldung(ergebnis.fehler, true);
          ctx.neuLaden();
        });
        binde(ctx, "data-dsgvoFertig", async (id) => {
          const nachweis = frage("Erledigungsnachweis (was wurde wann getan?):");
          if (!nachweis || nachweis.length < 5) return;
          const a2 = await A.dsgvoStatus(id, { status: "abgeschlossen", nachweis });
          if (!a2.ok) return ctx.meldung(a2.fehler, true);
          ctx.neuLaden();
        });
        binde(ctx, "data-dsgvoFrist", async (id) => {
          const grund = frage("Begründung für die Verlängerung um zwei Monate (Art. 12 Abs. 3):");
          if (!grund || grund.length < 10) return;
          const a2 = await A.dsgvoVerlaengern(id, grund);
          if (!a2.ok) return ctx.meldung(a2.fehler, true);
          ctx.neuLaden();
        });
      }
    },
    ankuendigungen: {
      id: "Q", gruppe: "Produkt", name: "Ankündigungen",
      async laden(ctx) {
        const a = await A.ankuendigungen();
        if (!a.ok) return ctx.fehler(a.fehler);
        ctx.zeichne(S.ankuendigungen(a.data));
        const neu = document.getElementById("ankNeu");
        if (neu) neu.addEventListener("click", async () => {
          const art = frage("Art:\n\nhinweis, wartung, stoerung", "hinweis");
          if (!art) return;
          const titel = frage("Titel:");
          if (!titel) return;
          const text = frage("Text für die Nutzer:");
          if (!text) return;
          const ziel = frage("Zielgruppe:\n\nalle, angemeldete, pro", "alle");
          if (!ziel) return;
          const ergebnis = await A.ankuendigungErstellen({ art, titel, text, ziel });
          if (!ergebnis.ok) return ctx.meldung(ergebnis.fehler, true);
          ctx.neuLaden();
        });
        binde(ctx, "data-ankWeg", async (id) => {
          const grund = frage("Warum wird die Ankündigung zurückgezogen?");
          if (!grund || grund.length < 3) return;
          const a2 = await A.ankuendigungZurueck(id, grund);
          if (!a2.ok) return ctx.meldung(a2.fehler, true);
          ctx.neuLaden();
        });
      }
    },
    flags: {
      id: "R", gruppe: "Produkt", name: "Feature-Flags",
      async laden(ctx) {
        const a = await A.flags();
        if (!a.ok) return ctx.fehler(a.fehler);
        ctx.zeichne(S.flags(a.data));
        const neu = document.getElementById("flagNeu");
        if (neu) neu.addEventListener("click", () => setzen(ctx, ""));
        binde(ctx, "data-flag", async (name) => setzen(ctx, name));
      }
    }
  };

  async function setzen(ctx, vorgabeName) {
    const name = frage("Name des Flags (Kleinbuchstaben, Ziffern, Bindestrich):", vorgabeName);
    if (!name) return;
    const status = frage("Zustand:\n\noff, partial, on", "partial");
    if (!status) return;
    let percent = 0;
    if (status === "partial") {
      const eingabe = frage("Anteil in Prozent (1 bis 99):", "5");
      if (!eingabe) return;
      percent = Number(eingabe);
    }
    const grund = frage("Grund (wird protokolliert):");
    if (!grund || grund.length < 3) return;
    const ergebnis = await A.flagSetzen({ name, status, percent, reason: grund });
    if (!ergebnis.ok) return ctx.meldung(ergebnis.fehler, true);
    ctx.neuLaden();
  }

  async function entscheiden(ctx, id, bewertung) {
    const begruendung = frage(bewertung === "bestaetigt"
      ? "Missbrauch bestätigen.\n\nDas sperrt NICHTS — es hält die Entscheidung fest. Begründung (mind. 10 Zeichen):"
      : "Entwarnung geben.\n\nBegründung (mind. 10 Zeichen):");
    if (!begruendung || begruendung.length < 10) return;
    const massnahme = bewertung === "bestaetigt" ? frage("Maßnahme (optional):", "Sperre beantragt") : "";
    const ergebnis = await A.moderationEntscheiden(id, { bewertung, begruendung, massnahme });
    if (!ergebnis.ok) return ctx.meldung(ergebnis.fehler, true);
    ctx.meldung(ergebnis.data.hinweis || "Entscheidung festgehalten.", false);
    ctx.neuLaden();
  }

  function binde(ctx, attribut, rueckruf) {
    document.querySelectorAll("[" + attribut + "]").forEach(function (el) {
      el.addEventListener("click", function () { rueckruf(el.getAttribute(attribut)); });
    });
  }

  window.adminStage4 = { seiten };
})();
