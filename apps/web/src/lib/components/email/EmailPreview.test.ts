// apps/web/src/lib/components/email/EmailPreview.test.ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import EmailPreview from './EmailPreview.svelte';

const emailData = {
	from_name: 'BuildOS',
	from_email: 'hello@build-os.com',
	subject: 'Security preview',
	content: '<img src="x" onerror="alert(1)"><script>alert(2)</script>',
	recipients: [],
	status: 'draft'
};
const originalCreateObjectURL = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
const originalRevokeObjectURL = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');

function restoreUrlMethod(
	name: 'createObjectURL' | 'revokeObjectURL',
	descriptor?: PropertyDescriptor
) {
	if (descriptor) {
		Object.defineProperty(URL, name, descriptor);
	} else {
		delete (URL as unknown as Record<string, unknown>)[name];
	}
}

describe('EmailPreview', () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		vi.useRealTimers();
		restoreUrlMethod('createObjectURL', originalCreateObjectURL);
		restoreUrlMethod('revokeObjectURL', originalRevokeObjectURL);
	});

	it('renders untrusted email content inside a scriptless, opaque-origin iframe', () => {
		render(EmailPreview, {
			props: { emailData }
		});

		const frame = screen.getByTitle('Email preview: Security preview') as HTMLIFrameElement;
		const sandbox = frame.getAttribute('sandbox') ?? '';

		expect(sandbox).toContain('allow-popups');
		expect(sandbox).not.toContain('allow-scripts');
		expect(sandbox).not.toContain('allow-same-origin');
		expect(frame.getAttribute('referrerpolicy')).toBe('no-referrer');
		expect(frame.srcdoc).not.toContain('<script');
		expect(frame.srcdoc).not.toContain('onerror');
	});

	it('opens only the sanitized document with an isolated window relationship', async () => {
		vi.useFakeTimers();
		const createObjectURL = vi.fn(() => 'blob:https://build-os.com/safe-preview');
		const revokeObjectURL = vi.fn();
		Object.defineProperties(URL, {
			createObjectURL: { configurable: true, value: createObjectURL },
			revokeObjectURL: { configurable: true, value: revokeObjectURL }
		});
		const documentWrite = vi.fn();
		const previewWindow = {
			document: { write: documentWrite },
			opener: window
		} as unknown as Window;
		const open = vi.spyOn(window, 'open').mockReturnValue(previewWindow);

		render(EmailPreview, { props: { emailData } });
		await fireEvent.click(screen.getByRole('button', { name: 'Open in new window' }));

		expect(createObjectURL).toHaveBeenCalledOnce();
		expect(open).toHaveBeenCalledWith(
			'blob:https://build-os.com/safe-preview',
			'_blank',
			'noopener,noreferrer'
		);
		expect(previewWindow.opener).toBeNull();
		expect(documentWrite).not.toHaveBeenCalled();

		vi.advanceTimersByTime(60_000);
		expect(revokeObjectURL).toHaveBeenCalledWith('blob:https://build-os.com/safe-preview');
	});
});
