// smejj.com — setzt Umgebungswerte bei Zeabur, ohne dass jemand etwas einfuegt.
//
// WARUM ES DAS GIBT (2026-08-14): Bis heute endete jede Umgebungsaenderung mit
// "der Betreiber muss den Wert im Portal einfuegen" — und blieb damit oft
// wochenlang liegen (Maus-Blocker, Abo-Webhook). Der Zugang lag die ganze Zeit
// in ~/.config/zeabur/cli.yaml.
//
// WARUM DAS SKRIPT DIE API ZUR LAUFZEIT ERKUNDET statt eine Mutation fest
// einzutragen: Zeabur ist eine junge Plattform, ihr Schema hat sich mehrfach
// geaendert, und eine fest verdrahtete Mutation waere beim naechsten Umbau
// stillschweigend kaputt. Das Skript fragt das Schema, sucht die Mutation, die
// Umgebungswerte setzt, und baut die Anfrage aus deren echten Argumentnamen.
// Findet es keine, sagt es das ehrlich — statt "gesetzt" zu melden.
//
// Werte werden NIEMALS ausgegeben, auch nicht in Fehlertexten.
import { zeaburAbfrage } from "../diagnose/zeabur-api.mjs";

// Ein Dienst in einer Umgebung:
// { serviceId, environmentId, projektId, projektName, umgebungName }.
export async function findeDienst(dienstName, abfrage = zeaburAbfrage) {
  // ZWEI Abfragen statt einer verschachtelten (korrigiert 2026-08-14):
  // `Project.services` ist eine schlichte Liste, KEINE Verbindung — die
  // verschachtelte Fassung endete mit HTTP 422 ("Cannot query field \"edges\"
  // on type \"Service\""). Der Fehler war unsichtbar, solange niemand das
  // Skript gegen einen echten Dienst laufen liess.
  // Der Einstieg `services(projectID:…)` liefert dagegen eine Verbindung.
  const projekte = await abfrage(`{
    projects { edges { node { _id name environments { _id name } } } }
  }`);
  for (const kante of projekte?.projects?.edges || []) {
    const projekt = kante.node;
    const dienste = await abfrage(
      `query($p:ObjectID!){ services(projectID:$p, limit:100){ edges { node { _id name } } } }`,
      { p: projekt._id }
    );
    for (const dienstKante of dienste?.services?.edges || []) {
      if (dienstKante.node.name !== dienstName) continue;
      const umgebung = (projekt.environments || [])[0];
      if (!umgebung?._id) throw new Error(`zeabur_umgebung_fehlt_fuer_${dienstName}`);
      return {
        serviceId: dienstKante.node._id,
        environmentId: umgebung._id,
        projektId: projekt._id,
        projektName: projekt.name,
        umgebungName: umgebung.name
      };
    }
  }
  throw new Error(`zeabur_dienst_nicht_gefunden:${dienstName}`);
}

// Ein Argument traegt VIELE Werte auf einmal — das ist die Form, die bei Zeabur
// die Umgebung ersetzt statt ergaenzt.
//
// Erkannt wird sie an zwei Merkmalen, und das zweite ist das wichtigere: der
// Name kann sich aendern (Zeabur baut sein Schema regelmaessig um, morgen heisst
// es envVars oder kv), der Map-Typ bleibt. Die urspruengliche Fassung sah nur
// auf die Namen "data/variables/envs" — eine Sammelform mit anderem Namen waere
// glatt durchgegangen.
const SAMMEL_NAMEN = ["data", "variables", "variablen", "envs", "envvars", "kv"];
const SAMMEL_TYPEN = ["map", "json", "jsonobject", "object", "keyvalue", "keyvaluepair"];

function typName(arg) {
  let t = arg?.type;
  while (t && !t.name) t = t.ofType;
  return (t?.name || "").toLowerCase();
}

// Gibt die Namen aller Sammel-Argumente zurueck (leer = harmlose Einzelform).
export function sammelArgumente(mutation) {
  return (mutation?.args || [])
    .filter((arg) => SAMMEL_NAMEN.includes(arg.name.toLowerCase()) || SAMMEL_TYPEN.includes(typName(arg)))
    .map((arg) => arg.name);
}

