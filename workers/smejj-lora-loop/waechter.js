// smejj.com Dauertrainings-Schleife — Anlaufwaechter
// (Single Responsibility: darf eine GPU, die nicht bedient, weiterlaufen?).
//
// DIE REGEL, DIE 2,55 USD GEKOSTET HAT:
// Am 2026-08-01 lief ein Trainer-Container 28 Stunden ins Leere. Salad meldete
// die ganze Zeit "running, ready=true", die Anwendung darin hat nie bedient.
// Niemand hatte eine Abbruchbedingung gesetzt — nicht aus Nachlaessigkeit,
// sondern weil sie als Vorsatz existierte und nicht als Code. Genau das ist
// hier nachgeholt.
//
// ABGRENZUNG ZU budget.js: dort liegen die Bremsen fuer GEPLANTE Ausgaben
// (Deckel, Freigabe, Laufzeit je Zyklus, Notaus). Sie greifen alle VOR dem
// Start eines Zyklus. Dieses Modul deckt den anderen Fall ab: es laeuft bereits
// eine Karte, aber sie leistet nichts. Kein Zyklus laeuft, also schlaegt keine
// Zyklusbremse an — und trotzdem tickt der Zaehler.
//
// WARUM DER WAECHTER IM LOOP SITZT UND NICHT IM TRAINER:
// Der Trainer koennte sich nur selbst beenden (Prozess-Ende). Bei
// restart_policy=always startet Salad ihn danach sofort neu — eine Schleife,
// die genauso viel kostet wie der Stillstand. Ein echtes Stoppen verlangt den
// Salad-Schluessel. Der gehoert NICHT in einen Container auf einer fremden
// Community-GPU, sondern in den vertrauenswuerdigen Loop-Prozess.
//
// Dieses Modul entscheidet nur. Es ruft nichts auf und kennt kein fetch —
// damit ist die Entscheidung ohne Netz und ohne Kosten pruefbar.

/** Voreinstellung: eine Stunde. Danach ist ein Anlauf kein Anlauf mehr. */
export const STANDARD_BEREIT_FRIST_MS = 60 * 60 * 1000;

function begrenzteZahl(wert, ersatz, min, max) {
  const zahl = Number(wert);
  if (!Number.isFinite(zahl)) return ersatz;
  return Math.min(max, Math.max(min, Math.round(zahl)));
}

/**
 * Liest die Waechter-Grenzen aus der Umgebung.
 *
 * Die Frist ist nach oben auf sechs Stunden begrenzt. Ein Tippfehler mit einer
 * zusaetzlichen Null darf den Waechter nicht faktisch abschalten — genau so
 * entstehen die Faelle, gegen die er gebaut ist.
 */
export function leseWachtGrenzen(env = process.env) {
  return Object.freeze({
    bereitFristMs: begrenzteZahl(
      env.SMEJJ_LORA_BEREIT_FRIST_MS,
      STANDARD_BEREIT_FRIST_MS,
      5 * 60 * 1000,
      6 * 60 * 60 * 1000
    ),
    // Ausdruecklich abschaltbar, aber nur mit einem klaren Wort. Ein leerer
    // oder unsinniger Wert laesst den Waechter scharf.
    aktiv: String(env.SMEJJ_LORA_WAECHTER || "AN").trim().toUpperCase() !== "AUS"
  });
}

/**
 * Die Entscheidung.
 *
 * @param {object}  lage
 * @param {boolean} lage.erreichbar        Hat /health ueberhaupt geantwortet?
 * @param {boolean} lage.bereit            Meldet der Trainer bereit=true?
 * @param {number}  lage.nichtBereitSeitMs Wie lange ist er schon nicht bereit?
 * @param {boolean} lage.zyklusLaeuft      Laeuft gerade ein Trainingszyklus?
 * @param {boolean} lage.ausfallBestaetigt Bestaetigt eine zweite, unabhaengige
 *   Quelle den Ausfall? Nur noetig, wenn der Trainer UNERREICHBAR ist; der
 *   Aufrufer belegt es mit `saladBestaetigtAusfall()`. Ohne Bestaetigung wird
 *   NICHT gestoppt — siehe `unerreichbar_ohne_zweitmeinung`.
 * @param {object}  grenzen                aus leseWachtGrenzen()
 * @returns {{stoppen: boolean, grund: string|null}}
 */
