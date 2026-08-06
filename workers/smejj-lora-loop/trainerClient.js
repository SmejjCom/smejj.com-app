// smejj.com Dauertrainings-Schleife — Vertrag zum GPU-Trainingsdienst
// (Single Responsibility: Start, Zustand und Abbruch eines Trainingslaufs).
//
// Dieses Modul kennt keine Hyperparameter-Logik und keine Kosten — es reicht
// nur durch. Der Trainingsdienst selbst ist ein eigener Container auf der
// gemieteten GPU (llama.cpp/peft-Bild), NICHT Teil dieses Prozesses. Die
// Schleife laeuft auf der billigen CPU-Instanz und steuert die teure Karte
// von aussen; so kostet ein Wartezustand nichts.
//
// FAIL-CLOSED HEISST HIER KONKRET: jeder Aufruf hat eine Zeitgrenze und jeder
// Fehler ist ein NEIN, nie ein "vermutlich schon gelaufen". Ein Trainingsdienst,
// der nicht antwortet, gilt als nicht erreichbar — dann wird nichts gestartet
// und nichts bezahlt. Ein unklarer Zustand fuehrt zum Abbruch, weil die
// Alternative waere, eine laufende Karte unbeaufsichtigt weiterlaufen zu lassen.

const STANDARD_ZEITGRENZE_MS = 20_000;

async function anfrage(basisUrl, pfad, {
  methode = "GET",
  koerper = null,
  apiKey = "",
  zeitgrenzeMs = STANDARD_ZEITGRENZE_MS,
  fetchImpl = fetch
} = {}) {
  if (!basisUrl) return { ok: false, status: 0, fehler: "trainer_adresse_fehlt" };
  const steuerung = new AbortController();
  const uhr = setTimeout(() => steuerung.abort(), zeitgrenzeMs);
  try {
    const antwort = await fetchImpl(new URL(pfad, basisUrl), {
      method: methode,
      headers: {
        "content-type": "application/json; charset=utf-8",
        // KEINE Verbindungswiederverwendung. Gemessen am 2026-08-04 am
        // Anlaufwaechter: in einem langlebigen Prozess haelt undici Verbindungen
        // offen, das Gateway schliesst sie, und der Pool reicht die Leiche noch
        // minutenlang weiter — acht Minuten "fetch failed" am Stueck, waehrend
        // ein frischer Prozess zeitgleich 5/5 HTTP 200 bekam.
        //
        // Dieser Prozess laeuft rund um die Uhr und fragt im 30-Sekunden-Takt.
        // Ein TLS-Handschlag je Abfrage ist dagegen belanglos; eine Messung, die
        // den eigenen Pool statt den Dienst beschreibt, ist es nicht — sie
        // wuerde hier als "trainer_nicht_erreichbar" einen Zyklus verhindern.
        connection: "close",
        ...(apiKey ? { "Salad-Api-Key": apiKey } : {})
      },
      body: koerper ? JSON.stringify(koerper) : undefined,
      signal: steuerung.signal
    });
    const text = await antwort.text();
    let daten = null;
    try { daten = text ? JSON.parse(text) : null; } catch { daten = null; }
    return { ok: antwort.ok, status: antwort.status, daten, roh: text.slice(0, 300) };
  } catch (error) {
    // Auch ein Abbruch durch die Zeitgrenze landet hier — bewusst als
    // gewoehnlicher Fehlschlag, nicht als Sonderfall.
    return { ok: false, status: 0, fehler: String(error?.name === "AbortError" ? "zeitgrenze" : error?.message || error).slice(0, 160) };
  } finally {
    // Ohne dieses clearTimeout bleibt nach JEDEM Aufruf ein Timer offen, bis
    // seine Zeitgrenze abgelaeuft. Im Dauerbetrieb mit einer Statusabfrage alle
    // 30 Sekunden waeren das dauerhaft offene Handles — und der Prozess koennte
    // sich beim Herunterfahren nicht beenden.
    clearTimeout(uhr);
  }
}

/**
 * Ist der Trainingsdienst da? Wird VOR der Budgetentscheidung gefragt, damit
 * eine unerreichbare Karte gar nicht erst als Startgrund zaehlt.
 */
export async function trainerErreichbar({ basisUrl, apiKey, fetchImpl, zeitgrenzeMs = 10_000 } = {}) {
  const ergebnis = await anfrage(basisUrl, "/health", { apiKey, fetchImpl, zeitgrenzeMs });
  return ergebnis.ok === true;
}