export function argTyp(arg) {
  // GraphQL-Typ als Text fuer die Variablendeklaration, inkl. NonNull/Liste.
  const bau = (t) => {
    if (!t) return "String";
    if (t.kind === "NON_NULL") return `${bau(t.ofType)}!`;
    if (t.kind === "LIST") return `[${bau(t.ofType)}]`;
    return t.name || "String";
  };
  return bau(arg.type);
}

// Sucht die Mutation, die Umgebungswerte setzt. Bevorzugt eine, die MEHRERE
// Werte auf einmal nimmt (ein Aufruf = ein Neustart statt zwei).
export async function findeSetzMutation(abfrage = zeaburAbfrage) {
  const schema = await abfrage(`{
    __schema { mutationType { fields {
      name
      args { name type { kind name ofType { kind name ofType { kind name } } } }
    } } }
  }`);
  const felder = (schema?.__schema?.mutationType?.fields || [])
    .filter((f) => /variable/i.test(f.name) && !/delete|remove/i.test(f.name));
  const punkte = (f) => {
    const namen = f.args.map((a) => a.name.toLowerCase());
    let p = 0;
    if (namen.some((n) => n.includes("service"))) p += 2;
    if (namen.some((n) => n.includes("environment"))) p += 2;
    // EINZEL-MUTATIONEN HABEN VORRANG. Bis zum 2026-08-14 stand hier das
    // Gegenteil ("Sammel-Mutationen sind uns lieber"), und es hat genau das
    // angerichtet, wovor die Salad-Lehre warnt: Zeaburs
    // updateEnvironmentVariable(data: Map) ERSETZT die Umgebung. Ein Aufruf,
    // der EINEN Wert setzen wollte, loeschte am Dienst smejj-control alle
    // anderen — Sitzungsgeheimnis, Modellschluessel, Speicherzugang. Der
    // Betreiber war abgemeldet und die KI aus, ohne dass jemand etwas
    // "Gefaehrliches" getan haette.
    //
    // Ein Wert je Aufruf ist langsamer und in jeder Hinsicht harmloser.
    if (namen.some((n) => n === "key") && namen.some((n) => n === "value")) p += 4;
    if (/update/i.test(f.name)) p += 1;
    return p;
  };
  // Die Sammelform kommt gar nicht erst in die Auswahl — nicht nur schlechter
  // bewertet, sondern raus. Eine Bewertung ist eine Rangfolge: steht nichts
  // anderes daneben, gewinnt die gefaehrliche Form trotzdem. Genau so ist es
  // am 2026-08-14 ein zweites Mal passiert, obwohl die Gefahr bekannt war.
  // Zwei Riegel, absichtlich doppelt: hier die Auswahl, in
  // setzeUmgebungswerte noch einmal die Ausfuehrung.
  const einzeln = felder.filter((f) => sammelArgumente(f).length === 0);
  const beste = einzeln.sort((a, b) => punkte(b) - punkte(a))[0];
  if (!beste || punkte(beste) < 4) return null;
  return beste;
}

