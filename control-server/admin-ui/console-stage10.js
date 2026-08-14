// smejj.com Operations Console — Bedienung der Stufe 10 (AI Evolution, Modul AE).
//
// Rein lesend: eine Ansicht, ein Endpunkt, keine Interaktion. Alles, was hier
// zu entscheiden wäre — welche Verbesserung gebaut wird — entscheidet der
// Betreiber in der Werkstatt, nicht mit einem Knopf auf einem Dashboard.
(function () {
  "use strict";
  const A = window.adminApi;
  const S = window.adminViewsStage10;

  async function laden(ctx) {
    const antwort = await A.hole("/api/admin/ops/evolution");
    if (!antwort.ok) return ctx.fehler(antwort.fehler);
    ctx.zeichne(S.evolution(antwort.data));
  }

  window.adminStage10 = {
    seiten: {
      evolution: { id: "AE", gruppe: "Betrieb", name: "AI Evolution", laden: laden }
    }
  };
})();
