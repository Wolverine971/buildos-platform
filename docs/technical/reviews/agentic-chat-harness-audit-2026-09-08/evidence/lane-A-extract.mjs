// docs/technical/reviews/agentic-chat-harness-audit-2026-09-08/evidence/lane-A-extract.mjs
// Extract string-array constants from TS sources by bracket matching and eval them.
import fs from 'node:fs';
const root = '/Users/djwayne/buildos-platform/';
export function read(p) {
	return fs.readFileSync(root + p, 'utf8');
}
export function sliceBlock(src, startMarker, open = '[', close = ']') {
	const i = src.indexOf(startMarker);
	if (i < 0) throw new Error('marker not found: ' + startMarker);
	const s = src.indexOf(open, i + startMarker.length - (startMarker.endsWith(open) ? 1 : 0));
	let depth = 0;
	let inStr = null;
	let esc = false;
	for (let j = s; j < src.length; j++) {
		const c = src[j];
		if (inStr) {
			if (esc) {
				esc = false;
				continue;
			}
			if (c === '\\') {
				esc = true;
				continue;
			}
			if (c === inStr) {
				inStr = null;
			}
			continue;
		}
		if (c === "'" || c === '"' || c === '`') {
			inStr = c;
			continue;
		}
		if (c === open) depth++;
		else if (c === close) {
			depth--;
			if (depth === 0) return src.slice(s, j + 1);
		}
	}
	throw new Error('unbalanced');
}
export function evalArr(block, scope = {}) {
	const keys = Object.keys(scope);
	const vals = keys.map((k) => scope[k]);
	return new Function(...keys, 'return (' + block + ');')(...vals);
}
export const est = (s) => Math.ceil(s.length / 4);
export function sliceString(src, marker) {
	const i = src.indexOf(marker);
	if (i < 0) throw new Error('marker not found: ' + marker);
	let s = i + marker.length;
	while (/\s/.test(src[s])) s++;
	const q = src[s];
	if (!'\'"`'.includes(q)) throw new Error('not a string at ' + marker);
	let out = '';
	let esc = false;
	for (let j = s + 1; j < src.length; j++) {
		const c = src[j];
		if (esc) {
			out += c === 'n' ? '\n' : c;
			esc = false;
			continue;
		}
		if (c === '\\') {
			esc = true;
			continue;
		}
		if (c === q) return out;
		out += c;
	}
	throw new Error('unterminated');
}
