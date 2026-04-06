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

// --- Dashboard HTML ---
function handleDashboardUI() {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>x-sync</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0a; color: #e0e0e0; padding: 2rem; }
  h1 { font-size: 1.5rem; font-weight: 600; margin-bottom: .5rem; }
  h1 span { color: #888; font-weight: 400; font-size: .9rem; margin-left: .5rem; }
  .status { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: .8rem; font-weight: 600; }
  .status.ok { background: #1a3a1a; color: #4ade80; }
  .status.err { background: #3a1a1a; color: #f87171; }
  .stats { display: flex; gap: 1.5rem; margin: 1.5rem 0; }
  .stat { background: #151515; border: 1px solid #252525; border-radius: 8px; padding: 1rem 1.5rem; min-width: 120px; }
  .stat .num { font-size: 2rem; font-weight: 700; color: #fff; }
  .stat .label { font-size: .8rem; color: #888; margin-top: .25rem; }
  table { width: 100%; border-collapse: collapse; margin-top: 1.5rem; }
  th { text-align: left; font-size: .75rem; color: #888; text-transform: uppercase; letter-spacing: .05em; padding: .5rem .75rem; border-bottom: 1px solid #252525; }
  td { padding: .75rem; border-bottom: 1px solid #1a1a1a; font-size: .9rem; }
  tr:hover td { background: #151515; }
  .machines { display: flex; gap: .25rem; flex-wrap: wrap; }
  .machine { background: #1a2a3a; color: #60a5fa; padding: 1px 6px; border-radius: 3px; font-size: .75rem; }
  .time { color: #888; font-size: .85rem; }
  .footer { margin-top: 2rem; font-size: .75rem; color: #555; }
  .refresh { color: #60a5fa; cursor: pointer; background: none; border: none; font-size: .8rem; margin-left: 1rem; }
  .refresh:hover { text-decoration: underline; }
</style>
</head>
<body>
<h1>x-sync <span id="version"></span></h1>
<div style="margin-top:.5rem"><span class="status" id="health"></span> <button class="refresh" onclick="load()">refresh</button></div>
<div class="stats">
  <div class="stat"><div class="num" id="s-projects">-</div><div class="label">Projects</div></div>
  <div class="stat"><div class="num" id="s-files">-</div><div class="label">Files</div></div>
  <div class="stat"><div class="num" id="s-machines">-</div><div class="label">Machines</div></div>
</div>
<table>
  <thead><tr><th>Project</th><th>Machines</th><th>Files</th><th>Last Push</th></tr></thead>
  <tbody id="tbody"></tbody>
</table>
<div class="footer">x-sync server</div>
<script>
async function load() {
  try {
    const h = await fetch('/dashboard/health').then(r=>r.json());
    document.getElementById('health').textContent = h.status;
    document.getElementById('health').className = 'status ' + (h.status==='ok'?'ok':'err');
    document.getElementById('version').textContent = 'v'+h.version;
    document.getElementById('s-projects').textContent = h.projects;
    document.getElementById('s-files').textContent = h.files;

    const projects = await fetch('/dashboard/projects').then(r=>r.json());
    let totalMachines = new Set();
    projects.forEach(p => p.machines.forEach(m => totalMachines.add(m)));
    document.getElementById('s-machines').textContent = totalMachines.size;

    const tbody = document.getElementById('tbody');
    tbody.innerHTML = projects.map(p => '<tr>'
      + '<td><strong>'+p.project_id+'</strong></td>'
      + '<td><div class="machines">'+p.machines.map(m=>'<span class="machine">'+m+'</span>').join('')+'</div></td>'
      + '<td>'+p.file_count+'</td>'
      + '<td class="time">'+(p.last_push ? new Date(p.last_push).toLocaleString() : '-')+'</td>'
      + '</tr>').join('');
    if (!projects.length) tbody.innerHTML = '<tr><td colspan="4" style="color:#555;text-align:center;padding:2rem">No projects synced yet</td></tr>';
  } catch(e) {
    document.getElementById('health').textContent = 'error';
    document.getElementById('health').className = 'status err';
  }
}
load();
setInterval(load, 10000);
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
