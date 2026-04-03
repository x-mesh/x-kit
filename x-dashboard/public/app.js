// Utility functions

function timeAgo(isoString) {
  if (!isoString) return '—';
  const diff = Date.now() - new Date(isoString).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function phaseBadge(phase) {
  const classes = {
    '01': 'phase-01',
    '02': 'phase-02',
    '03': 'phase-03',
    '04': 'phase-04',
    '05': 'phase-05',
  };
  const cls = classes[phase] || 'phase-01';
  return `<span class="badge ${cls}">${phase}</span>`;
}

function nullSafe(value) {
  return value === null || value === undefined ? '—' : value;
}

async function fetchJSON(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error('fetchJSON error:', url, err);
    return null;
  }
}

function startPolling(fetchFn, intervalMs = 3000) {
  fetchFn();
  const id = setInterval(fetchFn, intervalMs);
  return () => clearInterval(id);
}

// View render functions

function renderHome() {
  document.getElementById('app').innerHTML = `
    <div class="view-header"><h1>Home</h1></div>
    <div class="card"><p class="text-muted">Loading home...</p></div>
  `;
}

function renderProjectsList() {
  document.getElementById('app').innerHTML = `
    <div class="view-header"><h1>Projects</h1></div>
    <div class="card"><p class="text-muted">Loading projects...</p></div>
  `;
}

function renderProjectDetail(slug) {
  document.getElementById('app').innerHTML = `
    <div class="view-header"><h1>Project: <code>${slug}</code></h1></div>
    <div class="card"><p class="text-muted">Loading project...</p></div>
  `;
}

function renderProbesList() {
  document.getElementById('app').innerHTML = `
    <div class="view-header"><h1>Probes</h1></div>
    <div class="card"><p class="text-muted">Loading probes...</p></div>
  `;
}

function renderProbeDetail(file) {
  document.getElementById('app').innerHTML = `
    <div class="view-header"><h1>Probe: <code>${file}</code></h1></div>
    <div class="card"><p class="text-muted">Loading probe...</p></div>
  `;
}

function renderSolversList() {
  document.getElementById('app').innerHTML = `
    <div class="view-header"><h1>Solvers</h1></div>
    <div class="card"><p class="text-muted">Loading solvers...</p></div>
  `;
}

function renderSolverDetail(slug) {
  document.getElementById('app').innerHTML = `
    <div class="view-header"><h1>Solver: <code>${slug}</code></h1></div>
    <div class="card"><p class="text-muted">Loading solver...</p></div>
  `;
}

function renderConfig() {
  document.getElementById('app').innerHTML = `
    <div class="view-header"><h1>Config</h1></div>
    <div class="card"><p class="text-muted">Loading config...</p></div>
  `;
}

function render404(hash) {
  document.getElementById('app').innerHTML = `
    <div class="view-header"><h1>Not Found</h1></div>
    <div class="card"><p class="text-muted">No route matched: <code>${hash}</code></p></div>
  `;
}

// Router

const ROUTES = [
  { pattern: /^\/$/, handler: () => renderHome() },
  { pattern: /^\/projects$/, handler: () => renderProjectsList() },
  { pattern: /^\/projects\/(.+)$/, handler: (m) => renderProjectDetail(m[1]) },
  { pattern: /^\/probes$/, handler: () => renderProbesList() },
  { pattern: /^\/probes\/(.+)$/, handler: (m) => renderProbeDetail(m[1]) },
  { pattern: /^\/solvers$/, handler: () => renderSolversList() },
  { pattern: /^\/solvers\/(.+)$/, handler: (m) => renderSolverDetail(m[1]) },
  { pattern: /^\/config$/, handler: () => renderConfig() },
];

function getPath() {
  const hash = window.location.hash;
  return hash.startsWith('#') ? hash.slice(1) || '/' : '/';
}

function updateActiveNav(path) {
  document.querySelectorAll('#nav .nav-links a').forEach((a) => {
    const route = a.getAttribute('data-route');
    const active = path === route || (route !== '/' && path.startsWith(route));
    a.classList.toggle('active', active);
  });
}

function route() {
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
route();
