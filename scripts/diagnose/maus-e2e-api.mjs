#!/usr/bin/env node
// smejj.com — E2E-Harness: den FREIEN MAUS-LAUF des Panels ueber die Live-
// Schnittstelle nachfahren, ohne Browser-Anmeldung.
//
// WARUM (10.09.): Die Panel-Anmeldung war abgelaufen, die Chrome-Erweiterung
// getrennt — und der Lauf musste trotzdem bewiesen werden. Dieses Skript tut
// exakt, was browser-pane-maus.js tut: Hinsehen (ohne Bild) -> Planer
// (naechsterSchritt) -> Handeln, mit Zeitbilanz je Schritt und Anzeige der
// Planer-Messung (backend, ms, repariert). Zwei echte Fehler kamen so ans Licht
// (nth fiel im Locator weg; 429-Wartezeit zu kurz).
//
// Aufruf:
//   SMEJJ_EVAL_SESSION_TOKEN=$(node scripts/verlauf/mint-eval-token.mjs) \
//     node scripts/diagnose/maus-e2e-api.mjs "<Auftrag>" "<Startadresse>"
// Standard: Ada Lovelace ueber de.wikipedia.org/wiki/Spezial:Suche.
// Braucht die Origin-Kopfzeile https://smejj.com (isAllowedBrowserCaller).
// Hinsehen (ohne Bild) -> Planer (naechsterSchritt) -> Handeln, mit Zeitmessung je Schritt.
const API = "https://api.smejj.com";
const TOKEN = process.env.SMEJJ_EVAL_SESSION_TOKEN;
const TASK = process.argv[2] || "Öffne https://de.wikipedia.org/wiki/Spezial:Suche, suche dort nach Ada Lovelace und öffne ihren Artikel. Sag mir das Geburtsjahr.";
const START = process.argv[3] || "https://de.wikipedia.org/wiki/Spezial:Suche";
const H = { "content-type": "application/json", authorization: `Bearer ${TOKEN}`, origin: "https://smejj.com" };
const t0 = Date.now(); const s = () => ((Date.now() - t0) / 1000).toFixed(1);
async function post(pfad, body, ms = 60000) {
  const a = Date.now();
  const r = await fetch(API + pfad, { method: "POST", headers: H, body: JSON.stringify(body), signal: AbortSignal.timeout(ms) }).catch((e) => ({ status: "FEHLER " + e.name, text: async () => "" }));
  const text = await r.text(); let j = null; try { j = JSON.parse(text); } catch {}
  return { status: r.status, j, ms: Date.now() - a, roh: text.slice(0, 160) };
}
const beschreibe = (st) => { const sel = st.target?.selector || st.target || {}; const wo = sel.name || sel.value || ""; const n = Number.isInteger(sel.nth) ? ` (Treffer ${sel.nth + 1})` : ""; return st.action === "navigate" ? `Seite öffnen: ${st.url}` : st.action === "click" || st.action === "openLink" ? `Klicken: ${wo}${n}` : st.action === "type" ? `Tippen in ${wo}${n}` : `${st.action}: ${wo}`; };
const alsAktion = (st) => { const sel = st.target?.selector || st.target || null; const z = sel ? { strategy: sel.strategy, value: sel.value, ...(sel.name !== undefined ? { name: sel.name } : {}), ...(Number.isInteger(sel.nth) && sel.nth >= 0 ? { nth: sel.nth } : {}) } : null;
  if (st.action === "navigate") return { type: "navigate", url: st.url };
  if (["click", "openLink"].includes(st.action)) return z && { type: "selectorClick", ...z };
  if (st.action === "type") return z && { type: "selectorType", ...z, text: String(st.text ?? st.value ?? "") };
  if (["extract", "assert"].includes(st.action)) return z && { type: "selectorText", ...z };
  if (st.action === "scroll") return { type: "scroll", deltaY: 600 };
  return null; };
