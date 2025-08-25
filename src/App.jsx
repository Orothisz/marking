import React, { useMemo, useState, useEffect } from "react";

import * as XLSX from "xlsx";



// --- Helpers ---------------------------------------------------------------

const uid = () => Math.random().toString(36).slice(2, 9);

const lsKey = "mun-marking-v1";



function saveToLS(data) {

  try { localStorage.setItem(lsKey, JSON.stringify(data)); } catch {}

}

function loadFromLS() {

  try {

    const raw = localStorage.getItem(lsKey);

    return raw ? JSON.parse(raw) : null;

  } catch { return null; }

}



// --- Default Config (matches your sheet’s structure but fully editable) ---

const defaultConfig = {

  committee: "WHO – AIS",

  scoring: {

    speeches: [

      { name: "Speech 1", fields: [

        { key: "s1_research", label: "Research", max: 3 },

        { key: "s1_analysis", label: "Analysis", max: 4 },

        { key: "s1_impact", label: "Impact", max: 3 },

      ]},

      { name: "Speech 2", fields: [

        { key: "s2_research", label: "Research", max: 3 },

        { key: "s2_analysis", label: "Analysis", max: 4 },

        { key: "s2_impact", label: "Impact", max: 3 },

      ]},

      { name: "Speech 3", fields: [

        { key: "s3_research", label: "Research", max: 3 },

        { key: "s3_analysis", label: "Analysis", max: 4 },

        { key: "s3_impact", label: "Impact", max: 3 },

      ]},

    ],

    participation: [

      { key: "poo", label: "POO (x1)", max: 999, weight: 1 },

      { key: "poi", label: "POI (x1)", max: 999, weight: 1 },

      { key: "replies", label: "Replies (x1)", max: 999, weight: 1 },

    ],

    extras: [

      { key: "verbatim", label: "Verbatim items (count) × 5", perItem: 5 },

      { key: "documentation", label: "Documentation (/25)", max: 25 },

      { key: "diplomacy", label: "Diplomatic Courtesy (/3.5)", max: 3.5 },

      { key: "lobbying", label: "Lobbying (/3.5)", max: 3.5 },

      { key: "substantive", label: "Substantive chits (count) × 5", perItem: 5 },

      { key: "replypoi", label: "Reply & POI bonus (count) × 1", perItem: 1 },

      { key: "chits", label: "Non‑substantive chits (/5)", max: 5 },

    ],

  },

  awards: [

    { key: "BD", label: "Best Delegate", count: 1 },

    { key: "HC", label: "High Commendation", count: 1 },

    { key: "SM", label: "Special Mention", count: 3 },

    { key: "VM", label: "Verbal Mention", count: 2 },

  ],

};



const defaultDelegates = [

  // Start empty — add your portfolios easily

];



// --- Core App --------------------------------------------------------------

