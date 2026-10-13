#!/usr/bin/env node
// lighthouse-gate.mjs — serve site/ locally, run Lighthouse on four pages and
// fail when accessibility or performance drops below the thresholds in
// lib/lighthouse-gate.mjs. Needs the runner from tools/lighthouse (npm ci there)
// and a Chrome binary in CHROME_PATH. Nothing is published and nothing leaves the machine.
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize } from 'node:path';
import { evaluate, medianReport } from './lib/lighthouse-gate.mjs';

const run = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = join(ROOT, 'site');
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.woff2': 'font/woff2', '.png': 'image/png' };

function resolveFile(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  let file = join(SITE, clean);
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  return file.startsWith(SITE) && existsSync(file) ? file : null;
}

const server = createServer((req, res) => {
  const file = resolveFile(req.url);
  if (!file) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});

await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}`;
// The provider page comes from the dataset, so removing one provider cannot turn this gate into a 404.
const providers = JSON.parse(readFileSync(join(ROOT, 'data/providers.json'), 'utf8')).providers;
const sample = providers.find((p) => existsSync(join(SITE, 'p', `${p.slug}.html`)));
if (!sample) { console.error('No generated provider page under site/p/: run `node scripts/build.mjs` first.'); process.exit(1); }
const pages = ['/', '/best/', '/coverage/', `/p/${sample.slug}.html`];
const lighthouse = join(ROOT, 'tools/lighthouse/node_modules/.bin/lighthouse');
const RUNS = 3;
const failures = [];
try {
  for (const page of pages) {
    // Asynchronous on purpose: a synchronous child process would block this process's event loop, and the server below could never answer Lighthouse.
    const reports = [];
    for (let i = 0; i < RUNS; i++) {
      try {
        const { stdout: out } = await run(lighthouse, [
          base + page, '--output=json', '--quiet',
          '--only-categories=accessibility,performance',
          '--chrome-flags=--headless --no-sandbox',
        ], { maxBuffer: 64 * 1024 * 1024 });
        reports.push(JSON.parse(out));
      } catch (err) {
        // Lighthouse exits non-zero when it cannot load the page; keep the log readable.
        failures.push(`${page}: Lighthouse could not measure it: ${String(err.stderr || err.message).trim().slice(0, 300)}`);
        break;
      }
    }
    if (reports.length < RUNS) continue;
    const report = medianReport(reports);
    const all = reports.map((r) => r.categories?.performance?.score).join('/');
    console.log(`${page}: median of ${RUNS} runs: performance ${report.categories.performance?.score} (runs ${all}), accessibility ${report.categories.accessibility?.score}`);
    failures.push(...evaluate(page, report));
  }
} finally {
  server.close();
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('OK — Lighthouse accessibility and performance within thresholds.');
