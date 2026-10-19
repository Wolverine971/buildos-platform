// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import SharedChatTranscript from './SharedChatTranscript.svelte';

describe('shared chat transcript', () => {
	afterEach(cleanup);
	it('renders only a read-only message body, plain work labels and withheld counts', () => {
		render(SharedChatTranscript, {
			snapshot: {
				version: 1,
				title: 'A plan',
				messages: [
					{
						role: 'user',
						markdown: 'Please make a **plan**.',
						at: '2026-10-18T12:00:00Z',
						withheld: { images: 1, files: 2, voice: 1 }
					},
					{
						role: 'assistant',
						markdown: 'Here is the [reference](https://example.com/reference).',
						at: '2026-10-18T12:01:00Z',
						work: { seconds: 54, steps: 12 },
						made: [{ kind: 'task', label: 'Draft pitch deck' }]
					}
				]
			}
		});
		expect(screen.getByText('Worked for 54s · 12 steps')).toBeInTheDocument();
		expect(screen.getByText('Draft pitch deck')).toBeInTheDocument();
		expect(screen.getByText('1 image not shared')).toBeInTheDocument();
		expect(screen.getByText('2 files not shared')).toBeInTheDocument();
		expect(screen.getByText('1 voice note not shared')).toBeInTheDocument();
		expect(screen.getAllByRole('link')).toHaveLength(1);
		expect(screen.getByRole('link', { name: 'reference' })).toHaveAttribute(
			'href',
			'https://example.com/reference'
		);
		expect(screen.queryByRole('button')).not.toBeInTheDocument();
		expect(screen.queryByRole('img')).not.toBeInTheDocument();
	});
	it('uses the existing sanitizer before inserting rendered markdown', () => {
		const { container } = render(SharedChatTranscript, {
			snapshot: {
				version: 1,
				title: 'A plan',
				messages: [
					{
						role: 'assistant',
						markdown:
							'<script>alert(1)</script><a href="javascript:alert(1)">Unsafe link</a>\n\nSafe text.',
						at: '2026-10-18T12:00:00Z'
					}
				]
			}
		});
		expect(container.querySelector('script')).toBeNull();
		expect(container.querySelector('[href^="javascript:"]')).toBeNull();
		expect(screen.getByText('Safe text.')).toBeInTheDocument();
	});
});
