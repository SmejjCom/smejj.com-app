// Wach halten (14.09.2026): das Wach-Modell wird im Leerlauf nicht entladen,
// andere Modelle schon — und danach meldet der Motor sich zum Nachladen.
import test from "node:test";
import assert from "node:assert/strict";
import { Motor, ZUSTAENDE } from "../workers/smejj-hausmodell/motor.js";

function motorMit(modellId, optionen = {}) {
  const motor = new Motor({ leerlaufMs: 20, protokoll: {}, ...optionen });
  motor.prozess = { kill: () => { motor.prozess = null; } };
  motor.modell = { id: modellId };
  return motor;
}

test("Wach-Modell bleibt nach der Leerlauf-Frist geladen", async () => {
  const motor = motorMit("smejj-1-basis", { wachModellId: "smejj-1-basis" });
  motor.anfrageBeginnt();
  motor.anfrageEndet();
  assert.equal(motor.leerlaufUhr, null);
  await new Promise((r) => setTimeout(r, 60));
  assert.ok(motor.prozess, "Prozess darf nicht beendet sein");
  assert.equal(motor.zustand, ZUSTAENDE.WARM);
  assert.equal(motor.bericht().wachModell, "smejj-1-basis");
});

test("anderes Modell wird entladen, danach kommt der Ruf zum Nachladen", async () => {
  let gerufen = 0;
  const motor = motorMit("bitnet-b1.58-2b-4t", { wachModellId: "smejj-1-basis", nachEntladen: () => { gerufen += 1; } });
  motor.anfrageBeginnt();
  motor.anfrageEndet();
  await new Promise((r) => setTimeout(r, 1500));
  assert.equal(motor.prozess, null);
  assert.equal(motor.zustand, ZUSTAENDE.GESTOPPT);
  assert.equal(gerufen, 1);
});

test("ohne Wach-Modell bleibt das alte Verhalten: entladen nach Leerlauf", async () => {
  const motor = motorMit("smejj-1-basis");
  motor.anfrageBeginnt();
  motor.anfrageEndet();
  await new Promise((r) => setTimeout(r, 1500));
  assert.equal(motor.zustand, ZUSTAENDE.GESTOPPT);
});
