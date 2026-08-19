import { alsHerkunft } from "./adresse.js";
// smejj.com Maus-Bruecke — sichtbare Freigabe pro Herkunft.
// Single Responsibility: dem Betreiber zeigen, WO die Maus gerade arbeiten
// duerfte, und ihn das ein- und ausschalten lassen. Ohne einen Klick hier
// passiert im echten Chrome gar nichts.
const FREIGABE_DAUER_MS = 30 * 60 * 1000;

const $ = (id) => document.getElementById(id);

async function aktuelleHerkunft() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    const url = new URL(String(tab?.url || ""));
    return url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

async function lies() {
  const { freigaben = {} } = await chrome.storage.local.get("freigaben");
  const jetzt = Date.now();
  return Object.fromEntries(Object.entries(freigaben).filter(([, bis]) => Number(bis) > jetzt));
}

async function schreibe(liste) {
  await chrome.storage.local.set({ freigaben: liste });
}

async function zeichne() {
  const herkunft = await aktuelleHerkunft();
  $("herkunft").textContent = herkunft || "(keine https-Seite)";
  $("erlauben").disabled = !herkunft;
  const liste = await lies();
  $("stand").textContent = herkunft && liste[herkunft]
    ? `Freigegeben noch ${Math.ceil((liste[herkunft] - Date.now()) / 60000)} Minuten.`
    : "Diese Seite ist nicht freigegeben.";
  $("liste").textContent = "";
  for (const [ort, bis] of Object.entries(liste)) {
    const li = document.createElement("li");
    li.textContent = `${ort} (${Math.ceil((bis - Date.now()) / 60000)} min)`;
    $("liste").append(li);
  }
}

$("erlauben").addEventListener("click", async () => {
  const herkunft = await aktuelleHerkunft();
  if (!herkunft) return;
  // Die Host-Berechtigung wird ERST HIER erfragt — im direkten Anschluss an
  // den Klick des Betreibers. Chrome zeigt dabei seinen eigenen Dialog; die
  // Erweiterung bekommt nie mehr Rechte, als er dort bestaetigt.
  const gewaehrt = await chrome.permissions.request({ origins: [`${herkunft}/*`] });
  if (!gewaehrt) return;
  const liste = await lies();
  liste[herkunft] = Date.now() + FREIGABE_DAUER_MS;
  await schreibe(liste);
  zeichne();
});

$("entziehen").addEventListener("click", async () => {
  const herkunft = await aktuelleHerkunft();
  if (!herkunft) return;
  const liste = await lies();
  delete liste[herkunft];
  await schreibe(liste);
  await chrome.permissions.remove({ origins: [`${herkunft}/*`] }).catch(() => {});
  zeichne();
});

zeichne();

// --- Ein Ziel freigeben, ohne vorher hinzunavigieren -------------------------
//
// Bis hierher liess sich nur die GERADE OFFENE Seite freigeben. Fuer den
// eigentlichen Zweck ist das umstaendlich: wer der Maus auf smejj.com einen
// Gmail-Auftrag gibt, muesste erst selbst Gmail oeffnen, hier klicken und
// zurueckwechseln. Genau der Umweg, den die Maus abnehmen soll.
//
// chrome.permissions.request laeuft weiterhin direkt auf den Klick des
// Betreibers, und Chrome zeigt dabei seinen eigenen Dialog — die Erweiterung
// bekommt kein Recht, das er dort nicht bestaetigt. Nur der Weg dorthin ist
// kuerzer geworden, nicht die Schranke niedriger.
$("zielErlauben")?.addEventListener("click", async () => {
  const herkunft = alsHerkunft($("ziel").value);
  if (!herkunft) {
    $("stand").textContent = "Das ist keine gueltige https-Adresse.";
    return;
  }
  const gewaehrt = await chrome.permissions.request({ origins: [`${herkunft}/*`] });
  if (!gewaehrt) {
    $("stand").textContent = "Chrome hat die Berechtigung nicht erteilt.";
    return;
  }
  const liste = await lies();
  liste[herkunft] = Date.now() + FREIGABE_DAUER_MS;
  await schreibe(liste);
  $("ziel").value = "";
  zeichne();
});
