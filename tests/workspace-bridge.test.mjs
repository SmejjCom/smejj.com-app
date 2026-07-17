import test from "node:test";
import assert from "node:assert/strict";
import { initWorkspaceBridge } from "../public/workspace-bridge.js";
import { resolveWorkspaceReferences } from "../public/ai/chatClient.js";

function fakeDocument() {
  const listeners = {};
  return {
    listeners,
    addEventListener(type, handler) { listeners[type] = handler; },
    async dispatchEvent(event) { await listeners[event.type]?.(event); return true; }
  };
}

const fakeWorkspace = {
  async saveFile(projectId, path, content) {
    if (path === "kaputt.txt") throw new Error("boom");
    return { object: { path }, manifest: { version: 2 }, content };
  },
  async readFile(path) {
    if (path === "chat/vorhanden.js") return "console.log('inhalt');";
    throw new Error("not_found");
  },
  async getManifest() {
    return { files: [{ path: "a.js" }, { path: "b/c.css" }] };
  }
};

function bridge(documentRef, toasts = []) {
  return initWorkspaceBridge({
    workspace: fakeWorkspace,
    ensureProject: async () => "project_test",
    showToast: (msg) => toasts.push(msg),
    documentRef
  });
}

test("Bruecke registriert sich nur mit vollstaendigen Abhaengigkeiten", () => {
  assert.equal(initWorkspaceBridge({}), false);
  assert.equal(bridge(fakeDocument()), true);
});

test("workspace-save meldet Erfolg mit Pfad und toastet", async () => {
  const doc = fakeDocument(); const toasts = [];
  bridge(doc, toasts);
  let outcome;
  await doc.dispatchEvent({ type: "smejj:workspace-save", detail: { path: "x/y.js", content: "a", onDone: (r) => outcome = r } });
  assert.deepEqual(outcome, { ok: true, path: "x/y.js" });
  assert.match(toasts[0], /Im Workspace gespeichert: x\/y\.js/);
});

test("workspace-save faengt Fehler fail-closed ab", async () => {
  const doc = fakeDocument(); const toasts = [];
  bridge(doc, toasts);
  let outcome;
  await doc.dispatchEvent({ type: "smejj:workspace-save", detail: { path: "kaputt.txt", onDone: (r) => outcome = r } });
  assert.deepEqual(outcome, { ok: false });
  assert.match(toasts[0], /fehlgeschlagen/);
});

test("workspace-read liefert Inhalt bzw. ok:false", async () => {
  const doc = fakeDocument();
  bridge(doc);
  let hit, miss;
  await doc.dispatchEvent({ type: "smejj:workspace-read", detail: { path: "chat/vorhanden.js", onDone: (r) => hit = r } });
  await doc.dispatchEvent({ type: "smejj:workspace-read", detail: { path: "fehlt.js", onDone: (r) => miss = r } });
  assert.equal(hit.ok, true);
  assert.match(hit.content, /inhalt/);
  assert.equal(miss.ok, false);
});

test("workspace-list liefert Pfadliste aus dem Manifest", async () => {
  const doc = fakeDocument();
  bridge(doc);
  let outcome;
  await doc.dispatchEvent({ type: "smejj:workspace-list", detail: { onDone: (r) => outcome = r } });
  assert.equal(outcome.ok, true);
  assert.deepEqual(outcome.files, ["a.js", "b/c.css"]);
});

test("resolveWorkspaceReferences laedt referenzierte Dateien ueber die Bruecke", async () => {
  const doc = fakeDocument();
  bridge(doc);
  const files = await resolveWorkspaceReferences("Bitte pruefe [Workspace: chat/vorhanden.js] und [Workspace: fehlt.js]", doc);
  assert.equal(files.length, 1);
  assert.equal(files[0].path, "chat/vorhanden.js");
  assert.match(files[0].content, /inhalt/);
});

test("resolveWorkspaceReferences ohne Referenzen bleibt leer", async () => {
  const files = await resolveWorkspaceReferences("Nur Text", fakeDocument());
  assert.deepEqual(files, []);
});
