#!/usr/bin/env node

/**
 * agent-catalog.mjs — Agent matching engine for x-kit
 * Selects the best agents for a given topic from catalog.json.
 *
 * Usage:
 *   node agent-catalog.mjs match "결제 API 설계" --count 5
 *   node agent-catalog.mjs list
 *   node agent-catalog.mjs get security --slim
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAgentCount } from './shared-config.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Paths ─────────────────────────────────────────────────────────────

const PLUGIN_ROOT = join(__dirname, '..');
const CATALOG_PATH = join(PLUGIN_ROOT, 'agents', 'catalog.json');
const RULES_DIR = join(PLUGIN_ROOT, 'agents', 'rules');
const SLIM_DIR = join(PLUGIN_ROOT, 'agents', 'slim');

// ── Stopwords ─────────────────────────────────────────────────────────

const KO_STOPWORDS = new Set([
  '을', '를', '이', '가', '은', '는', '의', '에', '에서',
  '로', '으로', '와', '과', '도', '만', '까지', '부터',
  '위한', '대한', '하는', '있는', '없는', '되는',
]);

const EN_STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'can', 'for', 'to', 'of', 'in', 'on', 'at',
  'by', 'with', 'from', 'this', 'that', 'these', 'those', 'how', 'what',
  'why', 'which', 'who',
]);

// ── ANSI Colors ──────────────────────────────────────────────────────

const isTTY = process.stdout.isTTY && !process.env.NO_COLOR;
const C = isTTY ? {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m',
} : Object.fromEntries(
  ['reset', 'bold', 'dim', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan']
    .map(k => [k, ''])
);

// ── Korean → English keyword mapping ─────────────────────────────────

const KO_EN_MAP = new Map([
  // Security
  ['보안', 'security'], ['취약점', 'vulnerability'], ['인증', 'authentication'],
  ['인가', 'authorization'], ['암호화', 'encryption'], ['해킹', 'security'],
  ['공격', 'attack'], ['방어', 'security'], ['위협', 'threat-modeling'],
  // API & Backend
  ['결제', 'payment'], ['api', 'api'], ['설계', 'design'], ['서버', 'backend'],
  ['백엔드', 'backend'], ['프론트엔드', 'frontend'], ['프론트', 'frontend'],
  // Database
  ['데이터베이스', 'database'], ['디비', 'database'], ['스키마', 'schema'],
  ['쿼리', 'sql'], ['인덱스', 'database'], ['마이그레이션', 'migration'],
  // DevOps & Infra
  ['배포', 'deployment'], ['인프라', 'infrastructure'], ['컨테이너', 'docker'],
  ['쿠버네티스', 'kubernetes'], ['모니터링', 'monitoring'], ['로그', 'observability'],
  ['파이프라인', 'cicd'], ['자동화', 'automation'],
  // Performance
  ['성능', 'performance'], ['최적화', 'optimization'], ['느린', 'performance'],
  ['병목', 'bottleneck'], ['캐시', 'cache'], ['지연', 'latency'],
  // Testing & QA
  ['테스트', 'testing'], ['품질', 'qa'], ['버그', 'bug'], ['디버깅', 'debugging'],
  // Architecture
  ['아키텍처', 'architecture'], ['구조', 'architecture'], ['리팩토링', 'refactoring'],
  ['패턴', 'design-pattern'], ['모듈', 'module'],
  // Data
  ['데이터', 'data'], ['시각화', 'data-visualization'],
  ['대시보드', 'dashboard'], ['파이프', 'data-engineering'],
  // Mobile
  ['모바일', 'mobile'], ['앱', 'mobile'], ['ios', 'ios'], ['안드로이드', 'android'],
  // Frontend
  ['컴포넌트', 'frontend'], ['ui', 'frontend'], ['ux', 'ux'],
  ['접근성', 'a11y'], ['반응형', 'responsive'],
  // Docs
  ['문서', 'documentation'], ['readme', 'readme'], ['가이드', 'documentation'],
  // Compliance
  ['규정', 'compliance'], ['준수', 'compliance'], ['개인정보', 'privacy'],
  ['감사', 'audit'], ['gdpr', 'gdpr'],
  // Cost
  ['비용', 'cost'], ['클라우드', 'cloud'], ['절감', 'finops'],
  // Blockchain
  ['블록체인', 'blockchain'], ['스마트컨트랙트', 'smart-contract'], ['웹3', 'web3'],
  // ML/AI
  ['머신러닝', 'mlops'], ['모델', 'ml'], ['학습', 'ml'],
  // Game
  ['게임', 'gamedev'], ['물리엔진', 'physics'],
  // i18n
  ['번역', 'i18n'], ['다국어', 'i18n'], ['국제화', 'i18n'],
  // Code quality & review
  ['리뷰', 'review'], ['코드리뷰', 'code-review'], ['리팩터링', 'refactoring'],
  ['자동화', 'automation'], ['린트', 'lint'], ['정적분석', 'static-analysis'],
  // Microservices & architecture
  ['마이크로서비스', 'microservice'], ['서비스메시', 'service-mesh'],
  ['이벤트', 'event-driven'], ['메시지큐', 'message-queue'],
  // Monitoring & observability
  ['모니터링', 'monitoring'], ['로그', 'logging'], ['로깅', 'logging'],
  ['알림', 'alerting'], ['관측', 'observability'], ['추적', 'tracing'],
  // CI/CD
  ['cicd', 'cicd'], ['ci', 'cicd'], ['cd', 'cicd'],
  ['빌드', 'build'], ['배포', 'deployment'], ['테라폼', 'terraform'],
  // Containers
  ['도커', 'docker'], ['컨테이너', 'docker'], ['쿠버네티스', 'kubernetes'],
  ['k8s', 'kubernetes'], ['헬름', 'helm'],
]);

// ── English synonym expansion (common terms → catalog tag terms) ─────

const EN_SYNONYM_MAP = new Map([
  ['react', 'frontend'], ['vue', 'frontend'], ['svelte', 'frontend'],
  ['nextjs', 'frontend'], ['angular', 'frontend'],
  ['spring', 'backend'], ['django', 'backend'], ['express', 'backend'],
  ['microservice', 'backend'], ['microservices', 'backend'],
  ['graphql', 'graphql'], ['grpc', 'grpc'], ['rest', 'rest'],
  ['postgresql', 'database'], ['postgres', 'database'], ['mysql', 'database'],
  ['redis', 'database'], ['mongodb', 'database'],
  ['docker', 'docker'], ['container', 'docker'],
  ['terraform', 'terraform'], ['ansible', 'infrastructure'],
  ['cicd', 'cicd'], ['ci/cd', 'cicd'], ['pipeline', 'cicd'],
  ['github', 'cicd'], ['jenkins', 'cicd'],
  ['monitoring', 'monitoring'], ['logging', 'observability'],
  ['prometheus', 'monitoring'], ['grafana', 'monitoring'],
  ['sentry', 'monitoring'], ['datadog', 'monitoring'],
  ['review', 'code-review'], ['refactoring', 'refactoring'],
  ['testing', 'testing'], ['jest', 'testing'], ['pytest', 'testing'],
  ['flutter', 'mobile'], ['swift', 'ios'], ['kotlin', 'android'],
  ['owasp', 'owasp'], ['injection', 'security'], ['xss', 'security'],
  ['gdpr', 'gdpr'], ['hipaa', 'hipaa'], ['soc2', 'soc2'],
  ['pci', 'compliance'], ['audit', 'audit'],
]);

// ── Internal helpers ──────────────────────────────────────────────────

function loadCatalog(tier = null) {
  if (!existsSync(CATALOG_PATH)) {
    throw new Error(`Catalog not found: ${CATALOG_PATH}`);
  }
  const raw = JSON.parse(readFileSync(CATALOG_PATH, 'utf8'));
  const agents = raw.agents ?? [];
  if (tier === null) return agents;
  return agents.filter(a => a.tier === tier);
}

/**
 * Extract meaningful keywords from a topic string.
 * Splits on whitespace/punctuation, lowercases, removes stopwords.
 */
