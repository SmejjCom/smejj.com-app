import test from "node:test";
import assert from "node:assert/strict";
import { attachCodeActions } from "../public/ai/chatClient.js";

function fakeElement() {
  return {
    className: "",
    textContent: "",
    type: "",
    disabled: false,
    children: [],
    listeners: {},
    addEventListener(type, handler) { this.listeners[type] = handler; },
    append(...nodes) { this.children.push(...nodes); }
  };
}

function fakeDocument(dispatched) {
  return {
    createElement: () => fakeElement(),
    dispatchEvent: (event) => { dispatched.push(event); return true; }
  };
}

function fakeOutput(text) {
  return { textContent: text, appended: null, after(node) { this.appended = node; } };
}

test("attachCodeActions erkennt Codebloecke und haengt je Block einen Button an", () => {
  const dispatched = [];
  const output = fakeOutput("Hier:\n```js\nconsole.log(1);\n```\nund\n```html\n<p>hi</p>\n```\nfertig");
  const count = attachCodeActions(output, fakeDocument(dispatched));
  assert.equal(count, 2);
  assert.equal(output.appended.className, "chat-code-actions");
  assert.equal(output.appended.children.length, 4, "je Block ein Speichern- und ein Editor-Button");
  assert.match(output.appended.children[0].textContent, /Code 1 in Workspace speichern/);
  assert.match(output.appended.children[1].textContent, /Code 1 im Editor oeffnen/);
});

test("attachCodeActions tut nichts ohne Codebloecke", () => {
  const output = fakeOutput("Nur Text, kein Code.");
  assert.equal(attachCodeActions(output, fakeDocument([])), 0);
  assert.equal(output.appended, null);
});

test("Speichern-Button dispatcht smejj:workspace-save mit Pfad, Endung und Inhalt", () => {
  const dispatched = [];
  const output = fakeOutput("```python\nprint(1)\n```");
  attachCodeActions(output, fakeDocument(dispatched));
  const button = output.appended.children[0];
  button.listeners.click();
  assert.equal(dispatched.length, 1);
  const detail = dispatched[0].detail;
  assert.match(detail.path, /^chat\/\d+-snippet-1\.py$/);
  assert.equal(detail.content, "print(1)\n");
  assert.equal(button.disabled, true);
  // Erfolg: Button bleibt deaktiviert und zeigt den Pfad
  detail.onDone({ ok: true, path: detail.path });
  assert.match(button.textContent, /^Gespeichert: chat\//);
  // Fehlschlag (zweiter Block-Szenario): Button wird wieder freigegeben
  detail.onDone({ ok: false });
  assert.equal(button.disabled, false);
  assert.match(button.textContent, /fehlgeschlagen/);
});

test("unbekannte Sprache faellt auf .txt zurueck", () => {
  const dispatched = [];
  const output = fakeOutput("```brainfuck\n+++\n```");
  attachCodeActions(output, fakeDocument(dispatched));
  output.appended.children[0].listeners.click();
  assert.match(dispatched[0].detail.path, /\.txt$/);
});
