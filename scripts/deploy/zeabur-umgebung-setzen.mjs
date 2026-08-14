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

// Nimmt die Mutation eine Sammlung von Werten entgegen (data/variables/envs als
// Map)? Solche Formen ERSETZEN bei Zeabur die Umgebung — sie sind hier tabu.
export function istSammelform(feld) {
  return (feld?.args || []).some((a) => ["data", "variables", "envs"].includes(String(a.name).toLowerCase()));
}

// Sucht die Mutation, die Umgebungswerte setzt.
//
// SIE MEIDET SAMMEL-MUTATIONEN — und zwar aus Erfahrung. Am 2026-08-14 wurde
// hier die Sammelform BEVORZUGT ("ein Aufruf = ein Neustart statt zwei"). Das
// war der Denkfehler: Zeaburs updateEnvironmentVariable(data: Map) fuegt nicht
// hinzu, es ERSETZT die Umgebung. Ein Aufruf mit zwei Stripe-Werten nahm
// smejj-control noch am selben Tag ein zweites Mal alle uebrigen 19 Werte —
// Sitzungsgeheimnis, Modellschluessel, Speicher- und Mailzugang. Der Aufruf
// meldete dabei brav "2 Werte gesetzt".
//
// Ein Neustart mehr ist billig. Eine geloeschte Produktionsumgebung nicht.
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
    // Ein Wert je Aufruf ist die EINZIGE Form, die nur hinzufuegt.
    if (namen.some((n) => n === "key") && namen.some((n) => n === "value")) p += 3;
    return p;
  };
  // Sammel-Mutationen kommen gar nicht erst in die Auswahl.
  const einzeln = felder.filter((f) => !istSammelform(f));
  const beste = einzeln.sort((a, b) => punkte(b) - punkte(a))[0];
  if (!beste || punkte(beste) < 4) return null;
  return beste;
}

// Setzt werte = { NAME: "wert", ... } am Dienst. Gibt { ok, mutation, anzahl }
// zurueck; wirft bei Fehlern (Aufrufer entscheidet ueber den Rueckfallweg).
export async function setzeUmgebungswerte(dienstName, werte, abfrage = zeaburAbfrage) {
  const dienst = await findeDienst(dienstName, abfrage);
  const mutation = await findeSetzMutation(abfrage);
  if (!mutation) throw new Error("zeabur_setz_mutation_nicht_gefunden");

  const namen = mutation.args.map((a) => a.name);
  // Zweite Wache, unabhaengig von der Auswahl oben: selbst wenn hier je eine
  // Sammel-Mutation ankaeme, wird sie nicht ausgefuehrt.
  if (istSammelform(mutation)) throw new Error("zeabur_sammelform_verboten");

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
    // Liefert die Mutation ein Objekt zurueck, verlangt GraphQL eine
    // Feldauswahl und antwortet sonst mit 422. Ausgewaehlt wird nur `key` —
    // NIE `value`, damit kein Geheimwert in einer Antwort landet.
    try {
      return await abfrage(`mutation Setze(${deklaration}) { ${mutation.name}(${uebergabe}) }`, variablen);
    } catch (fehler) {
      if (!/422/.test(String(fehler?.message || ""))) throw fehler;
      return abfrage(`mutation Setze(${deklaration}) { ${mutation.name}(${uebergabe}) { key } }`, variablen);
    }
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
