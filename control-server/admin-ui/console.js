// smejj.com Operations Console — Aufbau, Navigation und Laden.
//
// Trennung: api.js spricht mit dem Server, views.js zeichnet, diese Datei
// verbindet beides und haelt den Zustand. Klassisches Skript, damit die CSP
// script-src 'self' ohne Sonderfall greift.
(function () {
  "use strict";
  const A = window.adminApi;
  const V = window.adminViews;

  const SEITEN = [
    { id: "A", pfad: "uebersicht", gruppe: "Überblick", name: "Übersicht" },
    { id: "B", pfad: "nutzer", gruppe: "Menschen", name: "Nutzerverwaltung" },
    { id: "C", pfad: "rollen", gruppe: "Menschen", name: "Rollen & Rechte" },
    { id: "O", pfad: "audit", gruppe: "Recht", name: "Audit-Log" },
    { id: "N", pfad: "compliance", gruppe: "Recht", name: "EU AI Act" }
  ];

  const zustand = { akteur: null, suchbegriff: "", von: "", bis: "" };
  const nav = document.getElementById("nav");
  const seite = document.getElementById("seite");

  function schreibeNav(aktiv) {
    let gruppe = null;
    nav.innerHTML = SEITEN.map(function (s) {
      let vorsatz = "";
      if (s.gruppe !== gruppe) { gruppe = s.gruppe; vorsatz = '<div class="rail-group">' + A.escapeHtml(s.gruppe) + '</div>'; }
      return vorsatz + '<a class="rail-item' + (s.pfad === aktiv ? " on" : "") + '" href="#' + s.pfad + '">'
        + '<span class="ltr">' + s.id + '</span><span>' + A.escapeHtml(s.name) + '</span></a>';
    }).join("");
  }

  function laedt(text) {
    seite.innerHTML = '<div class="laedt glass">' + A.escapeHtml(text || "wird geladen …") + '</div>';
  }

  function setzeKopf(name) {
    document.getElementById("crumb").textContent = name;
    document.title = name + " — smejj.com Operations Console";
  }

  function zeigeStand(index, kette) {
    const i = document.getElementById("indexStand");
    if (index) {
      i.textContent = "Index " + A.dauer(index.ageSeconds) + (index.refreshing ? " · frischt auf" : "");
      i.className = "pill " + (index.refreshing ? "warn" : "ok");
    }
    const k = document.getElementById("ketteStand");
    if (kette) {
      k.textContent = kette.ok ? "Kette intakt" : "Kette gebrochen";
      k.className = "pill " + (kette.ok ? "ok" : "bad");
    }
  }

  // ---- Ansichten laden --------------------------------------------------------

  async function zeigeUebersicht() {
    laedt("Betriebszustand wird geholt …");
    const [nutzer, audit, compliance] = await Promise.all([
      A.nutzer({ limit: 1 }), A.audit({ limit: 50 }), A.compliance()
    ]);
    if (!nutzer.ok && nutzer.status !== 409) return zeigeFehler(nutzer.fehler);
    seite.innerHTML = V.uebersicht({
      nutzer: nutzer.data, audit: audit.data, compliance: compliance.data
    });
    zeigeStand(nutzer.data && nutzer.data.index, audit.data && audit.data.chain);
  }

  async function zeigeNutzer() {
    laedt("Konten werden geholt …");
    const antwort = await A.nutzer({ limit: 50, query: zustand.suchbegriff });
    if (!antwort.ok) {
      seite.innerHTML = V.fehlerblock(antwort.fehler)
        + (antwort.data && antwort.data.hint ? '<div class="bar"><span class="btn" id="neubauKnopf">Index jetzt bauen</span></div>' : "");
      bindeNeubau();
      return;
    }
    const daten = antwort.data;
    daten.suchbegriff = zustand.suchbegriff;
    seite.innerHTML = V.nutzer(daten);
    zeigeStand(daten.index, null);
    bindeNutzerAktionen();
  }

  async function zeigeAkte(id) {
    const grund = window.prompt(
      "Die Einsicht in eine Nutzerakte wird unveränderlich protokolliert.\n\nGrund für den Zugriff:", "");
    if (grund === null) { location.hash = "#nutzer"; return; }
    if (String(grund).trim().length < 3) {
      seite.innerHTML = V.fehlerblock("Ohne Grund keine Einsicht. Bitte mindestens drei Zeichen angeben.")
        + '<div class="bar"><span class="btn zurueck" id="zurueckKnopf">← Zurück zur Liste</span></div>';
      bindeZurueck();
      return;
    }
    laedt("Akte wird geholt und der Zugriff protokolliert …");
    const antwort = await A.akte(id, String(grund).trim());
    if (!antwort.ok) {
      seite.innerHTML = V.fehlerblock(antwort.fehler)
        + '<div class="bar"><span class="btn zurueck" id="zurueckKnopf">← Zurück zur Liste</span></div>';
      bindeZurueck();
      return;
    }
    seite.innerHTML = V.akte({ user: antwort.data.user, grund: String(grund).trim() });
    bindeZurueck();
  }

  async function zeigeAudit() {
    laedt("Audit-Log wird geholt …");
    const parameter = { limit: 100 };
    if (zustand.von) parameter.from = zustand.von;
    if (zustand.bis) parameter.to = zustand.bis;
    const antwort = await A.audit(parameter);
    if (!antwort.ok) return zeigeFehler(antwort.fehler);
    const daten = antwort.data;
    daten.von = zustand.von;
    daten.bis = zustand.bis;
    seite.innerHTML = V.audit(daten);
    zeigeStand(null, daten.chain);
    bindeZeitraum();
  }

  async function zeigeRollen() {
    laedt("Rechte werden geholt …");
    const antwort = await A.ich();
    if (!antwort.ok) return zeigeFehler(antwort.fehler);
    seite.innerHTML = V.rollen(antwort.data);
  }

  async function zeigeCompliance() {
    laedt("Transparenzbericht wird geholt …");
    const antwort = await A.compliance();
    if (!antwort.ok) return zeigeFehler(antwort.fehler);
    seite.innerHTML = V.compliance(antwort.data);
  }

  function zeigeFehler(text) {
    seite.innerHTML = V.fehlerblock(text);
  }

  // ---- Ereignisse -------------------------------------------------------------

  function bindeNutzerAktionen() {
    document.querySelectorAll("tr.klickbar").forEach(function (zeile) {
      zeile.addEventListener("click", function () {
        location.hash = "#akte/" + encodeURIComponent(zeile.getAttribute("data-akte"));
      });
    });
    const feld = document.getElementById("sucheFeld");
    const knopf = document.getElementById("sucheKnopf");
    function suchen() { zustand.suchbegriff = feld ? feld.value.trim() : ""; zeigeNutzer(); }
    if (knopf) knopf.addEventListener("click", suchen);
    if (feld) feld.addEventListener("keydown", function (ereignis) { if (ereignis.key === "Enter") suchen(); });
    const leeren = document.getElementById("sucheLeeren");
    if (leeren) leeren.addEventListener("click", function () { zustand.suchbegriff = ""; zeigeNutzer(); });
    bindeNeubau();
  }

  function bindeNeubau() {
    const knopf = document.getElementById("neubauKnopf");
    if (!knopf) return;
    knopf.addEventListener("click", async function () {
      const grund = window.prompt("Der Neubau des Index wird protokolliert.\n\nGrund:", "Turnusmässige Auffrischung");
      if (grund === null || String(grund).trim().length < 3) return;
      knopf.textContent = "wird gebaut …";
      knopf.setAttribute("disabled", "disabled");
      const antwort = await A.neubau(String(grund).trim());
      if (!antwort.ok) { zeigeFehler(antwort.fehler); return; }
      zeigeNutzer();
    });
  }

  function bindeZurueck() {
    const knopf = document.getElementById("zurueckKnopf");
    if (knopf) knopf.addEventListener("click", function () { location.hash = "#nutzer"; });
  }

  function bindeZeitraum() {
    const anwenden = document.getElementById("zeitraumKnopf");
    if (anwenden) anwenden.addEventListener("click", function () {
      zustand.von = (document.getElementById("von") || {}).value || "";
      zustand.bis = (document.getElementById("bis") || {}).value || "";
      zeigeAudit();
    });
    const leeren = document.getElementById("zeitraumLeeren");
    if (leeren) leeren.addEventListener("click", function () {
      zustand.von = ""; zustand.bis = ""; zeigeAudit();
    });
  }

  // ---- Routing ----------------------------------------------------------------

  function route() {
    const ziel = (location.hash || "#uebersicht").replace(/^#/, "");
    if (ziel.indexOf("akte/") === 0) {
      schreibeNav("nutzer");
      setzeKopf("Nutzerakte");
      return zeigeAkte(decodeURIComponent(ziel.slice("akte/".length)));
    }
    const treffer = SEITEN.filter(function (s) { return s.pfad === ziel; })[0] || SEITEN[0];
    schreibeNav(treffer.pfad);
    setzeKopf(treffer.name);
    if (treffer.pfad === "nutzer") return zeigeNutzer();
    if (treffer.pfad === "rollen") return zeigeRollen();
    if (treffer.pfad === "audit") return zeigeAudit();
    if (treffer.pfad === "compliance") return zeigeCompliance();
    return zeigeUebersicht();
  }

  async function start() {
    schreibeNav("uebersicht");
    laedt("Anmeldung wird geprüft …");
    const antwort = await A.ich();
    if (!antwort.ok) {
      seite.innerHTML = V.fehlerblock(antwort.fehler);
      return;
    }
    zustand.akteur = antwort.data.actor || {};
    const name = zustand.akteur.name || zustand.akteur.email || "—";
    document.getElementById("akteurName").textContent = name;
    document.getElementById("akteurRolle").textContent = zustand.akteur.role || "—";
    document.getElementById("akteurKuerzel").textContent =
      name.replace(/[^A-Za-zÄÖÜäöü ]/g, " ").trim().split(/\s+/).map(function (t) { return t[0]; })
        .join("").slice(0, 2).toUpperCase() || "··";
    const stufe = document.getElementById("stufe");
    stufe.textContent = "Stufe " + (antwort.data.stage || 2)
      + (antwort.data.writable ? " · schreibend" : " · nur lesend");
    window.addEventListener("hashchange", route);
    route();
  }

  start();
})();