export default function App() {

  const [config, setConfig] = useState(() => loadFromLS()?.config || defaultConfig);

  const [delegates, setDelegates] = useState(() => loadFromLS()?.delegates || defaultDelegates);

  const [activeTab, setActiveTab] = useState("mark"); // mark | recognition | notes | settings

  const [filter, setFilter] = useState("");



  useEffect(() => saveToLS({ config, delegates }), [config, delegates]);



  const addDelegate = () => {

    const sNo = delegates.length ? Math.max(...delegates.map(d => d.sno || 0)) + 1 : 1;

    setDelegates(d => [...d, {

      id: uid(),

      sno: sNo,

      portfolio: "",

      scores: {},

      counts: { verbatim: 0, substantive: 0, replypoi: 0, poo: 0, poi: 0, replies: 0 },

      notes: "",

      award: "",

    }]);

  };



  const removeDelegate = (id) => setDelegates(d => d.filter(x => x.id !== id));



  const setScore = (id, key, value) => setDelegates(d => d.map(row => row.id === id ? {

    ...row,

    scores: { ...row.scores, [key]: value }

  } : row));



  const setCount = (id, key, value) => setDelegates(d => d.map(row => row.id === id ? {

    ...row,

    counts: { ...row.counts, [key]: value }

  } : row));



  const setMeta = (id, field, value) => setDelegates(d => d.map(row => row.id === id ? { ...row, [field]: value } : row));



  const compute = (row) => {

    let speechTotal = 0;

    config.scoring.speeches.forEach(s => {

      s.fields.forEach(f => {

        const v = Number(row.scores[f.key] ?? 0);

        speechTotal += clamp(v, 0, f.max);

      });

    });



    let participation = 0;

    config.scoring.participation.forEach(p => {

      const c = Number(row.counts[p.key] ?? 0);

      participation += clamp(c, 0, p.max) * (p.weight ?? 1);

    });



    let extras = 0;

    config.scoring.extras.forEach(e => {

      if (e.perItem) {

        const c = Number(row.counts[e.key] ?? 0);

        extras += clamp(c, 0, 9999) * e.perItem;

      } else {

        const v = Number(row.scores[e.key] ?? 0);

        extras += clamp(v, 0, e.max ?? 1000);

      }

    });



    const total = round2(speechTotal + participation + extras);

    return { speechTotal: round2(speechTotal), participation: round2(participation), extras: round2(extras), total };

  };



  const rows = useMemo(() => delegates.map(d => ({ ...d, calc: compute(d) })), [delegates, config]);

  const ranked = useMemo(() => [...rows].sort((a,b) => b.calc.total - a.calc.total), [rows]);



  const exportExcel = () => {

    const wsData = [

      ["S.NO", "Portfolio", ...config.scoring.speeches.flatMap(s => s.fields.map(f => `${s.name} – ${f.label} (/ ${f.max})`)),

       ...config.scoring.participation.map(p => `${p.label}`),

       ...config.scoring.extras.map(e => e.perItem ? `${e.label}` : `${e.label} (/ ${e.max})`),

       "Speech Total", "Participation", "Extras", "FINAL"],

      ...rows.map(r => [

        r.sno, r.portfolio,

        ...config.scoring.speeches.flatMap(s => s.fields.map(f => Number(r.scores[f.key] ?? 0))),

        ...config.scoring.participation.map(p => Number(r.counts[p.key] ?? 0) * (p.weight ?? 1)),

        ...config.scoring.extras.map(e => e.perItem ? Number(r.counts[e.key] ?? 0) * e.perItem : Number(r.scores[e.key] ?? 0)),

        r.calc.speechTotal, r.calc.participation, r.calc.extras, r.calc.total,

      ])

    ];



    const ws = XLSX.utils.aoa_to_sheet(wsData);

    const wb = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(wb, ws, "Marking");



    // Recognition sheet

    const recRows = [["Award", "S.NO", "Portfolio", "Score"], ...ranked.filter(r => r.award).map(r => [r.award, r.sno, r.portfolio, r.calc.total])];

    const ws2 = XLSX.utils.aoa_to_sheet(recRows);

    XLSX.utils.book_append_sheet(wb, ws2, "Recognition");



    // Verbatim notes

    const notesRows = [["S.NO", "Portfolio", "Notes"], ...rows.map(r => [r.sno, r.portfolio, r.notes || ""] )];

    const ws3 = XLSX.utils.aoa_to_sheet(notesRows);

    XLSX.utils.book_append_sheet(wb, ws3, "Verbatim");



    XLSX.writeFile(wb, `${(config.committee || "committee").replace(/\s+/g,'_')}_marking.xlsx`);

  };



  const importJSON = (file) => {

    const reader = new FileReader();

    reader.onload = () => {

      try {

        const parsed = JSON.parse(reader.result);

        if (parsed.config && parsed.delegates) {

          setConfig(parsed.config); setDelegates(parsed.delegates);

        } else if (parsed.delegates) {

          setDelegates(parsed.delegates);

        }

      } catch (e) { alert("Invalid JSON"); }

    };

    reader.readAsText(file);

  };



  const exportJSON = () => {

    const blob = new Blob([JSON.stringify({ config, delegates }, null, 2)], { type: "application/json" });

    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");

    a.href = url; a.download = `${(config.committee||'committee').replace(/\s+/g,'_')}_backup.json`; a.click();

    URL.revokeObjectURL(url);

  };



  const resetAll = () => {

    if (!confirm("Clear all data?")) return;

    setConfig(defaultConfig); setDelegates([]);

  };



  const visible = rows.filter(r => (r.portfolio||"" ).toLowerCase().includes(filter.toLowerCase()) || String(r.sno||"").includes(filter));



  return (

    <div className="p-4 md:p-6 max-w-[1400px] mx-auto font-sans">

      <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">

        <h1 className="text-2xl md:text-3xl font-bold">MUN Marking Dashboard</h1>

        <div className="flex flex-wrap gap-2">

          <button className="btn" onClick={addDelegate}>+ Add Delegate</button>

          <button className="btn" onClick={exportExcel}>Export Excel</button>

          <button className="btn" onClick={exportJSON}>Backup JSON</button>

          <label className="btn cursor-pointer"><input type="file" accept="application/json" className="hidden" onChange={e=> e.target.files?.[0] && importJSON(e.target.files[0])}/>Import JSON</label>

          <button className="btn danger" onClick={resetAll}>Reset</button>

        </div>

      </header>



      <nav className="mt-4 flex gap-2">

        {[

          {k:"mark", t:"Marking"},

          {k:"recognition", t:"Recognition"},

          {k:"notes", t:"Verbatim Notes"},

          {k:"settings", t:"Settings"},

          {k:"table", t:"Table View"},

        ].map(tab => (

          <button key={tab.k} onClick={()=>setActiveTab(tab.k)} className={`tab ${activeTab===tab.k? 'tab-active':''}`}>{tab.t}</button>

        ))}

        <div className="ml-auto">

          <input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Search S.NO / Portfolio" className="inp w-64"/>

        </div>

      </nav>



      {activeTab === "mark" && (

        <div className="mt-6 grid gap-4">

          {visible.map(r => (

            <DelegateCard key={r.id} row={r} config={config} setMeta={setMeta} setScore={setScore} setCount={setCount} removeDelegate={removeDelegate} />

          ))}

          {visible.length===0 && <p className="text-sm opacity-70">No delegates yet. Click “+ Add Delegate”.</p>}

        </div>

      )}



      {activeTab === "recognition" && (

        <RecognitionTab ranked={ranked} config={config} setMeta={setMeta} />

      )}



      {activeTab === "notes" && (

        <NotesTab rows={visible} setMeta={setMeta} />

      )}



      {activeTab === "settings" && (

        <SettingsTab config={config} setConfig={setConfig} />

      )}



      {activeTab === "table" && (

        <TableView rows={visible} config={config} setScore={setScore} setCount={setCount} />

      )}



      <footer className="mt-10 text-xs opacity-60">

        <p>Auto‑saves locally • Fully offline • Configurable to your rubric • Excel export compatible</p>

      </footer>



      <style>{css}</style>

    </div>

  );

}



