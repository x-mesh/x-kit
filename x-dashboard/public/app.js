// Workspace state
let currentWsId = null;
let multiRootMode = false;

// Poll sequence counter — incremented on every route change to discard stale responses
let _pollSequence = 0;

// Smart DOM update: replaces #app innerHTML while preserving scroll and focus
function updateApp(html) {
  const app = document.getElementById('app');
  const content = document.querySelector('.content');
  const scrollTop = content ? content.scrollTop : 0;

  const focused = document.activeElement;
  const focusId = focused?.id;
  const focusValue = focused?.value;
  const focusSelStart = focused?.selectionStart;

  app.innerHTML = html;

  if (content) content.scrollTop = scrollTop;

  if (focusId) {
    const el = document.getElementById(focusId);
    if (el) {
      el.focus();
      if (focusValue !== undefined) el.value = focusValue;
      if (focusSelStart !== undefined) el.selectionStart = el.selectionEnd = focusSelStart;
    }
  }
}

function apiUrl(path) {
  const p = path.startsWith('/') ? path : '/' + path;
  if (multiRootMode && currentWsId) {
    return `/api/ws/${encodeURIComponent(currentWsId)}${p}`;
  }
  return `/api${p}`;
}

async function initWorkspaces() {
  const res = await fetchJSON('/api/workspaces');
  if (res.error || !Array.isArray(res)) return;

  const workspaces = res;
  if (workspaces.length <= 1) {
    currentWsId = workspaces[0]?.id ?? null;
    multiRootMode = false;
    return;
  }

  multiRootMode = true;
  const savedWs = localStorage.getItem('xm-workspace');
  const savedValid = savedWs && workspaces.find(w => w.id === savedWs);
  currentWsId = savedValid ? savedWs : workspaces[0].id;
  localStorage.setItem('xm-workspace', currentWsId);

  const currentWs = workspaces.find(w => w.id === currentWsId) || workspaces[0];

  const nav = document.getElementById('nav');
  if (!nav) return;
  const selector = document.createElement('div');
  selector.id = 'ws-selector';
  selector.innerHTML = `
    <div class="ws-selector-label">Workspace</div>
    <select id="ws-select" aria-label="Select workspace">
      ${workspaces.map(w => `<option value="${w.id}"${w.id === currentWsId ? ' selected' : ''}>${w.name} (${w.stats?.projects ?? 0} builds)</option>`).join('')}
    </select>
    <div id="ws-current-name" class="ws-current-name">${currentWs.name}</div>
  `;

  const navLinks = nav.querySelector('.nav-links');
  nav.insertBefore(selector, navLinks);

  document.getElementById('ws-select').addEventListener('change', (e) => {
    currentWsId = e.target.value;
    localStorage.setItem('xm-workspace', currentWsId);
    const selected = workspaces.find(w => w.id === currentWsId);
    const nameEl = document.getElementById('ws-current-name');
    if (nameEl && selected) nameEl.textContent = selected.name;
    route();
  });
}

// Utility functions

function timeAgo(isoString) {
  if (!isoString) return '—';
  const diff = Date.now() - new Date(isoString).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  if (w < 4) return `${w}w ago`;
  const mo = Math.floor(d / 30);
  return `${mo}mo ago`;
}

function phaseBadge(phase) {
  const map = {
    '01-research': { cls: 'badge-blue',   label: 'Research' },
    '02-plan':     { cls: 'badge-indigo', label: 'Plan'     },
    '03-execute':  { cls: 'badge-amber',  label: 'Execute'  },
    '04-verify':   { cls: 'badge-purple', label: 'Verify'   },
    '05-close':    { cls: 'badge-green',  label: 'Close'    },
  };
  const entry = map[phase];
  if (entry) return `<span class="badge ${entry.cls}">${entry.label}</span>`;
  const label = phase || 'Unknown';
  return `<span class="badge badge-gray">${label}</span>`;
}

function nullSafe(value, fallback = '—') {
  return (value === null || value === undefined || value === '') ? fallback : value;
}

async function fetchJSON(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return { error: true, message: `HTTP ${res.status}` };
    try {
      return await res.json();
    } catch (parseErr) {
      return { error: true, message: `Parse error: ${parseErr.message}` };
    }
  } catch (err) {
    console.error('fetchJSON error:', url, err);
    return { error: true, message: err.message };
  }
}

function statusBadge(status) {
  const map = {
    completed: { cls: 'badge-green',  label: '✅ Completed' },
    pending:   { cls: 'badge-gray',   label: 'Pending'      },
    running:   { cls: 'badge-amber',  label: 'Running'      },
    failed:    { cls: 'badge-red',    label: '❌ Failed'    },
  };
  const entry = map[status];
  if (entry) return `<span class="badge ${entry.cls}">${entry.label}</span>`;
  return `<span class="badge badge-gray">${status || 'Unknown'}</span>`;
}

function sizeBadge(size) {
  const map = {
    small:  { cls: 'badge-blue',  label: 'small'  },
    medium: { cls: 'badge-amber', label: 'medium' },
    large:  { cls: 'badge-red',   label: 'large'  },
  };
  const entry = map[size];
  if (entry) return `<span class="badge ${entry.cls}">${entry.label}</span>`;
  return `<span class="badge badge-gray">${size || '—'}</span>`;
}

