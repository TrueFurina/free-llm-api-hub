import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { gpuComputeErrors, CLAIM_FIELDS } from './lib/gpu-compute.mjs';
import { providerFigures } from './lib/figures.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const providers = JSON.parse(readFileSync(join(ROOT, 'data/providers.json'), 'utf8')).providers;
const slugs = new Set(providers.map((p) => p.slug));
const section = () => JSON.parse(readFileSync(join(ROOT, 'data/gpu-compute.json'), 'utf8'));
const claim = (state, quotes = []) => ({ state, quotes });
const entry = (over = {}) => ({
  slug: 'example-gpu', name: 'Example', url: 'https://example.com/faq', kind: 'notebook',
  claims: Object.fromEntries(CLAIM_FIELDS.map((f) => [f, claim('not_stated')])), ...over,
});

test('the section exists and passes its own rules', () => {
  assert.ok(existsSync(join(ROOT, 'data/gpu-compute.json')), 'data/gpu-compute.json is missing');
  assert.deepEqual(gpuComputeErrors(section(), slugs), []);
});

test('the section enters no provider count, no slug and no figure', () => {
  const s = section();
  assert.ok(s.entries.length > 0);
  for (const e of s.entries) assert.ok(!slugs.has(e.slug), `${e.slug} is also a provider`);
  // The provider figures come from providers.json alone, so the section is not counted.
  assert.equal(providerFigures(providers).providers, providers.length);
  // The committed outputs that carry the provider count do not list the section's entries as providers.
  const home = readFileSync(join(ROOT, 'site/index.html'), 'utf8');
  for (const e of s.entries) assert.ok(!home.includes(`/p/${e.slug}`), `${e.slug} must not have a provider page link on the home`);
});

test('a slug shared with a provider is rejected', () => {
  const errs = gpuComputeErrors({ entries: [entry({ slug: providers[0].slug })] }, slugs);
  assert.ok(errs.some((m) => /shares its slug with a provider/.test(m)));
});

test('a stated value without a quoted sentence is rejected', () => {
  const e = entry();
  e.claims.quota = claim('stated', []);
  assert.ok(gpuComputeErrors({ entries: [e] }, slugs).some((m) => /stated without a quoted sentence/.test(m)));
});

test('a quotation without a source or a read date is rejected', () => {
  const e = entry();
  e.claims.expires = claim('not_stated', [{ text: 'they expire in 90 days' }]);
  const errs = gpuComputeErrors({ entries: [e] }, slugs);
  assert.ok(errs.some((m) => /source/.test(m)) && errs.some((m) => /day it was read/.test(m)));
});

test('a missing or unknown claim field is rejected', () => {
  const e = entry();
  delete e.claims.card_required;
  e.claims.price = claim('not_stated');
  const errs = gpuComputeErrors({ entries: [e] }, slugs);
  assert.ok(errs.some((m) => /card_required/.test(m)) && errs.some((m) => /unknown claim "price"/.test(m)));
});

test('fal.ai keeps both of its contradicting expiry sentences and no invented value', () => {
  const fal = section().entries.find((e) => e.slug === 'fal-ai');
  assert.equal(fal.claims.expires.state, 'not_stated');
  const texts = fal.claims.expires.quotes.map((q) => q.text).join(' | ');
  assert.match(texts, /expire in 90 days/);
  assert.match(texts, /ranging from 1 week to 1 year/);
  for (const f of ['credit_amount', 'card_required']) assert.equal(fal.claims[f].state, 'not_stated');
});