function DelegateCard({ row, config, setMeta, setScore, setCount, removeDelegate }) {

  return (

    <div className="card">

      <div className="flex items-center gap-3">

        <input className="inp w-20" type="number" value={row.sno ?? ""} onChange={e=> setMeta(row.id, 'sno', Number(e.target.value))} placeholder="S.NO"/>

        <input className="inp flex-1" value={row.portfolio ?? ""} onChange={e=> setMeta(row.id, 'portfolio', e.target.value)} placeholder="Portfolio / Country"/>

        <div className="ml-auto text-right">

          <div className="text-xs">TOTAL</div>

          <div className="text-2xl font-bold">{row.calc.total.toFixed(2)}</div>

        </div>

        <button className="icon danger" title="Remove" onClick={()=>removeDelegate(row.id)}>×</button>

      </div>



      <div className="grid md:grid-cols-3 gap-4 mt-4">

        {config.scoring.speeches.map(s => (

          <div key={s.name} className="subcard">

            <div className="font-semibold mb-2">{s.name}</div>

            <div className="grid grid-cols-2 gap-2">

              {s.fields.map(f => (

                <NumberInput key={f.key} label={`${f.label} (/ ${f.max})`} value={row.scores[f.key] ?? ""} onChange={v=> setScore(row.id, f.key, v)} max={f.max} />

              ))}

            </div>

          </div>

        ))}



        <div className="subcard">

          <div className="font-semibold mb-2">Participation</div>

          <div className="grid grid-cols-2 gap-2">

            {config.scoring.participation.map(p => (

              <NumberInput key={p.key} label={p.label} value={row.counts[p.key] ?? ""} onChange={v=> setCount(row.id, p.key, v)} integer />

            ))}

          </div>

        </div>



        <div className="subcard md:col-span-2">

          <div className="font-semibold mb-2">Extras</div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">

            {config.scoring.extras.map(e => (

              e.perItem ? (

                <NumberInput key={e.key} label={e.label} value={row.counts[e.key] ?? ""} onChange={v=> setCount(row.id, e.key, v)} integer />

              ) : (

                <NumberInput key={e.key} label={e.label} value={row.scores[e.key] ?? ""} onChange={v=> setScore(row.id, e.key, v)} max={e.max} />

              )

            ))}

          </div>

        </div>

      </div>



      <div className="mt-4 grid grid-cols-3 md:grid-cols-6 gap-3 text-sm">

        <div>

          <div className="lbl">Speech Total</div>

          <div className="val">{row.calc.speechTotal.toFixed(2)}</div>

        </div>

        <div>

          <div className="lbl">Participation</div>

          <div className="val">{row.calc.participation.toFixed(2)}</div>

        </div>

        <div>

          <div className="lbl">Extras</div>

          <div className="val">{row.calc.extras.toFixed(2)}</div>

        </div>

        <div>

          <div className="lbl">Award</div>

          <select className="inp" value={row.award || ""} onChange={e=> setMeta(row.id, 'award', e.target.value)}>

            <option value="">—</option>

            <option>BD</option>

            <option>HC</option>

            <option>SM</option>

            <option>VM</option>

          </select>

        </div>

        <div className="col-span-3 md:col-span-2">

          <div className="lbl">Verbatim Notes</div>

          <textarea className="inp h-20" value={row.notes || ""} onChange={e=> setMeta(row.id, 'notes', e.target.value)} placeholder="Key quotes, policy lines, directives, etc." />

        </div>

      </div>

    </div>

  );

}



