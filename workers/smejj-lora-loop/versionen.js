// smejj.com Dauertrainings-Schleife — Versionsschema und Versionsregister
// (Single Responsibility: einem bewiesenen Stand seinen Namen geben und alle
// Versionen fuehren).
//
// Das Schema folgt der Uebung der grossen Modellfamilien: eine HAUPTVERSION
// bezeichnet eine Basismodell-Generation, eine NEBENVERSION einen Nachtrainings-
// lauf auf derselben Basis.
//
//   smejj-1-0  erster bewiesener Stand auf der ersten Basis (Qwen3-8B)
//   smejj-1-1  Nachtraining auf derselben Basis, das den Besten schlaegt
//   smejj-2-0  Wechsel der Basis (z. B. Qwen3-14B) beginnt eine neue Generation
//
// ABGRENZUNG — zwei Tore, keine Doppeltuer:
//   1. Dieses Modul entscheidet nur, WER einen Versionsnamen BEKOMMT: ausschliesslich
//      ein Ergebnis, das istNeuerBester (sweep.js) bestanden hat — Eval-Sieg ueber
//      die Rauschschwelle und null kritische Fehler.
//   2. OB eine Version Nutzer sieht, entscheidet unverändert
//      src/evaluation/modelPromotion.js und dort ein Mensch (promotionStatus
//      bleibt "not-approved", siehe state.js#schreibeBestenStand).
//
// Die Version ist damit die Waehrung zwischen beiden Toeren: der beste-stand
// traegt sie als Kandidat, das Register behaelt alle Versionen mit ihren
// Metadaten fuer die Befoerderungsentscheidung.

/** Schlüsselform: Bindestriche, passend zu checkpoints/smejj-1-0/... und der Modellkennung. */
export const VERSIONS_MUSTER = /^smejj-(\d{1,3})-(\d{1,3})$/;

/** Wie viele Eintraege das Register haelt. Danach fallen die aeltesten raus — der beste-stand bleibt unberuehrt. */
export const REGISTER_MAX = 200;

/** Anzeigeform "smejj-1-1" -> "smejj 1.1" (Berichte, /health, Kapseln). */
export function versionsAnzeige(version) {
  const treffer = VERSIONS_MUSTER.exec(String(version || ""));
  if (!treffer) return null;
  return `smejj ${Number(treffer[1])}.${Number(treffer[2])}`;
}

function bestandteile(version) {
  const treffer = VERSIONS_MUSTER.exec(String(version || ""));
  if (!treffer) return null;
  return { haupt: Number(treffer[1]), neben: Number(treffer[2]) };
}

function schluesselform(haupt, neben) {
  return `smejj-${haupt}-${neben}`;
}

function gleicheBasis(a, b) {
  return String(a || "").trim() !== "" && a === b;
}

/**
 * Die Version des NAECHSTEN Besten.
 *
 * Rein und deterministisch aus (bisheriger bester Stand, neue Basis) ableitbar —
 * dieselbe Konfiguration muss nach einem Container-Neustart dieselbe Version
 * ergeben, sonst wandern Namen zwischen Zweiungen.
 *
 * Basis-Generation ohne Spur: Ein Stand ohne Versionsfeld (Zeit vor diesem
 * Schema, der reale smejj-1-0) und ein Stand, dessen Basis nirgends mitgefuehrt
 * wird, gelten als DIESELBE Basis wie die aktuelle Konfiguration. Ein echter
 * Generationswechsel ist nur maschinell beweisbar, wenn die alte Basis
 * dokumentiert ist — ohne Beweis keine neue Hauptversion.
 */