function renderMarkdown(text) {
  if (!text) return '';
  if (typeof marked !== 'undefined' && marked.parse) {
    return marked.parse(text);
  }
  // Fallback: escape HTML and preserve line breaks
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

function renderJsonSmart(obj) {
  if (!obj || typeof obj !== 'object') return `<span class="text-muted">${nullSafe(obj)}</span>`;

  // Array of objects → table
  if (Array.isArray(obj) && obj.length > 0 && typeof obj[0] === 'object') {
    const keys = [...new Set(obj.flatMap(o => Object.keys(o)))];
    const thead = keys.map(k => `<th>${k}</th>`).join('');
    const rows = obj.map(item => `<tr>${keys.map(k => {
      const v = item[k];
      if (v === null || v === undefined) return '<td class="text-muted">—</td>';
      if (typeof v === 'boolean') return `<td>${v ? '✅' : '—'}</td>`;
      if (typeof v === 'object') return `<td><code style="font-size:0.75rem">${JSON.stringify(v)}</code></td>`;
      return `<td>${v}</td>`;
    }).join('')}</tr>`).join('');
    return `<div class="table-wrapper" style="margin-top:0.25rem"><table class="table"><thead><tr>${thead}</tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  // Simple array → bulleted list
  if (Array.isArray(obj)) {
    return `<ul style="margin:0.25rem 0 0 1.25rem">${obj.map(i => `<li>${i}</li>`).join('')}</ul>`;
  }

  // Flat object → key-value table
  const entries = Object.entries(obj);
  if (entries.length > 0 && entries.every(([, v]) => v === null || typeof v !== 'object')) {
    const rows = entries.map(([k, v]) => {
      let display = nullSafe(v);
      if (typeof v === 'boolean') display = v ? '<span class="badge badge-green">true</span>' : '<span class="badge badge-gray">false</span>';
      else if (k.includes('passed') || k.includes('success')) display = v ? '<span class="badge badge-green">✅ yes</span>' : '<span class="badge badge-red">❌ no</span>';
      else if (k.includes('duration') || k.includes('_ms')) display = typeof v === 'number' ? `${(v / 1000).toFixed(1)}s` : display;
      else if (k.includes('_at') && typeof v === 'string') display = `${timeAgo(v)} <span class="text-muted" style="font-size:0.75rem">(${v})</span>`;
      return `<tr><td style="font-weight:600;white-space:nowrap;width:1%;color:var(--text-muted)">${k}</td><td>${display}</td></tr>`;
    }).join('');
    return `<table class="table" style="margin-top:0.25rem"><tbody>${rows}</tbody></table>`;
  }

  // Nested object — recurse with sections
  let html = '';
  for (const [k, v] of entries) {
    if (typeof v === 'object' && v !== null) {
      html += `<div style="margin-top:0.5rem"><strong style="font-size:0.8rem;color:var(--text-muted)">${k}</strong>${renderJsonSmart(v)}</div>`;
    } else {
      let display = nullSafe(v);
      if (typeof v === 'boolean') display = v ? '✅' : '—';
      html += `<div style="margin-top:0.25rem"><span class="text-muted" style="font-size:0.8rem">${k}:</span> ${display}</div>`;
    }
  }
  return `<div style="margin-top:0.25rem">${html}</div>`;
}

function exportMarkdown(filename, content) {
  const blob = new Blob([content], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function startPolling(fetchFn, intervalMs = 3000) {
  fetchFn();
  const id = setInterval(fetchFn, intervalMs);
  return () => clearInterval(id);
}

function getHashParams() {
  const hash = window.location.hash;
  const qIdx = hash.indexOf('?');
  if (qIdx === -1) return {};
  return Object.fromEntries(new URLSearchParams(hash.slice(qIdx + 1)));
}

// View render functions

function verdictBadge(verdict) {
  if (!verdict) return `<span class="badge badge-gray">—</span>`;
  const map = {
    PROCEED: 'badge-green',
    RETHINK: 'badge-amber',
    KILL:    'badge-red',
  };
  const cls = map[verdict] ?? 'badge-gray';
  return `<span class="badge ${cls}">${verdict}</span>`;
}

async function renderAggregateHome() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="view-header"><h1>Workspaces</h1></div>
    <div class="card"><p class="text-muted">Loading workspaces...</p></div>
  `;

  const workspaces = await fetchJSON('/api/workspaces');
  if (!Array.isArray(workspaces) || workspaces.error) {
    app.innerHTML = `
      <div class="view-header"><h1>Workspaces</h1></div>
      <div class="card"><p class="text-muted">Error loading workspaces.</p></div>
    `;
    return;
  }

  let totalProjects = 0;
  let totalProbes = 0;
  let totalSolvers = 0;
  for (const w of workspaces) {
    totalProjects += w.stats?.projects ?? 0;
    totalProbes   += w.stats?.probes   ?? 0;
    totalSolvers  += w.stats?.solvers  ?? 0;
  }

  const wsColors = ['#FFAB40', '#40c4ff', '#b388ff', '#69f0ae', '#ff5252', '#80cbc4'];
  const cards = workspaces.map((w, idx) => {
    const color = wsColors[idx % wsColors.length];
    const lastActivity = w.stats?.last_updated_at ?? w.updated_at ?? null;
    return `
    <div class="card ws-card" data-wsid="${w.id}" style="cursor:pointer;flex:1 1 200px;min-width:180px;border-left:4px solid ${color}">
      <div style="font-size:1.1em;font-weight:700;margin-bottom:0.25rem;color:${color}">${w.name}</div>
      <div class="text-muted" style="font-size:0.75em;font-family:var(--font-mono);margin-bottom:0.5rem;word-break:break-all">${w.path ?? ''}</div>
      ${lastActivity ? `<div class="text-muted" style="font-size:0.75em;margin-bottom:0.5rem">Last activity: ${timeAgo(lastActivity)}</div>` : ''}
      <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
        <span class="badge badge-blue">${w.stats?.projects ?? 0} builds</span>
        <span class="badge badge-indigo">${w.stats?.probes ?? 0} probes</span>
        <span class="badge badge-amber">${w.stats?.solvers ?? 0} solvers</span>
        ${w.stats?.cost > 0 ? `<span class="badge badge-green">$${w.stats.cost.toFixed(2)}</span>` : ''}
      </div>
    </div>
  `;
  }).join('');

  app.innerHTML = `
    <div class="view-header"><h1>Workspaces</h1></div>
    <div style="display:flex;flex-wrap:wrap;gap:1rem;margin-bottom:1rem">${cards}</div>
    <div class="stat-bar">
      <div class="card stat-card" aria-label="${totalProjects} total builds">
        <div class="stat-value">${totalProjects}</div>
        <div class="stat-label">Total Builds</div>
      </div>
      <div class="card stat-card" aria-label="${totalProbes} total probes">
        <div class="stat-value">${totalProbes}</div>
        <div class="stat-label">Total Probes</div>
      </div>
      <div class="card stat-card" aria-label="${totalSolvers} total solvers">
        <div class="stat-value">${totalSolvers}</div>
        <div class="stat-label">Total Solvers</div>
      </div>
    </div>
  `;

  app.querySelectorAll('.ws-card[data-wsid]').forEach(card => {
    card.addEventListener('click', () => {
      currentWsId = card.dataset.wsid;
      localStorage.setItem('xm-workspace', currentWsId);
      const sel = document.getElementById('ws-select');
      if (sel) sel.value = currentWsId;
      window.location.hash = '#/projects';
    });
  });
}

async function renderHome() {
  if (multiRootMode) return renderAggregateHome();

  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="view-header"><h1>Home</h1></div>
    <div class="card"><p class="text-muted">Loading...</p></div>
  `;

  const stopPolling = startPolling(async () => {
    const seq = _pollSequence;
    const [projectsRes, solverRes, probeRes, healthRes] = await Promise.all([
      fetchJSON(apiUrl('/projects')),
      fetchJSON(apiUrl('/solver')),
      fetchJSON(apiUrl('/probe/latest')),
      fetchJSON('/api/health'),
    ]);
    if (seq !== _pollSequence) return;

    const projects = Array.isArray(projectsRes.data) ? projectsRes.data : [];
    const solvers  = Array.isArray(solverRes.data)   ? solverRes.data   : [];

    // Active tasks: sum tasks with status != completed across all projects
    // We use task counts from manifest if available; otherwise 0
    let activeTasks = 0;
    for (const p of projects) {
      const tasks = Array.isArray(p.tasks) ? p.tasks : [];
      activeTasks += tasks.filter(t => t.status !== 'completed').length;
    }

    const probe = (!probeRes.error) ? probeRes : null;
    const evidence = probe?.evidence_summary ?? {};

    // Recent projects: last 5 by updated_at
    const recent = [...projects]
      .sort((a, b) => {
        const da = a.updated_at ?? a.created_at ?? '';
        const db = b.updated_at ?? b.created_at ?? '';
        return db < da ? -1 : db > da ? 1 : 0;
      })
      .slice(0, 5);

    const projectName = healthRes?.project ?? 'unknown';
    const cwdPath = healthRes?.cwd ?? '';

    updateApp(`
      <div class="view-header">
        <h1>${projectName}</h1>
        <p style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted)">${cwdPath}/.xm/</p>
      </div>

      <div class="stat-bar">
        <div class="card stat-card">
          <div class="stat-value">${projects.length}</div>
          <div class="stat-label">Builds</div>
        </div>
        <div class="card stat-card">
          <div class="stat-value">${activeTasks}</div>
          <div class="stat-label">Active Tasks</div>
        </div>
        <div class="card stat-card">
          <div class="stat-value">${solvers.length}</div>
          <div class="stat-label">Solver Problems</div>
        </div>
        <div class="card stat-card">
          <div class="stat-value">${probe ? verdictBadge(probe.verdict) : '<span class="text-muted">—</span>'}</div>
          <div class="stat-label">${probe ? nullSafe(probe.idea, 'Latest Probe') : 'No Probe'}</div>
        </div>
      </div>

      ${probe ? `
      <div class="card" style="margin-top:1rem">
        <div class="card-header" style="display:flex;align-items:center;gap:0.5rem">
          ${verdictBadge(probe.verdict)}
          <strong>${nullSafe(probe.idea, 'Latest Probe Verdict')}</strong>
        </div>
        <p style="margin:0.5rem 0 0">${nullSafe(probe.recommendation, '')}</p>
        ${Object.keys(evidence).length > 0 ? `
        <div style="margin-top:0.75rem;display:flex;gap:0.5rem;flex-wrap:wrap">
          ${evidence.validated    != null ? `<span class="badge badge-green">validated: ${evidence.validated}</span>`       : ''}
          ${evidence.data_backed  != null ? `<span class="badge badge-blue">data-backed: ${evidence.data_backed}</span>`   : ''}
          ${evidence.heuristic    != null ? `<span class="badge badge-amber">heuristic: ${evidence.heuristic}</span>`      : ''}
          ${evidence.assumption   != null ? `<span class="badge badge-gray">assumption: ${evidence.assumption}</span>`     : ''}
        </div>` : ''}
        <div style="margin-top:0.75rem">
          <a href="#/probes">View all probes →</a>
        </div>
      </div>` : `
      <div class="card" style="margin-top:1rem">
        <p class="text-muted">No probe verdict available. Run <code>x-probe</code> to generate one.</p>
      </div>`}

      <div class="card" style="margin-top:1rem">
        <div class="card-header"><strong>Recent Builds</strong></div>
        ${recent.length === 0 ? `<p class="text-muted">No projects found.</p>` : `
        <ul style="list-style:none;padding:0;margin:0">
          ${recent.map(p => `
          <li style="padding:0.5rem 0;border-bottom:1px solid var(--border, #e5e7eb);display:flex;align-items:center;justify-content:space-between">
            <a href="#/projects/${p.name}">${nullSafe(p.display_name || p.name)}</a>
            <span style="display:flex;align-items:center;gap:0.5rem">
              ${phaseBadge(p.current_phase)}
              <span class="text-muted" style="font-size:0.8em">${timeAgo(p.updated_at ?? p.created_at)}</span>
            </span>
          </li>`).join('')}
        </ul>`}
      </div>
    `);

    // Session metrics bar chart (async, non-blocking)
    fetchJSON(apiUrl('/metrics/sessions?limit=50')).then(sessionsRes => {
      const sessions = Array.isArray(sessionsRes.data) ? sessionsRes.data : [];
      if (sessions.length === 0) return;

      // Group by date
      const counts = {};
      for (const s of sessions) {
        const ts = s.started_at ?? s.timestamp ?? s.created_at ?? '';
        if (!ts) continue;
        const date = ts.slice(0, 10); // YYYY-MM-DD
        counts[date] = (counts[date] || 0) + 1;
      }
      const dates = Object.keys(counts).sort();
      if (dates.length === 0) return;

      const max = Math.max(...Object.values(counts));
      const bars = dates.map(d => {
        const pct = max > 0 ? Math.round((counts[d] / max) * 100) : 0;
        return `<div style="width:8px;background:var(--accent);height:${pct}%;min-height:2px;flex-shrink:0" title="${d}: ${counts[d]}"></div>`;
      }).join('');

      const metricsCard = document.createElement('div');
      metricsCard.className = 'card';
      metricsCard.style.marginTop = '1rem';
      metricsCard.innerHTML = `
        <div class="card-header" style="margin-bottom:0.75rem">
          <strong style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.1em">Session Metrics</strong>
          <span class="text-muted" style="font-size:11px;margin-left:0.5rem">${sessions.length} sessions</span>
        </div>
        <div style="display:flex;align-items:flex-end;gap:2px;height:60px;overflow:hidden">
          ${bars}
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:4px">
          <span class="text-muted" style="font-size:10px">${dates[0]}</span>
          <span class="text-muted" style="font-size:10px">${dates[dates.length - 1]}</span>
        </div>
      `;
      app.appendChild(metricsCard);
    });

    // Cost widget (async, non-blocking)
    fetchJSON(apiUrl('/costs')).then(costsRes => {
      if (costsRes.error) return;
      const totalCost = costsRes.totalCost ?? 0;
      const totalTokens = (costsRes.totalInputTokens ?? 0) + (costsRes.totalOutputTokens ?? 0);
      const byModel = costsRes.byModel ?? {};

      const costCard = document.createElement('div');
      costCard.className = 'card';
      costCard.style.marginTop = '1rem';

      if (totalCost === 0) {
        costCard.innerHTML = `
          <div class="card-header" style="margin-bottom:0.5rem">
            <strong style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.1em">Cost</strong>
          </div>
          <p class="text-muted" style="font-size:12px">No cost data. Run x-trace to track tokens.</p>
        `;
      } else {
        const modelKeys = Object.keys(byModel);
        const modelTotal = modelKeys.reduce((sum, k) => sum + (byModel[k].cost ?? 0), 0);

        const segmentColors = {
          haiku:  '#40c4ff',
          sonnet: '#FFAB40',
          opus:   '#b388ff',
        };

        const segments = modelKeys.map(k => {
          const pct = modelTotal > 0 ? ((byModel[k].cost ?? 0) / modelTotal) * 100 : 0;
          if (pct < 1) return '';
          const color = Object.keys(segmentColors).find(c => k.toLowerCase().includes(c));
          const bg = color ? segmentColors[color] : '#B0BEC5';
          const label = pct > 8 ? k.replace('claude-', '').split('-')[0] : '';
          return `<div class="cost-bar-segment" style="width:${pct}%;background:${bg};color:#000">${label}</div>`;
        }).join('');

        const modelBreakdown = modelKeys.map(k => {
          const c = byModel[k];
          const pct = modelTotal > 0 ? Math.round(((c.cost ?? 0) / modelTotal) * 100) : 0;
          const color = Object.keys(segmentColors).find(mc => k.toLowerCase().includes(mc));
          const fg = color ? segmentColors[color] : '#B0BEC5';
          return `<span style="font-size:11px;color:${fg};font-family:var(--font-mono)">${k.split('-').pop()}: $${(c.cost ?? 0).toFixed(4)} (${pct}%)</span>`;
        }).join(' &nbsp;·&nbsp; ');

        costCard.innerHTML = `
          <div class="card-header" style="margin-bottom:0.75rem;display:flex;align-items:center;gap:0.75rem">
            <strong style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.1em">Cost</strong>
            <span style="font-size:18px;font-weight:700;font-family:var(--font-mono);color:var(--accent)">$${totalCost.toFixed(4)}</span>
            ${totalTokens > 0 ? `<span class="text-muted" style="font-size:11px">/ ${totalTokens.toLocaleString()} tokens</span>` : ''}
          </div>
          ${segments ? `<div class="cost-bar">${segments}</div>` : ''}
          ${modelBreakdown ? `<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:4px">${modelBreakdown}</div>` : ''}
        `;
      }

      app.appendChild(costCard);
    });
  }, 3000);

  // Stop polling when navigating away
  window.addEventListener('hashchange', stopPolling, { once: true });
}

function renderProjectsList() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="view-header"><h1>Builds</h1><p>.xm/build/projects/</p></div>
    <div class="card"><p class="text-muted">Loading projects...</p></div>
  `;

  const stopPolling = startPolling(async () => {
    const seq = _pollSequence;
    const result = await fetchJSON(apiUrl('/projects'));
    if (seq !== _pollSequence) return;
    if (result.error) {
      updateApp(`
        <div class="view-header"><h1>Builds</h1><p>.xm/build/projects/</p></div>
        <div class="card"><p class="text-muted">Error: ${result.message}</p></div>
      `);
      return;
    }

    const projects = result.data || [];
    if (projects.length === 0) {
      updateApp(`
        <div class="view-header"><h1>Builds</h1><p>.xm/build/projects/</p></div>
        <div class="card"><p class="text-muted">No projects found.</p></div>
      `);
      return;
    }

    const rows = projects.map((p) => `
      <tr>
        <td>
          <a href="#/projects/${p.name}">${nullSafe(p.display_name || p.name)}</a>
          ${p.goal ? `<div class="text-muted" style="font-size:11px;margin-top:2px">${p.goal}</div>` : ''}
        </td>
        <td>${phaseBadge(p.current_phase)}</td>
        <td>${timeAgo(p.created_at)}</td>
        <td>${timeAgo(p.updated_at)}</td>
      </tr>
    `).join('');

    updateApp(`
      <div class="view-header"><h1>Builds</h1><p>.xm/build/projects/</p></div>
      <div class="card" style="padding:0">
        <table class="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Phase</th>
              <th>Created</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `);
  });

  window.addEventListener('hashchange', stopPolling, { once: true });
}

const PHASES = ['01-research', '02-plan', '03-execute', '04-verify', '05-close'];
const PHASE_LABELS = {
  '01-research': 'Research',
  '02-plan': 'Plan',
  '03-execute': 'Execute',
  '04-verify': 'Verify',
  '05-close': 'Close',
};

function renderPhaseBar(currentPhase) {
  const parts = PHASES.map((p, i) => {
    const active = p === currentPhase;
    const dot = `<div class="phase-dot${active ? ' phase-dot-active' : ''}" title="${PHASE_LABELS[p] || p}">${p.slice(0, 2)}</div>`;
    return i < PHASES.length - 1 ? dot + '<div class="phase-connector"></div>' : dot;
  });
  return `<div class="phase-bar">${parts.join('')}</div>`;
}

const _activeTabState = {};
function switchTab(tabId, idx, btn) {
  _activeTabState[tabId] = idx;
  const card = btn.closest('.card');
  card.querySelectorAll('.tab-btn').forEach((b) => {
    b.classList.remove('tab-active');
    b.setAttribute('aria-selected', 'false');
  });
  btn.classList.add('tab-active');
  btn.setAttribute('aria-selected', 'true');
  card.querySelectorAll('.tab-panel').forEach((p, i) => {
    p.style.display = i === idx ? '' : 'none';
    p.setAttribute('role', 'tabpanel');
  });
}
function restoreTab(tabId) {
  const idx = _activeTabState[tabId];
  if (idx == null) return;
  const card = document.getElementById(tabId);
  if (!card) return;
  const btns = card.querySelectorAll('.tab-btn');
  const panels = card.querySelectorAll('.tab-panel');
  btns.forEach((b, i) => b.classList.toggle('tab-active', i === idx));
  panels.forEach((p, i) => { p.style.display = i === idx ? '' : 'none'; });
}

function renderProjectDetail(slug) {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="view-header"><h1>Project: <code>${slug}</code></h1></div>
    <div class="card"><p class="text-muted">Loading project...</p></div>
  `;

  const stopPolling = startPolling(async () => {
    const seq = _pollSequence;
    const [projectResult, tasksResult] = await Promise.all([
      fetchJSON(apiUrl(`/projects/${slug}`)),
      fetchJSON(apiUrl(`/projects/${slug}/tasks`)),
    ]);
    if (seq !== _pollSequence) return;

    if (projectResult.error) {
      updateApp(`
        <div class="view-header"><h1>Project: <code>${slug}</code></h1></div>
        <div class="card"><p class="text-muted">Error: ${projectResult.message}</p></div>
      `);
      return;
    }

    const { manifest, circuitBreaker, handoff, phases: projectPhases, context } = projectResult;
    const name = nullSafe(manifest?.name, slug);
    const phase = nullSafe(manifest?.current_phase, '');

    // Extract goal from context docs
    const contextDocs = Array.isArray(context) ? context : [];
    let goal = '';
    const ctxDoc = contextDocs.find(d => d.name === 'CONTEXT.md' || d.name === 'brief.md');
    if (ctxDoc) {
      const goalMatch = ctxDoc.content.match(/^##\s*Goal\s*\n+(.+)/m);
      if (goalMatch) goal = goalMatch[1].trim();
    }

    // Header
    let html = `
      <div class="view-header">
        <h1>${name}</h1>
        ${goal ? `<p style="margin:4px 0 0;font-size:13px">${goal}</p>` : ''}
        <div class="view-header-meta">
          ${phaseBadge(phase)}
          <span class="text-muted">Created: ${timeAgo(manifest?.created_at)}</span>
          <span class="text-muted">Updated: ${timeAgo(manifest?.updated_at)}</span>
          <button class="btn-export" id="btn-export-project" style="margin-left:auto;font-size:0.75rem;padding:0.25rem 0.6rem;background:transparent;border:1px solid var(--border,#e5e7eb);border-radius:4px;cursor:pointer;color:var(--text-muted)">↓ EXPORT</button>
        </div>
      </div>
    `;

    // Phase bar
    html += `<div class="card">${renderPhaseBar(phase)}</div>`;

    // Tasks table
    const tasks = Array.isArray(tasksResult) ? tasksResult
      : Array.isArray(tasksResult?.tasks) ? tasksResult.tasks
      : Array.isArray(tasksResult?.data) ? tasksResult.data
      : [];
    const completedCount = tasks.filter((t) => t.status === 'completed').length;

    const taskRows = tasks.map((t) => {
      const deps = Array.isArray(t.dependencies) ? t.dependencies.join(', ') : nullSafe(t.dependencies);
      return `
        <tr>
          <td><code>${nullSafe(t.id)}</code></td>
          <td>${nullSafe(t.name)}</td>
          <td>${statusBadge(t.status)}</td>
          <td>${sizeBadge(t.size)}</td>
          <td>${deps || '—'}</td>
          <td>${nullSafe(t.done_criteria)}</td>
        </tr>
      `;
    }).join('');

    html += `
      <div class="card" style="padding:0">
        <div style="padding:1rem 1.25rem 0"><h2 style="margin:0">Tasks</h2></div>
        <table class="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Status</th>
              <th>Size</th>
              <th>Dependencies</th>
              <th>Done Criteria</th>
            </tr>
          </thead>
          <tbody>${taskRows || '<tr><td colspan="6" class="text-muted">No tasks found.</td></tr>'}</tbody>
          <tfoot>
            <tr><td colspan="6" class="text-muted" style="padding:.75rem 1rem">${completedCount}/${tasks.length} tasks completed</td></tr>
          </tfoot>
        </table>
      </div>
    `;

    // Context docs (tabs) — preserve active tab across polling
    const docs = Array.isArray(context) ? context : [];
    if (docs.length > 0) {
      const tabId = 'ctx-tab';
      const savedIdx = _activeTabState[tabId] ?? 0;
      const tabs = docs.map((d, i) => `
        <button class="tab-btn${i === savedIdx ? ' tab-active' : ''}" role="tab" aria-selected="${i === savedIdx ? 'true' : 'false'}" onclick="switchTab('${tabId}', ${i}, this)">${d.name}</button>
      `).join('');
      const panels = docs.map((d, i) => `
        <div class="tab-panel" id="${tabId}-panel-${i}" style="${i === savedIdx ? '' : 'display:none'}">
          <div class="markdown-body">${renderMarkdown(d.content)}</div>
        </div>
      `).join('');
      html += `
        <div class="card" id="${tabId}">
          <h2 style="margin:0 0 .75rem">Context Docs</h2>
          <div class="tab-bar" role="tablist" aria-label="Context docs">${tabs}</div>
          ${panels}
        </div>
      `;
    }

    // Circuit breaker warning
    if (circuitBreaker && circuitBreaker.state && circuitBreaker.state !== 'closed') {
      html += `
        <div class="card card-warning">
          <h2 style="margin:0 0 .5rem">Circuit Breaker</h2>
          <p><strong>State:</strong> ${circuitBreaker.state}</p>
          <p><strong>Failures:</strong> ${nullSafe(circuitBreaker.failures)}</p>
          <p><strong>Opened at:</strong> ${timeAgo(circuitBreaker.opened_at)}</p>
        </div>
      `;
    }

    // Handoff panel
    if (handoff) {
      const pending = Array.isArray(handoff.pending_tasks)
        ? handoff.pending_tasks.map((t) => `<li>${t}</li>`).join('')
        : '';
      html += `
        <div class="card">
          <h2 style="margin:0 0 .5rem">Handoff</h2>
          <p>${nullSafe(handoff.summary)}</p>
          ${pending ? `<ul>${pending}</ul>` : ''}
          <p class="text-muted">Saved: ${timeAgo(handoff.saved_at)}</p>
        </div>
      `;
    }

    // Build timeline
    const timelineEvents = [];
    if (manifest?.created_at) {
      timelineEvents.push({ label: 'Project Created', ts: manifest.created_at, color: 'var(--info)' });
    }
    const phases = Array.isArray(projectPhases) ? projectPhases : [];
    for (const p of phases) {
      const phaseLabel = { '01-research': 'Research', '02-plan': 'Plan', '03-execute': 'Execute', '04-verify': 'Verify', '05-close': 'Close' }[p.phase] ?? p.phase;
      const ts = p.started_at ?? p.completed_at ?? p.updated_at ?? '';
      if (ts) {
        timelineEvents.push({ label: phaseLabel, ts, color: 'var(--accent)', detail: p.status ? `Status: ${p.status}` : '' });
      }
    }
    if (manifest?.updated_at && manifest.updated_at !== manifest.created_at) {
      timelineEvents.push({ label: 'Last Activity', ts: manifest.updated_at, color: 'var(--success)' });
    }
    timelineEvents.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));

    if (timelineEvents.length > 0) {
      const timelineItems = timelineEvents.map(e => `
        <div class="timeline-item">
          <div class="timeline-dot" style="background:${e.color};border-color:${e.color}"></div>
          <div class="timeline-content">
            <strong>${e.label}</strong>
            ${e.detail ? `<span class="text-muted" style="margin-left:6px">${e.detail}</span>` : ''}
            <span class="text-muted" style="display:block">${timeAgo(e.ts)}</span>
          </div>
        </div>
      `).join('');
      html += `
        <div class="card" style="margin-top:1rem">
          <h2 style="margin:0 0 1rem">Build Timeline</h2>
          <div class="timeline">${timelineItems}</div>
        </div>
      `;
    }

    updateApp(html);

    // Export button handler
    const exportBtn = document.getElementById('btn-export-project');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const taskRows = tasks.map(t => {
          const deps = Array.isArray(t.dependencies) ? t.dependencies.join(', ') : (t.dependencies || '');
          return `| ${nullSafe(t.id)} | ${nullSafe(t.name)} | ${t.status || ''} | ${t.size || ''} | ${nullSafe(t.done_criteria)} |`;
        }).join('\n');
        const taskTable = tasks.length > 0
          ? `| ID | Name | Status | Size | Done Criteria |\n|---|---|---|---|---|\n${taskRows}`
          : '_No tasks found._';

        const contextSections = docs.map(d => `### ${d.name}\n\n${d.content || ''}`).join('\n\n');

        const md = [
          `# Project: ${name}`,
          `Phase: ${phase}`,
          `Created: ${manifest?.created_at || '—'}`,
          `Updated: ${manifest?.updated_at || '—'}`,
          '',
          '## Tasks',
          taskTable,
          '',
          docs.length > 0 ? '## Context\n\n' + contextSections : '',
        ].join('\n');

        exportMarkdown(`project-${slug}.md`, md);
      });
    }
  });

  window.addEventListener('hashchange', stopPolling, { once: true });
}

