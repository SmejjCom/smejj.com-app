// smejj.com — Mailer (Single Responsibility: transaktionale Auth-E-Mails).
// Minimaler SMTP-Client ohne externe Dependency. Fail-closed: ohne vollstaendige,
// sichere Konfiguration wird NICHT gesendet und ehrlich "unconfigured" gemeldet.
// Es werden keine Secrets geloggt; Fehlertexte enthalten niemals Credentials.
// Konfiguration (nur Secret-Umgebung, niemals Repo):
//   SMEJJ_SMTP_HOST, SMEJJ_SMTP_PORT (465=implizites TLS, 587=STARTTLS),
//   SMEJJ_SMTP_USER, SMEJJ_SMTP_PASS, SMEJJ_SMTP_FROM
import net from "node:net";
import { protokolliereVersand } from "./mailDeliveryLog.js";
import tls from "node:tls";

const COMMAND_TIMEOUT_MS = 15_000;

export function mailerConfig(env = process.env) {
  const host = String(env.SMEJJ_SMTP_HOST || "").trim();
  const port = Number(env.SMEJJ_SMTP_PORT || 465);
  const user = String(env.SMEJJ_SMTP_USER || "").trim();
  const pass = String(env.SMEJJ_SMTP_PASS || "");
  const from = String(env.SMEJJ_SMTP_FROM || user).trim();
  if (!host || !user || !pass || !from || !(port > 0 && port < 65536)) return null;
  return { host, port, user, pass, from, implicitTls: port === 465 };
}

export async function sendAuthMail({ to, subject, text, art = "" }, env = process.env, transport = smtpSend) {
  const cfg = mailerConfig(env);
  if (!cfg) return { sent: false, reason: "email_delivery_unconfigured" };
  const recipient = String(to || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(recipient)) return { sent: false, reason: "recipient_invalid" };
  let ergebnis;
  try {
    await transport(cfg, buildMessage({ from: cfg.from, to: recipient, subject, text }), recipient);
    ergebnis = { sent: true };
  } catch (error) {
    ergebnis = { sent: false, reason: sanitizeError(error) };
  }
  // Nachweis, keine Voraussetzung: das Protokoll wirft nie und wird bewusst
  // NICHT abgewartet-mit-Konsequenz. Ob eine Registrierung klappt, darf nicht
  // davon abhaengen, dass ein Logeintrag gelingt (Freigabe 2026-07-29).
  await protokolliereVersand(
    { to: recipient, subject, sent: ergebnis.sent, reason: ergebnis.reason, art },
    { env }
  ).catch(() => {});
  return ergebnis;
}

function buildMessage({ from, to, subject, text }) {
  const date = new Date().toUTCString();
  const safeSubject = String(subject || "").replace(/[\r\n]/g, " ").slice(0, 200);
  const body = String(text || "").replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
  return [
    `From: smejj.com <${from}>`,
    `To: <${to}>`,
    `Subject: ${encodeSubject(safeSubject)}`,
    `Date: ${date}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    body,
    "."
  ].join("\r\n");
}

function encodeSubject(subject) {
  return /^[\x20-\x7e]*$/.test(subject)
    ? subject
    : `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
}

async function smtpSend(cfg, message, recipient) {
  const socket = await openSocket(cfg);
  const talk = createTalker(socket);
  try {
    await talk.expect(220);
    await talk.command("EHLO smejj.com", 250);
    if (!cfg.implicitTls) {
      await talk.command("STARTTLS", 220);
      await talk.upgradeTls(cfg.host);
      await talk.command("EHLO smejj.com", 250);
    }
    await talk.command("AUTH LOGIN", 334);
    await talk.command(Buffer.from(cfg.user, "utf8").toString("base64"), 334);
    await talk.command(Buffer.from(cfg.pass, "utf8").toString("base64"), 235);
    await talk.command(`MAIL FROM:<${cfg.from}>`, 250);
    await talk.command(`RCPT TO:<${recipient}>`, [250, 251]);
    await talk.command("DATA", 354);
    await talk.command(message, 250);
    await talk.command("QUIT", 221).catch(() => {});
  } finally {
    talk.destroy();
  }
}

function openSocket(cfg) {
  return new Promise((resolve, reject) => {
    const onError = (error) => reject(new Error(`smtp_connect_failed:${error?.code || "unknown"}`));
    if (cfg.implicitTls) {
      const socket = tls.connect({ host: cfg.host, port: cfg.port, servername: cfg.host, minVersion: "TLSv1.2" }, () => resolve(socket));
      socket.once("error", onError);
    } else {
      const socket = net.connect({ host: cfg.host, port: cfg.port }, () => resolve(socket));
      socket.once("error", onError);
    }
  });
}

function createTalker(initialSocket) {
  let socket = initialSocket;
  let buffer = "";
  let pending = null;

  function attach() {
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      flush();
    });
    socket.on("error", () => fail(new Error("smtp_socket_error")));
    socket.on("close", () => fail(new Error("smtp_socket_closed")));
  }

  function flush() {
    if (!pending) return;
    const lines = buffer.split("\r\n");
    for (const line of lines) {
      if (/^\d{3} /.test(line)) {
        const code = Number(line.slice(0, 3));
        const current = pending;
        pending = null;
        buffer = "";
        clearTimeout(current.timer);
        if (current.accept.includes(code)) current.resolve(code);
        else current.reject(new Error(`smtp_unexpected_status:${code}`));
        return;
      }
    }
  }

  function fail(error) {
    if (!pending) return;
    const current = pending;
    pending = null;
    clearTimeout(current.timer);
    current.reject(error);
  }

  function expect(accept) {
    const accepted = Array.isArray(accept) ? accept : [accept];
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => fail(new Error("smtp_timeout")), COMMAND_TIMEOUT_MS);
      pending = { resolve, reject, accept: accepted, timer };
      flush();
    });
  }

  attach();
  return {
    expect,
    command(line, accept) {
      socket.write(`${line}\r\n`);
      return expect(accept);
    },
    upgradeTls(host) {
      return new Promise((resolve, reject) => {
        const plain = socket;
        plain.removeAllListeners("data");
        plain.removeAllListeners("error");
        plain.removeAllListeners("close");
        const secure = tls.connect({ socket: plain, servername: host, minVersion: "TLSv1.2" }, () => {
          socket = secure;
          buffer = "";
          attach();
          resolve();
        });
        secure.once("error", (error) => reject(new Error(`smtp_starttls_failed:${error?.code || "unknown"}`)));
      });
    },
    destroy() {
      try { socket.destroy(); } catch { /* bereits geschlossen */ }
    }
  };
}

function sanitizeError(error) {
  const text = String(error?.message || error || "email_send_failed");
  // Niemals Nutzdaten/Credentials in Fehlertexten weiterreichen.
  return /^smtp_[a-z_:0-9]+$/i.test(text) ? text : "email_send_failed";
}
