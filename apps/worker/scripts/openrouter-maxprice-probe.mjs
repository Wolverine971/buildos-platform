#!/usr/bin/env node
// apps/worker/scripts/openrouter-maxprice-probe.mjs
// Probe OpenRouter's real endpoint price for a model by trying max_price at
// increasing multiples of the catalog rate. Finds the smallest multiplier that
// clears the "No endpoints found that satisfy the max price" 404. Used to
// calibrate DEFAULT_SAFETY_MULTIPLIER in packages/smart-llm/src/spend-guard.ts.
//   node apps/worker/scripts/openrouter-maxprice-probe.mjs
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const env = Object.fromEntries(
	readFileSync(resolve(REPO, 'apps/worker/.env'), 'utf8')
		.split('\n')
		.map((l) => {
			const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
			return m ? [m[1], m[2].replace(/^"|"$/g, '')] : null;
		})
		.filter(Boolean)
);
const KEY = env.PRIVATE_OPENROUTER_API_KEY;
if (!KEY) throw new Error('no OpenRouter key');

const MODEL = 'z-ai/glm-5.2';
const CATALOG_PROMPT = 0.9226;
const CATALOG_COMPLETION = 2.8996;

async function probe(mult) {
	const body = {
		model: MODEL,
		messages: [{ role: 'user', content: 'Reply with the single word: ok' }],
		max_tokens: 5,
		provider:
			mult === null
				? undefined
				: {
						max_price: {
							prompt: CATALOG_PROMPT * mult,
							completion: CATALOG_COMPLETION * mult
						}
					}
	};
	const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
		method: 'POST',
		headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});
	const j = await res.json().catch(() => ({}));
	const err = j?.error?.message || null;
	const ok = res.ok && j?.choices?.[0];
	return { mult, http: res.status, ok: !!ok, err: err ? err.slice(0, 90) : null };
}

// First: no cap (baseline — what does glm-5.2 actually cost?)
const base = await fetch('https://openrouter.ai/api/v1/chat/completions', {
	method: 'POST',
	headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
	body: JSON.stringify({
		model: MODEL,
		messages: [{ role: 'user', content: 'Reply with the single word: ok' }],
		max_tokens: 5,
		usage: { include: true }
	})
});
const baseJson = await base.json().catch(() => ({}));
console.log('no-cap call http', base.status, 'ok', !!baseJson?.choices?.[0]);
console.log('usage:', JSON.stringify(baseJson?.usage || null));

for (const mult of [1, 1.25, 1.5, 2, 3, 4, 6, 8]) {
	const r = await probe(mult);
	console.log(
		`mult=${String(r.mult).padEnd(5)} price/M {p:${(CATALOG_PROMPT * r.mult).toFixed(3)}, c:${(CATALOG_COMPLETION * r.mult).toFixed(3)}} -> HTTP ${r.http} ok=${r.ok}${r.err ? ' err=' + r.err : ''}`
	);
}
