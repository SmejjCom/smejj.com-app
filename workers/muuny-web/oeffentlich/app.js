// muuny.com — Oberflaeche. Kein Framework, keine Fremdskripte, kein Tracking.
"use strict";
const $ = (id) => document.getElementById(id);
const zustand = { ich: null, email: "", laeuft: false };

const GRUENDE = {
  email_ungueltig: "Diese E-Mail-Adresse sieht nicht gültig aus.",
  zu_viele_anfragen: "Zu viele Versuche. Bitte warte kurz und versuche es dann erneut.",
  versand_fehlgeschlagen: "Die E-Mail konnte gerade nicht gesendet werden. Bitte später erneut versuchen.",
  email_versand_nicht_eingerichtet: "Die Anmeldung per E-Mail ist gerade noch nicht freigeschaltet.",
  code_falsch: "Der Code stimmt nicht.",
  code_abgelaufen: "Der Code ist abgelaufen. Fordere einen neuen an.",
  code_verbrannt: "Zu viele falsche Versuche. Fordere einen neuen Code an.",
  eine_frage_nach_der_anderen: "muuny beantwortet gerade noch deine vorige Frage.",
  zu_viele_fragen: "Du hast in der letzten Stunde sehr viele Fragen gestellt. Bitte später weiter.",
  modell_nicht_bereit: "muuny startet gerade. Bitte in ein paar Minuten erneut versuchen.",
  einwilligung_nicht_eingerichtet: "Die Einwilligung ist gerade noch nicht freigeschaltet.",
  ausdrueckliches_ja_fehlt: "Bitte alle drei Punkte bestätigen."
};
const text = (grund) => GRUENDE[grund] || (String(grund || "").startsWith("besetzt") ? "muuny ist gerade ausgelastet. Bitte gleich erneut versuchen." : "Etwas ist schiefgegangen. Bitte erneut versuchen.");

async function api(pfad, { methode = "GET", daten } = {}) {
  const r = await fetch(pfad, { method: methode, credentials: "same-origin",
    headers: methode === "GET" ? {} : { "content-type": "application/json", "x-muuny": "1" },
    body: daten ? JSON.stringify(daten) : undefined });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, ...j };
}

function zeige(bereich) {
  for (const b of ["laden", "anmeldung", "chat"]) $(b).hidden = b !== bereich;
  $("menue").hidden = bereich !== "chat";
}

async function start() {
  zustand.ich = await api("/api/ich").catch(() => null);
  if (!zustand.ich?.angemeldet) return zeige("anmeldung");
  zeige("chat");
  $("widerrufen").hidden = !zustand.ich.einwilligung;
  let spaeter = false;
  try { spaeter = sessionStorage.getItem("muuny-nicht-jetzt") === "1"; } catch { /* privat */ }
  $("einwilligung").hidden = zustand.ich.einwilligung || !zustand.ich.einwilligungMoeglich || spaeter;
  $("frage").focus();
}

// ---- Anmeldung
$("form-email").addEventListener("submit", async (e) => {
  e.preventDefault();
  const knopf = e.submitter; knopf.disabled = true;
  zustand.email = $("email").value.trim();
  const r = await api("/api/code", { methode: "POST", daten: { email: zustand.email } }).catch(() => ({ grund: "netz" }));
  knopf.disabled = false;
  if (!r.ok) { $("anmeldung-meldung").textContent = text(r.grund); return; }
  $("form-email").hidden = true; $("form-code").hidden = false;
  $("anmeldung-meldung").textContent = `Code an ${zustand.email} gesendet. Schau auch im Spam-Ordner nach.`;
  $("code").focus();
});
$("form-code").addEventListener("submit", async (e) => {
  e.preventDefault();
  const r = await api("/api/anmelden", { methode: "POST", daten: { email: zustand.email, code: $("code").value.trim() } }).catch(() => ({ grund: "netz" }));
  if (!r.ok) { $("anmeldung-meldung").textContent = text(r.grund); if (r.grund !== "code_falsch") { $("form-code").hidden = true; $("form-email").hidden = false; } return; }
  $("anmeldung-meldung").textContent = ""; $("code").value = "";
  start();
});
$("zurueck").addEventListener("click", () => { $("form-code").hidden = true; $("form-email").hidden = false; $("anmeldung-meldung").textContent = ""; });
$("abmelden").addEventListener("click", async () => { await api("/api/abmelden", { methode: "POST" }).catch(() => {}); $("verlauf").textContent = ""; start(); });

// ---- Einwilligung: drei einzelne, ausdrueckliche Ja
const haken = ["ja-training", "ja-pruefung", "ja-rechte"].map($);
for (const h of haken) h.addEventListener("change", () => { $("einwilligen").disabled = !haken.every((x) => x.checked); });
$("einwilligen").addEventListener("click", async () => {
  const r = await api("/api/einwilligung", { methode: "POST", daten: { trainingJa: haken[0].checked, pruefungJa: haken[1].checked, rechteJa: haken[2].checked } }).catch(() => ({ grund: "netz" }));
  if (!r.ok) { $("einwilligung-meldung").textContent = text(r.grund); return; }
  $("einwilligung").hidden = true; $("widerrufen").hidden = false;
  zustand.ich.einwilligung = true;
});
$("nicht-jetzt").addEventListener("click", () => { $("einwilligung").hidden = true; try { sessionStorage.setItem("muuny-nicht-jetzt", "1"); } catch { /* privat */ } });
$("widerrufen").addEventListener("click", async () => {
  if (!confirm("Einwilligung widerrufen? Danach speichert muuny keine weiteren Lernpaare von dir.")) return;
  const r = await api("/api/einwilligung", { methode: "DELETE" }).catch(() => ({ grund: "netz" }));
  if (!r.ok) { alert(text(r.grund)); return; }
  zustand.ich.einwilligung = false; $("widerrufen").hidden = true;
  for (const h of haken) h.checked = false;
  $("einwilligen").disabled = true;
  alert("Widerrufen. Für die Löschung bereits gespeicherter Paare schreib an s@muuny.com.");
});