function premiseStatusIcon(status) {
  if (status === 'survived') return '✅';
  if (status === 'weakened') return '⚠️';
  if (status === 'refuted')  return '❌';
  return '—';
}

function gradeLabel(grade) {
  const map = {
    validated:   { cls: 'badge-green', label: 'validated'   },
    data_backed: { cls: 'badge-blue',  label: 'data-backed' },
    heuristic:   { cls: 'badge-amber', label: 'heuristic'   },
    assumption:  { cls: 'badge-gray',  label: 'assumption'  },
  };
  const entry = map[grade];
  if (entry) return `<span class="badge ${entry.cls}">${entry.label}</span>`;
  return `<span class="badge badge-gray">${grade || '—'}</span>`;
}

function buildProbeDetailHtml(data) {
  const isV2 = data.schema_version === 2;
  const ts = data.timestamp ? new Date(data.timestamp).toLocaleString() : '—';

  let premisesHtml = '';
  if (isV2 && Array.isArray(data.premises) && data.premises.length > 0) {
    const rows = data.premises.map((p) => {
      const gradeCell = p.initial_grade === p.final_grade
        ? gradeLabel(p.final_grade)
        : `${gradeLabel(p.initial_grade)} → ${gradeLabel(p.final_grade)}`;
      return `<tr>
        <td style="text-align:center">${p.id}</td>
        <td>${nullSafe(p.statement)}</td>
        <td style="text-align:center">${premiseStatusIcon(p.status)}</td>
        <td>${gradeCell}</td>
        <td>${nullSafe(p.evidence_summary)}</td>
      </tr>`;
    }).join('');
    premisesHtml = `
      <div class="card" style="margin-top:1rem;padding:0">
        <div style="padding:1rem 1.25rem 0"><h2 style="margin:0">Premises</h2></div>
        <table class="table">
          <thead>
            <tr><th>#</th><th>Statement</th><th>Status</th><th>Evidence Grade</th><th>Evidence Summary</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  let evidenceSummaryHtml = '';
  if (isV2 && data.evidence_summary) {
    const es = data.evidence_summary;
    evidenceSummaryHtml = `
      <div class="card" style="margin-top:1rem">
        <h2 style="margin:0 0 .75rem">Evidence Summary</h2>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;text-align:center">
          <div><div style="font-size:1.5em;font-weight:700">${es.validated ?? 0}</div><span class="badge badge-green">validated</span></div>
          <div><div style="font-size:1.5em;font-weight:700">${es.data_backed ?? 0}</div><span class="badge badge-blue">data-backed</span></div>
          <div><div style="font-size:1.5em;font-weight:700">${es.heuristic ?? 0}</div><span class="badge badge-amber">heuristic</span></div>
          <div><div style="font-size:1.5em;font-weight:700">${es.assumption ?? 0}</div><span class="badge badge-gray">assumption</span></div>
        </div>
      </div>`;
  }

  const makeList = (items, title) => {
    if (!Array.isArray(items) || items.length === 0) return '';
    return `
      <div class="card" style="margin-top:1rem">
        <h2 style="margin:0 0 .5rem">${title}</h2>
        <ul style="margin:0;padding-left:1.25rem">${items.map((i) => `<li>${i}</li>`).join('')}</ul>
      </div>`;
  };

  const recommendationHtml = data.recommendation ? `
    <div class="card" style="margin-top:1rem">
      <h2 style="margin:0 0 .5rem">Recommendation</h2>
      <p style="margin:0">${data.recommendation}</p>
    </div>` : '';

  return `
    <div class="view-header">
      <h1 style="display:flex;align-items:center;gap:.75rem;flex-wrap:wrap">
        ${nullSafe(data.idea, 'Probe Detail')}
        ${verdictBadge(data.verdict)}
      </h1>
      <div style="display:flex;align-items:center;gap:1rem">
        <p class="text-muted" style="margin:4px 0 0">${ts}${data.domain ? ` · ${data.domain}` : ''}</p>
        <button id="btn-export-probe" style="font-size:0.75rem;padding:0.25rem 0.6rem;background:transparent;border:1px solid var(--border,#e5e7eb);border-radius:4px;cursor:pointer;color:var(--text-muted)">↓ EXPORT</button>
      </div>
    </div>
    ${premisesHtml}
    ${evidenceSummaryHtml}
    ${makeList(data.evidence_gaps, 'Evidence Gaps')}
    ${makeList(data.risks, 'Risks')}
    ${makeList(data.kill_criteria, 'Kill Criteria')}
    ${recommendationHtml}
  `;
}

async function renderProbeDiff() {
  const app = document.getElementById('app');
  const { a, b } = getHashParams();

  if (!a || !b) {
    app.innerHTML = `
      <div class="view-header"><h1>Probe Diff</h1></div>
      <div class="card"><p class="text-muted">Missing parameters: a and b are required.</p></div>
    `;
    return;
  }

  app.innerHTML = `
    <div class="view-header"><h1>Probe Diff</h1></div>
    <div class="card"><p class="text-muted">Loading diff...</p></div>
  `;

  const url = `/api/probe/diff?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`;
  const data = await fetchJSON(url);

  if (!data || data.error) {
    app.innerHTML = `
      <div class="view-header"><h1>Probe Diff</h1></div>
      <div class="card"><p class="text-muted">Error: ${data ? data.message : 'unknown error'}</p></div>
    `;
    return;
  }

  const { a: pa, b: pb, diff } = data;

  // Header: side-by-side
  const headerHtml = `
    <div class="diff-grid" style="margin-bottom:1rem">
      <div class="diff-side card" style="margin-bottom:0">
        <div style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:0.5rem">A (Before)</div>
        <div style="font-weight:700;margin-bottom:0.5rem">${nullSafe(pa.idea)}</div>
        <div style="margin-bottom:0.25rem">${verdictBadge(pa.verdict)}</div>
        <div class="text-muted" style="font-size:0.8rem;margin-top:0.5rem">${pa.timestamp ? new Date(pa.timestamp).toLocaleDateString() : '—'}</div>
      </div>
      <div class="diff-side card" style="margin-bottom:0">
        <div style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:0.5rem">B (After)</div>
        <div style="font-weight:700;margin-bottom:0.5rem">${nullSafe(pb.idea)}</div>
        <div style="margin-bottom:0.25rem">${verdictBadge(pb.verdict)}</div>
        <div class="text-muted" style="font-size:0.8rem;margin-top:0.5rem">${pb.timestamp ? new Date(pb.timestamp).toLocaleDateString() : '—'}</div>
      </div>
    </div>
  `;

  // Verdict change
  let verdictChangeHtml = '';
  if (diff.verdict && diff.verdict.changed) {
    verdictChangeHtml = `
      <div class="card diff-changed" style="margin-bottom:1rem">
        <strong style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.1em">Verdict Changed</strong>
        <div style="margin-top:0.5rem;display:flex;align-items:center;gap:0.75rem;font-size:1.1em">
          ${verdictBadge(diff.verdict.a)}
          <span style="color:var(--accent)">→</span>
          ${verdictBadge(diff.verdict.b)}
        </div>
      </div>
    `;
  }

  // Recommendation diff
  let recommendationHtml = '';
  if (diff.recommendation) {
    if (diff.recommendation.changed) {
      recommendationHtml = `
        <div class="card" style="margin-bottom:1rem">
          <strong style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.1em">Recommendation Changed</strong>
          <div class="diff-grid" style="margin-top:0.75rem">
            <div class="diff-removed" style="padding:0.75rem;font-size:0.85rem">${nullSafe(diff.recommendation.a)}</div>
            <div class="diff-added" style="padding:0.75rem;font-size:0.85rem">${nullSafe(diff.recommendation.b)}</div>
          </div>
        </div>
      `;
    } else {
      recommendationHtml = `
        <div class="card" style="margin-bottom:1rem">
          <strong style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.1em">Recommendation</strong>
          <p style="margin-top:0.5rem">${nullSafe(diff.recommendation.b || diff.recommendation.a)}</p>
        </div>
      `;
    }
  }

  // Premises diff table
  let premisesHtml = '';
  if (diff.premises) {
    const { added = [], removed = [], changed = [], unchanged = [] } = diff.premises;
    if (added.length + removed.length + changed.length + unchanged.length > 0) {
      const addedRows = added.map(p => `
        <tr class="diff-added">
          <td style="color:var(--success);font-weight:700">+</td>
          <td>${nullSafe(p.statement)}</td>
          <td style="text-align:center">${premiseStatusIcon(p.status)}</td>
          <td>${gradeLabel(p.final_grade)}</td>
          <td class="text-muted" style="font-size:0.8rem">Added</td>
        </tr>`).join('');

      const removedRows = removed.map(p => `
        <tr class="diff-removed">
          <td style="color:var(--danger);font-weight:700">−</td>
          <td>${nullSafe(p.statement)}</td>
          <td style="text-align:center">${premiseStatusIcon(p.status)}</td>
          <td>${gradeLabel(p.final_grade)}</td>
          <td class="text-muted" style="font-size:0.8rem">Removed</td>
        </tr>`).join('');

      const changedRows = changed.map(({ a: pa, b: pb }) => `
        <tr class="diff-changed">
          <td style="color:var(--accent);font-weight:700">~</td>
          <td>${nullSafe(pb.statement || pa.statement)}</td>
          <td style="text-align:center">
            ${pa.status !== pb.status
              ? `${premiseStatusIcon(pa.status)} → ${premiseStatusIcon(pb.status)}`
              : premiseStatusIcon(pb.status)}
          </td>
          <td>
            ${pa.final_grade !== pb.final_grade
              ? `${gradeLabel(pa.final_grade)} → ${gradeLabel(pb.final_grade)}`
              : gradeLabel(pb.final_grade)}
          </td>
          <td class="text-muted" style="font-size:0.8rem">Changed</td>
        </tr>`).join('');

      const unchangedRows = unchanged.map(p => `
        <tr style="opacity:0.55">
          <td style="color:var(--text-muted)"> </td>
          <td>${nullSafe(p.statement)}</td>
          <td style="text-align:center">${premiseStatusIcon(p.status)}</td>
          <td>${gradeLabel(p.final_grade)}</td>
          <td class="text-muted" style="font-size:0.8rem">Unchanged</td>
        </tr>`).join('');

      premisesHtml = `
        <div class="card" style="margin-bottom:1rem;padding:0">
          <div style="padding:1rem 1.25rem 0"><h2 style="margin:0">Premises</h2></div>
          <table class="table">
            <thead><tr><th></th><th>Statement</th><th>Status</th><th>Grade</th><th>Change</th></tr></thead>
            <tbody>${addedRows}${removedRows}${changedRows}${unchangedRows}</tbody>
          </table>
        </div>
      `;
    }
  }

  // List diff helper
  function renderListDiff(diffObj, title) {
    if (!diffObj) return '';
    const { added = [], removed = [], unchanged = [] } = diffObj;
    if (added.length + removed.length + unchanged.length === 0) return '';
    const items = [
      ...added.map(i => `<li class="diff-added" style="padding:0.35rem 0.75rem;margin:2px 0"><span style="color:var(--success);font-weight:700;margin-right:0.5rem">+</span>${i}</li>`),
      ...removed.map(i => `<li class="diff-removed" style="padding:0.35rem 0.75rem;margin:2px 0"><span style="color:var(--danger);font-weight:700;margin-right:0.5rem">−</span>${i}</li>`),
      ...unchanged.map(i => `<li style="padding:0.35rem 0.75rem;margin:2px 0;opacity:0.6">${i}</li>`),
    ].join('');
    return `
      <div class="card" style="margin-bottom:1rem">
        <h2 style="margin:0 0 0.75rem">${title}</h2>
        <ul style="list-style:none;padding:0;margin:0">${items}</ul>
      </div>
    `;
  }

  const evidenceHtml   = renderListDiff(diff.evidence_gaps, 'Evidence Gaps');
  const risksHtml      = renderListDiff(diff.risks, 'Risks');
  const killHtml       = renderListDiff(diff.kill_criteria, 'Kill Criteria');

  app.innerHTML = `
    <div class="view-header">
      <div><a href="#/probes" style="font-size:0.875rem;opacity:0.7">← Probes</a></div>
      <h1 style="margin-top:0.5rem">Probe Diff</h1>
    </div>
    ${headerHtml}
    ${verdictChangeHtml}
    ${premisesHtml}
    ${evidenceHtml}
    ${risksHtml}
    ${killHtml}
    ${recommendationHtml}
  `;
}

async function renderProbesList() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="view-header"><h1>Probes</h1></div>
    <div class="card"><p class="text-muted">Loading probes...</p></div>
  `;

  const [latest, historyRes] = await Promise.all([
    fetchJSON(apiUrl('/probe/latest')),
    fetchJSON(apiUrl('/probe/history')),
  ]);

  let latestCardHtml = '';
  if (latest && !latest.error) {
    const ts = latest.timestamp ? new Date(latest.timestamp).toLocaleString() : '—';
    const evidence = latest.evidence_summary ?? {};
    latestCardHtml = `
      <div class="card" style="margin-bottom:1rem">
        <div style="display:flex;align-items:center;gap:.75rem;flex-wrap:wrap;margin-bottom:.5rem">
          <strong style="font-size:1.1em">${nullSafe(latest.idea, 'Latest Probe')}</strong>
          ${verdictBadge(latest.verdict)}
        </div>
        <p class="text-muted" style="margin:0 0 .5rem">${ts}${latest.domain ? ` · ${latest.domain}` : ''}</p>
        ${latest.recommendation ? `<p style="margin:0 0 .5rem">${latest.recommendation}</p>` : ''}
        ${Object.keys(evidence).length > 0 ? `
        <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.5rem">
          ${evidence.validated   != null ? `<span class="badge badge-green">validated: ${evidence.validated}</span>` : ''}
          ${evidence.data_backed != null ? `<span class="badge badge-blue">data-backed: ${evidence.data_backed}</span>` : ''}
          ${evidence.heuristic   != null ? `<span class="badge badge-amber">heuristic: ${evidence.heuristic}</span>` : ''}
          ${evidence.assumption  != null ? `<span class="badge badge-gray">assumption: ${evidence.assumption}</span>` : ''}
        </div>` : ''}
      </div>`;
  }

  const history = (!historyRes.error && Array.isArray(historyRes.data)) ? historyRes.data : [];

  let historyHtml = '';
  if (history.length > 0) {
    const canCompare = history.length >= 2;
    const compareToggleHtml = canCompare ? `
      <button id="btn-compare-toggle" style="font-size:0.75rem;padding:0.25rem 0.6rem;background:transparent;border:1px solid var(--border,#333);border-radius:4px;cursor:pointer;color:var(--text-muted)">Compare</button>
    ` : '';

    const rows = history.map((item, idx) => {
      const date = item.timestamp ? new Date(item.timestamp).toLocaleDateString() : '—';
      const idea = nullSafe(item.idea, '—');
      const fileParam = item._file ?? `history-${idx}`;
      const premiseCount = Array.isArray(item.premises) ? item.premises.length : 0;
      const survived = Array.isArray(item.premises) ? item.premises.filter(p => p.status === 'survived').length : 0;
      const killed = Array.isArray(item.premises) ? item.premises.filter(p => p.status === 'killed').length : 0;
      const es = item.evidence_summary ?? {};
      const evidenceBadges = [
        es.validated   ? `<span class="badge badge-green" style="font-size:0.7em">${es.validated}V</span>` : '',
        es.data_backed ? `<span class="badge badge-blue" style="font-size:0.7em">${es.data_backed}D</span>` : '',
        es.heuristic   ? `<span class="badge badge-amber" style="font-size:0.7em">${es.heuristic}H</span>` : '',
        es.assumption  ? `<span class="badge badge-gray" style="font-size:0.7em">${es.assumption}A</span>` : '',
      ].filter(Boolean).join(' ');
      const rec = item.recommendation ? item.recommendation.slice(0, 80) + (item.recommendation.length > 80 ? '…' : '') : '—';
      return `<tr style="cursor:pointer" data-href="#/probes/${encodeURIComponent(fileParam)}" data-file="${fileParam}">
        <td class="compare-cell" style="display:none;width:32px;padding:10px 8px">
          <input type="checkbox" class="compare-check" data-file="${fileParam}" style="cursor:pointer">
        </td>
        <td>${date}</td>
        <td>${idea}</td>
        <td>${verdictBadge(item.verdict)}</td>
        <td>${nullSafe(item.domain)}</td>
        <td style="white-space:nowrap">${premiseCount} <span class="text-muted" style="font-size:0.8em">(${survived}✓ ${killed}✗)</span></td>
        <td>${evidenceBadges || '—'}</td>
        <td style="font-size:0.85em;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${item.recommendation ?? ''}">${rec}</td>
      </tr>`;
    }).join('');

    historyHtml = `
      <div class="card" style="padding:0">
        <div style="padding:1rem 1.25rem 0;display:flex;align-items:center;justify-content:space-between">
          <h2 style="margin:0">History</h2>
          <div style="display:flex;align-items:center;gap:0.5rem">
            ${compareToggleHtml}
            <button id="btn-compare-go" style="display:none;font-size:0.75rem;padding:0.25rem 0.6rem;background:var(--accent);border:none;border-radius:4px;cursor:pointer;color:#000;font-weight:700">Compare Selected</button>
          </div>
        </div>
        <table class="table" id="probe-history-table">
          <thead>
            <tr>
              <th class="compare-cell" style="display:none;width:32px"></th>
              <th>Date</th><th>Idea</th><th>Verdict</th><th>Domain</th><th>Premises</th><th>Evidence</th><th>Recommendation</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  } else {
    historyHtml = `<div class="card"><p class="text-muted">No probe history found.</p></div>`;
  }

  app.innerHTML = `
    <div class="view-header"><h1>Probes</h1></div>
    ${latestCardHtml}
    ${historyHtml}
  `;

  // Event delegation for table row clicks (CSP-safe, no inline onclick)
  const table = document.getElementById('probe-history-table');
  if (table) {
    table.addEventListener('click', (e) => {
      // Don't navigate if clicking a checkbox
      if (e.target.classList.contains('compare-check')) return;
      const row = e.target.closest('tr[data-href]');
      if (row) window.location.hash = row.dataset.href;
    });
  }

  // Compare mode toggle
  const btnToggle = document.getElementById('btn-compare-toggle');
  const btnGo = document.getElementById('btn-compare-go');
  if (btnToggle) {
    let compareMode = false;
    btnToggle.addEventListener('click', () => {
      compareMode = !compareMode;
      btnToggle.textContent = compareMode ? 'Cancel' : 'Compare';
      btnToggle.style.color = compareMode ? 'var(--accent)' : 'var(--text-muted)';
      document.querySelectorAll('.compare-cell').forEach(el => {
        el.style.display = compareMode ? '' : 'none';
      });
      if (!compareMode) {
        document.querySelectorAll('.compare-check').forEach(cb => { cb.checked = false; });
        if (btnGo) btnGo.style.display = 'none';
      }
    });
  }

  if (table) {
    table.addEventListener('change', (e) => {
      if (!e.target.classList.contains('compare-check')) return;
      const checked = [...document.querySelectorAll('.compare-check:checked')];
      if (checked.length > 2) {
        e.target.checked = false;
        return;
      }
      if (btnGo) {
        btnGo.style.display = checked.length === 2 ? '' : 'none';
      }
    });
  }

  if (btnGo) {
    btnGo.addEventListener('click', () => {
      const checked = [...document.querySelectorAll('.compare-check:checked')];
      if (checked.length !== 2) return;
      const [fileA, fileB] = checked.map(cb => cb.dataset.file);
      window.location.hash = `#/probes/diff?a=${encodeURIComponent(fileA)}&b=${encodeURIComponent(fileB)}`;
    });
  }
}

