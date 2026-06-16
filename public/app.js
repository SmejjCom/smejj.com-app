import { CLIENT_ROUTES, STORAGE_KEYS, UI_COPY } from "./config.js";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const state = {
  uploads: [],
  profile: loadJson(STORAGE_KEYS.profile, { name: "", email: "" }),
  settings: loadJson(STORAGE_KEYS.settings, { language: "de", mode: "safe" }),
  memory: loadText(STORAGE_KEYS.memory),
  rag: loadText(STORAGE_KEYS.rag)
};

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

boot();

function boot() {
  bindNavigation();
  bindChat();
  bindSidebarActions();
  bindCodeTools();
  bindUploads();
  bindMemory();
  bindTools();
  bindProfile();
  initGoogleLogin().catch((error) => {
    writeOutput("#profileOutput", error.message || "Google Login konnte nicht geladen werden.");
  });
  hydrateProfile();
  $("#memoryText").value = state.memory;
  $("#ragText").value = state.rag;
  addEntry(UI_COPY.startup, "assistant");
}

function bindNavigation() {
  for (const button of $$(".nav-button")) {
    button.addEventListener("click", () => {
      $$(".nav-button").forEach((item) => item.classList.toggle("is-active", item === button));
      $$(".view").forEach((view) => view.classList.toggle("is-active", view.id === button.dataset.view));
    });
  }
}

function bindChat() {
  $("#form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const task = $("#message").value.trim();
    if (!task) return;
    addEntry(task, "user");
    $("#message").value = "";
    const output = addEntry("", "assistant");
    await stream(CLIENT_ROUTES.api.agent, {
      task,
      files: $("#fileRefs").value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    }, output);
  });
}

function bindSidebarActions() {
  $("#storage").addEventListener("click", () => showJsonInLog(CLIENT_ROUTES.api.storageStatus));
  $("#status").addEventListener("click", () => showJsonInLog(CLIENT_ROUTES.api.gitStatus));
  $("#tests").addEventListener("click", async () => {
    const result = await postJson(CLIENT_ROUTES.api.terminalRun, { command: UI_COPY.testCommand });
    addEntry(JSON.stringify(result, null, 2), "assistant");
  });
}

function bindCodeTools() {
  $("#readFile").addEventListener("click", async () => {
    const path = $("#filePath").value.trim();
    if (!path) return writeOutput("#codeOutput", "Dateipfad fehlt.");
    const result = await postJson(CLIENT_ROUTES.api.fileRead, { path });
    if (result.content) $("#editor").value = result.content;
    writeOutput("#codeOutput", JSON.stringify(result, null, 2));
  });

  $("#previewWrite").addEventListener("click", async () => {
    const result = await writeFile(false);
    writeOutput("#codeOutput", JSON.stringify(result, null, 2));
  });

  $("#applyWrite").addEventListener("click", async () => {
    const result = await writeFile(true);
    writeOutput("#codeOutput", JSON.stringify(result, null, 2));
  });

  $("#downloadEditor").addEventListener("click", () => {
    const filename = ($("#filePath").value.trim() || "smejj-editor.txt").split(/[\\/]/).pop();
    downloadText(filename, $("#editor").value);
  });
}

function bindUploads() {
  $("#upload").addEventListener("change", async (event) => {
    state.uploads = [];
    for (const file of Array.from(event.target.files || [])) {
      const text = await file.text().catch(() => "");
      state.uploads.push({
        name: file.name,
        bytes: file.size,
        type: file.type || "application/octet-stream",
        preview: text.slice(0, 2000)
      });
    }
    $("#uploadList").value = state.uploads
      .map((file) => `${file.name} | ${file.bytes} bytes | ${file.type}`)
      .join("\n");
    writeOutput("#fileOutput", "Uploads sind lokal gestaged. Dauerhafte Speicherung gehoert in IDrive e2 und bleibt serverseitig geschuetzt.");
  });
  $("#storageAgain").addEventListener("click", () => showJson("#fileOutput", CLIENT_ROUTES.api.storageStatus));
  $("#downloadUploadManifest").addEventListener("click", () => {
    downloadText("smejj-upload-manifest.json", JSON.stringify({
      generatedAt: new Date().toISOString(),
      uploads: state.uploads.map(({ name, bytes, type }) => ({ name, bytes, type }))
    }, null, 2));
  });
}

