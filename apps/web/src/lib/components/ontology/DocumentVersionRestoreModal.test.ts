// apps/web/src/lib/components/ontology/DocumentVersionRestoreModal.test.ts
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DocumentVersionRestoreModal from './DocumentVersionRestoreModal.svelte';

const mocks = vi.hoisted(() => ({ success: vi.fn(), warning: vi.fn(), log: vi.fn() }));
vi.mock('$lib/stores/toast.store', () => ({ toastService: mocks }));
vi.mock('$lib/utils/ontology-client-logger', () => ({ logOntologyClientError: mocks.log }));

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => {
		resolve = r;
	});
	return { promise, resolve };
}
const props = {
	isOpen: true,
	documentId: 'doc-1',
	projectId: 'project-1',
	expectedUpdatedAt: 'loaded-token',
	version: {
		number: 1,
		created_by_name: 'Editor',
		created_at: '2026-09-07T12:00:00Z',
		window: null,
		snapshot_hash: 'reviewed-hash'
	}
};
function response(warning: string | null = null) {
	return new Response(
		JSON.stringify({ data: { document: { id: 'doc-1' }, version_warning: warning } }),
		{ status: 200 }
	);
}
async function confirm() {
	await fireEvent.click(screen.getByRole('checkbox'));
	await fireEvent.click(screen.getByRole('button', { name: 'Restore Version' }));
}

describe('DocumentVersionRestoreModal', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal('fetch', vi.fn());
		Object.defineProperty(Element.prototype, 'animate', {
			configurable: true,
			value: vi.fn(() => ({
				cancel: vi.fn(),
				commitStyles: vi.fn(),
				finished: Promise.resolve(),
				play: vi.fn()
			}))
		});
		Object.defineProperty(window, 'scrollTo', { configurable: true, value: vi.fn() });
		Object.defineProperty(HTMLElement.prototype, 'checkVisibility', {
			configurable: true,
			value: () => true
		});
	});
	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it('waits for the recovery checkpoint and sends its exact head token and reviewed snapshot hash', async () => {
		const checkpoint = deferred<string | null>();
		const restore = deferred<Response>();
		const onRestored = vi.fn();
		const onClose = vi.fn();
		const state = vi.fn();
		vi.mocked(fetch).mockReturnValue(restore.promise);
		render(DocumentVersionRestoreModal, {
			props: {
				...props,
				onBeforeRestore: () => checkpoint.promise,
				onRestored,
				onClose,
				onRestoreStateChange: state
			}
		});
		expect(screen.getByRole('button', { name: 'Restore Version' })).toBeDisabled();
		await confirm();
		expect(fetch).not.toHaveBeenCalled();
		expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
		await fireEvent.keyDown(window, { key: 'Escape' });
		expect(onClose).not.toHaveBeenCalled();
		checkpoint.resolve('saved-token');
		await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
		expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0]![1]!.body))).toEqual({
			expected_updated_at: 'saved-token',
			expected_snapshot_hash: 'reviewed-hash'
		});
		restore.resolve(response());
		await waitFor(() => expect(onRestored).toHaveBeenCalledOnce());
		expect(mocks.success).toHaveBeenCalledWith('Document restored to version 1');
	});

	it('does not restore when the recovery checkpoint could not be written', async () => {
		render(DocumentVersionRestoreModal, {
			props: { ...props, onBeforeRestore: async () => null }
		});
		await confirm();
		await screen.findByText(/current document could not be saved to history/i);
		expect(fetch).not.toHaveBeenCalled();
	});

	it('shows a saved-without-history warning instead of an unconditional success', async () => {
		vi.mocked(fetch).mockResolvedValue(
			response('Restored content saved, but history is unavailable.')
		);
		const onRestored = vi.fn();
		render(DocumentVersionRestoreModal, { props: { ...props, onRestored } });
		await confirm();
		await waitFor(() => expect(onRestored).toHaveBeenCalledOnce());
		expect(mocks.warning).toHaveBeenCalledWith(
			'Restored content saved, but history is unavailable.'
		);
		expect(mocks.success).not.toHaveBeenCalled();
	});

	it('keeps the confirmation open on a conflict without reporting success', async () => {
		vi.mocked(fetch).mockResolvedValue(
			new Response(JSON.stringify({ error: 'The reviewed version changed.' }), {
				status: 409
			})
		);
		const onRestored = vi.fn();
		render(DocumentVersionRestoreModal, { props: { ...props, onRestored } });
		await confirm();
		await screen.findByText('The reviewed version changed.');
		expect(onRestored).not.toHaveBeenCalled();
		expect(screen.getByRole('button', { name: 'Cancel' })).not.toBeDisabled();
	});

	it.each(['document', 'snapshot'])(
		'ignores a late restore response after changing the %s and requires fresh confirmation',
		async (changed) => {
			const restore = deferred<Response>();
			vi.mocked(fetch).mockReturnValue(restore.promise);
			const onRestored = vi.fn();
			const view = render(DocumentVersionRestoreModal, { props: { ...props, onRestored } });
			await confirm();
			const signal = vi.mocked(fetch).mock.calls[0]![1]!.signal;
			await view.rerender({
				...props,
				...(changed === 'document'
					? { documentId: 'doc-2' }
					: { version: { ...props.version, snapshot_hash: 'new-hash' } }),
				onRestored
			});
			expect(signal?.aborted).toBe(true);
			restore.resolve(response());
			await Promise.resolve();
			expect(onRestored).not.toHaveBeenCalled();
			expect(mocks.success).not.toHaveBeenCalled();
			expect(screen.getByRole('button', { name: 'Restore Version' })).toBeDisabled();
		}
	);
});
