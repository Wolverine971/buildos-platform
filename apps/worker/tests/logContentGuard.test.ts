// apps/worker/tests/logContentGuard.test.ts
/**
 * Log guard: server logs must never carry user content (chat, email, calendar, documents,
 * voice). This scans code, not user text: it fails when a console.* / *logger.* / job.log
 * call passes or interpolates an identifier that holds content (`.title`, `.summary`,
 * `event_title`, `subject`, ...). String literal text is ignored; `${...}` is scanned.
 * `.length` on a content identifier is fine. Log ids, lengths, counts, and statuses instead.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SCAN_ROOTS = ['apps/worker/src', 'apps/web/src/lib/services'];

// NOT_LENGTH allows logging a length; `(?<!\.)` skips spreads such as `...summary`.
const NOT_LENGTH = String.raw`(?!\??\.length\b)`;
const property = (name: string) => new RegExp(String.raw`(?<!\.)\.${name}\b${NOT_LENGTH}`);
const word = (name: string) => new RegExp(String.raw`(?<![\w$])${name}\b${NOT_LENGTH}`);

const CONTENT_IDENTIFIERS: Array<{ token: string; pattern: RegExp }> = [
	{ token: '.title', pattern: property('title') },
	{ token: '.summary', pattern: property('summary') },
	{ token: '.snippet', pattern: property('snippet') },
	{ token: '.transcript', pattern: property('transcript') },
	// A bare `title` local, but not a `title:` object key.
	{ token: 'title', pattern: new RegExp(String.raw`(?<![\w$.])title\b${NOT_LENGTH}(?!\s*:)`) },
	{ token: 'event_title', pattern: word('event_title') },
	{ token: 'subject', pattern: word('subject') },
	{ token: 'cleanedContent', pattern: word('cleanedContent') },
	{ token: 'message_content', pattern: word('message_content') }
];

/** Current legitimate hits. One line of reason each; keep this list short. */
const ALLOWLIST: Array<{ file: string; token: string; reason: string }> = [
	{
		file: 'apps/web/src/lib/services/email-service.ts',
		token: 'subject',
		reason: 'Lifecycle log sink (dev default, or PRIVATE_LIFECYCLE_EMAIL_SINK=log) prints instead of sending.'
	}
];

const LOG_CALL =
	/(?:\bconsole\.(?:log|info|warn|error|debug|trace)|\b\w*[Ll]ogger\??\.(?:log|info|warn|error|debug|trace|fatal)|\bjob\.log)\s*\(/g;

function listSourceFiles(dir: string): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(dir)) {
		const path = join(dir, entry);
		if (statSync(path).isDirectory()) {
			if (entry === 'node_modules' || entry === 'dist') continue;
			files.push(...listSourceFiles(path));
		} else if (/\.(?:ts|js|mjs|svelte)$/.test(entry) && !/\.(?:test|spec)\./.test(entry)) {
			files.push(path);
		}
	}
	return files;
}

/**
 * Returns the code inside a call's parentheses with string literal text, template literal
 * text, and comments blanked out, and `${...}` expressions kept.
 */
function extractCallCode(source: string, openParen: number): string {
	let depth = 0;
	let code = '';
	let i = openParen;
	const templateStack: number[] = [];

	while (i < source.length) {
		const ch = source[i]!;
		const next = source[i + 1];

		if (ch === '/' && next === '/') {
			const end = source.indexOf('\n', i);
			i = end === -1 ? source.length : end;
			continue;
		}
		if (ch === '/' && next === '*') {
			const end = source.indexOf('*/', i + 2);
			i = end === -1 ? source.length : end + 2;
			continue;
		}
		if (ch === '"' || ch === "'") {
			i++;
			while (i < source.length && source[i] !== ch) i += source[i] === '\\' ? 2 : 1;
			i++;
			code += '""';
			continue;
		}
		if (ch === '`' || (ch === '}' && templateStack.at(-1) === depth)) {
			if (ch === '}') templateStack.pop();
			i++;
			// Skip template text until the closing backtick or a `${` expression.
			while (i < source.length && source[i] !== '`') {
				if (source[i] === '\\') {
					i += 2;
					continue;
				}
				if (source[i] === '$' && source[i + 1] === '{') break;
				i++;
			}
			if (source[i] === '`') {
				i++;
				code += '``';
				continue;
			}
			// Enter a `${` expression.
			i += 2;
			templateStack.push(depth);
			code += ' ';
			continue;
		}

		if (ch === '(' || ch === '{' || ch === '[') depth++;
		if (ch === ')' || ch === '}' || ch === ']') {
			depth--;
			if (depth === 0) return code;
		}
		code += ch;
		i++;
	}
	return code;
}

function lineOf(source: string, index: number): number {
	return source.slice(0, index).split('\n').length;
}

type Hit = { file: string; line: number; token: string };

function scan(): Hit[] {
	const hits: Hit[] = [];
	for (const root of SCAN_ROOTS) {
		for (const path of listSourceFiles(join(REPO_ROOT, root))) {
			const source = readFileSync(path, 'utf8');
			const file = relative(REPO_ROOT, path).split(sep).join('/');
			for (const match of source.matchAll(LOG_CALL)) {
				const openParen = match.index! + match[0].length - 1;
				const code = extractCallCode(source, openParen);
				for (const { token, pattern } of CONTENT_IDENTIFIERS) {
					if (pattern.test(code)) {
						hits.push({ file, line: lineOf(source, match.index!), token });
					}
				}
			}
		}
	}
	return hits;
}

describe('log content guard', () => {
	const hits = scan();
	const isAllowed = (hit: Hit) =>
		ALLOWLIST.some((entry) => entry.file === hit.file && entry.token === hit.token);

	it('keeps content identifiers out of server log calls', () => {
		const violations = hits
			.filter((hit) => !isAllowed(hit))
			.map((hit) => `${hit.file}:${hit.line} logs ${hit.token}`);
		expect(violations).toEqual([]);
	});

	it('has no stale allowlist entries', () => {
		const stale = ALLOWLIST.filter(
			(entry) => !hits.some((hit) => hit.file === entry.file && hit.token === entry.token)
		).map((entry) => `${entry.file} ${entry.token}`);
		expect(stale).toEqual([]);
	});

	it('detects interpolated and passed content identifiers', () => {
		const source = [
			'console.log(`Created reminder for "${event.event_title}"`);',
			"logger.info('sent', { subject: data.subject });",
			"console.log('the subject line is ignored in string text', count);",
			'console.log(`summary ${session.summary.length} chars, title ${title.length}`);',
			'console.info(JSON.stringify({ ...summary, id }));',
			'await job.log(`prompt: ${row.transcript}`);',
			'console.log(`✅ Result: "${title}"`);'
		].join('\n');
		const found: string[] = [];
		for (const match of source.matchAll(LOG_CALL)) {
			const code = extractCallCode(source, match.index! + match[0].length - 1);
			for (const { token, pattern } of CONTENT_IDENTIFIERS) {
				if (pattern.test(code)) found.push(token);
			}
		}
		expect(found).toEqual(['event_title', 'subject', '.transcript', 'title']);
	});
});
