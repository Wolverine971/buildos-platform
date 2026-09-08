// apps/web/src/lib/components/ontology/DocumentProposalReview.test.ts
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDocumentPatchV1 } from '@buildos/shared-agent-ops/ontology/document-patch';
import { hashDocumentContent } from '@buildos/shared-agent-ops/utils/document-outline';
import DocumentProposalReview from './DocumentProposalReview.svelte';

const voice = vi.hoisted(() => ({
	callbacks: null as null | { onPhaseChange: (phase: 'idle' | 'transcribing') => void }
}));
vi.mock('$lib/services/voiceRecording.service', () => ({
	voiceRecordingService: {
		cleanup: vi.fn(),
		getRecordingDuration: () => ({
			subscribe: (cb: (n: number) => void) => {
				cb(0);
				return () => {};
			}
		}),
		initialize: (callbacks: typeof voice.callbacks) => {
			voice.callbacks = callbacks;
		},
		isLiveTranscriptSupported: () => false,
		isVoiceSupported: () => true,
		setVocabularyTerms: vi.fn(),
		startRecording: async () => {},
		stopRecording: async () => {}
	}
}));
vi.mock('$lib/services/voice-note-groups.service', () => ({
	cleanupVoiceNoteGroups: vi.fn(),
	createVoiceNoteGroup: vi.fn()
}));
vi.mock('$lib/services/voice-notes.service', () => ({
	uploadVoiceNote: vi.fn(),
	updateVoiceNote: vi.fn()
}));

const content = '# Plan\n\nDraft this paragraph.';
const selected = 'Draft this paragraph.';
const props = {
	documentId: 'document-1',
	baseContent: content,
	selectionFrom: 8,
	selectionTo: content.length,
	selectedMarkdown: selected
};
function proposal(status = 'pending') {
	return {
		id: 'proposal-1',
		status,
		instruction: 'Make it clear',
		conflict_reason: null,
		patch: createDocumentPatchV1({
			project_id: 'project-1',
			document_id: props.documentId,
			base_content: content,
			selections: [
				{
					op_id: 'op-1',
					from: 8,
					to: content.length,
					replacement_markdown: 'Publish this paragraph.'
				}
			]
		})
	};
}
const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => (resolve = r));
	return { promise, resolve };
}
async function generate() {
	await fireEvent.input(screen.getByRole('textbox', { name: 'Proposal instruction' }), {
		target: { value: 'Make it clear' }
	});
	await fireEvent.click(screen.getByRole('button', { name: 'Generate proposal' }));
}
async function waitForReview() {
	await waitFor(() =>
		expect(screen.getByRole('button', { name: 'Apply proposal' })).toBeInTheDocument()
	);
}
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.clearAllMocks();
	voice.callbacks = null;
});

