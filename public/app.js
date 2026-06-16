import { CLIENT_ROUTES, UI_COPY } from "./config.js";

const log = document.querySelector("#log");
const form = document.querySelector("#form");
const message = document.querySelector("#message");
const files = document.querySelector("#files");
const statusButton = document.querySelector("#status");
const testsButton = document.querySelector("#tests");
const storageButton = document.querySelector("#storage");

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

addEntry(UI_COPY.startup, "assistant");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const task = message.value.trim();
  if (!task) return;
  addEntry(task, "user");
  message.value = "";
  const output = addEntry("", "assistant");
  await stream(CLIENT_ROUTES.api.agent, {
    task,
    files: files.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  }, output);
});

statusButton.addEventListener("click", async () => {
  const result = await fetch(CLIENT_ROUTES.api.gitStatus);
  addEntry(JSON.stringify(await result.json(), null, 2), "assistant");
});

testsButton.addEventListener("click", async () => {
  const result = await fetch(CLIENT_ROUTES.api.terminalRun, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command: UI_COPY.testCommand })
  });
  addEntry(JSON.stringify(await result.json(), null, 2), "assistant");
});

storageButton.addEventListener("click", async () => {
  const result = await fetch(CLIENT_ROUTES.api.storageStatus);
  addEntry(JSON.stringify(await result.json(), null, 2), "assistant");
});

function addEntry(text, role) {
  const node = document.createElement("article");
  node.className = `entry ${role}`;
  node.textContent = text;
  log.append(node);
  node.scrollIntoView({ block: "end" });
  return node;
}

async function stream(url, body, output) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!response.ok || !response.body) {
    output.textContent = await readableError(response);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";
    for (const event of events) {
      const text = event.split("\n")
        .filter((line) => line.startsWith("data: "))
        .map((line) => line.slice(6))
        .join("\n");
      if (!text || text === "[DONE]") continue;
      try {
        const payload = JSON.parse(text);
        const delta = payload.choices?.[0]?.delta;
        output.textContent += delta?.content || delta?.reasoning_content || "";
      } catch {
        output.textContent += text;
      }
    }
    output.scrollIntoView({ block: "end" });
  }
}

async function readableError(response) {
  const text = await response.text();
  try {
    const payload = JSON.parse(text);
    return payload.error || text;
  } catch {
    return text;
  }
}