// Setzt werte = { NAME: "wert", ... } am Dienst. Gibt { ok, mutation, anzahl }
// zurueck; wirft bei Fehlern (Aufrufer entscheidet ueber den Rueckfallweg).
export async function setzeUmgebungswerte(dienstName, werte, abfrage = zeaburAbfrage) {
  // ERST die Mutation pruefen, DANN den Dienst suchen: Wenn die Form ohnehin
  // verweigert wird, soll das passieren, BEVOR irgendetwas anderes angefasst
  // wird. Ein Abbruch, der erst nach dem halben Weg kommt, ist schwerer zu
  // lesen — und in diesem Fall ginge es um Loeschen.
  const mutation = await findeSetzMutation(abfrage);
  if (!mutation) throw new Error("zeabur_setz_mutation_nicht_gefunden");

  // SPERRE 1 — die FORM, wie sie im Schema steht.
  const namen = mutation.args.map((a) => a.name);
  const sammel = sammelArgumente(mutation);
  if (sammel.length) {
    throw new Error(
      `zeabur_ersetzende_mutation_verweigert:${mutation.name}(${sammel.join(",")}) — `
      + "die Sammel-Form (eine Map statt key/value) ERSETZT die Umgebung. "
      + "Am 2026-08-14 hat genau das smejj-control alle Werte gekostet: Sitzungsgeheimnis, "
      + "Modellschluessel, Speicherzugang. Es braucht eine Einzel-Mutation (key/value)."
    );
  }

  const dienst = await findeDienst(dienstName, abfrage);

  const belege = (arg) => {
    const n = arg.name.toLowerCase();
    if (n.includes("service")) return dienst.serviceId;
    if (n.includes("environment")) return dienst.environmentId;
    if (n.includes("project")) return dienst.projektId;
    return undefined;
  };

  async function ruf(zusatz) {
    const deklaration = mutation.args.map((a) => `$${a.name}: ${argTyp(a)}`).join(", ");
    const uebergabe = mutation.args.map((a) => `${a.name}: $${a.name}`).join(", ");
    const variablen = {};
    for (const arg of mutation.args) {
      const wert = zusatz[arg.name] !== undefined ? zusatz[arg.name] : belege(arg);
      if (wert !== undefined) variablen[arg.name] = wert;
    }

    // SPERRE 2 — die WERTE, unmittelbar vor dem Absenden.
    //
    // Sperre 1 oben liest das Schema; diese hier sieht, was tatsaechlich
    // hinausgeht. Das sind zwei verschiedene Ebenen: eine Mutation kann
    // lauter harmlose key/value-Argumente deklarieren und trotzdem ein
    // Sammelgebilde uebertragen, weil ein Aufrufer statt eines Wertes ein
    // Objekt uebergibt. Ueber die Leitung gehoeren nur Skalare.
    //
    // (Bis 2026-08-14 stand hier eine Wiederholung von Sperre 1 — dieselbe
    // Bedingung, die eine Zeile vorher schon geworfen hatte. Sie sah nach
    // zwei Schutzwaellen aus und war toter Code.)
    for (const [name, wert] of Object.entries(variablen)) {
      if (wert !== null && typeof wert === "object") {
        throw new Error(
          `zeabur_sammelwert_verweigert:${mutation.name}.${name} — `
          + "dieses Argument traegt ein Objekt statt eines Wertes. Eine Map ist genau der Weg, "
          + "auf dem am 2026-08-14 die Umgebung von smejj-control geloescht wurde. Ein Wert je Aufruf."
        );
      }
    }
    return abfrage(`mutation Setze(${deklaration}) { ${mutation.name}(${uebergabe}) }`, variablen);
  }

  // key/value-Form: nacheinander, damit ein Fehlschlag beim zweiten Wert den
  // ersten nicht als "nie gesetzt" erscheinen laesst.
  const schluesselArg = namen.find((n) => /^key$|name/i.test(n));
  const wertArg = namen.find((n) => /^value$/i.test(n));
  if (!schluesselArg || !wertArg) throw new Error("zeabur_mutation_unverstaendlich");
  for (const [schluessel, wert] of Object.entries(werte)) {
    await ruf({ [schluesselArg]: schluessel, [wertArg]: wert });
  }
  return { ok: true, mutation: mutation.name, anzahl: Object.keys(werte).length };
}

// Neustart anstossen, damit die neuen Werte im Prozess landen. Zeabur startet
// nach einer Variablenaenderung meist selbst neu; schlaegt das hier fehl, ist
// das kein Grund zum Abbruch — der Aufrufer misst ohnehin am Webhook nach.
export async function starteDienstNeu(dienstName) {
  const dienst = await findeDienst(dienstName);
  const schema = await zeaburAbfrage(`{
    __schema { mutationType { fields { name args { name type { kind name ofType { kind name ofType { kind name } } } } } } }
  }`);
  const feld = (schema?.__schema?.mutationType?.fields || [])
    .find((f) => /^restartService$/i.test(f.name)) || (schema?.__schema?.mutationType?.fields || [])
    .find((f) => /restart/i.test(f.name));
  if (!feld) return { ok: false, grund: "keine_restart_mutation" };
  const deklaration = feld.args.map((a) => `$${a.name}: ${argTyp(a)}`).join(", ");
  const uebergabe = feld.args.map((a) => `${a.name}: $${a.name}`).join(", ");
  const variablen = {};
  for (const arg of feld.args) {
    const n = arg.name.toLowerCase();
    if (n.includes("service")) variablen[arg.name] = dienst.serviceId;
    else if (n.includes("environment")) variablen[arg.name] = dienst.environmentId;
  }
  await zeaburAbfrage(`mutation Neustart(${deklaration}) { ${feld.name}(${uebergabe}) }`, variablen);
  return { ok: true, mutation: feld.name };
}
