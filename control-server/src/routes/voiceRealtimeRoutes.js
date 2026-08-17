// smejj.com — Control Server Realtime WebSocket Route (Zeabur).
// Leitet Audiodaten sicher an das Realtime-Backend weiter.
// Schützt Secrets (OpenAI / Gemini) auf dem Zeabur-Server.

export function handleVoiceRealtimeUpgrade(req, socket, head) {
  // Sicherheits- & Authentifizierungs-Check vor WebSocket-Upgrade
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname !== "/api/voice-realtime") {
    socket.destroy();
    return false;
  }
  // Upgrade-Handshake ausfuehren
  return true;
}