function RecognitionTab({ ranked, config, setMeta }) {

  return (

    <div className="mt-6 grid gap-4">

      <div className="card">

        <div className="flex items-center justify-between">

          <div>

            <h2 className="text-xl font-semibold">Recognition Sheet</h2>

            <p className="text-sm opacity-70">Assign awards or auto‑fill from ranking.</p>

          </div>

          <div className="flex gap-2">

            <button className="btn" onClick={()=> autoAssignAwards(ranked, setMeta)}>Auto‑assign</button>

            <button className="btn" onClick={()=> clearAwards(ranked, setMeta)}>Clear</button>

          </div>

        </div>

      </div>



      <div className="grid md:grid-cols-2 gap-4">

        {Object.entries(groupBy(ranked, r => r.award || "Unassigned")).map(([award, list]) => (

          <div className="card" key={award}>

            <div className="font-semibold mb-2">{award}</div>

            <table className="tbl">

              <thead><tr><th className="w-14">S.NO</th><th>Portfolio</th><th className="w-24 text-right">Score</th></tr></thead>

              <tbody>

                {list.map(r => (

                  <tr key={r.id}>

                    <td>{r.sno}</td>

                    <td>{r.portfolio}</td>

                    <td className="text-right">{r.calc.total.toFixed(2)}</td>

                  </tr>

                ))}

              </tbody>

            </table>

          </div>

        ))}

      </div>

    </div>

  );

}



