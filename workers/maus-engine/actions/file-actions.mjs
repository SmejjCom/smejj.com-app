// smejj.com Maus-Engine — Datei-Aktionen.
// Single Responsibility: uploadFile, download, watchDownloads. Downloads
// und Uploads sind nur gemaess policy.files erlaubt (Plan-Validator) und
// werden hier zusaetzlich fail-closed geprueft. Upload-Quellen kommen nur
// aus der Task Capsule, nie von beliebigen Worker-Pfaden.

function assertExtensionAllowed(fileName, files) {
  const allowed = files?.allowedExtensions;
  if (!Array.isArray(allowed) || allowed.length === 0) return;
  const lower = String(fileName).toLowerCase();
  if (!allowed.some((ext) => lower.endsWith(ext))) {
    throw new Error(`dateityp_nicht_erlaubt: ${fileName}`);
  }
}

export const fileActions = {
  async uploadFile(ctx, step, { attempt }) {
    if (ctx.policy.files?.uploadAllowed !== true) throw new Error("upload_nicht_erlaubt");
    if (String(step.capsulePath).includes("..")) throw new Error("capsule_pfad_ungueltig");
    assertExtensionAllowed(step.capsulePath, ctx.policy.files);
    const localPath = await ctx.capsuleFiles.materialize(step.capsulePath);
    const page = ctx.activePage();
    const locator = ctx.locate(page, step.target, attempt);
    await locator.setInputFiles(localPath, { timeout: ctx.timeoutFor(step) });
    return { file: step.capsulePath };
  },

  async download(ctx, step, { attempt }) {
    if (ctx.policy.files?.downloadAllowed !== true) throw new Error("download_nicht_erlaubt");
    assertExtensionAllowed(step.saveAs, ctx.policy.files);
    const maxBytes = ctx.policy.files?.maxFileBytes ?? 104857600;

    if (step.url) {
      ctx.ensureUrlAllowed(step.url);
      const response = await ctx.fetchImpl(step.url, { method: "GET", redirect: "manual" });
      if (!response.ok) throw new Error(`download_http_${response.status}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > maxBytes) throw new Error(`download_zu_gross: ${buffer.length} > ${maxBytes}`);
      ctx.addArtifact(`downloads/${step.saveAs}`, buffer, "application/octet-stream");
      ctx.state.downloads.push({ suggestedFilename: step.saveAs, bytes: buffer.length });
      return { bytes: buffer.length, via: "http" };
    }

    const page = ctx.activePage();
    const locator = ctx.locate(page, step.trigger, attempt);
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: ctx.timeoutFor(step) }),
      locator.click({ timeout: ctx.timeoutFor(step) })
    ]);
    const path = await download.path();
    const buffer = await ctx.readLocalFile(path);
    if (buffer.length > maxBytes) throw new Error(`download_zu_gross: ${buffer.length} > ${maxBytes}`);
    ctx.addArtifact(`downloads/${step.saveAs}`, buffer, "application/octet-stream");
    ctx.state.downloads.push({ suggestedFilename: step.saveAs, bytes: buffer.length });
    return { bytes: buffer.length, via: "browser" };
  },

  async watchDownloads(ctx, step) {
    const expect = step.expectFiles ?? 1;
    const deadline = Date.now() + ctx.timeoutFor(step);
    while (ctx.state.downloads.length < expect) {
      if (Date.now() > deadline) {
        throw new Error(`downloads_unvollstaendig: ${ctx.state.downloads.length}/${expect}`);
      }
      await ctx.sleep(200);
    }
    return { files: ctx.state.downloads.map((d) => d.suggestedFilename) };
  }
};
