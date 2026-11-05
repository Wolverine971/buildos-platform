// apps/web/src/lib/utils/svg-icon-mask.test.ts
import { describe, expect, it } from 'vitest';
import { svgIconMaskImage } from './svg-icon-mask';

function decode(value: string): string {
	const match = /^url\("data:image\/svg\+xml,(.*)"\)$/.exec(value);
	if (!match) throw new Error(`unexpected mask value: ${value}`);
	return decodeURIComponent(match[1]!);
}

describe('svgIconMaskImage', () => {
	it('wraps a normal icon as a data: URL that round-trips', () => {
		const svg =
			'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" stroke="currentColor"><path d="M8 8h48"/></svg>';
		const value = svgIconMaskImage(`  ${svg}\n`);
		expect(value).not.toBeNull();
		expect(decode(value!)).toBe(svg);
	});

	it('returns null for empty, non-svg or oversized input', () => {
		expect(svgIconMaskImage(null)).toBeNull();
		expect(svgIconMaskImage(undefined)).toBeNull();
		expect(svgIconMaskImage('   ')).toBeNull();
		expect(svgIconMaskImage('<img src=x onerror=alert(1)>')).toBeNull();
		expect(svgIconMaskImage('<svg></svg><script>alert(1)</script>')).toBeNull();
		expect(svgIconMaskImage(`<svg>${'a'.repeat(60_000)}</svg>`)).toBeNull();
	});

	it('never lets markup or CSS break out of the url() token', () => {
		// The audit payload shape: HTML breakout + iframe srcdoc + entity-encoded handler.
		const hostile =
			'<svg><p><iframe srcdoc="<img src=x onerror&#61;parent.document.title=1>"></iframe>\'"); background:url(https://evil.example/x) \\</svg>';
		const value = svgIconMaskImage(hostile)!;
		const inner = value.slice('url("'.length, -'")'.length);
		for (const ch of ['<', '>', '"', "'", '(', ')', '\\', ' ', '\n', ';']) {
			expect(inner).not.toContain(ch);
		}
		expect(decode(value)).toBe(hostile);
	});
});