function NotesTab({ rows, setMeta }) {

  return (

    <div className="mt-6 grid gap-4">

      {rows.map(r => (

        <div className="card" key={r.id}>

          <div className="flex items-center gap-3 mb-2"><div className="font-semibold">{r.sno}. {r.portfolio}</div><div className="ml-auto text-sm opacity-70">Score: {r.calc.total.toFixed(2)}</div></div>

          <textarea className="inp h-28" value={r.notes || ""} onChange={e=> setMeta(r.id, 'notes', e.target.value)} placeholder="Verbatim / directives / highlights" />

        </div>

      ))}

      {rows.length===0 && <p className="text-sm opacity-70">No delegates selected.</p>}

    </div>

  );

}



function SettingsTab({ config, setConfig }) {

  const [local, setLocal] = useState(JSON.parse(JSON.stringify(config)));

  useEffect(()=> setLocal(JSON.parse(JSON.stringify(config))), [config]);



  const updateField = (path, updater) => {

    const draft = JSON.parse(JSON.stringify(local));

    updater(draft);

    setLocal(draft);

  };



  const addSpeechField = (si) => updateField([], d => {

    d.scoring.speeches[si].fields.push({ key: uid(), label: "New", max: 1 });

  });

  const addSpeech = () => updateField([], d => {

    d.scoring.speeches.push({ name: `Speech ${d.scoring.speeches.length+1}`, fields: [] });

  });



  const addParticipation = () => updateField([], d => { d.scoring.participation.push({ key: uid(), label: "New (x1)", max: 999, weight: 1 }); });

  const addExtra = () => updateField([], d => { d.scoring.extras.push({ key: uid(), label: "New (/5)", max: 5 }); });



  const save = () => setConfig(local);



  return (

    <div className="mt-6 grid gap-4">

      <div className="card">

        <div className="grid md:grid-cols-2 gap-4">

          <div>

            <label className="lbl">Committee name</label>

            <input className="inp" value={local.committee} onChange={e=> updateField([], d => { d.committee = e.target.value; })} />

            <div className="mt-6">

              <div className="font-semibold mb-2">Speeches</div>

              {local.scoring.speeches.map((s, si) => (

                <div className="subcard" key={si}>

                  <div className="flex items-center gap-2 mb-2">

                    <input className="inp" value={s.name} onChange={e=> updateField([], d => { d.scoring.speeches[si].name = e.target.value; })} />

                    <button className="icon" title="Add field" onClick={()=> addSpeechField(si)}>＋</button>

                    <button className="icon danger" title="Remove speech" onClick={()=> updateField([], d => { d.scoring.speeches.splice(si,1); })}>×</button>

                  </div>

                  <div className="grid md:grid-cols-2 gap-2">

                    {s.fields.map((f, fi) => (

                      <div key={fi} className="flex gap-2">

                        <input className="inp flex-1" value={f.label} onChange={e=> updateField([], d => { d.scoring.speeches[si].fields[fi].label = e.target.value; })} />

                        <input className="inp w-24" type="number" value={f.max} onChange={e=> updateField([], d => { d.scoring.speeches[si].fields[fi].max = Number(e.target.value); })} />

                        <button className="icon danger" onClick={()=> updateField([], d => { d.scoring.speeches[si].fields.splice(fi,1); })}>×</button>

                      </div>

                    ))}

                  </div>

                </div>

              ))}

              <button className="btn" onClick={addSpeech}>+ Add Speech</button>

            </div>

          </div>



          <div>

            <div className="font-semibold mb-2">Participation</div>

            <div className="grid gap-2">

              {local.scoring.participation.map((p, pi) => (

                <div key={pi} className="grid grid-cols-12 gap-2 items-center">

                  <input className="inp col-span-7" value={p.label} onChange={e=> updateField([], d => { d.scoring.participation[pi].label = e.target.value; })} />

                  <input className="inp col-span-2" type="number" value={p.weight || 1} onChange={e=> updateField([], d => { d.scoring.participation[pi].weight = Number(e.target.value); })} />

                  <input className="inp col-span-2" type="number" value={p.max} onChange={e=> updateField([], d => { d.scoring.participation[pi].max = Number(e.target.value); })} />

                  <button className="icon danger col-span-1" onClick={()=> updateField([], d => { d.scoring.participation.splice(pi,1); })}>×</button>

                </div>

              ))}

              <button className="btn w-fit" onClick={addParticipation}>+ Add Participation</button>

            </div>



            <div className="mt-6 font-semibold mb-2">Extras</div>

            <div className="grid gap-2">

              {local.scoring.extras.map((e, ei) => (

                <div key={ei} className="grid grid-cols-12 gap-2 items-center">

                  <input className="inp col-span-7" value={e.label} onChange={ev=> updateField([], d => { d.scoring.extras[ei].label = ev.target.value; })} />

                  <label className="col-span-2 text-sm flex items-center gap-2"><input type="checkbox" checked={!!e.perItem} onChange={ev=> updateField([], d => { d.scoring.extras[ei].perItem = ev.target.checked ? (e.perItem || 1) : undefined; })}/> per‑item?</label>

                  {e.perItem ? (

                    <input className="inp col-span-2" type="number" value={e.perItem} onChange={ev=> updateField([], d => { d.scoring.extras[ei].perItem = Number(ev.target.value); })} />

                  ) : (

                    <input className="inp col-span-2" type="number" value={e.max || 0} onChange={ev=> updateField([], d => { d.scoring.extras[ei].max = Number(ev.target.value); })} />

                  )}

                  <button className="icon danger col-span-1" onClick={()=> updateField([], d => { d.scoring.extras.splice(ei,1); })}>×</button>

                </div>

              ))}

              <button className="btn w-fit" onClick={addExtra}>+ Add Extra</button>

            </div>



            <div className="mt-6">

              <div className="font-semibold mb-2">Awards (labels only; scoring is ranking‑based)</div>

              <AwardEditor local={local} setLocal={setLocal} />

            </div>



            <div className="mt-4 flex gap-2">

              <button className="btn" onClick={save}>Save Settings</button>

            </div>

          </div>

        </div>

      </div>

    </div>

  );

}



