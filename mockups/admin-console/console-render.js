// smejj.com — Operations Console (Mockup): Darstellung und Aufbau.
// Liest die Moduldaten aus window.adminConsoleModules (console-modules.js).
// Klassisches Skript, kein ES-Modul — damit die Datei auch per file:// laeuft.
/* ---------------- Bausteine ---------------- */
const esc = s => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;");
// "ok:Aktiv" -> Pille;  sonst Klartext
function cell(v){
  if(typeof v !== "string") return esc(v);
  const m = v.match(/^(ok|warn|bad|acc|dim):(.*)$/);
  if(m) return m[1]==="dim" ? `<span style="color:var(--sm-ink-faint)">${esc(m[2])}</span>`
                            : `<span class="pill ${m[1]}">${esc(m[2])}</span>`;
  if(v.startsWith("#")) return `<span class="mono">${esc(v)}</span>`;
  if(v.startsWith("!")) return `<b>${v.slice(1)}</b>`;
  if(v.startsWith("@")) return v.slice(1).split("|").map(a=>{
      const dg=a.startsWith("-");return `<span class="act${dg?" dg":""}">${esc(dg?a.slice(1):a)}</span>`;}).join("");
  return esc(v);
}
const B = {
  kpis: b => `<div class="kpis">${b.items.map(i=>`
    <div class="kpi glass"><div class="k">${esc(i.k)}</div><div class="v">${esc(i.v)}</div>
      <div class="d ${i.tone||""}">${esc(i.d||"")}</div>
      ${i.spark?`<div class="spark">${i.spark.map(h=>`<i style="height:${h}%"></i>`).join("")}</div>`:""}
    </div>`).join("")}</div>`,

  table: b => `<section class="panel glass">
      <div class="ph"><h3>${esc(b.title)}</h3>${b.sub?`<span class="sub">${esc(b.sub)}</span>`:""}
        <span class="spacer"></span>${(b.tools||[]).map(t=>`<span class="btn">${esc(t)}</span>`).join("")}</div>
      <div class="pb flush"><table><thead><tr>${b.cols.map(c=>`<th>${esc(c)}</th>`).join("")}</tr></thead>
      <tbody>${b.rows.map(r=>`<tr>${r.map(c=>`<td>${cell(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
    </section>`,

  rows: b => `<section class="panel glass">
      <div class="ph"><h3>${esc(b.title)}</h3>${b.sub?`<span class="sub">${esc(b.sub)}</span>`:""}<span class="spacer"></span>
        ${(b.tools||[]).map(t=>`<span class="btn">${esc(t)}</span>`).join("")}</div>
      <div class="rows">${b.items.map(i=>`<div class="row"><div class="ic">${esc(i.ic||"•")}</div>
        <div><div class="t">${esc(i.t)}</div>${i.s?`<div class="s">${esc(i.s)}</div>`:""}</div>
        <div>${cell(i.r||"")}</div></div>`).join("")}</div></section>`,

  bars: b => `<section class="panel glass"><div class="ph"><h3>${esc(b.title)}</h3>
      ${b.sub?`<span class="sub">${esc(b.sub)}</span>`:""}</div>
      <div class="pb"><div class="bars">${b.items.map(i=>`<div class="bar-row">
        <div class="bl"><span>${esc(i.l)}</span><span>${esc(i.v)}</span></div>
        <div class="track"><i class="${i.tone||""}" style="width:${i.p}%"></i></div></div>`).join("")}</div></div></section>`,

  form: b => `<section class="panel glass"><div class="ph"><h3>${esc(b.title)}</h3>
      ${b.sub?`<span class="sub">${esc(b.sub)}</span>`:""}</div><div class="pb"><div class="form">
      ${b.fields.map(f=>`<div class="field"><label>${esc(f.l)}</label>
        <div class="in ${f.ph?"ph":""} ${f.sel?"sel":""}">${esc(f.v)}</div>
        ${f.hint?`<div class="hint">${esc(f.hint)}</div>`:""}</div>`).join("")}
      ${b.actions?`<div class="bar" style="margin:4px 0 0">${b.actions.map(a=>
        `<span class="btn ${a.startsWith("!")?"primary":a.startsWith("-")?"danger":""}">${esc(a.replace(/^[!-]/,""))}</span>`).join("")}</div>`:""}
      </div></div></section>`,

  toggles: b => `<section class="panel glass"><div class="ph"><h3>${esc(b.title)}</h3>
      ${b.sub?`<span class="sub">${esc(b.sub)}</span>`:""}</div><div class="pb">
      ${b.items.map(i=>`<div class="tgl"><div><div class="tl">${esc(i.t)}</div>
        <div class="ts">${esc(i.s||"")}</div></div><div class="sw ${i.on?"on":""}"></div></div>`).join("")}</div></section>`,

  note: b => `<div class="note glass ${b.tone||""}"><div class="nx">${b.icon||"◆"}</div>
      <div><div class="nt">${esc(b.h)}</div><div class="ns">${esc(b.s)}</div></div></div>`,

  tl: b => `<section class="panel glass"><div class="ph"><h3>${esc(b.title)}</h3>
      ${b.sub?`<span class="sub">${esc(b.sub)}</span>`:""}<span class="spacer"></span>
      ${(b.tools||[]).map(t=>`<span class="btn">${esc(t)}</span>`).join("")}</div>
      <div class="tl">${b.items.map(i=>`<div class="e"><div class="tm">${esc(i.tm)}</div>
        <div class="tx">${i.tx}</div></div>`).join("")}</div></section>`,

  dual: b => `<section class="panel glass"><div class="ph"><h3>${esc(b.title)}</h3>
      <span class="sub">${esc(b.sub||"")}</span></div>
      <div class="dual"><div class="who"><div class="n">${esc(b.a)}</div>
        <div class="st ok">beantragt</div></div><div class="link"></div>
        <div class="who"><div class="n">${esc(b.bb)}</div><div class="st wait">Freigabe offen</div></div></div>
      <div class="pb" style="border-top:1px solid var(--sm-border)">
        <div class="field"><label>Begründung (Pflicht)</label><div class="in">${esc(b.reason)}</div></div></div></section>`,

  cols2: b => `<div class="cols2">${b.left.map(render).join("")}<div class="stack">${b.right.map(render).join("")}</div></div>`,
  cols3: b => `<div class="cols3">${b.items.map(render).join("")}</div>`,
  bar:  b => `<div class="bar">${b.items.map(t=>`<span class="btn ${t.startsWith("!")?"primary":t.startsWith("*")?"on":t.startsWith("-")?"danger":""}">${esc(t.replace(/^[!*-]/,""))}</span>`).join("")}</div>`,
};
const render = b => (B[b.t] ? B[b.t](b) : "");

/* ---------------- Die 26 Module ---------------- */

const P = window.adminConsoleModules || [];
/* ---------------- Aufbau ---------------- */
const nav = document.getElementById("nav"), pages = document.getElementById("pages");
let lastG = null;
P.forEach(p=>{
  if(p.g !== lastG){ lastG = p.g;
    const g=document.createElement("div"); g.className="rail-group"; g.textContent=p.g; nav.appendChild(g); }
  const a=document.createElement("a"); a.className="rail-item"; a.href="#"+p.id; a.dataset.id=p.id;
  a.innerHTML=`<span class="ltr">${p.id}</span><span>${p.n}</span>`; nav.appendChild(a);

  const s=document.createElement("section"); s.className="page"; s.id="pg-"+p.id;
  s.innerHTML = `<div class="head"><div class="eyebrow"><span class="kbd">${p.id}</span>${p.h}</div>
      <h1>${p.n}</h1><p>${p.d}</p></div>
      <div class="stack">${p.blocks.map(render).join("")}</div>
      <div class="foot-note glass">Mockup · smejj.com Operations Console · Modul <b>${p.id} — ${p.n}</b> ·
        Design nach public/ui-modern.css, alle Radien auf 0 gesetzt (Vorgabe „viereckig“), Glasflächen nach iPhone-17-Vorbild.
        Alle Zahlen sind Beispieldaten.</div>`;
  pages.appendChild(s);
});
function show(id){
  id = (id||"A").toUpperCase();
  if(!P.some(p=>p.id===id)) id="A";
  document.querySelectorAll(".page").forEach(e=>e.classList.toggle("on", e.id==="pg-"+id));
  document.querySelectorAll(".rail-item").forEach(e=>e.classList.toggle("on", e.dataset.id===id));
  const p=P.find(x=>x.id===id);
  document.getElementById("crumb").textContent = p.n;
  const on=document.querySelector(".rail-item.on"); if(on) on.scrollIntoView({block:"nearest"});
  window.scrollTo(0,0);
}
addEventListener("hashchange",()=>show(location.hash.slice(1)));
show(location.hash.slice(1));
