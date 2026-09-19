// Analyze saved A/B measurements; no new model calls.
import { readFileSync, writeFileSync } from 'node:fs';
import { loadCase } from '../lib/fixtures.js';
import { runAllChecks } from '../lib/checks.js';

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error('Usage: node analyze_latency_ab.mjs input.json output.json');
const report = JSON.parse(readFileSync(input, 'utf8'));
if (!report.finished_at) throw new Error('Wait for the live run to finish');
const median = (items) => {
  const values = [...items].sort((a, b) => a - b), mid = Math.floor(values.length / 2);
  return values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
};
const normalized = (result) => ({ ...result, recommendations: result.recommendations.map((item) => ({
  ...item, status: item.status.toUpperCase(), failure_code: item.failure_code?.toUpperCase() ?? null,
  excerpts: item.excerpts.map((e) => ({ ...e, source: e.source.toUpperCase() })),
})) });
const checks = report.runs.filter((row) => row.scenario.startsWith('E')).map((row) => {
  const fixture = loadCase(row.scenario);
  return { scenario: row.scenario, variant: row.variant,
    ...runAllChecks(normalized(row.result), fixture.request, fixture.expectations) };
});
const pairs = [];
const successfulPairs = {};
for (const before of report.runs.filter((row) => row.variant === 'before')) {
  const after = report.runs.find((row) => row.variant === 'after' && row.scenario === before.scenario && row.repeat === before.repeat);
  const b = new Map(before.result.recommendations.map((r) => [r.candidate_user_id, r]));
  const a = new Map(after.result.recommendations.map((r) => [r.candidate_user_id, r]));
  const changed = [...b.keys()].filter((id) => b.get(id).status !== a.get(id).status);
  const scoreChanges = [...b.keys()].filter((id) => b.get(id).score !== null && a.get(id).score !== null)
    .map((id) => Math.abs(b.get(id).score - a.get(id).score));
  const top = (rows) => rows.result.recommendations.filter((r) => r.status === 'evaluated').slice(0, 3).map((r) => r.candidate_user_id);
  const beforeTop = top(before), afterTop = top(after);
  if (!before.statuses.FAILED && !after.statuses.FAILED
      && before.returned === before.candidates && after.returned === after.candidates) {
    (successfulPairs[before.scenario] ??= []).push({ repeat: before.repeat, before_ms: before.wall_ms, after_ms: after.wall_ms });
  }
  pairs.push({ scenario: before.scenario, repeat: before.repeat,
    changed_status: changed.map((id) => ({ id, before: b.get(id).status, after: a.get(id).status })),
    mean_absolute_score_change: scoreChanges.length ? scoreChanges.reduce((s, v) => s + v, 0) / scoreChanges.length : null,
    top3_before: beforeTop, top3_after: afterTop, top3_overlap: beforeTop.filter((id) => afterTop.includes(id)).length,
    changed_intent_conflict: [...b.keys()].filter((id) => b.get(id).intent_conflict !== a.get(id).intent_conflict),
  });
}
const aggregates = Object.fromEntries(['before', 'after'].map((variant) => {
  const runs = report.runs.filter((row) => row.variant === variant), items = runs.flatMap((row) => row.result.recommendations);
  const reasons = items.filter((r) => r.reason).map((r) => r.reason.length);
  return [variant, { logical_runs: runs.length, candidates: items.length,
    gateway_calls: runs.reduce((n, r) => n + r.gateway_calls, 0),
    input_tokens: runs.reduce((n, r) => n + r.usage.input_tokens, 0),
    output_tokens: runs.reduce((n, r) => n + r.usage.output_tokens, 0),
    failures: items.filter((r) => r.status === 'failed').length,
    insufficient: items.filter((r) => r.status === 'insufficient_evidence').length,
    unverified_excerpts: items.flatMap((r) => r.excerpts).filter((e) => !e.verified).length,
    reason_chars_median: median(reasons),
    reason_over_90_chars: reasons.filter((v) => v > 90).length,
    warm_ms_median: median(runs.filter((r) => r.warm_ms != null).map((r) => r.warm_ms)),
    warm_gateway_calls: runs.reduce((n, r) => n + (r.warm_gateway_calls ?? 0), 0),
  }];
}));
const successfulSummary = Object.fromEntries(Object.entries(successfulPairs).map(([scenario, rows]) => {
  const before = median(rows.map((r) => r.before_ms)), after = median(rows.map((r) => r.after_ms));
  return [scenario, { paired_runs: rows.length, before_median_ms: before, after_median_ms: after,
    reduction_percent: 100 * (1 - after / before), rows }];
}));
// Delivery is a schedule calculation from measured cache-ready times, not a
// device/browser timing claim. t=0 is the first pending response; zero network
// overhead, visible app, continuous re-observations for the old 15-second path.
const delivery = Object.fromEntries(Object.keys(report.summary).filter((name) => name.startsWith('crowd-')).map((scenario) => {
  const repeats = new Set((successfulPairs[scenario] ?? []).map((r) => r.repeat));
  const rows = report.runs.filter((r) => r.scenario === scenario && repeats.has(r.repeat));
  const intervals = { before: 15000, after: 1000 };
  const times = (variant, interval) => rows.filter((r) => r.variant === variant).map((row) =>
    Math.ceil(Math.max(...row.cached_candidates_at.map((v) => v.stored_ms)) / interval) * interval);
  const before = times('before', intervals.before), after = times('after', intervals.after);
  return [scenario, { before_poll_ms: before, after_poll_ms: after,
    before_median_ms: median(before), after_median_ms: median(after),
    reduction_percent: 100 * (1 - median(after) / median(before)),
    interval_only_before_model_ms: times('before', 1000),
  }];
}));
const result = { input, live_generation_calls_in_this_analysis: 0, summary_including_failed: report.summary,
  successful_paired_summary: successfulSummary,
  aggregates, quality_checks: checks, paired_output_changes: pairs,
  delivery_schedule: { assumptions: 'Calculated from measured cache readiness. First pending at t=0, zero HTTP/device overhead, visible app; old path assumes continued observations. Not real-device end-to-end measurements.', scenarios: delivery } };
writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ aggregates, quality_checks: checks.map(({ scenario, variant, pass, reason }) => ({ scenario, variant, pass, reason })), successful_paired_summary: successfulSummary, delivery }, null, 2));