function AwardEditor({ local, setLocal }) {

  const add = () => setLocal(d => ({...d, awards: [...d.awards, { key: uid(), label: "Award", count: 1 }]}));

  const update = (i, patch) => setLocal(d => ({...d, awards: d.awards.map((a,idx)=> idx===i ? {...a, ...patch} : a)}));

  const remove = (i) => setLocal(d => ({...d, awards: d.awards.filter((_,idx)=> idx!==i)}));

  return (

    <div className="grid gap-2">

      {local.awards.map((a,i)=> (

        <div key={i} className="grid grid-cols-12 gap-2 items-center">

          <input className="inp col-span-7" value={a.label} onChange={e=> update(i, { label: e.target.value })} />

          <input className="inp col-span-3" value={a.key} onChange={e=> update(i, { key: e.target.value })} />

          <input className="inp col-span-1" type="number" value={a.count} onChange={e=> update(i, { count: Number(e.target.value) })} />

          <button className="icon danger col-span-1" onClick={()=> remove(i)}>×</button>

        </div>

      ))}

      <button className="btn w-fit" onClick={add}>+ Add Award</button>

    </div>

  );

}



function TableView({ rows, config, setScore, setCount }) {

  const header = ["S.NO", "Portfolio",

    ...config.scoring.speeches.flatMap(s => s.fields.map(f => `${s.name} – ${f.label}`)),

    ...config.scoring.participation.map(p => p.label),

    ...config.scoring.extras.map(e => e.label),

    "TOTAL"

  ];

  return (

    <div className="mt-6 card overflow-x-auto">

      <table className="tbl min-w-[900px]">

        <thead><tr>{header.map((h,i)=>(<th key={i}>{h}</th>))}</tr></thead>

        <tbody>

          {rows.map(r => (

            <tr key={r.id}>

              <td className="w-16">{r.sno}</td>

              <td className="w-56">{r.portfolio}</td>

              {config.scoring.speeches.map(s => s.fields.map(f => (

                <td key={f.key}><CellNumber value={r.scores[f.key] ?? ""} onChange={v=> setScore(r.id, f.key, v)} /></td>

              )))}

              {config.scoring.participation.map(p => (

                <td key={p.key}><CellNumber integer value={r.counts[p.key] ?? ""} onChange={v=> setCount(r.id, p.key, v)} /></td>

              ))}

              {config.scoring.extras.map(e => (

                <td key={e.key}>

                  {e.perItem ? <CellNumber integer value={r.counts[e.key] ?? ""} onChange={v=> setCount(r.id, e.key, v)} /> : <CellNumber value={r.scores[e.key] ?? ""} onChange={v=> setScore(r.id, e.key, v)} />}

                </td>

              ))}

              <td className="text-right font-semibold">{r.calc.total.toFixed(2)}</td>

            </tr>

          ))}

        </tbody>

      </table>

    </div>

  );

}



