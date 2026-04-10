/**
 * x-build/cost-learner — Adaptive learning engine (lazy-loaded)
 * Reads outcome data from sessions.jsonl, computes success rates per role×model,
 * and writes model_learned to shared config.
 */

import { readFileSync, existsSync } from 'node:fs';
import { metricsPath, MIN_SAMPLES } from './cost-engine.mjs';

const WINDOW_DAYS = 90;

/**
 * Aggregate outcomes from sessions.jsonl within a 90-day window.
 * Returns: { "executor:sonnet": { role, model, attempts, successes, total_retries, total_cost }, ... }
 */
export function aggregateOutcomes(windowDays = WINDOW_DAYS) {
  const cutoff = Date.now() - windowDays * 86_400_000;
  const mp = metricsPath();
  if (!existsSync(mp)) return {};

  const lines = readFileSync(mp, 'utf8').split('\n').filter(Boolean);
  const stats = {};

  for (const line of lines) {
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    if (entry.type !== 'task_complete' && entry.type !== 'task_failed') continue;
    if (new Date(entry.timestamp).getTime() < cutoff) continue;

    const role = entry.role || 'executor';
    const model = entry.model || 'sonnet';
    const key = `${role}:${model}`;

    if (!stats[key]) stats[key] = { role, model, attempts: 0, successes: 0, total_retries: 0, total_cost: 0 };
    stats[key].attempts++;
    if (entry.success === true || (entry.type === 'task_complete' && entry.success == null)) stats[key].successes++;
    stats[key].total_retries += entry.retry_count || 0;
    stats[key].total_cost += entry.cost_usd || 0;
  }

  return stats;
}

/**
 * Compute the best model for each role based on outcome data.
 * Uses success-rate weighted by retry penalty.
 * Returns: { executor: { model: "haiku", sample_count: 15, success_rate: 0.87, updated_at: "..." }, ... }
 */
export function computeModelLearned() {
  const outcomes = aggregateOutcomes();
  const learned = {};

  // Group by role
  const byRole = {};
  for (const [, stat] of Object.entries(outcomes)) {
    if (!byRole[stat.role]) byRole[stat.role] = [];
    byRole[stat.role].push(stat);
  }

  for (const [role, models] of Object.entries(byRole)) {
    // Only consider models with enough samples
    const eligible = models.filter(m => m.attempts >= MIN_SAMPLES);
    if (eligible.length === 0) continue;

    // Score: success_rate - retry_penalty (higher is better)
    let best = null;
    let bestScore = -1;

    for (const m of eligible) {
      const successRate = m.successes / m.attempts;
      const retryPenalty = Math.min(m.total_retries / m.attempts, 0.3);
      const score = successRate - retryPenalty;

      if (score > bestScore) {
        bestScore = score;
        best = m;
      }
    }

    if (best) {
      learned[role] = {
        model: best.model,
        sample_count: best.attempts,
        success_rate: best.successes / best.attempts,
        updated_at: new Date().toISOString(),
      };
    }
  }

  return learned;
}

/**
 * Update model_learned in shared config.
 * Called after task completions or on-demand.
 * @param {object} _config - current config (unused, re-read inside for freshness)
 * @param {function} writeConfigFn - fn(key, value) to persist the key
 * @returns {object|null} learned mapping, or null if no data
 */
export function updateModelLearned(_config, writeConfigFn) {
  const learned = computeModelLearned();
  if (Object.keys(learned).length === 0) return null;
  writeConfigFn('model_learned', learned);
  return learned;
}
