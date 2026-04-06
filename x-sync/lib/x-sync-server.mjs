#!/usr/bin/env bun
import { Database } from "bun:sqlite";
import { homedir } from "os";
import { mkdirSync } from "fs";
import { join } from "path";

// --- Config ---
const PORT = (() => {
  const idx = process.argv.indexOf("--port");
  return idx !== -1 ? parseInt(process.argv[idx + 1], 10) : 19842;
})();
const API_KEY = process.env.XM_SYNC_API_KEY ?? "";
const DB_PATH = join(homedir(), ".xm", "sync", "sync.db");

mkdirSync(join(homedir(), ".xm", "sync"), { recursive: true });

// --- DB ---
const db = new Database(DB_PATH);
db.exec("PRAGMA journal_mode=WAL;");
db.exec(`
  CREATE TABLE IF NOT EXISTS sync_files (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL,
    machine_id TEXT NOT NULL,
    path       TEXT NOT NULL,
    content    TEXT NOT NULL,
    hash       TEXT NOT NULL,
    pushed_at  INTEGER NOT NULL,
    UNIQUE(project_id, path, machine_id)
  );
  CREATE INDEX IF NOT EXISTS idx_pushed_at ON sync_files(pushed_at);
  CREATE INDEX IF NOT EXISTS idx_project   ON sync_files(project_id);
`);

const stmtGetHash = db.prepare(
  "SELECT hash FROM sync_files WHERE project_id=? AND path=? AND machine_id=?"
);
const stmtUpsert = db.prepare(
  `INSERT OR REPLACE INTO sync_files (project_id, machine_id, path, content, hash, pushed_at)
   VALUES (?, ?, ?, ?, ?, ?)`
);
const stmtPull = db.prepare(
  "SELECT path, content, hash, machine_id, pushed_at FROM sync_files WHERE project_id=? AND pushed_at>?"
);
const stmtPullAll = db.prepare(
  "SELECT path, content, hash, machine_id, pushed_at FROM sync_files WHERE project_id=?"
);
const stmtProjects = db.prepare(
  `SELECT project_id,
          COUNT(*) AS file_count,
          MAX(pushed_at) AS last_push
   FROM sync_files GROUP BY project_id`
);
const stmtMachines = db.prepare(
  "SELECT DISTINCT machine_id FROM sync_files WHERE project_id=?"
);
const stmtTotalFiles = db.prepare("SELECT COUNT(*) AS n FROM sync_files");
const stmtTotalProjects = db.prepare(
  "SELECT COUNT(DISTINCT project_id) AS n FROM sync_files"
);

// --- Helpers ---
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function authError() {
  return json({ error: "Unauthorized" }, 401);
}

function checkAuth(req) {
  if (!API_KEY) return true; // no key configured → open
  return req.headers.get("X-Api-Key") === API_KEY;
}

// --- Handlers ---
async function handlePush(req) {
  if (!checkAuth(req)) return authError();
  const body = await req.json();
  const { machine_id, project_id, files } = body;
  if (!machine_id || !project_id || !Array.isArray(files)) {
    return json({ error: "Bad request" }, 400);
  }

  let accepted = 0;
  let skipped = 0;
  const now = Date.now();

  for (const { path, content, hash } of files) {
    const existing = stmtGetHash.get(project_id, path, machine_id);
    if (existing?.hash === hash) {
      skipped++;
    } else {
      stmtUpsert.run(project_id, machine_id, path, content, hash, now);
      accepted++;
    }
  }

  console.error(
    `[x-sync] POST /sync/push project=${project_id} files=${files.length} accepted=${accepted} skipped=${skipped}`
  );
  return json({ accepted, skipped });
}

function handlePull(req) {
  if (!checkAuth(req)) return authError();
  const url = new URL(req.url);
  const project_id = url.searchParams.get("project_id");
  const since = url.searchParams.get("since");

  if (!project_id) return json({ error: "project_id required" }, 400);

  const files = since
    ? stmtPull.all(project_id, parseInt(since, 10))
    : stmtPullAll.all(project_id);

  console.error(
    `[x-sync] GET /sync/pull project=${project_id} since=${since ?? "all"} returned=${files.length}`
  );
  return json({ files, server_time: Date.now() });
}