function bindMemory() {
  $("#saveMemory").addEventListener("click", () => {
    state.memory = $("#memoryText").value;
    state.rag = $("#ragText").value;
    localStorage.setItem(STORAGE_KEYS.memory, state.memory);
    localStorage.setItem(STORAGE_KEYS.rag, state.rag);
    writeOutput("#memoryOutput", "Memory und RAG-Notizen lokal gespeichert. Serverseitige Memory-Daten muessen spaeter in IDrive e2 landen.");
  });

  $("#searchMemory").addEventListener("click", () => {
    const query = $("#memoryQuery").value.trim().toLowerCase();
    if (!query) return writeOutput("#memoryOutput", "Suchbegriff fehlt.");
    const haystack = [
      ["memory", $("#memoryText").value],
      ["rag", $("#ragText").value],
      ...state.uploads.map((file) => [`upload:${file.name}`, file.preview])
    ];
    const hits = haystack
      .filter(([, text]) => text.toLowerCase().includes(query))
      .map(([source, text]) => `${source}\n${snippet(text, query)}`);
    writeOutput("#memoryOutput", hits.length ? hits.join("\n\n") : "Keine lokalen Treffer.");
  });

  $("#downloadMemory").addEventListener("click", () => {
    downloadText("smejj-memory-rag.json", JSON.stringify({
      generatedAt: new Date().toISOString(),
      memory: $("#memoryText").value,
      rag: $("#ragText").value
    }, null, 2));
  });
}

function bindTools() {
  $("#capabilities").addEventListener("click", () => showJson("#toolOutput", CLIENT_ROUTES.api.capabilities));
  $("#health").addEventListener("click", () => showJson("#toolOutput", CLIENT_ROUTES.api.health));
  $("#freeGuard").addEventListener("click", () => {
    writeOutput("#toolOutput", [
      "Free-Guard aktiv:",
      "- GitHub Free nur fuer Code/Doku.",
      "- Cloudflare Free nur fuer PWA, DNS und leichte Edge-Routen.",
      "- IDrive e2 ist Hauptspeicher.",
      "- Unsichere oder paid-risk Online-Schreibwege bleiben gesperrt."
    ].join("\n"));
  });
}

function bindProfile() {
  $("#registerLocal").addEventListener("click", () => {
    writeOutput("#profileOutput", "Registrierung lokal vorbereitet. Serverseitige Registrierung bleibt gesperrt, bis Auth, Rate-Limit und IDrive-e2-Datenlayout sicher implementiert sind.");
  });

  $("#loginLocal").addEventListener("click", () => {
    const profile = loadJson(STORAGE_KEYS.profile, {});
    writeOutput("#profileOutput", profile.email ? `Lokaler Login-Test aktiv fuer ${profile.email}.` : "Kein lokales Profil gespeichert.");
  });

  $("#logoutLocal").addEventListener("click", () => {
    writeOutput("#profileOutput", "Lokaler Login-Test beendet. Serverseitige Session-Cookies werden in dieser Free-safe Shell nicht gesetzt.");
  });

  $("#saveProfile").addEventListener("click", () => {
    state.profile = {
      name: $("#profileName").value.trim(),
      email: $("#profileEmail").value.trim()
    };
    state.settings = {
      language: $("#language").value,
      mode: $("#mode").value
    };
    localStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(state.profile));
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(state.settings));
    writeOutput("#profileOutput", "Profil und Einstellungen lokal gespeichert. Registrierung/Login bleiben bis zu einer sicheren Auth-Architektur client-lokal.");
  });

  $("#clearLocal").addEventListener("click", () => {
    for (const key of Object.values(STORAGE_KEYS)) localStorage.removeItem(key);
    writeOutput("#profileOutput", "Lokale smejj.com Daten geloescht.");
  });
}

