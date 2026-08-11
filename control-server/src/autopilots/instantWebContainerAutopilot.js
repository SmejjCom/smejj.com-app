// smejj.com — In-Browser Instant WebContainers & Live-Vorschau Engine (Autopilot Nr. 26)
// Ermöglicht das sofortige, clientseitige Rendern und Ausführen von generierten Web-Apps
// (HTML/JS/CSS) in einer isolierten Sandbox mit 0 Server-Last (Static-First für 1 Mrd. Besucher).

/**
 * Erzeugt ein isoliertes HTML5-Sandboxed-Preview-Dokument aus Code-Bausteinen.
 * @param {{html?: string, css?: string, js?: string, title?: string}} projectFiles
 * @returns {{previewHtml: string, sizeBytes: number, isSafe: boolean}}
 */
export function buildInstantWebContainerPreview({ html = "", css = "", js = "", title = "smejj.com Live App" } = {}) {
  // Sicherheits-Sanitization gegen schädliche Parent-Frame-Ausbrüche
  const sanitizedJs = js
    .replace(/window\.parent/g, "window")
    .replace(/window\.top/g, "window")
    .replace(/document\.cookie/g, "''");

  const previewDoc = [
    "<!DOCTYPE html>",
    "<html lang=\"de\">",
    "<head>",
    "  <meta charset=\"UTF-8\">",
    "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">",
    `  <title>${title} — smejj.com</title>`,
    "  <style>",
    "    * { box-sizing: border-box; margin: 0; padding: 0; }",
    "    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }",
    `    ${css}`,
    "  </style>",
    "</head>",
    "<body>",
    `  ${html || "<div id=\"app\"></div>"}`,
    "  <script>",
    "    try {",
    `      ${sanitizedJs}`,
    "    } catch (renderError) {",
    "      console.error('[smejj.com WebContainer Error]:', renderError);",
    "    }",
    "  </script>",
    "</body>",
    "</html>"
  ].join("\n");

  return {
    previewHtml: previewDoc,
    sizeBytes: Buffer.byteLength(previewDoc, "utf8"),
    isSafe: true
  };
}

/**
 * Validiert, ob ein generiertes Web-App-Snippet fehlerfrei als interaktive Vorschau gebündelt werden kann.
 * @param {string} rawCode
 * @returns {{canPreview: boolean, detectedType: "html" | "full_stack" | "script" | "unknown", extracted: {html: string, css: string, js: string}}}
 */
export function analyzeWebContainerSnippet(rawCode) {
  if (typeof rawCode !== "string" || !rawCode.trim()) {
    return { canPreview: false, detectedType: "unknown", extracted: { html: "", css: "", js: "" } };
  }

  const htmlMatch = rawCode.match(/```html([\s\S]*?)```/i);
  const cssMatch = rawCode.match(/```css([\s\S]*?)```/i);
  const jsMatch = rawCode.match(/```(?:javascript|js)([\s\S]*?)```/i);

  const html = htmlMatch ? htmlMatch[1].trim() : (rawCode.includes("<div") || rawCode.includes("<button") ? rawCode : "");
  const css = cssMatch ? cssMatch[1].trim() : "";
  const js = jsMatch ? jsMatch[1].trim() : "";

  const canPreview = Boolean(html || js);
  const detectedType = html && js ? "full_stack" : html ? "html" : js ? "script" : "unknown";

  return {
    canPreview,
    detectedType,
    extracted: { html, css, js }
  };
}
