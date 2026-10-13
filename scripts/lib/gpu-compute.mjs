// gpu-compute.mjs — the rules of the "Free GPU compute" section (data/gpu-compute.json).
//
// The section is kept apart from the provider ranking on purpose: its entries are not
// providers of the LLM dataset, so nothing here may share a slug with a provider and
// nothing here is counted, scored or collected with them. Pure: takes the parsed section
// and the provider slugs, returns the list of errors.

export const CLAIM_FIELDS = ['gpu_access', 'quota', 'credit_amount', 'expires', 'card_required'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const URL_RE = /^https?:\/\/.+/;

function quoteErrors(where, q) {
  const errs = [];
  if (!q || typeof q.text !== 'string' || !q.text.trim()) errs.push(`${where}: a quotation needs its text`);
  if (!q || !URL_RE.test(q.source || '')) errs.push(`${where}: a quotation needs the provider's page as an http(s) source`);
  if (!q || !DATE_RE.test(q.read || '')) errs.push(`${where}: a quotation needs the day it was read (YYYY-MM-DD)`);
  return errs;
}

export function gpuComputeErrors(section, providerSlugs) {
  const errs = [];
  if (!section || !Array.isArray(section.entries)) return ['gpu-compute: "entries" must be an array'];
  const seen = new Set();
  for (const e of section.entries) {
    const id = `gpu-compute/${e && e.slug}`;
    if (!e || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(e.slug || '')) { errs.push(`${id}: slug must be lower-case words joined by hyphens`); continue; }
    if (seen.has(e.slug)) errs.push(`${id}: duplicate slug`);
    seen.add(e.slug);
    if (providerSlugs.has(e.slug)) errs.push(`${id}: shares its slug with a provider; this section must not mix with the provider ranking`);
    if (!e.name) errs.push(`${id}: name is required`);
    if (!URL_RE.test(e.url || '')) errs.push(`${id}: url must be the provider's page (http/https)`);
    for (const f of CLAIM_FIELDS) {
      const c = e.claims && e.claims[f];
      if (!c || !['stated', 'not_stated'].includes(c.state) || !Array.isArray(c.quotes)) { errs.push(`${id}.${f}: needs state stated/not_stated and a quotes array`); continue; }
      // A stated value must rest on a quoted sentence; "not stated" is never filled in.
      if (c.state === 'stated' && !c.quotes.length) errs.push(`${id}.${f}: stated without a quoted sentence`);
      c.quotes.forEach((q, i) => errs.push(...quoteErrors(`${id}.${f}[${i}]`, q)));
    }
    for (const f of Object.keys(e.claims || {})) if (!CLAIM_FIELDS.includes(f)) errs.push(`${id}: unknown claim "${f}"`);
  }
  for (const n of section.notes || []) {
    if (!n.subject || !n.text) errs.push('gpu-compute note: subject and text are required');
    (n.quotes || []).forEach((q, i) => errs.push(...quoteErrors(`gpu-compute note "${n.subject}"[${i}]`, q)));
  }
  return errs;
}