function extractKeywords(topic) {
  const tokens = topic
    .split(/[\s,;:!?\/\(\)\[\]]+/)
    .map(t => t.toLowerCase())
    .filter(t => t.length > 0);

  const filtered = tokens.filter(t => !KO_STOPWORDS.has(t) && !EN_STOPWORDS.has(t));

  // Expand keywords to catalog-matching terms
  const expanded = new Set(filtered);
  for (const kw of filtered) {
    // Korean → English
    const koEn = KO_EN_MAP.get(kw);
    if (koEn) expanded.add(koEn);
    // English → catalog tag synonym
    const enSyn = EN_SYNONYM_MAP.get(kw);
    if (enSyn) expanded.add(enSyn);
  }
  return [...expanded];
}

/**
 * Check if two terms match at word boundaries.
 * Returns match strength: 'exact' | 'partial' | null
 * - "api" matches "api" → 'exact'
 * - "optimization" matches "gas-optimization" → 'partial' (compound part)
 * - "optimization" matches "optimization" → 'exact'
 */
function wordMatch(term, target) {
  if (term === target) return 'exact';
  const parts = target.split('-');
  if (parts.length > 1 && parts.includes(term)) return 'partial';
  return null;
}

/**
 * Compute relevance score for one agent against a set of keywords.
 * - tag exact match:   +3 per keyword matching a tag (word-boundary)
 * - name match:        +5 if keyword matches agent name (word-boundary)
 * - description match: +2 per keyword found in description
 */