describe('Document proposal review', () => {
	it('generates an exact selection proposal, reviews it, and waits for save preparation before applying', async () => {
		const preparation = deferred<boolean>();
		const onApplied = vi.fn();
		const onApplyStateChange = vi.fn();
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(json({ data: { proposal: proposal() } }))
			.mockResolvedValueOnce(json({ data: { proposal: proposal('applied') } }));
		vi.stubGlobal('fetch', fetchMock);
		render(DocumentProposalReview, {
			props: {
				...props,
				onBeforeApply: () => preparation.promise,
				onApplied,
				onApplyStateChange
			}
		});
		await generate();
		await waitForReview();
		expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
			instruction: 'Make it clear',
			selection_from: 8,
			selection_to: content.length,
			base_content_hash: hashDocumentContent(content)
		});
		expect(screen.getAllByText(/Publish/).length).toBeGreaterThan(0);
		await fireEvent.click(screen.getByRole('button', { name: 'Apply proposal' }));
		expect(onApplyStateChange).toHaveBeenLastCalledWith(true);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		preparation.resolve(true);
		await waitFor(() => expect(onApplied).toHaveBeenCalledWith({ versionWarning: null }));
		expect(fetchMock.mock.calls[1][0]).toBe(
			'/api/onto/documents/document-1/proposals/proposal-1/apply'
		);
		expect(onApplyStateChange).toHaveBeenLastCalledWith(false);
	});
	it('surfaces a failed save preparation without sending an apply request', async () => {
		const fetchMock = vi.fn().mockResolvedValue(json({ data: { proposal: proposal() } }));
		vi.stubGlobal('fetch', fetchMock);
		render(DocumentProposalReview, { props: { ...props, onBeforeApply: () => false } });
		await generate();
		await waitForReview();
		await fireEvent.click(screen.getByRole('button', { name: 'Apply proposal' }));
		await waitFor(() =>
			expect(screen.getByRole('alert')).toHaveTextContent('Resolve its save warning')
		);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
	it.each(['response', 'receipt'])(
		'preserves a version-history warning from the %s',
		async (source) => {
			const warning = 'Saved, but version history failed.';
			const onApplied = vi.fn();
			vi.stubGlobal(
				'fetch',
				vi
					.fn()
					.mockResolvedValueOnce(json({ data: { proposal: proposal() } }))
					.mockResolvedValueOnce(
						json({
							data: {
								proposal: {
									...proposal('applied'),
									version_warning: source === 'receipt' ? warning : null
								},
								version_warning: source === 'response' ? warning : undefined
							}
						})
					)
			);
			render(DocumentProposalReview, { props: { ...props, onApplied } });
			await generate();
			await waitForReview();
			await fireEvent.click(screen.getByRole('button', { name: 'Apply proposal' }));
			await waitFor(() =>
				expect(onApplied).toHaveBeenCalledWith({ versionWarning: warning })
			);
		}
	);
	it.each(['generate', 'apply'])(
		'offers a real reselection after a %s conflict and keeps the instruction',
		async (stage) => {
			const onReselect = vi.fn();
			const fetchMock = vi.fn();
			if (stage === 'apply')
				fetchMock.mockResolvedValueOnce(json({ data: { proposal: proposal() } }));
			fetchMock.mockResolvedValueOnce(
				json({ error: 'Selection changed', code: 'DOCUMENT_SELECTION_STALE' }, 409)
			);
			vi.stubGlobal('fetch', fetchMock);
			render(DocumentProposalReview, { props: { ...props, onReselect } });
			await generate();
			if (stage === 'apply') {
				await waitForReview();
				await fireEvent.click(screen.getByRole('button', { name: 'Apply proposal' }));
			}
			await waitFor(() =>
				expect(screen.getByRole('button', { name: 'Select again' })).toBeInTheDocument()
			);
			await fireEvent.click(screen.getByRole('button', { name: 'Select again' }));
			expect(onReselect).toHaveBeenCalledWith('Make it clear');
		}
	);
	it('cancels generation when the review is closed and ignores its late response', async () => {
		const pending = deferred<Response>();
		const fetchMock = vi.fn().mockReturnValue(pending.promise);
		vi.stubGlobal('fetch', fetchMock);
		const view = render(DocumentProposalReview, { props });
		await generate();
		expect(screen.getByRole('button', { name: 'Close proposal review' })).not.toBeDisabled();
		view.unmount();
		expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
		pending.resolve(json({ data: { proposal: proposal() } }));
		await tick();
		expect(screen.queryByRole('button', { name: 'Apply proposal' })).not.toBeInTheDocument();
	});
	it('does not apply to a replacement document after save preparation resolves', async () => {
		const preparation = deferred<boolean>();
		const onApplied = vi.fn();
		const fetchMock = vi.fn().mockResolvedValue(json({ data: { proposal: proposal() } }));
		vi.stubGlobal('fetch', fetchMock);
		const view = render(DocumentProposalReview, {
			props: { ...props, onBeforeApply: () => preparation.promise, onApplied }
		});
		await generate();
		await waitForReview();
		await fireEvent.click(screen.getByRole('button', { name: 'Apply proposal' }));
		await view.rerender({
			...props,
			documentId: 'document-2',
			onBeforeApply: () => preparation.promise,
			onApplied
		});
		preparation.resolve(true);
		await tick();
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(onApplied).not.toHaveBeenCalled();
	});
	it('releases its apply lock when a reload removes the review and ignores a late receipt', async () => {
		const pending = deferred<Response>();
		const onApplied = vi.fn();
		const onApplyStateChange = vi.fn();
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(json({ data: { proposal: proposal() } }))
			.mockReturnValueOnce(pending.promise);
		vi.stubGlobal('fetch', fetchMock);
		const view = render(DocumentProposalReview, {
			props: { ...props, onApplied, onApplyStateChange }
		});
		await generate();
		await waitForReview();
		await fireEvent.click(screen.getByRole('button', { name: 'Apply proposal' }));
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
		view.unmount();
		expect(fetchMock.mock.calls[1][1].signal.aborted).toBe(true);
		expect(onApplyStateChange).toHaveBeenLastCalledWith(false);
		pending.resolve(json({ data: { proposal: proposal('applied') } }));
		await tick();
		expect(onApplied).not.toHaveBeenCalled();
	});

	it('rejects incomplete or mismatched proposal data before exposing Apply', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				json({
					data: { proposal: { id: 'broken', instruction: 'Something', patch: {} } }
				})
			)
		);
		render(DocumentProposalReview, { props });
		await generate();
		await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
		expect(screen.queryByRole('button', { name: 'Apply proposal' })).not.toBeInTheDocument();
	});
	it('keeps the instruction when revising and identifies the previous proposal', async () => {
		const fetchMock = vi
			.fn()
			.mockImplementation(() => Promise.resolve(json({ data: { proposal: proposal() } })));
		vi.stubGlobal('fetch', fetchMock);
		render(DocumentProposalReview, { props });
		await generate();
		await waitForReview();
		await fireEvent.click(screen.getByRole('button', { name: 'Revise instruction' }));
		expect(screen.getByRole('textbox', { name: 'Proposal instruction' })).toHaveValue(
			'Make it clear'
		);
		await fireEvent.click(screen.getByRole('button', { name: 'Generate proposal' }));
		await waitForReview();
		expect(JSON.parse(fetchMock.mock.calls[1][1].body).replaces_proposal_id).toBe('proposal-1');
	});
	it('waits for recording and transcription before allowing generation', async () => {
		const onVoiceStateChange = vi.fn();
		render(DocumentProposalReview, { props: { ...props, onVoiceStateChange } });
		await fireEvent.input(screen.getByRole('textbox', { name: 'Proposal instruction' }), {
			target: { value: 'Typed instruction' }
		});
		await waitFor(() =>
			expect(screen.getByRole('button', { name: 'Record voice note' })).not.toBeDisabled()
		);
		await fireEvent.click(screen.getByRole('button', { name: 'Record voice note' }));
		await waitFor(() =>
			expect(screen.getByRole('button', { name: 'Stop recording' })).toBeInTheDocument()
		);
		expect(screen.getByRole('button', { name: 'Generate proposal' })).toBeDisabled();
		voice.callbacks?.onPhaseChange('transcribing');
		await fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }));
		await tick();
		expect(screen.getByRole('button', { name: 'Generate proposal' })).toBeDisabled();
		voice.callbacks?.onPhaseChange('idle');
		await tick();
		await waitFor(() =>
			expect(screen.getByRole('button', { name: 'Generate proposal' })).not.toBeDisabled()
		);
		expect(onVoiceStateChange).toHaveBeenLastCalledWith(false);
	});
});