async function renderProbeDetail(file) {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="view-header"><h1>Probe</h1></div>
    <div class="card"><p class="text-muted">Loading...</p></div>
  `;

  const url = file === 'latest'
    ? apiUrl('/probe/latest')
    : apiUrl(`/probe/history/${encodeURIComponent(file)}`);
  const data = await fetchJSON(url);

  if (!data || data.error) {
    app.innerHTML = `
      <div class="view-header"><h1>Probe</h1></div>
      <div class="card"><p class="text-muted">Error: ${data ? data.message : 'unknown error'}</p></div>
    `;
    return;
  }

  app.innerHTML = buildProbeDetailHtml(data);

  // Export button handler
  const exportBtn = document.getElementById('btn-export-probe');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const ts = data.timestamp ? new Date(data.timestamp).toLocaleString() : '—';
      const premiseRows = (Array.isArray(data.premises) ? data.premises : []).map(p => {
        const grade = p.initial_grade === p.final_grade
          ? p.final_grade
          : `${p.initial_grade} → ${p.final_grade}`;
        return `| ${p.id} | ${nullSafe(p.statement)} | ${p.status || ''} | ${grade} | ${nullSafe(p.evidence_summary)} |`;
      }).join('\n');
      const premiseTable = data.premises && data.premises.length > 0
        ? `| # | Statement | Status | Grade | Evidence |\n|---|---|---|---|---|\n${premiseRows}`
        : '_No premises._';

      const md = [
        `# Probe: ${nullSafe(data.idea, 'Probe')}`,
        `Verdict: ${data.verdict || '—'}`,
        `Date: ${ts}`,
        data.domain ? `Domain: ${data.domain}` : '',
        '',
        '## Premises',
        premiseTable,
        '',
        data.recommendation ? `## Recommendation\n\n${data.recommendation}` : '',
      ].filter(l => l !== undefined).join('\n');

      const slug = (data.idea || 'probe').toLowerCase().replace(/\s+/g, '-').slice(0, 40);
      exportMarkdown(`probe-${slug}.md`, md);
    });
  }
}