function scoreAgent(agent, keywords) {
  const nameLower = agent.name.toLowerCase();
  const nameParts = nameLower.split('-');
  const descLower = (agent.description ?? '').toLowerCase();
  const tags = (agent.tags ?? []).map(t => t.toLowerCase());

  let score = 0;
  for (const kw of keywords) {
    // Name match — word boundary
    if (nameLower === kw || nameParts.includes(kw)) {
      score += 5;
    }
    // Tag matches — word boundary with strength
    for (const tag of tags) {
      const match = wordMatch(kw, tag);
      if (match === 'exact') {
        score += 3;
        break;
      } else if (match === 'partial') {
        score += 1; // compound tag partial match: low score
        break;
      }
    }
    // Description match — only for specific keywords (4+ chars or mapped English terms)
    // Short generic Korean words like "보안", "최적화" match too many descriptions
    const isEnglish = /^[a-z]/.test(kw);
    const isSpecific = isEnglish ? kw.length >= 4 : kw.length >= 4;
    if (isSpecific && descLower.includes(kw)) {
      score += 2;
    }
  }
  return score;
}

/**
 * Infer a broad domain from an agent based on its tags.
 * Used for the contrarian diversity check.
 */
function inferDomain(agent) {
  const tags = agent.tags ?? [];
  const domainMap = [
    ['cloud',      ['aws', 'eks', 'oke', 'kubernetes', 'k8s', 'terraform', 'devops', 'serverless', 'finops']],
    ['data',       ['data-engineering', 'etl', 'elt', 'airflow', 'dbt', 'data-warehouse', 'data-visualization', 'dashboard']],
    ['frontend',   ['frontend', 'react', 'vue', 'svelte', 'ux', 'design-system', 'a11y']],
    ['mobile',     ['mobile', 'ios', 'android', 'flutter', 'react-native']],
    ['security',   ['security', 'vulnerability', 'owasp', 'compliance', 'gdpr', 'hipaa']],
    ['backend',    ['api', 'rest', 'graphql', 'database', 'schema', 'sql', 'event-driven', 'cqrs']],
    ['ai',         ['llm', 'agent', 'prompt-engineering', 'rag', 'mlops', 'ml-pipeline']],
    ['quality',    ['testing', 'qa', 'code-review', 'refactoring', 'deslop']],
    ['platform',   ['blockchain', 'web3', 'embedded', 'iot', 'gamedev']],
  ];

  for (const [domain, markers] of domainMap) {
    if (tags.some(tag => markers.includes(tag))) return domain;
  }
  return 'other';
}