export function bewerteWacht({ erreichbar, bereit, nichtBereitSeitMs, zyklusLaeuft = false, ausfallBestaetigt = true } = {}, grenzen = leseWachtGrenzen()) {
  if (!grenzen.aktiv) return { stoppen: false, grund: null };

  // Ein laufender Zyklus wird NIE vom Waechter abgeraeumt. Dafuer gibt es den
  // Laufzeitdeckel in budget.js, der die bereits investierte Rechenzeit kennt.
  // Zwei Stellen, die denselben Lauf beenden duerfen, wuerden sich gegenseitig
  // die Ergebnisse wegnehmen.
  if (zyklusLaeuft) return { stoppen: false, grund: null };

  // Bereit ist der Normalfall. Eine wartende, bereite Karte ist gewollt: sie
  // haelt das Modell im Speicher und spart den naechsten Ladevorgang.
  if (bereit === true) return { stoppen: false, grund: null };

  const seit = Number(nichtBereitSeitMs);
  if (!Number.isFinite(seit) || seit < 0) {
    // Ohne belastbare Zeitangabe wird NICHT gestoppt. Fail-closed heisst hier
    // ausnahmsweise "nichts abraeumen": ein faelschlich beendeter Lauf kostet
    // die bereits bezahlte Rechenzeit, ein zu spaeter Stopp nur Minuten.
    return { stoppen: false, grund: null };
  }
  if (seit < grenzen.bereitFristMs) return { stoppen: false, grund: null };

  const minuten = Math.round(seit / 60000);

  // GEMESSEN AM 2026-08-04, dreimal: die Dauerwache meldete "fetch failed" und
  // damit einen Ausfall — der Trainer war jedes Mal in derselben Minute
  // nachweislich gesund (5x HTTP 200, unveraenderte Instanz-id, ready=true).
  // Es waren Aussetzer auf der Leitung des Waechters, einer davon laenger als
  // die eingebaute Wiederholung.
  //
  // Ein Waechter, der die eigene Leitung nicht von einem kranken Dienst
  // unterscheidet, beendet frueher oder spaeter eine gesunde, bezahlte GPU —
  // und zwar genau dann, wenn er selbst offline ist und es niemand sieht.
  // "unerreichbar" ist deshalb nur dann ein Stoppgrund, wenn eine ZWEITE,
  // unabhaengige Quelle den Ausfall bestaetigt (saladBestaetigtAusfall).
  if (!erreichbar && !ausfallBestaetigt) {
    return { stoppen: false, grund: `unerreichbar_ohne_zweitmeinung_seit_${minuten}min` };
  }

  return {
    stoppen: true,
    grund: erreichbar
      ? `trainer_nicht_bereit_seit_${minuten}min`
      : `trainer_unerreichbar_seit_${minuten}min`
  };
}

/**
 * Die Salad-Koordinaten, ohne die kein Stopp moeglich ist.
 *
 * Fehlt eine davon, ist der Waechter zahnlos: er kann melden, aber nicht
 * handeln. Das MUSS auffallen — ein Waechter, der nur zusieht, ist gefaehrlicher
 * als gar keiner, weil er Sicherheit vortaeuscht. Deshalb gibt es hier ein
 * `vollstaendig`-Feld, das der Aufrufer laut protokollieren kann.
 */
export function leseSaladKoordinaten(env = process.env) {
  const organisation = env.SALAD_ORGANIZATION_NAME || "";
  const projekt = env.SALAD_PROJECT_NAME || "";
  const gruppe = env.SMEJJ_TRAINER_GRUPPE || "smejj-lora-trainer";
  // Der Loop bekommt den Salad-Schluessel ohnehin als SMEJJ_LORA_TRAINER_KEY —
  // es ist derselbe Schluessel, der auch das Gateway oeffnet.
  const apiKey = env.SMEJJ_LORA_TRAINER_KEY || env.SALAD_API_KEY || "";
  const fehlend = [];
  if (!organisation) fehlend.push("SALAD_ORGANIZATION_NAME");
  if (!projekt) fehlend.push("SALAD_PROJECT_NAME");
  if (!apiKey) fehlend.push("SMEJJ_LORA_TRAINER_KEY");
  return Object.freeze({
    organisation, projekt, gruppe, apiKey,
    fehlend: Object.freeze(fehlend),
    vollstaendig: fehlend.length === 0
  });
}

/**
 * Bestaetigt eine ZWEITE, unabhaengige Quelle den Ausfall?
 *
 * Gefragt wird Salads eigenes Bereitschaftsurteil ueber die Instanzen. Das ist
 * die belastbarste verfuegbare Gegenmeinung: Salads Readiness-Sonde ruft
 * dieselbe `/health`-Route auf, aber VON INNEN — sie haengt nicht an der
 * Leitung des Waechters.
 *
 * Drei Faelle, und nur einer rechtfertigt das Abschalten:
 *   API nicht erreichbar        -> false. Der Waechter ist blind, nicht der Trainer.
 *   API sagt eine Instanz ready -> false. Der Dienst bedient; das Problem liegt
 *                                  auf dem Weg dorthin, also beim Waechter.
 *   API sagt KEINE Instanz ready-> true.  Jetzt sind sich beide Seiten einig.
 *
 * Am 2026-08-04 dreimal live gebraucht: der Waechter meldete "fetch failed",
 * waehrend dieselbe Instanz (unveraenderte id) durchgehend `ready=true` war und
 * direkte Abfragen 5/5 HTTP 200 lieferten.
 */