function solverStateBadge(state) {
  if (state === 'solved') return `<span class="badge badge-success">solved</span>`;
  return `<span class="badge badge-warning">${state || 'unknown'}</span>`;
}

const SOLVER_PHASES = ['01-intake', '02-classify', '03-solve', '04-verify', '05-close'];
const SOLVER_PHASE_CSS = {
  '01-intake':  'phase-01',
  '02-classify':'phase-02',
  '03-solve':   'phase-03',
  '04-verify':  'phase-04',
  '05-close':   'phase-05',
};

function solverPhaseBadge(phase) {
  if (!phase) return `<span class="badge badge-neutral">—</span>`;
  const cls = SOLVER_PHASE_CSS[phase] || 'badge-neutral';
  return `<span class="badge ${cls}">${phase}</span>`;
}

function renderSolversList() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="view-header"><h1>Solvers</h1></div>
    <div class="card"><p class="text-muted">Loading solvers...</p></div>
  `;

  const stopPolling = startPolling(async () => {
    const seq = _pollSequence;
    const res = await fetchJSON(apiUrl('/solver'));
    if (seq !== _pollSequence) return;
    if (res.error) {
      updateApp(`
        <div class="view-header"><h1>Solvers</h1></div>
        <div class="card"><p class="text-muted">Error: ${res.message}</p></div>
      `);
      return;
    }

    const solvers = Array.isArray(res.data) ? res.data : [];

    updateApp(`
      <div class="view-header">
        <h1>Solvers <span class="badge badge-neutral" style="font-size:0.85rem;vertical-align:middle">${solvers.length}</span></h1>
      </div>
      <div class="card" style="padding:0">
        ${solvers.length === 0 ? `<p class="text-muted" style="padding:1rem">No solver problems found.</p>` : `
        <table class="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>State</th>
              <th>Strategy</th>
              <th>Phase</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            ${solvers.map(s => {
              const slug = s.name;
              const displayName = s.display_name || s.name || '—';
              const truncated = displayName.length > 80 ? displayName.slice(0, 80) + '…' : displayName;
              return `
              <tr>
                <td><a href="#/solvers/${slug}" title="${displayName.replace(/"/g, '&quot;')}">${truncated}</a></td>
                <td>${solverStateBadge(s.state)}</td>
                <td>${s.strategy ? `<span class="badge badge-info">${s.strategy}</span>` : '<span class="text-muted">—</span>'}</td>
                <td>${solverPhaseBadge(s.current_phase)}</td>
                <td class="text-muted">${timeAgo(s.created_at)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>`}
      </div>
    `);
  });

  window.addEventListener('hashchange', stopPolling, { once: true });
}

