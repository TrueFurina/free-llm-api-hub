// lighthouse-gate.mjs — the pass/fail rule for the Lighthouse + accessibility CI gate.
//
// Pure on purpose: it takes parsed Lighthouse reports and a thresholds object and
// returns the failures, so the rule is unit-tested without a browser.
// A category that is missing or has a null score (Lighthouse could not compute it)
// is a failure, never a pass: "no score" must not read as "fine".

export const THRESHOLDS = Object.freeze({ accessibility: 0.95, performance: 0.8 });

export function evaluate(url, report, thresholds = THRESHOLDS) {
  const failures = [];
  const categories = (report && report.categories) || {};
  for (const [name, minimum] of Object.entries(thresholds)) {
    const score = categories[name] ? categories[name].score : undefined;
    if (typeof score !== 'number') {
      failures.push(`${url}: ${name} has no score`);
    } else if (score < minimum) {
      failures.push(`${url}: ${name} ${score.toFixed(2)} is below ${minimum.toFixed(2)}`);
    }
  }
  return failures;
}

// Lighthouse performance moves between runs on a shared runner (the home page scored
// 0.78 and then 0.91 in two CI runs of the same commit), so the gate judges the median
// of several runs. The result has the shape evaluate() reads.
export function medianReport(reports) {
  const names = new Set(reports.flatMap((r) => Object.keys((r && r.categories) || {})));
  const categories = {};
  for (const name of names) {
    const scores = reports.map((r) => r && r.categories && r.categories[name] && r.categories[name].score);
    // One run without a score makes the median unreliable: keep it as "no score".
    if (scores.some((x) => typeof x !== 'number')) { categories[name] = { score: null }; continue; }
    const sorted = [...scores].sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    categories[name] = { score: sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2 };
  }
  return { categories };
}