/**
 * Startet einen LoRA-Lauf.
 *
 * `datensatz` enthaelt ausschliesslich VERWEISE (Ablage-Schluessel), nie die
 * Datenzeilen selbst — Trainingsdaten gehen nicht durch diesen Prozess und
 * nicht durch seine Protokolle.
 */
export async function starteTraining({
  basisUrl,
  apiKey,
  konfiguration,
  basismodell,
  datensatz,
  fetchImpl,
  zeitgrenzeMs
} = {}) {
  const ergebnis = await anfrage(basisUrl, "/training/start", {
    methode: "POST",
    apiKey,
    fetchImpl,
    zeitgrenzeMs,
    koerper: {
      basismodell,
      datensatzSchluessel: datensatz?.schluessel || null,
      datensatzManifestSchluessel: datensatz?.manifestSchluessel || null,
      hyperparameter: {
        lernrate: konfiguration?.lernrate,
        loraRang: konfiguration?.loraRang,
        loraAlpha: konfiguration?.loraAlpha,
        epochen: konfiguration?.epochen,
        projektAnteil: konfiguration?.projektAnteil
      },
      kennung: konfiguration?.kennung
    }
  });
  if (!ergebnis.ok || !ergebnis.daten?.laufId) {
    return {
      ok: false,
      gruende: [`training_start_fehlgeschlagen:${ergebnis.status || ergebnis.fehler || "unbekannt"}`],
      // Bei 409 nennt der Trainer den Lauf, der noch belegt. Der Aufrufer
      // braucht die Kennung, um ihn aufzuraeumen — sonst blockiert ein
      // verwaister Lauf jeden weiteren Zyklus, bis jemand von Hand eingreift.
      aktiverLauf: ergebnis.daten?.aktiverLauf || null
    };
  }
  return { ok: true, laufId: String(ergebnis.daten.laufId) };
}

/**
 * Fragt den Zustand ab.
 * Rueckgabe-Zustaende: "laeuft" | "fertig" | "fehlgeschlagen" | "unbekannt".
 * "unbekannt" wird vom Aufrufer wie ein Fehlschlag behandelt.
 */
export async function trainingZustand({ basisUrl, apiKey, laufId, fetchImpl, zeitgrenzeMs } = {}) {
  const ergebnis = await anfrage(basisUrl, `/training/status/${encodeURIComponent(laufId)}`, {
    apiKey, fetchImpl, zeitgrenzeMs
  });
  if (!ergebnis.ok) return { zustand: "unbekannt", fehler: ergebnis.fehler || `status_${ergebnis.status}` };
  const roh = String(ergebnis.daten?.zustand || ergebnis.daten?.state || "").toLowerCase();
  const zustand = ["laeuft", "running", "training"].includes(roh) ? "laeuft"
    : ["fertig", "done", "completed", "succeeded"].includes(roh) ? "fertig"
      : ["fehlgeschlagen", "failed", "error"].includes(roh) ? "fehlgeschlagen"
        : "unbekannt";
  return {
    zustand,
    adapterSchluessel: ergebnis.daten?.adapterSchluessel || null,
    // Adresse, unter der der frisch trainierte Stand zum Messen bereitsteht.
    messEndpunkt: ergebnis.daten?.messEndpunkt || null,
    gelaufeneMinuten: Number(ergebnis.daten?.gelaufeneMinuten) || 0
  };
}

/**
 * Bricht einen Lauf ab und beendet die GPU-Instanz.
 *
 * Wird sowohl vom Notaus als auch von der Laufzeitgrenze benutzt. Gibt bewusst
 * auch dann `false` zurueck, wenn der Dienst nicht antwortet — der Aufrufer
 * muss dann eskalieren (Container-Gruppe ueber die Salad-API stoppen), statt
 * anzunehmen, es sei erledigt.
 */
export async function brichTrainingAb({ basisUrl, apiKey, laufId, fetchImpl, zeitgrenzeMs = 15_000 } = {}) {
  const ergebnis = await anfrage(basisUrl, `/training/abort/${encodeURIComponent(laufId)}`, {
    methode: "POST", apiKey, fetchImpl, zeitgrenzeMs
  });
  return ergebnis.ok === true;
}