function handleDashboardProjects() {
  const rows = stmtProjects.all();
  const result = rows.map((r) => {
    const machines = stmtMachines
      .all(r.project_id)
      .map((m) => m.machine_id);
    return {
      project_id: r.project_id,
      machines,
      file_count: r.file_count,
      last_push: r.last_push,
    };
  });
  return json(result);
}

function handleDashboardHealth() {
  const files = stmtTotalFiles.get().n;
  const projects = stmtTotalProjects.get().n;
  return json({ status: "ok", version: "0.1.0", files, projects });
}

// --- Dashboard HTML (matches x-dashboard brutalist style) ---
function handleDashboardUI() {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>x-sync</title>
<style>
:root{--bg:#212121;--surface:#263238;--surface-hover:#37474f;--text:#fff;--text-muted:#B0BEC5;--accent:#FFAB40;--accent-dim:rgba(255,171,64,.12);--success:#69f0ae;--danger:#ff5252;--border:2px solid #333;--shadow:4px 4px 0 rgba(0,0,0,.5);--font-sans:'Pretendard',-apple-system,system-ui,sans-serif;--font-mono:'SF Mono','Fira Code',Consolas,monospace}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;background:var(--bg);color:var(--text);font-family:var(--font-sans);font-size:13px;line-height:1.5}
.layout{display:grid;grid-template-columns:180px 1fr;height:100vh;overflow:hidden}
.sidebar{background:var(--surface);border-right:3px solid var(--accent);display:flex;flex-direction:column;overflow-y:auto}
.nav-brand{padding:20px 14px 14px;font-size:14px;font-weight:700;font-family:var(--font-mono);letter-spacing:.15em;text-transform:uppercase;color:var(--accent);border-bottom:2px solid #333;text-shadow:0 0 10px rgba(255,171,64,.3)}
.nav-links{list-style:none;padding:4px 0}
.nav-links a{display:block;padding:10px 14px;color:var(--text-muted);font-size:12px;font-weight:700;font-family:var(--font-mono);letter-spacing:.08em;text-transform:uppercase;border-left:4px solid transparent;text-decoration:none;transition:all .08s}
.nav-links a:hover,.nav-links a.active{background:var(--accent-dim);color:var(--accent);border-left-color:var(--accent)}
.content{overflow-y:auto;padding:28px 32px;background:var(--bg)}
h1{font-size:18px;font-weight:700;font-family:var(--font-mono);letter-spacing:.04em;margin-bottom:1rem}
h2{font-size:14px;font-weight:700;font-family:var(--font-mono);letter-spacing:.04em}
.card{background:var(--surface);border:var(--border);box-shadow:var(--shadow);padding:1rem;margin-bottom:1rem}
.stat-row{display:flex;gap:1rem;margin-bottom:1rem}
.stat-card{text-align:center;min-width:100px;padding:1rem}
.stat-value{font-size:2rem;font-weight:700;font-family:var(--font-mono);color:var(--accent)}
.badge{display:inline-block;padding:1px 6px;font-size:11px;font-weight:700;font-family:var(--font-mono);text-transform:uppercase;letter-spacing:.04em;border:1px solid #555;color:var(--text-muted)}
.badge-green{border-color:var(--success);color:var(--success);background:rgba(105,240,174,.08)}
.badge-red{border-color:var(--danger);color:var(--danger);background:rgba(255,82,82,.08)}
.badge-accent{border-color:var(--accent);color:var(--accent);background:var(--accent-dim)}
table{width:100%;border-collapse:collapse}
th{text-align:left;font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;padding:.5rem .75rem;border-bottom:var(--border);font-family:var(--font-mono)}
td{padding:.6rem .75rem;border-bottom:1px solid #333;font-size:13px}
tr:hover td{background:var(--surface-hover)}
code{font-family:var(--font-mono);font-size:.9em;background:#1a1a1a;padding:.1em .3em;border:1px solid #333;color:var(--accent)}
.machine-badge{display:inline-block;padding:1px 6px;font-size:11px;font-family:var(--font-mono);border:1px solid #555;color:var(--text-muted);margin:1px}
</style>
</head>
<body>
<div class="layout">
  <nav class="sidebar">
    <div class="nav-brand">x-sync</div>
    <ul class="nav-links">
      <li><a href="/" class="active">Sync</a></li>
    </ul>
  </nav>
  <main class="content">
    <div id="app"><h1>Sync</h1><p style="color:var(--text-muted)">Loading...</p></div>
  </main>
</div>
<script>
async function load(){
  const app=document.getElementById('app');
  try{
    const h=await fetch('/dashboard/health').then(r=>r.json());
    const projects=await fetch('/dashboard/projects').then(r=>r.json());
    const machines=new Set();
    projects.forEach(p=>(p.machines||[]).forEach(m=>machines.add(m)));

    const ok=h.status==='ok';
    let html='<h1>Sync <span class="badge '+(ok?'badge-green':'badge-red')+'">'+(ok?'ONLINE':'OFFLINE')+'</span> <span style="color:var(--text-muted);font-size:12px;font-weight:400">v'+h.version+'</span></h1>';

    html+='<div class="stat-row">';
    html+='<div class="card stat-card"><div class="stat-value">'+h.projects+'</div><div style="color:var(--text-muted)">Projects</div></div>';
    html+='<div class="card stat-card"><div class="stat-value">'+h.files+'</div><div style="color:var(--text-muted)">Files</div></div>';
    html+='<div class="card stat-card"><div class="stat-value">'+machines.size+'</div><div style="color:var(--text-muted)">Machines</div></div>';
    html+='</div>';

    if(projects.length){
      html+='<div class="card"><h2 style="margin:0 0 .75rem">Projects <span class="badge">'+projects.length+'</span></h2>';
      html+='<table><thead><tr><th>Project</th><th>Machines</th><th>Files</th><th>Last Push</th></tr></thead><tbody>';
      for(const p of projects){
        const ms=(p.machines||[]).map(m=>'<span class="machine-badge">'+m+'</span>').join(' ');
        html+='<tr><td><strong>'+p.project_id+'</strong></td><td>'+ms+'</td><td>'+p.file_count+'</td><td style="color:var(--text-muted)">'+(p.last_push?new Date(p.last_push).toLocaleString():'—')+'</td></tr>';
      }
      html+='</tbody></table></div>';
    }

    if(machines.size){
      html+='<div class="card"><h2 style="margin:0 0 .75rem">Machines <span class="badge">'+machines.size+'</span></h2>';
      html+='<div style="display:flex;flex-wrap:wrap;gap:.5rem">';
      for(const m of machines){
        const cnt=projects.filter(p=>(p.machines||[]).includes(m)).length;
        html+='<div class="card" style="padding:.75rem;min-width:180px"><div style="font-weight:700;font-family:var(--font-mono);font-size:12px">'+m+'</div><div style="color:var(--text-muted);margin-top:.25rem">'+cnt+' project'+(cnt!==1?'s':'')+'</div></div>';
      }
      html+='</div></div>';
    }

    if(!projects.length) html+='<div class="card" style="text-align:center;padding:2rem;color:var(--text-muted)">No projects synced yet</div>';

    app.innerHTML=html;
  }catch(e){
    app.innerHTML='<h1>Sync <span class="badge badge-red">ERROR</span></h1><div class="card" style="color:var(--text-muted)">Failed to connect to server.</div>';
  }
}
load();
setInterval(load,10000);
</script>
</body>
</html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

// --- Router ---
function router(req) {
  const url = new URL(req.url);
  const { pathname } = url;

  if (req.method === "GET"  && pathname === "/") return handleDashboardUI();
  if (req.method === "POST" && pathname === "/sync/push") return handlePush(req);
  if (req.method === "GET"  && pathname === "/sync/pull") return handlePull(req);
  if (req.method === "GET"  && pathname === "/dashboard/projects") return handleDashboardProjects();
  if (req.method === "GET"  && pathname === "/dashboard/health") return handleDashboardHealth();

  return json({ error: "Not found" }, 404);
}

// --- Start ---
Bun.serve({ port: PORT, fetch: router });
console.error(`[x-sync] listening on http://localhost:${PORT}  db=${DB_PATH}`);
