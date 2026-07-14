// apps/web/src/lib/utils/emailTemplate.test.ts
import { describe, expect, it } from 'vitest';
import { generateMinimalEmailHTML, generatePlainEmailHTML } from './emailTemplate';
import { generateSafeEmailPreviewHTML } from './emailPreview';

describe('email template safety', () => {
	it('escapes subjects in generated document titles', () => {
		const subject = '</title><script>globalThis.compromised = true</script>';

		for (const html of [
			generateMinimalEmailHTML({ subject, content: '<p>Hello</p>' }),
			generatePlainEmailHTML({ subject, content: '<p>Hello</p>' })
		]) {
			expect(html).not.toContain('</title><script>');
			expect(html).toContain('&lt;/title&gt;&lt;script&gt;');
		}
	});

	it('strips active content and unsafe URLs from browser previews', () => {
		const html = generateSafeEmailPreviewHTML({
			subject: 'Security preview',
			content: `
				<script>globalThis.compromised = true</script>
				<img src="javascript:alert(1)" onerror="alert(2)" alt="unsafe" />
				<a href="javascript:alert(3)" onclick="alert(4)">unsafe link</a>
				<a href="data:text/html,<script>alert(5)</script>">unsafe data link</a>
				<a href="//attacker.example/path">unsafe protocol-relative link</a>
				<iframe src="https://attacker.example"></iframe>
			`
		});

		expect(html).not.toContain('<script');
		expect(html).not.toContain('globalThis.compromised');
		expect(html).not.toContain('javascript:');
		expect(html).not.toContain('data:text/html');
		expect(html).not.toContain('href="//');
		expect(html).not.toContain('onerror');
		expect(html).not.toContain('onclick');
		expect(html).not.toContain('<iframe');
		expect(html).not.toContain('attacker.example');
		expect(html).toContain("script-src 'none'");
		expect(html).toContain('<meta name="referrer" content="no-referrer">');
	});

	it('preserves ordinary formatted email content and hardens links', () => {
		const html = generateSafeEmailPreviewHTML({
			subject: 'Formatted preview',
			content: `
				<h2 style="color: #D96C1E">Project update</h2>
				<p><strong>Three tasks</strong> are ready.</p>
				<a href="https://example.com/details">View details</a>
				<img src="https://example.com/update.png" alt="Update" width="320" />
			`
		});

		expect(html).toContain('<h2 style="color:#D96C1E">Project update</h2>');
		expect(html).toContain('<strong>Three tasks</strong>');
		expect(html).toContain(
			'<a href="https://example.com/details" rel="noopener noreferrer" target="_blank">'
		);
		expect(html).toContain(
			'<img src="https://example.com/update.png" alt="Update" width="320" />'
		);
	});
});
