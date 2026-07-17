// smejj.com control-server — Server-Sent-Events-Helfer (Single Responsibility: SSE-Protokoll).
import { SECURITY_HEADERS } from "../../../src/shared/platform.js";

export function openEventStream(res) {
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  });
  res.write(": smejj.com control-server event stream\n\n");
}

export function sendEvent(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function formatEvent(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function startHeartbeat(res, intervalMs = 15_000) {
  const timer = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, intervalMs);
  if (typeof timer.unref === "function") timer.unref();
  return () => clearInterval(timer);
}