export async function saladBestaetigtAusfall({ koordinaten, fetchImpl = fetch, zeitgrenzeMs = 15_000 } = {}) {
  if (!koordinaten?.vollstaendig) return false;
  const steuerung = new AbortController();
  const uhr = setTimeout(() => steuerung.abort(), zeitgrenzeMs);
  try {
    const url = `https://api.salad.com/api/public/organizations/${koordinaten.organisation}`
      + `/projects/${koordinaten.projekt}/containers/${koordinaten.gruppe}/instances`;
    const antwort = await fetchImpl(url, {
      // Ohne Wiederverwendung: in einem langlebigen Prozess reicht undici sonst
      // eine vom Gegenueber geschlossene Verbindung minutenlang weiter und die
      // Abfrage scheitert, obwohl die Gegenseite laengst wieder antwortet
      // (am 2026-08-04 acht Minuten am Stueck gemessen).
      headers: { "Salad-Api-Key": koordinaten.apiKey, accept: "application/json", connection: "close" },
      signal: steuerung.signal
    });
    if (!antwort.ok) return false;
    const daten = await antwort.json();
    const instanzen = Array.isArray(daten?.instances) ? daten.instances : [];
    // Keine einzige bereite Instanz -> der Ausfall ist bestaetigt.
    return !instanzen.some((instanz) => instanz?.ready === true);
  } catch {
    return false;
  } finally {
    clearTimeout(uhr);
  }
}

/**
 * Beendet die Container-Gruppe. Gibt ehrlich `false` zurueck, wenn es nicht
 * geklappt hat — der Aufrufer muss das protokollieren und darf es NICHT als
 * erledigt verbuchen. Eine Karte, die man faelschlich fuer gestoppt haelt,
 * laeuft genau so lange weiter wie eine, um die sich niemand kuemmert.
 */
export async function stoppeContainerGruppe({ koordinaten, fetchImpl = fetch, zeitgrenzeMs = 15_000 } = {}) {
  if (!koordinaten?.vollstaendig) {
    return { ok: false, fehler: `koordinaten_fehlen:${koordinaten?.fehlend?.join(",") || "alle"}` };
  }
  const steuerung = new AbortController();
  const uhr = setTimeout(() => steuerung.abort(), zeitgrenzeMs);
  try {
    const url = `https://api.salad.com/api/public/organizations/${koordinaten.organisation}`
      + `/projects/${koordinaten.projekt}/containers/${koordinaten.gruppe}/stop`;
    const antwort = await fetchImpl(url, {
      method: "POST",
      headers: { "Salad-Api-Key": koordinaten.apiKey, accept: "application/json" },
      signal: steuerung.signal
    });
    // Salad quittiert den Stopp mit 202 Accepted, nicht mit 200.
    const ok = antwort.status === 200 || antwort.status === 202 || antwort.status === 204;
    return ok ? { ok: true, status: antwort.status } : { ok: false, status: antwort.status, fehler: `http_${antwort.status}` };
  } catch (error) {
    return { ok: false, fehler: String(error?.name === "AbortError" ? "zeitgrenze" : error?.message || error).slice(0, 160) };
  } finally {
    clearTimeout(uhr);
  }
}

/**
 * Verfolgt ueber mehrere Messungen, seit wann der Trainer nicht bereit ist.
 *
 * Bewusst ein eigenes kleines Gedaechtnis statt eines Zeitstempels im
 * Trainer: der Trainer wird beim Stopp neu aufgesetzt und verliert seinen
 * Zeitstempel; der Waechter muss ueber genau diesen Neustart hinweg zaehlen.
 */
export function erzeugeWachtGedaechtnis(jetzt = () => Date.now(), { maxLueckeMs = 0 } = {}) {
  let nichtBereitSeit = null;
  let letzteMeldung = null;

  return Object.freeze({
    /** @returns {number} Millisekunden ununterbrochener, BEOBACHTETER Nichtbereitschaft. */
    melde(bereit) {
      const nun = jetzt();

      // MESSLUECKE. Beobachtet am 2026-08-04: zwischen zwei Meldungen lagen
      // 2 h 45 min statt einer Minute — der Rechner des Waechters hatte
      // geschlafen. Die Uhr misst aber "wie lange ist der Trainer schon nicht
      // bereit", nicht "wieviel Zeit ist vergangen".
      //
      // Ohne diese Bremse stuende die Uhr nach dem Aufwachen sofort ueber der
      // Frist, und eine EINZIGE danebengegangene Abfrage koennte eine gesunde
      // Karte beenden. Was nicht beobachtet wurde, darf nicht als beobachtete
      // Nichtbereitschaft zaehlen.
      if (maxLueckeMs > 0 && letzteMeldung !== null && nun - letzteMeldung > maxLueckeMs) {
        nichtBereitSeit = null;
      }
      letzteMeldung = nun;

      if (bereit === true) {
        nichtBereitSeit = null;
        return 0;
      }
      if (nichtBereitSeit === null) nichtBereitSeit = nun;
      return nun - nichtBereitSeit;
    },
    zuruecksetzen() {
      nichtBereitSeit = null;
      letzteMeldung = null;
    }
  });
}