function renderSolverDetail(slug) {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="view-header"><h1>Solver</h1></div>
    <div class="card"><p class="text-muted">Loading...</p></div>
  `;

  const stopPolling = startPolling(async () => {
    const seq = _pollSequence;
    const res = await fetchJSON(apiUrl(`/solver/${encodeURIComponent(slug)}`));
    if (seq !== _pollSequence) return;
    if (res.error) {
      updateApp(`
        <div class="view-header"><h1>Solver: <code>${slug}</code></h1></div>
        <div class="card"><p class="text-muted">Error: ${res.message || res.error}</p></div>
      `);
      return;
    }

    const m = res.manifest || {};
    const phases = Array.isArray(res.phases) ? res.phases : [];
    const phaseSet = new Set(phases.map(p => p.phase));

    let html = `
      <div class="view-header">
        <div><a href="#/solvers" style="font-size:0.875rem;opacity:0.7">← Solvers</a></div>
        <h1 style="margin-top:0.5rem">${m.display_name || m.name || slug}</h1>
        <div style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap;margin-top:0.5rem">
          ${solverStateBadge(m.state)}
          ${m.strategy ? `<span class="badge badge-info">${m.strategy}</span>` : ''}
          ${solverPhaseBadge(m.current_phase)}
          <span class="text-muted" style="font-size:0.8rem">created ${timeAgo(m.created_at)}</span>
          ${m.closed_at ? `<span class="text-muted" style="font-size:0.8rem">· closed ${timeAgo(m.closed_at)}</span>` : ''}
          <button id="btn-export-solver" style="margin-left:auto;font-size:0.75rem;padding:0.25rem 0.6rem;background:transparent;border:1px solid var(--border,#e5e7eb);border-radius:4px;cursor:pointer;color:var(--text-muted)">↓ EXPORT</button>
        </div>
      </div>

      <div class="card" style="margin-top:1rem">
        <div style="font-weight:600;margin-bottom:0.5rem">Phase Progression</div>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
          ${SOLVER_PHASES.map(ph => {
            const isCurrent = m.current_phase === ph;
            const hasData = phaseSet.has(ph);
            const cls = (isCurrent || hasData) ? (SOLVER_PHASE_CSS[ph] || 'badge-neutral') : 'badge-neutral';
            const style = isCurrent ? 'outline:2px solid currentColor;outline-offset:2px' : '';
            return `<span class="badge ${cls}" style="${style}">${ph}</span>`;
          }).join('')}
        </div>
      </div>
    `;

    if (phases.length > 0) {
      for (const p of phases) {
        const files = p.files || {};
        let contentHtml = '';
        for (const [fname, content] of Object.entries(files)) {
          if (fname.endsWith('.md')) {
            contentHtml += `<div style="margin-top:0.75rem"><strong style="font-size:0.8rem;color:var(--text-muted)">${fname}</strong><div class="markdown-body" style="margin-top:0.25rem">${renderMarkdown(content)}</div></div>`;
          } else if (fname.endsWith('.json')) {
            contentHtml += `<div style="margin-top:0.75rem"><strong style="font-size:0.8rem;color:var(--text-muted)">${fname}</strong>${renderJsonSmart(content)}</div>`;
          } else {
            contentHtml += `<div style="margin-top:0.75rem"><strong style="font-size:0.8rem;color:var(--text-muted)">${fname}</strong><pre style="margin:0.25rem 0 0;white-space:pre-wrap;font-size:0.8rem">${content}</pre></div>`;
          }
        }
        html += `
          <div class="card" style="margin-top:1rem">
            <div style="font-weight:600;margin-bottom:0.5rem">${solverPhaseBadge(p.phase)} ${p.phase}</div>
            ${contentHtml || '<p class="text-muted">No data</p>'}
          </div>`;
      }
    }

    updateApp(html);

    // Export button handler
    const exportBtn = document.getElementById('btn-export-solver');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const sections = phases.map(p => {
          const fileContents = Object.entries(p.files || {}).map(([fname, content]) => {
            const text = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
            return `### ${fname}\n\n${text}`;
          }).join('\n\n');
          return `## Phase: ${p.phase}\n\n${fileContents || '_No data._'}`;
        }).join('\n\n');

        const md = [
          `# Solver: ${m.display_name || m.name || slug}`,
          `State: ${m.state || '—'}`,
          m.strategy ? `Strategy: ${m.strategy}` : '',
          `Phase: ${m.current_phase || '—'}`,
          `Created: ${m.created_at || '—'}`,
          m.closed_at ? `Closed: ${m.closed_at}` : '',
          '',
          sections || '_No phase data._',
        ].filter(l => l !== undefined).join('\n');

        exportMarkdown(`solver-${slug}.md`, md);
      });
    }
  });

  window.addEventListener('hashchange', stopPolling, { once: true });
}

function renderConfig() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="view-header"><h1>Config</h1></div>
    <div class="card"><p class="text-muted">Loading config...</p></div>
  `;

  const stopPolling = startPolling(async () => {
    const seq = _pollSequence;
    const res = await fetchJSON(apiUrl('/config'));
    if (seq !== _pollSequence) return;
    if (res.error) {
      updateApp(`
        <div class="view-header"><h1>Config</h1></div>
        <div class="card"><p class="text-muted">Error: ${res.message ?? res.error}</p></div>
      `);
      return;
    }
    updateApp(`
      <div class="view-header"><h1>Config</h1></div>
      <div class="card">
        <pre style="margin:0;overflow:auto;font-size:0.85em">${JSON.stringify(res, null, 2)}</pre>
      </div>
    `);
  });

  window.addEventListener('hashchange', stopPolling, { once: true });
}

// ── x-op views ──────────────────────────────────────────────────────

const STRATEGY_BADGES = {
  debate: 'badge-blue', tournament: 'badge-amber', refine: 'badge-green',
  review: 'badge-indigo', 'red-team': 'badge-red', hypothesis: 'badge-purple',
  investigate: 'badge-teal', council: 'badge-blue', brainstorm: 'badge-amber',
  scaffold: 'badge-green', decompose: 'badge-indigo', chain: 'badge-gray',
  persona: 'badge-purple', socratic: 'badge-teal', escalate: 'badge-gray',
  monitor: 'badge-red', distribute: 'badge-green', compose: 'badge-amber',
};

async function renderOpsList() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="view-header"><h1>Ops</h1></div>
    <div class="card"><p class="text-muted">Loading...</p></div>
  `;

  const res = await fetchJSON(apiUrl('/op'));
  const ops = (!res.error && Array.isArray(res.data)) ? res.data : [];

  if (ops.length === 0) {
    app.innerHTML = `
      <div class="view-header"><h1>Ops</h1></div>
      <div class="card"><p class="text-muted">No strategy results found. Run <code>/x-op</code> to generate one.</p></div>
    `;
    return;
  }

  const rows = ops.map((op) => {
    const date = op.completed_at ? new Date(op.completed_at).toLocaleDateString() : op.created_at ? new Date(op.created_at).toLocaleDateString() : '—';
    const stratClass = STRATEGY_BADGES[op.strategy] ?? 'badge-neutral';
    const topic = nullSafe(op.topic, '—');
    const truncTopic = topic.length > 60 ? topic.slice(0, 57) + '…' : topic;
    const verdict = op.outcome?.verdict ?? op.outcome?.summary ?? '—';
    const truncVerdict = verdict.length > 50 ? verdict.slice(0, 47) + '…' : verdict;
    const score = op.self_score?.overall != null ? `${op.self_score.overall}/10` : '—';
    const agents = op.options?.agents ?? '—';
    const fileParam = op._file ?? '';
    return `<tr style="cursor:pointer" onclick="window.location.hash='#/ops/${encodeURIComponent(fileParam)}'">
      <td>${date}</td>
      <td><span class="badge ${stratClass}">${op.strategy ?? '—'}</span></td>
      <td title="${topic.replace(/"/g, '&quot;')}">${truncTopic}</td>
      <td title="${verdict.replace(/"/g, '&quot;')}">${truncVerdict}</td>
      <td style="text-align:center">${score}</td>
      <td style="text-align:center">${agents}</td>
    </tr>`;
  }).join('');

  app.innerHTML = `
    <div class="view-header">
      <h1>Ops <span class="badge badge-neutral" style="font-size:0.85rem;vertical-align:middle">${ops.length}</span></h1>
    </div>
    <div class="card" style="padding:0">
      <table class="table">
        <thead>
          <tr><th>Date</th><th>Strategy</th><th>Topic</th><th>Outcome</th><th>Score</th><th>Agents</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

async function renderOpDetail(file) {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="view-header"><h1>Op Detail</h1></div>
    <div class="card"><p class="text-muted">Loading...</p></div>
  `;

  const data = await fetchJSON(apiUrl(`/op/${encodeURIComponent(file)}`));
  if (data.error) {
    app.innerHTML = `
      <div class="view-header"><h1>Op Detail</h1></div>
      <div class="card"><p class="text-muted">Error: ${data.error}</p></div>
    `;
    return;
  }

  const ts = data.completed_at ? new Date(data.completed_at).toLocaleString() : data.created_at ? new Date(data.created_at).toLocaleString() : '—';
  const stratClass = STRATEGY_BADGES[data.strategy] ?? 'badge-neutral';

  // Outcome card
  const outcomeHtml = data.outcome ? `
    <div class="card" style="margin-top:1rem">
      <h2 style="margin:0 0 .75rem">Outcome</h2>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;text-align:center">
        <div><div style="font-size:1.3em;font-weight:700">${nullSafe(data.outcome.verdict, '—')}</div><span class="text-muted">Verdict</span></div>
        ${data.outcome.confidence != null ? `<div><div style="font-size:1.3em;font-weight:700">${data.outcome.confidence}/10</div><span class="text-muted">Confidence</span></div>` : ''}
      </div>
      ${data.outcome.summary ? `<p style="margin:.75rem 0 0">${data.outcome.summary}</p>` : ''}
    </div>` : '';

  // Self-score card
  let scoreHtml = '';
  if (data.self_score) {
    const criteria = data.self_score.criteria ?? {};
    const criteriaRows = Object.entries(criteria).map(([k, v]) =>
      `<tr><td>${k}</td><td style="text-align:center">${v}/10</td></tr>`
    ).join('');
    scoreHtml = `
      <div class="card" style="margin-top:1rem">
        <h2 style="margin:0 0 .75rem">Self-Score: ${data.self_score.overall ?? '—'}/10</h2>
        <table class="table">
          <thead><tr><th>Criterion</th><th>Score</th></tr></thead>
          <tbody>${criteriaRows}</tbody>
        </table>
      </div>`;
  }

  // Participants card
  let participantsHtml = '';
  if (Array.isArray(data.participants) && data.participants.length > 0) {
    const pRows = data.participants.map(p =>
      `<tr><td>${nullSafe(p.role)}</td><td>${nullSafe(p.position, '—')}</td></tr>`
    ).join('');
    participantsHtml = `
      <div class="card" style="margin-top:1rem">
        <h2 style="margin:0 0 .75rem">Participants</h2>
        <table class="table">
          <thead><tr><th>Role</th><th>Position</th></tr></thead>
          <tbody>${pRows}</tbody>
        </table>
      </div>`;
  }

  // Rounds summary card
  let roundsHtml = '';
  if (Array.isArray(data.rounds_summary) && data.rounds_summary.length > 0) {
    const rRows = data.rounds_summary.map(r =>
      `<tr><td style="text-align:center">${r.round}</td><td>${nullSafe(r.phase)}</td><td>${nullSafe(r.summary)}</td></tr>`
    ).join('');
    roundsHtml = `
      <div class="card" style="margin-top:1rem">
        <h2 style="margin:0 0 .75rem">Rounds</h2>
        <table class="table">
          <thead><tr><th>#</th><th>Phase</th><th>Summary</th></tr></thead>
          <tbody>${rRows}</tbody>
        </table>
      </div>`;
  }

  // Options card
  const optsHtml = data.options ? `
    <div class="card" style="margin-top:1rem">
      <h2 style="margin:0 0 .75rem">Options</h2>
      <pre style="margin:0;font-size:0.85em">${JSON.stringify(data.options, null, 2)}</pre>
    </div>` : '';

  app.innerHTML = `
    <div class="view-header">
      <div><a href="#/ops" style="font-size:0.875rem;opacity:0.7">← Ops</a></div>
      <h1 style="display:flex;align-items:center;gap:.75rem;flex-wrap:wrap;margin-top:0.5rem">
        <span class="badge ${stratClass}">${data.strategy ?? '—'}</span>
        ${nullSafe(data.topic, 'Op Detail')}
      </h1>
      <p class="text-muted" style="margin:4px 0 0">${ts}</p>
    </div>
    ${outcomeHtml}
    ${scoreHtml}
    ${participantsHtml}
    ${roundsHtml}
    ${optsHtml}
  `;
}