async function initGoogleLogin() {
  const config = await getJson(CLIENT_ROUTES.api.authConfig);
  if (!config.configured) {
    $("#googleSignIn").textContent = "Google Login: Client-ID fehlt.";
    return;
  }
  const session = await getJson(CLIENT_ROUTES.api.authMe);
  if (session.authenticated && session.user) {
    showSignedIn(session.user);
    return;
  }
  await loadGoogleIdentity();
  google.accounts.id.initialize({
    client_id: config.clientId,
    callback: handleGoogleCredential,
    login_uri: `${location.origin}${CLIENT_ROUTES.api.authGoogle}`,
    ux_mode: "redirect",
    use_fedcm_for_button: false,
    use_fedcm_for_prompt: false
  });
  google.accounts.id.renderButton($("#googleSignIn"), {
    theme: "outline",
    size: "large",
    text: "signin_with",
    shape: "rectangular"
  });
}

async function handleGoogleCredential(response) {
  const result = await postJson(CLIENT_ROUTES.api.authGoogle, { credential: response.credential });
  if (result.authenticated && result.user) {
    showSignedIn(result.user);
    return;
  }
  writeOutput("#profileOutput", result.error || "Google Login fehlgeschlagen.");
}

function showSignedIn(user) {
  $("#profileName").value = user.name || "";
  $("#profileEmail").value = user.email || "";
  $("#googleSignIn").innerHTML = "";
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = `Google: ${user.email} abmelden`;
  button.addEventListener("click", async () => {
    await postJson(CLIENT_ROUTES.api.authLogout, {});
    $("#googleSignIn").textContent = "Abgemeldet. Seite neu laden fuer Google Login.";
    writeOutput("#profileOutput", "Google Session beendet.");
  });
  $("#googleSignIn").append(button);
  writeOutput("#profileOutput", `Google Login aktiv fuer ${user.email}.`);
}

function loadGoogleIdentity() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error("Google Login Script konnte nicht geladen werden."));
    document.head.append(script);
  });
}

function hydrateProfile() {
  $("#profileName").value = state.profile.name || "";
  $("#profileEmail").value = state.profile.email || "";
  $("#language").value = state.settings.language || "de";
  $("#mode").value = state.settings.mode || "safe";
}

async function writeFile(apply) {
  const path = $("#filePath").value.trim();
  if (!path) return { ok: false, error: "Dateipfad fehlt." };
  return postJson(CLIENT_ROUTES.api.fileWrite, {
    path,
    content: $("#editor").value,
    apply
  });
}

async function showJsonInLog(url) {
  addEntry(JSON.stringify(await getJson(url), null, 2), "assistant");
}

async function showJson(target, url) {
  writeOutput(target, JSON.stringify(await getJson(url), null, 2));
}

async function getJson(url) {
  try {
    const response = await fetch(url);
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      return { ok: response.ok, status: response.status, text };
    }
  } catch (error) {
    return { ok: false, error: error.message || "Network request failed" };
  }
}

async function postJson(url, body) {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      return { ok: response.ok, status: response.status, text };
    }
  } catch {
    return { ok: false, error: "Network request failed" };
  }
}

function addEntry(text, role) {
  const node = document.createElement("article");
  node.className = `entry ${role}`;
  node.textContent = text;
  $("#log").append(node);
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

function writeOutput(selector, text) {
  const node = $(selector);
  node.textContent = text || "";
}

function loadJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || "") || fallback;
  } catch {
    return fallback;
  }
}

function loadText(key) {
  return localStorage.getItem(key) || "";
}

function snippet(text, query) {
  const index = text.toLowerCase().indexOf(query);
  const start = Math.max(0, index - 80);
  const end = Math.min(text.length, index + query.length + 160);
  return text.slice(start, end);
}

function downloadText(filename, text) {
  const blob = new Blob([text || ""], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