export function naechsteVersion(bisherigerStand, neuesBasisRepo, bisherigeBasisRepo) {
  const neueBasis = String(neuesBasisRepo || "").trim();
  if (!neueBasis) {
    return { version: null, gruende: ["kein_basismodell"] };
  }

  const bisherigeVersion = bestandteile(bisherigerStand?.version);
  const altBasis = bisherigeBasisRepo ?? bisherigerStand?.basismodell?.hfRepo;
  const basisBleibt = !bisherigerStand || !altBasis || gleicheBasis(neueBasis, altBasis);

  if (!bisherigerStand) return { version: schluesselform(1, 0), gruende: ["erste_version"] };
  if (!bisherigeVersion) {
    // Vor-Schema-Stand: er TRUG "smejj-1-0" implizit, der naechste erbt die naechste Nummer.
    return basisBleibt
      ? { version: schluesselform(1, 1), gruende: ["vor_schema_gleiche_basis"] }
      : { version: schluesselform(2, 0), gruende: ["vor_schema_neue_basis"] };
  }
  return basisBleibt
    ? { version: schluesselform(bisherigeVersion.haupt, bisherigeVersion.neben + 1), gruende: ["neben_increment"] }
    : { version: schluesselform(bisherigeVersion.haupt + 1, 0), gruende: ["neue_basis_generation"] };
}

/**
 * Der Metadatensatz einer Version — der Nachweis, der spaeter der
 * Befoerderungsentscheidung vorliegt.
 *
 * Ohne Adapter-Schluessel KEINE Version: das ist dieselbe Regel, nach der
 * der Trainer einen Lauf ohne dauerhaftes Artefakt als fehlgeschlagen wuertet
 * (motor.py). Ein Name fuer ein Modell, das nicht mehr existiert, waere eine
 * Verweis-Falle wie die aus der Capsule 2026-08-04.
 */
export function versionsEintrag({
  version, konfiguration, kennzahlen, adapterSchluessel,
  basismodell, datensatz, freigabeId = null, zyklusIndex, gemessenAm
}) {
  if (!VERSIONS_MUSTER.test(String(version || ""))) {
    throw new Error(`versionsname_ungueltig:${version}`);
  }
  if (!adapterSchluessel) {
    throw new Error("adapter_schluessel_fehlt");
  }
  const kennzahlenBereinigt = {
    punktzahl: Number(kennzahlen?.punktzahl),
    kritischeFehler: Number(kennzahlen?.kritischeFehler || 0),
    faelle: Number(kennzahlen?.faelle || 0),
    bestanden: Number(kennzahlen?.bestanden || 0),
    wiederholungen: Number(kennzahlen?.wiederholungen || 0)
  };
  if (!Number.isFinite(kennzahlenBereinigt.punktzahl)) {
    throw new Error("punktzahl_ungueltig");
  }
  return Object.freeze({
    version,
    anzeige: versionsAnzeige(version),
    promotionStatus: "not-approved",
    kennung: konfiguration?.kennung || null,
    zyklusIndex: Number(zyklusIndex) || 0,
    basismodell: Object.freeze({
      hfRepo: basismodell?.hfRepo || null,
      revision: basismodell?.revision || null,
      lizenz: basismodell?.lizenz || null
    }),
    datensatz: Object.freeze({
      schluessel: datensatz?.schluessel || null,
      manifestSchluessel: datensatz?.manifestSchluessel || null
    }),
    adapterSchluessel,
    kennzahlen: Object.freeze(kennzahlenBereinigt),
    freigabeId: freigabeId || null,
    gemessenAm: gemessenAm
  });
}

/** Leeres Register. `aktiveVersion` = der aktuelle Kandidat auf dem besten-stand. */
export function leeresRegister() {
  return Object.freeze({ schemaVersion: 1, aktiveVersion: null, eintraege: [] });
}

/**
 * Register + neuer Eintrag (rein). Neuester zuerst. Der neue Eintrag wird die
 * aktive Version — er hat den bisherigen Besten geschlagen; das ist genau die
 * Bedeutung des besten-stand.
 */
export function registerMitEintrag(register, eintrag) {
  const basis = register && Array.isArray(register.eintraege) ? register : leeresRegister();
  const eintraege = [eintrag, ...basis.eintraege].slice(0, REGISTER_MAX);
  return Object.freeze({
    schemaVersion: 1,
    aktiveVersion: eintrag.version,
    eintraege: Object.freeze(eintraege)
  });
}