async function renderTracesList() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="view-header"><h1>Traces</h1><p>.xm/traces/</p></div>
    <div class="card"><p class="text-muted">Loading traces...</p></div>
  `;

  const res = await fetchJSON(apiUrl('/traces'));
  if (res.error) {
    app.innerHTML = `
      <div class="view-header"><h1>Traces</h1><p>.xm/traces/</p></div>
      <div class="card"><p class="text-muted">Error: ${res.message}</p></div>
    `;
    return;
  }

  const traces = Array.isArray(res.traces) ? res.traces : [];
  const activeFile = res.active ?? null;

  if (traces.length === 0) {
    app.innerHTML = `
      <div class="view-header"><h1>Traces</h1><p>.xm/traces/</p></div>
      <div class="card" style="text-align:center;padding:3rem">
        <div style="font-size:2rem;margin-bottom:1rem;opacity:0.3">◇</div>
        <p class="text-muted">No trace data yet.</p>
        <p style="font-size:0.8rem;color:var(--text-muted)">Run <code>/x-trace start</code> to begin recording agent execution.</p>
      </div>
    `;
    return;
  }

  const rows = traces.map(t => {
    const isActive = activeFile && t.file === activeFile;
    const liveBadge = isActive ? `<span class="badge badge-green" style="margin-left:6px;animation:none">LIVE</span>` : '';
    const statusBadgeHtml = t.status === 'active'
      ? `<span class="badge badge-amber">Active</span>`
      : `<span class="badge badge-gray">Done</span>`;
    const dur = t.duration_ms != null ? `${(t.duration_ms / 1000).toFixed(1)}s` : t.duration != null ? `${(t.duration / 1000).toFixed(1)}s` : '—';
    const cost = t.cost != null && t.cost > 0 ? `$${t.cost.toFixed(3)}` : '—';
    const agents = t.agents != null && t.agents > 0 ? t.agents : '—';
    return `
      <tr${isActive ? ' style="background:rgba(105,240,174,0.05)"' : ''}>
        <td><a href="#/traces/${encodeURIComponent(t.file)}">${t.name || t.file}</a>${liveBadge}</td>
        <td class="mono" style="font-size:11px">${t.date || timeAgo(t.started_at) || '—'}</td>
        <td>${nullSafe(t.entries, '—')}</td>
        <td>${dur}</td>
        <td style="text-align:right">${cost}</td>
        <td style="text-align:center">${agents}</td>
        <td>${statusBadgeHtml}</td>
      </tr>
    `;
  }).join('');

  app.innerHTML = `
    <div class="view-header"><h1>Traces</h1><p>.xm/traces/</p></div>
    <div class="card" style="padding:0">
      <table class="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Date</th>
            <th>Entries</th>
            <th>Duration</th>
            <th style="text-align:right">Cost</th>
            <th style="text-align:center">Agents</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function traceTypeBadge(type) {
  const map = {
    session_start: ['badge-blue',   'START'],
    session_end:   ['badge-green',  'END'],
    agent_call:    ['badge-amber',  'AGENT'],
    agent_step:    ['badge-amber',  'STEP'],
    fan_out:       ['badge-purple', 'FAN-OUT'],
    synthesize:    ['badge-green',  'SYNTH'],
    checkpoint:    ['badge-gray',   'CHECKPOINT'],
  };
  const [cls, label] = map[type] ?? ['badge-gray', type || '?'];
  return `<span class="badge ${cls} trace-type">${label}</span>`;
}

async function renderTraceDetail(file) {
  const app = document.getElementById('app');
  const decodedFile = decodeURIComponent(file);
  app.innerHTML = `
    <div class="breadcrumb">${multiRootMode && currentWsId ? `<span class="text-accent" style="margin-right:4px">${currentWsId}</span><span class="sep">/</span>` : ''}<a href="#/traces">Traces</a><span class="sep">/</span>${decodedFile}</div>
    <div class="view-header"><h1>Trace: <code>${decodedFile}</code></h1></div>
    <div class="card"><p class="text-muted">Loading trace...</p></div>
  `;

  let offset = 0;
  const limit = 200;

  async function loadEntries(currentOffset) {
    const res = await fetchJSON(apiUrl(`/traces/${encodeURIComponent(decodedFile)}?limit=${limit}&offset=${currentOffset}`));
    if (res.error) {
      app.innerHTML = `
        <div class="breadcrumb">${multiRootMode && currentWsId ? `<span class="text-accent" style="margin-right:4px">${currentWsId}</span><span class="sep">/</span>` : ''}<a href="#/traces">Traces</a><span class="sep">/</span>${decodedFile}</div>
        <div class="view-header"><h1>Trace: <code>${decodedFile}</code></h1></div>
        <div class="card"><p class="text-muted">Error: ${res.message}</p></div>
      `;
      return;
    }

    const entries = Array.isArray(res.entries) ? res.entries : [];
    const total = res.total ?? entries.length;
    const hasMore = (currentOffset + entries.length) < total;

    // Compute summary
    let totalCost = 0;
    let totalIn = 0;
    let totalOut = 0;
    let minTs = null;
    let maxTs = null;
    for (const e of entries) {
      totalCost += e.cost ?? 0;
      totalIn   += e.input_tokens  ?? e.tokens_in  ?? 0;
      totalOut  += e.output_tokens ?? e.tokens_out ?? 0;
      const ts = e.timestamp ?? e.ts;
      if (ts) {
        if (!minTs || ts < minTs) minTs = ts;
        if (!maxTs || ts > maxTs) maxTs = ts;
      }
    }
    const totalDurMs = (minTs && maxTs) ? (new Date(maxTs) - new Date(minTs)) : null;
    const totalDurStr = totalDurMs != null ? `${(totalDurMs / 1000).toFixed(1)}s` : '—';

    // Build parent-child map for fan_out indentation
    const parentMap = {};
    for (const e of entries) {
      if (e.parent_id) {
        if (!parentMap[e.parent_id]) parentMap[e.parent_id] = [];
        parentMap[e.parent_id].push(e.id ?? e.seq);
      }
    }

    const entryRows = entries.map(e => {
      const isChild = !!e.parent_id;
      const ts = e.timestamp ?? e.ts ?? '';
      const tsDisplay = ts ? ts.slice(11, 19) : '—';
      const dur = e.duration_ms != null ? `${(e.duration_ms / 1000).toFixed(2)}s` : '—';
      const tokIn  = e.input_tokens  ?? e.tokens_in  ?? null;
      const tokOut = e.output_tokens ?? e.tokens_out ?? null;
      const cost   = e.cost ?? null;

      let agentInfo = '';
      if (e.agent_role || e.model) {
        agentInfo = `<span style="color:var(--text)">${e.agent_role || ''}</span>`;
        if (e.model) agentInfo += ` <span class="text-muted">(${e.model})</span>`;
      } else if (e.message) {
        agentInfo = `<span class="text-muted" style="font-size:11px">${e.message.slice(0, 80)}</span>`;
      }

      const tokStr = (tokIn != null || tokOut != null)
        ? `<span class="trace-tokens">${tokIn != null ? tokIn.toLocaleString() : '?'} in / ${tokOut != null ? tokOut.toLocaleString() : '?'} out</span>`
        : '';
      const costStr = cost != null
        ? `<span class="trace-tokens" style="color:var(--accent)">$${cost.toFixed(4)}</span>`
        : '';

      return `
        <div class="trace-entry${isChild ? ' trace-entry-child' : ''}">
          <span class="text-muted mono" style="font-size:11px;min-width:70px">${tsDisplay}</span>
          ${traceTypeBadge(e.type)}
          <span style="flex:1">${agentInfo}</span>
          <span class="trace-tokens">${dur}</span>
          ${tokStr}
          ${costStr}
        </div>
      `;
    }).join('');

    const costDisplay = totalCost > 0 ? `$${totalCost.toFixed(4)}` : '—';
    const tokDisplay = (totalIn + totalOut) > 0 ? `${(totalIn + totalOut).toLocaleString()} tokens` : '';

    app.innerHTML = `
      <div class="breadcrumb">${multiRootMode && currentWsId ? `<span class="text-accent" style="margin-right:4px">${currentWsId}</span><span class="sep">/</span>` : ''}<a href="#/traces">Traces</a><span class="sep">/</span>${decodedFile}</div>
      <div class="view-header"><h1>Trace: <code>${decodedFile}</code></h1></div>
      <div class="stat-bar" style="margin-bottom:16px">
        <div class="card stat-card">
          <div class="stat-value">${total}</div>
          <div class="stat-label">Entries</div>
        </div>
        <div class="card stat-card">
          <div class="stat-value" style="font-size:20px">${totalDurStr}</div>
          <div class="stat-label">Duration</div>
        </div>
        <div class="card stat-card">
          <div class="stat-value" style="font-size:20px">${costDisplay}</div>
          <div class="stat-label">Total Cost</div>
        </div>
        ${tokDisplay ? `<div class="card stat-card">
          <div class="stat-value" style="font-size:16px">${tokDisplay}</div>
          <div class="stat-label">Tokens</div>
        </div>` : ''}
      </div>
      <div class="card" style="padding:0" id="trace-entries">
        ${entryRows || '<div class="trace-entry"><span class="text-muted">No entries.</span></div>'}
      </div>
      ${hasMore ? `<div style="margin-top:12px;text-align:center">
        <button id="btn-load-more" style="background:var(--surface);border:var(--border);color:var(--accent);padding:8px 20px;font-family:var(--font-mono);font-size:11px;font-weight:700;text-transform:uppercase;cursor:pointer;letter-spacing:0.08em">
          Load More (${total - currentOffset - entries.length} remaining)
        </button>
      </div>` : ''}
    `;

    const loadMoreBtn = document.getElementById('btn-load-more');
    if (loadMoreBtn) {
      loadMoreBtn.addEventListener('click', () => loadEntries(currentOffset + entries.length));
    }
  }

  await loadEntries(offset);
}

function memoryTypeBadge(type) {
  const map = {
    decision: 'badge-blue',
    pattern:  'badge-indigo',
    failure:  'badge-red',
    learning: 'badge-green',
  };
  const cls = map[(type ?? '').toLowerCase()] ?? 'badge-gray';
  return `<span class="badge ${cls}">${type || '—'}</span>`;
}

function confidenceBadge(confidence) {
  if (confidence === null || confidence === undefined || confidence === '') return `<span class="badge badge-gray">—</span>`;
  const n = typeof confidence === 'number' ? confidence : parseFloat(confidence);
  if (isNaN(n)) return `<span class="badge badge-gray">—</span>`;
  const cls = n >= 0.8 ? 'badge-green' : n >= 0.5 ? 'badge-amber' : 'badge-red';
  return `<span class="badge ${cls}">${(n * 100).toFixed(0)}%</span>`;
}

