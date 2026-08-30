// smejj.com Maus-Bruecke — Inhaltsskript, laeuft NUR auf smejj.com.
//
// WOZU: Die Seite soll die Erweiterung ansprechen koennen, ohne deren Kennung
// zu kennen. Eine unverpackt geladene Erweiterung bekommt bei jeder
// Installation eine ANDERE Kennung — sie fest einzutragen hiesse, dass die
// Bruecke auf genau einem Rechner funktioniert und sonst nirgends.
//
// Darum dieser Weg: das Inhaltsskript sitzt im selben Fenster wie die Seite
// und reicht Nachrichten durch. Die Seite ruft nie chrome.* auf.
//
// SICHERHEIT: Es wird ausschliesslich auf Nachrichten aus DEMSELBEN Fenster
// gehoert (event.source === window) und nur auf die eigene Kennung. Fremde
// Rahmen koennen nichts einschleusen. Ausgefuehrt wird ohnehin nichts hier —
// der Hintergrund prueft Freigabe und Vokabular noch einmal vollstaendig.
const MARKE = "smejj-maus-bruecke";

window.addEventListener("message", (ereignis) => {
  if (ereignis.source !== window) return;
  const daten = ereignis.data;
  if (!daten || daten.marke !== MARKE || !daten.ruf) return;

  chrome.runtime.sendMessage(daten.nachricht, (antwort) => {
    const fehler = chrome.runtime.lastError;
    window.postMessage({
      marke: MARKE,
      antwortAuf: daten.ruf,
      antwort: fehler ? { ok: false, error: String(fehler.message).slice(0, 200) } : antwort
    }, window.location.origin);
  });
});

// Anwesenheit melden — daran erkennt die Seite, dass die Bruecke da ist,
// ohne zu fragen und ohne auf eine Zeitgrenze zu warten.
document.documentElement.dataset.smejjMausBruecke = chrome.runtime.getManifest().version;
window.postMessage({ marke: MARKE, bereit: true }, window.location.origin);