// ── Public API ────────────────────────────────────────────────────────

/**
 * Match the best agents for a given topic.
 *
 * @param {string}  topic   - Natural-language topic string
 * @param {number}  count   - Number of agents to return
 * @param {boolean} all     - If true, include domain-tier agents; otherwise core only
 * @returns {Array<{name, description, tags, score}>}
 */
export function matchAgents(topic, count = 3, all = false) {
  const agents = loadCatalog(all ? null : 'core');
  const keywords = extractKeywords(topic);

  if (keywords.length === 0) {
    // No meaningful keywords — return first N agents
    return agents.slice(0, count).map(a => ({ ...a, score: 0 }));
  }

  // Score all agents
  const scored = agents.map(agent => ({
    ...agent,
    score: scoreAgent(agent, keywords),
  }));

  // Sort by score descending, then name ascending for stable order
  scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  // Filter: minimum score threshold (no zero-score padding)
  const MIN_SCORE = 2;
  const relevant = scored.filter(a => a.score >= MIN_SCORE);
  const top = relevant.slice(0, count);
  // If fewer than count pass threshold, return only what's relevant (no noise padding)

  // Contrarian diversity check:
  // If all top agents share the same domain AND we have at least 2 slots,
  // replace the last slot with the highest-scoring agent from a different domain
  // ONLY if the contrarian also meets the minimum score threshold.
  if (top.length >= 2) {
    const domains = top.map(a => inferDomain(a));
    const allSameDomain = domains.every(d => d === domains[0]);

    if (allSameDomain) {
      const topDomain = domains[0];
      const contrarian = scored.find(a => inferDomain(a) !== topDomain && a.score >= MIN_SCORE);
      if (contrarian) {
        top[top.length - 1] = contrarian;
      }
    }
  }

  return top;
}

/**
 * Read the full prompt for a named agent.
 *
 * When slim=true, first checks the catalog's system_prompt field and returns
 * it directly if present. Falls back to reading the slim/ file if missing.
 * When slim=false, always reads from rules/.
 *
 * @param {string}  agentName - Agent name (e.g. "security")
 * @param {boolean} slim      - If true, prefer catalog system_prompt then slim/; otherwise rules/
 * @returns {string} Prompt content
 */
export function getAgentPrompt(agentName, slim = false) {
  const agents = loadCatalog();
  const agent = agents.find(a => a.name === agentName);

  if (!agent) {
    throw new Error(`Agent not found in catalog: ${agentName}`);
  }

  // When slim mode: use inline system_prompt from catalog if available
  if (slim && agent.system_prompt) {
    return agent.system_prompt;
  }

  const baseDir = slim ? SLIM_DIR : RULES_DIR;
  const filePath = join(baseDir, agent.file);

  if (!existsSync(filePath)) {
    const variant = slim ? 'slim' : 'rules';
    throw new Error(`Agent file not found (${variant}): ${filePath}`);
  }

  return readFileSync(filePath, 'utf8');
}

/**
 * List all agents from the catalog.
 *
 * @returns {Array<{name, description, tags}>}
 */
export function listAgents() {
  const agents = loadCatalog();
  return agents.map(({ name, description, tags }) => ({ name, description, tags }));
}

// ── CLI ──────────────────────────────────────────────────────────────

