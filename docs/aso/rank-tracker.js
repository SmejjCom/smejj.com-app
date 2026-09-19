// Rang-Messung fuer com.smejj.app in der oeffentlichen Play-Suche.
// Nutzung: in einem Chrome-Tab auf https://play.google.com/ (beliebige Seite) die Konsole/JS-Tool oeffnen,
// diese Datei einfuegen, dann:  await smejjRank(['ai coding agent','browser automation'],'en','US')
// Ergebnis: [{q,pos,n}]  pos 0 = nicht in den ersten ~30 Treffern.
// Hinweis: curl/Node bekommen von Google nur eine Standardseite - die Messung MUSS im Browser laufen.
window.smejjRank = async (kws, hl = 'en', gl = 'US', pkg = 'com.smejj.app') => {
  const out = [];
  for (const q of kws) {
    const h = await (await fetch(`/store/search?q=${encodeURIComponent(q)}&c=apps&hl=${hl}&gl=${gl}`)).text();
    const ids = []; const re = /\/store\/apps\/details\?id=([A-Za-z0-9._]+)/g; let m;
    while ((m = re.exec(h))) if (!ids.includes(m[1])) ids.push(m[1]);
    out.push({ q, hl, gl, pos: ids.indexOf(pkg) + 1, n: ids.length, top3: ids.slice(0, 3) });
    await new Promise(r => setTimeout(r, 250));
  }
  return out;
};
// Lange Listen NICHT mit await am Stück laufen lassen (45-s-Zeitlimit des JS-Tools): stattdessen
// window.__res = []; smejjRank(liste).then(r => window.__res = r);  und spaeter window.__res lesen.