// ---- Chat
function blase(rolle, inhalt = "") {
  const li = document.createElement("li");
  li.className = `blase ${rolle}`;
  const p = document.createElement("div"); p.className = "inhalt"; p.textContent = inhalt;
  li.append(p);
  $("verlauf").append(li);
  li.scrollIntoView({ block: "end" });
  return li;
}

function daumenLeiste(li, frage, antwort) {
  const leiste = document.createElement("div"); leiste.className = "daumen";
  const meldung = document.createElement("span"); meldung.className = "klein grau";
  const knopf = (zeichen, wert, titel) => {
    const b = document.createElement("button"); b.type = "button"; b.className = "leise"; b.textContent = zeichen; b.title = titel; b.setAttribute("aria-label", titel);
    b.addEventListener("click", async () => {
      for (const x of leiste.querySelectorAll("button")) x.disabled = true;
      b.classList.add("gewaehlt");
      if (wert !== "hoch") { meldung.textContent = "Danke für die Rückmeldung."; return; }
      if (!zustand.ich?.einwilligung) { meldung.textContent = "Danke! Gespeichert wird nur mit Einwilligung."; if (zustand.ich?.einwilligungMoeglich) $("einwilligung").hidden = false; return; }
      const r = await api("/api/daumen", { methode: "POST", daten: { daumen: "hoch", frage, antwort } }).catch(() => ({}));
      meldung.textContent = r.erfasst ? "Danke! muuny lernt daraus." : r.grund === "sensible_daten_erkannt" ? "Danke! Nicht gespeichert – enthielt möglicherweise persönliche Daten." : "Danke! Diesmal nicht gespeichert.";
    });
    return b;
  };
  leiste.append(knopf("👍", "hoch", "Gute Antwort"), knopf("👎", "runter", "Schlechte Antwort"), meldung);
  li.append(leiste);
}

async function frageSenden(frage) {
  zustand.laeuft = true; $("senden").disabled = true;
  blase("nutzer", frage);
  const li = blase("muuny");
  const inhalt = li.querySelector(".inhalt");
  const warte = document.createElement("div"); warte.className = "klein grau warte"; li.append(warte);
  const t0 = Date.now();
  const uhr = setInterval(() => { warte.textContent = `muuny denkt nach … ${Math.round((Date.now() - t0) / 1000)} s`; }, 1000);
  let antwort = "";
  try {
    const r = await fetch("/api/chat", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", "x-muuny": "1" }, body: JSON.stringify({ frage }) });
    if (!r.ok || !r.body) { const j = await r.json().catch(() => ({})); if (r.status === 401) return start(); throw new Error(j.grund || "fehler"); }
    const modell = r.headers.get("x-muuny-modell") || "";
    const wissen = Number(r.headers.get("x-muuny-wissen") || 0);
    const leser = r.body.getReader(); const dek = new TextDecoder(); let rest = "";
    for (;;) {
      const { value, done } = await leser.read();
      if (done) break;
      rest += dek.decode(value, { stream: true });
      const teile = rest.split("\n\n"); rest = teile.pop();
      for (const t of teile) for (const z of t.split("\n")) {
        if (!z.startsWith("data: ") || z === "data: [DONE]") continue;
        let d; try { d = JSON.parse(z.slice(6)); } catch { continue; }
        if (d.error) throw new Error(d.error.message);
        const stueck = d.choices?.[0]?.delta?.content || "";
        if (stueck) { antwort += stueck; inhalt.textContent = antwort; li.scrollIntoView({ block: "end" }); }
      }
    }
    clearInterval(uhr);
    const sek = Math.round((Date.now() - t0) / 1000);
    warte.textContent = [modell, `${sek} s`, wissen ? `${wissen} geprüfte Quelle(n) aus dem Radar` : ""].filter(Boolean).join(" · ");
    if (antwort.trim()) daumenLeiste(li, frage, antwort);
    else inhalt.textContent = "Keine Antwort erhalten. Bitte erneut versuchen.";
  } catch (f) {
    clearInterval(uhr);
    warte.textContent = "";
    inhalt.textContent = text(f.message);
    li.classList.add("fehler");
  } finally {
    zustand.laeuft = false; $("senden").disabled = false;
  }
}

$("form-frage").addEventListener("submit", (e) => {
  e.preventDefault();
  const frage = $("frage").value.trim();
  if (!frage || zustand.laeuft) return;
  $("frage").value = ""; $("frage").style.height = "";
  frageSenden(frage);
});
$("frage").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); $("form-frage").requestSubmit(); } });
$("frage").addEventListener("input", (e) => { e.target.style.height = ""; e.target.style.height = `${Math.min(e.target.scrollHeight, 180)}px`; });

start();