async function renderMemoryList() {
  const app = document.getElementById('app');
  const emptyState = `
    <div class="view-header"><h1>Memory</h1><p>.xm/memory/</p></div>
    <div class="card" style="text-align:center;padding:3rem">
      <div style="font-size:2rem;margin-bottom:1rem;opacity:0.3">◇</div>
      <p class="text-muted">No memory data yet.</p>
      <p style="font-size:0.8rem;color:var(--text-muted)">Run <code>/x-memory</code> to begin storing cross-session decisions.</p>
    </div>
  `;

  app.innerHTML = `<div class="view-header"><h1>Memory</h1><p>.xm/memory/</p></div><div class="card"><p class="text-muted">Loading...</p></div>`;

  const res = await fetchJSON(apiUrl('/memory'));
  if (res.error) {
    app.innerHTML = emptyState;
    return;
  }

  const decisions = Array.isArray(res.decisions) ? res.decisions : [];
  if (decisions.length === 0) {
    app.innerHTML = emptyState;
    return;
  }

  const TYPES = ['All', 'Decision', 'Pattern', 'Failure', 'Learning'];
  let activeType = 'All';
  let searchQuery = '';

  function filtered() {
    return decisions.filter(e => {
      const matchType = activeType === 'All' || (e.type ?? '').toLowerCase() === activeType.toLowerCase();
      const q = searchQuery.toLowerCase();
      const matchSearch = !q ||
        (e.title ?? '').toLowerCase().includes(q) ||
        (e.why ?? '').toLowerCase().includes(q) ||
        (Array.isArray(e.tags) ? e.tags.join(' ').toLowerCase().includes(q) : false);
      return matchType && matchSearch;
    });
  }

  function renderTable() {
    const rows = filtered();
    if (rows.length === 0) {
      return `<p class="text-muted">No entries match.</p>`;
    }
    const tbody = rows.map(e => {
      const tags = Array.isArray(e.tags) ? e.tags.map(t => `<code style="font-size:0.75rem;margin-right:3px">${t}</code>`).join('') : '—';
      return `<tr>
        <td><a href="#/memory/${encodeURIComponent(e.id)}">${e.title || e.id || '—'}</a></td>
        <td>${memoryTypeBadge(e.type)}</td>
        <td>${tags}</td>
        <td>${confidenceBadge(e.confidence)}</td>
        <td class="text-muted" style="font-size:0.8rem">${e.source || '—'}</td>
        <td class="text-muted" style="font-size:0.8rem">${e.created_at ? timeAgo(e.created_at) : '—'}</td>
      </tr>`;
    }).join('');
    return `
      <div class="table-wrapper">
        <table class="table">
          <thead><tr>
            <th>Title</th><th>Type</th><th>Tags</th><th>Confidence</th><th>Source</th><th>Created</th>
          </tr></thead>
          <tbody>${tbody}</tbody>
        </table>
      </div>`;
  }

  function renderView() {
    const filterBtns = TYPES.map(t =>
      `<button class="memory-filter-btn${activeType === t ? ' active' : ''}" data-type="${t}">${t}</button>`
    ).join('');

    app.innerHTML = `
      <div class="view-header"><h1>Memory</h1><p>${res.total} entries in .xm/memory/</p></div>
      <div class="card">
        <input id="memory-search" type="text" placeholder="Search title, tags, why…"
          style="width:100%;background:var(--surface);border:2px solid #333;color:var(--text);padding:6px 10px;font-family:var(--font-mono);font-size:12px;margin-bottom:12px;box-sizing:border-box"
          value="${searchQuery.replace(/"/g, '&quot;')}">
        <div class="memory-filters">${filterBtns}</div>
        <div id="memory-table">${renderTable()}</div>
      </div>
    `;

    document.getElementById('memory-search').addEventListener('input', e => {
      searchQuery = e.target.value;
      document.getElementById('memory-table').innerHTML = renderTable();
    });

    app.querySelectorAll('.memory-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        activeType = btn.dataset.type;
        renderView();
      });
    });
  }

  renderView();
}

async function renderMemoryDetail(id) {
  const app = document.getElementById('app');
  app.innerHTML = `<div class="view-header"><h1>Memory</h1></div><div class="card"><p class="text-muted">Loading...</p></div>`;

  const res = await fetchJSON(apiUrl(`/memory/${encodeURIComponent(id)}`));
  if (res.error) {
    app.innerHTML = `
      <div class="view-header"><h1>Memory</h1></div>
      <div class="card"><p class="text-muted">Error: ${res.message || res.error}</p></div>
    `;
    return;
  }

  const meta = res.meta ?? {};
  const tags = Array.isArray(meta.tags) ? meta.tags.map(t => `<code style="font-size:0.75rem;margin-right:3px">${t}</code>`).join('') : '—';
  const relatedFiles = Array.isArray(meta.related_files) ? meta.related_files : [];

  app.innerHTML = `
    <div class="view-header">
      <h1>${meta.title || res.id}</h1>
      <p><a href="#/memory" style="font-size:0.85rem">&#8592; Memory</a></p>
    </div>
    <div class="card" style="margin-bottom:1rem">
      <div style="display:flex;gap:0.75rem;flex-wrap:wrap;align-items:center;margin-bottom:0.75rem">
        ${memoryTypeBadge(meta.type)}
        ${confidenceBadge(meta.confidence)}
        ${meta.source ? `<span class="text-muted" style="font-size:0.8rem;font-family:var(--font-mono)">${meta.source}</span>` : ''}
        ${meta.created_at ? `<span class="text-muted" style="font-size:0.8rem">${timeAgo(meta.created_at)}</span>` : ''}
      </div>
      ${tags !== '—' ? `<div style="margin-bottom:0.5rem"><span class="text-muted" style="font-size:0.8rem">Tags: </span>${tags}</div>` : ''}
      ${relatedFiles.length > 0 ? `<div><span class="text-muted" style="font-size:0.8rem">Related: </span>${relatedFiles.map(f => `<code style="font-size:0.75rem;margin-right:4px">${f}</code>`).join('')}</div>` : ''}
    </div>
    <div class="card markdown-body">${renderMarkdown(res.content)}</div>
  `;
}

function render404(hash) {
  document.getElementById('app').innerHTML = `
    <div class="view-header"><h1>Not Found</h1></div>
    <div class="card"><p class="text-muted">No route matched: <code>${hash}</code></p></div>
  `;
}


async function renderSearch(query) {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="view-header"><h1>Search: <code>${query}</code></h1></div>
    <div class="card"><p class="text-muted">Searching...</p></div>
  `;

  const res = await fetchJSON(apiUrl(`/search?q=${encodeURIComponent(query)}`));
  if (res.error) {
    app.innerHTML = `
      <div class="view-header"><h1>Search: <code>${query}</code></h1></div>
      <div class="card"><p class="text-muted">Error: ${res.message}</p></div>
    `;
    return;
  }

  const all = Array.isArray(res.data) ? res.data : [];

  function highlight(text, q) {
    if (!text || !q) return text || '';
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark>$1</mark>');
  }

  function groupBy(arr, key) {
    return arr.reduce((acc, item) => {
      (acc[item[key]] = acc[item[key]] || []).push(item);
      return acc;
    }, {});
  }

  if (all.length === 0) {
    app.innerHTML = `
      <div class="view-header"><h1>Search: <code>${query}</code></h1></div>
      <div class="card"><p class="text-muted">No results found for "<strong>${query}</strong>".</p></div>
    `;
    return;
  }

  const groups = groupBy(all, 'type');
  const ORDER = ['project', 'task', 'probe', 'solver', 'doc'];
  const LABELS = { project: 'Projects', task: 'Tasks', probe: 'Probes', solver: 'Solvers', doc: 'Context Docs' };

  let html = `<div class="view-header"><h1>Search: <code>${query}</code></h1><p class="text-muted">${all.length} result${all.length !== 1 ? 's' : ''}</p></div>`;

  for (const type of ORDER) {
    const items = groups[type];
    if (!items || items.length === 0) continue;
    const cards = items.map(item => {
      const name = highlight(item.name || '\u2014', query);
      const match = highlight(item.match || '', query);
      const sub = item.project ? `<span class="text-muted" style="font-size:0.8rem"> \u00b7 ${item.project}</span>` : '';
      return `
        <div style="padding:0.75rem 0;border-bottom:1px solid var(--border, #333)">
          <div><a href="${item.url}">${name}</a>${sub}</div>
          ${match ? `<div class="text-muted" style="font-size:0.82rem;margin-top:0.25rem;font-family:var(--font-mono)">${match}</div>` : ''}
        </div>`;
    }).join('');
    html += `
      <div class="card" style="margin-top:1rem">
        <h2 style="margin:0 0 0.5rem">${LABELS[type] || type} <span class="badge badge-gray">${items.length}</span></h2>
        ${cards}
      </div>`;
  }

  app.innerHTML = html;
}

// Router

const ROUTES = [
  { pattern: /^\/$/, handler: () => renderHome() },
  { pattern: /^\/projects$/, handler: () => renderProjectsList() },
  { pattern: /^\/projects\/(.+)$/, handler: (m) => renderProjectDetail(m[1]) },
  { pattern: /^\/probes$/, handler: () => renderProbesList() },
  { pattern: /^\/probes\/diff/, handler: () => renderProbeDiff() },
  { pattern: /^\/probes\/(.+)$/, handler: (m) => renderProbeDetail(m[1]) },
  { pattern: /^\/solvers$/, handler: () => renderSolversList() },
  { pattern: /^\/solvers\/(.+)$/, handler: (m) => renderSolverDetail(m[1]) },
  { pattern: /^\/ops$/, handler: () => renderOpsList() },
  { pattern: /^\/ops\/(.+)$/, handler: (m) => renderOpDetail(m[1]) },
  { pattern: /^\/config$/, handler: () => renderConfig() },
  { pattern: /^\/traces$/, handler: () => renderTracesList() },
  { pattern: /^\/traces\/(.+)$/, handler: (m) => renderTraceDetail(m[1]) },
  { pattern: /^\/memory$/, handler: () => renderMemoryList() },
  { pattern: /^\/memory\/(.+)$/, handler: (m) => renderMemoryDetail(decodeURIComponent(m[1])) },
  { pattern: /^\/search\/(.+)$/, handler: (m) => renderSearch(decodeURIComponent(m[1])) },
];

function getPath() {
  const hash = window.location.hash;
  const raw = hash.startsWith('#') ? hash.slice(1) || '/' : '/';
  try { return decodeURIComponent(raw); } catch { return raw; }
}

function updateActiveNav(path) {
  document.querySelectorAll('#nav .nav-links a').forEach((a) => {
    const route = a.getAttribute('data-route');
    const active = path === route || (route !== '/' && path.startsWith(route));
    a.classList.toggle('active', active);
    if (active) {
      a.setAttribute('aria-current', 'page');
    } else {
      a.removeAttribute('aria-current');
    }
  });
}

function route() {
  _pollSequence++;
  const path = getPath();
  updateActiveNav(path);

  for (const { pattern, handler } of ROUTES) {
    const match = path.match(pattern);
    if (match) {
      handler(match);
      return;
    }
  }

  render404(window.location.hash);
}

window.addEventListener('hashchange', route);

// Set sidebar brand to current project name
fetchJSON('/api/health').then(h => {
  if (h && !h.error && h.project) {
    const brand = document.querySelector('.nav-brand');
    if (brand) brand.textContent = h.project;
  }
});

// Inject search input into sidebar
(function() {
  const nav = document.getElementById('nav');
  if (!nav) return;
  const searchDiv = document.createElement('div');
  searchDiv.style.cssText = 'padding:8px 14px;border-bottom:2px solid #333';
  searchDiv.innerHTML = '<input type="text" id="search-input" placeholder="Search .xm..." aria-label="Search workspace" style="width:100%;background:#1a1a1a;border:2px solid #444;color:var(--text);padding:6px 10px;font-family:var(--font-mono);font-size:11px;box-sizing:border-box">';
  const navLinks = nav.querySelector('.nav-links');
  if (navLinks) {
    nav.insertBefore(searchDiv, navLinks);
  } else {
    nav.appendChild(searchDiv);
  }
  document.addEventListener('keydown', (e) => {
    if (e.target && e.target.id === 'search-input' && e.key === 'Enter') {
      const q = e.target.value.trim();
      if (q) window.location.hash = '#/search/' + encodeURIComponent(q);
    }
  });
})();

// Theme toggle
(function initTheme() {
  const saved = localStorage.getItem('xm-theme');
  if (saved === 'light') document.body.classList.add('theme-light');

  const nav = document.getElementById('nav');
  if (!nav) return;
  const btn = document.createElement('button');
  btn.role = 'button';
  btn.setAttribute('aria-label', document.body.classList.contains('theme-light') ? 'Switch to dark theme' : 'Switch to light theme');
  btn.style.cssText = 'padding:12px 14px;border:none;border-top:2px solid #333;margin-top:auto;cursor:pointer;font-size:11px;font-family:var(--font-mono);text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted);user-select:none;background:transparent;width:100%;text-align:left';
  btn.textContent = document.body.classList.contains('theme-light') ? '● DARK' : '◐ LIGHT';
  btn.addEventListener('click', () => {
    document.body.classList.toggle('theme-light');
    const isLight = document.body.classList.contains('theme-light');
    localStorage.setItem('xm-theme', isLight ? 'light' : 'dark');
    btn.textContent = isLight ? '● DARK' : '◐ LIGHT';
    btn.setAttribute('aria-label', isLight ? 'Switch to dark theme' : 'Switch to light theme');
  });
  nav.appendChild(btn);
})();

initWorkspaces().then(() => route());