function printUsage() {
  console.log(`
${C.bold}agent-catalog${C.reset} — x-kit agent matching engine

${C.bold}USAGE${C.reset}
  node agent-catalog.mjs match <topic> [--count N]
  node agent-catalog.mjs list
  node agent-catalog.mjs get <agent-name> [--slim]

${C.bold}COMMANDS${C.reset}
  ${C.cyan}match${C.reset} <topic>       Find best agents for a topic
  ${C.cyan}list${C.reset}               List all available agents
  ${C.cyan}get${C.reset} <name>         Print agent prompt (--slim for slim variant)

${C.bold}OPTIONS${C.reset}
  --count N          Number of agents to return (default: 3)
  --all              Include domain-tier agents (default: core only)
  --slim             Read from slim/ directory instead of rules/

${C.bold}EXAMPLES${C.reset}
  node agent-catalog.mjs match "결제 API 설계" --count 5
  node agent-catalog.mjs list
  node agent-catalog.mjs get security --slim
`);
}

function parseArgs(argv) {
  let defaultCount;
  try { defaultCount = getAgentCount(); } catch { defaultCount = 4; }
  const args = { command: null, topic: null, agentName: null, count: defaultCount, slim: false, all: false };
  const rest = argv.slice(2);

  args.command = rest[0] ?? null;

  for (let i = 1; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === '--count' || arg === '-n') {
      const val = parseInt(rest[i + 1], 10);
      if (!isNaN(val) && val > 0) {
        args.count = val;
        i++;
      }
    } else if (arg === '--slim') {
      args.slim = true;
    } else if (arg === '--all') {
      args.all = true;
    } else if (!arg.startsWith('--')) {
      if (args.command === 'match' && args.topic === null) {
        args.topic = arg;
      } else if (args.command === 'get' && args.agentName === null) {
        args.agentName = arg;
      }
    }
  }

  return args;
}

function runCLI() {
  const args = parseArgs(process.argv);

  if (!args.command || args.command === '--help' || args.command === '-h') {
    printUsage();
    process.exit(0);
  }

  try {
    if (args.command === 'match') {
      if (!args.topic) {
        console.error(`${C.red}Error:${C.reset} Topic is required. Usage: match <topic> [--count N]`);
        process.exit(1);
      }

      const keywords = extractKeywords(args.topic);
      const results = matchAgents(args.topic, args.count, args.all);

      console.log(`\n${C.bold}Topic:${C.reset} ${args.topic}`);
      console.log(`${C.dim}Keywords: ${keywords.join(', ') || '(none)'}${C.reset}`);
      console.log(`${C.bold}Top ${results.length} agent(s):${C.reset}\n`);

      results.forEach((agent, idx) => {
        const scoreStr = agent.score > 0
          ? `${C.green}score: ${agent.score}${C.reset}`
          : `${C.dim}score: 0${C.reset}`;
        console.log(`  ${C.bold}${idx + 1}. ${C.cyan}${agent.name}${C.reset}  (${scoreStr})`);
        console.log(`     ${agent.description}`);
        if (agent.tags?.length) {
          console.log(`     ${C.dim}tags: ${agent.tags.join(', ')}${C.reset}`);
        }
        console.log();
      });

    } else if (args.command === 'list') {
      const agents = listAgents();
      console.log(`\n${C.bold}Available agents (${agents.length}):${C.reset}\n`);
      agents.forEach(agent => {
        console.log(`  ${C.cyan}${agent.name.padEnd(22)}${C.reset} ${agent.description}`);
        if (agent.tags?.length) {
          console.log(`  ${''.padEnd(22)} ${C.dim}${agent.tags.join(', ')}${C.reset}`);
        }
      });
      console.log();

    } else if (args.command === 'get') {
      if (!args.agentName) {
        console.error(`${C.red}Error:${C.reset} Agent name is required. Usage: get <name> [--slim]`);
        process.exit(1);
      }

      const content = getAgentPrompt(args.agentName, args.slim);
      process.stdout.write(content);

    } else {
      console.error(`${C.red}Error:${C.reset} Unknown command: ${args.command}`);
      printUsage();
      process.exit(1);
    }
  } catch (err) {
    console.error(`${C.red}Error:${C.reset} ${err.message}`);
    process.exit(1);
  }
}

// Run CLI only when executed directly
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  runCLI();
}