const open = await post("/api/browser/session", { url: START, viewport: { width: 1365, height: 900 } }, 60000);
if (!open.j?.ok) { console.log("OPEN fehlgeschlagen", open.status, open.roh); process.exit(1); }
const sid = open.j.sessionId; console.log(`[${s()}s] Sitzung ${sid.slice(0, 8)} offen, ${open.ms} ms, ${open.j.title}`);
const verlauf = []; const zeit = { hinsehen: 0, ueberlegen: 0, handeln: 0 }; let ergebnis = null;
for (let n = 1; n <= 12; n++) {
  const blick = await post("/api/browser/session/act", { sessionId: sid, action: { type: "observe", ohneBild: true } }, 45000);
  zeit.hinsehen += blick.ms;
  if (!blick.j?.beobachtung) { console.log(`[${s()}s] ${n}: Hinsehen FEHL ${blick.status} ${blick.j?.error || blick.roh} (${blick.ms} ms)`); break; }
  const b = blick.j.beobachtung; console.log(`[${s()}s] ${n}: Hinsehen ${blick.ms} ms — ${b.title} — ${b.elements?.length} Elemente`);
  const plan = await post("/api/maus/run", { naechsterSchritt: true, task: TASK, capsuleRef: `e2e-${t0.toString(36)}`, domainAllowlist: ["de.wikipedia.org"], beobachtung: b, verlauf: verlauf.slice(-12), restSchritte: 13 - n }, 130000);
  zeit.ueberlegen += plan.ms; const p = plan.j?.planer;
  if (!plan.j?.ok) { console.log(`[${s()}s] ${n}: Planer ${plan.status} ${plan.j?.error} ${JSON.stringify(plan.j?.gruende || "")} (${plan.ms} ms)`); verlauf.push(`VERWORFEN: ${(plan.j?.gruende || []).join("; ")}`); continue; }
  const e = plan.j.entscheidung; console.log(`[${s()}s] ${n}: Überlegt ${plan.ms} ms (${p?.backend} ${p?.ms} ms${plan.j.repariert?.length ? ", repariert " + plan.j.repariert.join(",") : ""}) → ${e.decision}${e.step ? " " + beschreibe(e.step) : ": " + (e.result || e.reason)}`);
  if (e.decision !== "act") { ergebnis = e; break; }
  const aktion = alsAktion(e.step); if (!aktion) { verlauf.push(`FEHLGESCHLAGEN: ${beschreibe(e.step)} (nicht ausfuehrbar)`); continue; }
  const tat = await post("/api/browser/session/act", { sessionId: sid, action: aktion }, 45000);
  zeit.handeln += tat.ms;
  if (tat.j?.ok) { console.log(`[${s()}s] ${n}: Handeln ${tat.ms} ms ok${tat.j.gelesen ? " → " + tat.j.gelesen.slice(0, 80) : ""}`); verlauf.push(tat.j.gelesen ? `${beschreibe(e.step)} → »${tat.j.gelesen.slice(0, 300)}«` : `${beschreibe(e.step)}: erledigt`); }
  else { console.log(`[${s()}s] ${n}: Handeln FEHL ${tat.status} ${tat.j?.error || tat.roh} (${tat.ms} ms)`); verlauf.push(`FEHLGESCHLAGEN: ${beschreibe(e.step)} (${String(tat.j?.error || "keine Antwort").slice(0, 220)}) — bitte anders vorgehen`); }
}
console.log(`ERGEBNIS: ${ergebnis ? ergebnis.decision + ": " + (ergebnis.result || ergebnis.reason) : "kein Abschluss"} [${s()} s: Hinsehen ${(zeit.hinsehen/1000).toFixed(0)} s, Überlegen ${(zeit.ueberlegen/1000).toFixed(0)} s, Handeln ${(zeit.handeln/1000).toFixed(0)} s]`);
await post("/api/browser/session/close", { sessionId: sid }, 20000);