function NumberInput({ label, value, onChange, max, integer }) {

  return (

    <label className="grid gap-1 text-sm">

      <span className="opacity-80">{label}</span>

      <input className="inp" type="number" step={integer?1:0.01} value={value} onChange={e=> onChange(numberOrBlank(e.target.value, integer))} {...(max!=null?{max}:{})} />

    </label>

  );

}



function CellNumber({ value, onChange, integer }) {

  return <input className="inp w-24" type="number" step={integer?1:0.01} value={value} onChange={e=> onChange(numberOrBlank(e.target.value, integer))} />;

}



function numberOrBlank(v, integer) {

  if (v === "") return "";

  const n = integer ? parseInt(v,10) : parseFloat(v);

  return isNaN(n) ? "" : n;

}



function autoAssignAwards(ranked, setMeta) {

  // Clear existing awards

  ranked.forEach(r => setMeta(r.id, 'award', ''));

  // Simple template: top 1 BD, next 1 HC, next 3 SM, next 2 VM

  const plan = [

    { label: 'BD', count: 1 },

    { label: 'HC', count: 1 },

    { label: 'SM', count: 3 },

    { label: 'VM', count: 2 },

  ];

  let i = 0;

  plan.forEach(block => {

    for (let k = 0; k < block.count && i < ranked.length; k++, i++) {

      setMeta(ranked[i].id, 'award', block.label);

    }

  });

}

function clearAwards(ranked, setMeta) { ranked.forEach(r => setMeta(r.id, 'award', '')); }



function groupBy(arr, fn) {

  return arr.reduce((acc, x) => { const k = fn(x); (acc[k] ||= []).push(x); return acc; }, {});

}

function clamp(n, a, b) { return Math.max(a, Math.min(b, Number(n)||0)); }

function round2(n) { return Math.round(n * 100) / 100; }



// --- Minimal CSS (Tailwind‑like utility vibes, no external dep) -----------

const css = `

:root { color-scheme: dark light; }

* { box-sizing: border-box; }

body { margin: 0; }

.btn { padding: 0.5rem 0.8rem; border: 1px solid #444; border-radius: 0.6rem; background: transparent; cursor: pointer; }

.btn:hover { background: rgba(127,127,127,.12); }

.btn.danger { border-color: #a33; color: #f66; }

.icon { width: 2rem; height: 2rem; border: 1px solid #444; border-radius: 0.5rem; background: transparent; cursor: pointer; display: grid; place-items: center; }

.icon:hover { background: rgba(127,127,127,.12); }

.icon.danger { border-color: #a33; color: #f66; }

.inp { width: 100%; padding: 0.5rem 0.7rem; border: 1px solid #444; border-radius: 0.6rem; background: transparent; }

.lbl { font-size: 0.8rem; opacity: 0.7; margin-bottom: 0.3rem; }

.card { border: 1px solid #333; border-radius: 1rem; padding: 1rem; background: rgba(127,127,127,.06); }

.subcard { border: 1px dashed #444; border-radius: 0.8rem; padding: 0.75rem; }

.tbl { width: 100%; border-collapse: collapse; }

.tbl th, .tbl td { padding: 0.5rem; border-bottom: 1px solid #333; text-align: left; }

.tab { padding: 0.45rem 0.8rem; border: 1px solid #333; border-radius: 0.6rem; background: transparent; }

.tab-active { background: rgba(127,127,127,.15); }

.val { font-weight: 700; font-variant-numeric: tabular-nums; }

`;
