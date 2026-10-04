// apps/web/src/lib/components/consolidation/ConsolidationQuestionCard.test.ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import {
	parseConsolidationQuestion,
	type ConsolidationQuestion
} from '@buildos/shared-agent-ops/consolidation';
import ConsolidationQuestionCard from './ConsolidationQuestionCard.svelte';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [RUN, QUESTION, ROD1, ROD2, BEYOND] = [1, 2, 3, 4, 5].map(id) as [
	string,
	string,
	string,
	string,
	string
];

function question(overrides: Record<string, unknown> = {}): ConsolidationQuestion {
	const parsed = parseConsolidationQuestion({
		id: QUESTION,
		run_id: RUN,
		piece: 'cluster:c1',
		header: 'Rod docs',
		question: '11 Rod Chamberlin docs sit in Wayne Strategies. What should happen to them?',
		evidence: [
			{
				document_id: ROD1,
				source: 'Rod Website - Deployment Plan',
				quote: 'Demo Jan 20, launch post-approval.'
			}
		],
		options: [
			{
				id: 'leave',
				label: 'Leave them',
				description: 'Nothing changes.',
				ops: [{ op: 'keep', document_ids: [ROD1, ROD2] }]
			},
			{
				id: 'rec',
				label: 'Move them to Beyond Exit',
				description: 'Rod lives there.',
				ops: [{ op: 'move', document_ids: [ROD1, ROD2], target_project_id: BEYOND }]
			}
		],
		recommended_option_id: 'rec',
		skip_option_id: 'leave',
		priority: 5,
		status: 'open',
		answer: null,
		draft: null,
		answered_at: null,
		created_at: '2026-10-03T00:00:00Z',
		...overrides
	});
	if (!parsed) throw new Error('fixture did not parse');
	return parsed;
}

function setup(q = question()) {
	const onSubmit = vi.fn(async (body: Record<string, unknown>) =>
		body.via === 'text' ? { reply: null } : undefined
	);
	render(ConsolidationQuestionCard, {
		props: { question: q, describe: (optionId: string) => `effect of ${optionId}`, onSubmit }
	});
	return { onSubmit };
}

afterEach(() => cleanup());

describe('ConsolidationQuestionCard', () => {
	it('puts the recommended option first, then type and chat', () => {
		setup();
		const radios = screen.getAllByRole('radio');
		expect(radios.map((radio) => radio.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
			'1. Move them to Beyond Exit Recommended Rod lives there.',
			'2. Leave them Nothing changes.',
			'3. Type something Say it your way. You see how it was read before anything runs.',
			'4. Chat about this Talk it through here. The rest of the run keeps going.'
		]);
		expect(radios[0]).toHaveAttribute('aria-checked', 'true');
		expect(screen.getByText('effect of rec')).toBeInTheDocument();
		expect(screen.getByText('Demo Jan 20, launch post-approval.')).toBeInTheDocument();
	});

	it('picks with number keys and confirms with Enter', async () => {
		const { onSubmit } = setup();
		const card = screen.getByRole('radiogroup');
		await fireEvent.keyDown(card, { key: '2' });
		expect(screen.getAllByRole('radio')[1]).toHaveAttribute('aria-checked', 'true');
		await fireEvent.keyDown(card, { key: 'Enter' });
		await waitFor(() =>
			expect(onSubmit).toHaveBeenCalledWith({ via: 'option', option_id: 'leave' })
		);
	});

	it('skips with the keep-only option', async () => {
		const { onSubmit } = setup();
		await fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
		expect(onSubmit).toHaveBeenCalledWith({ via: 'skip' });
	});

	it('Enter on Skip skips; it never answers with the selected option', async () => {
		const { onSubmit } = setup();
		const skip = screen.getByRole('button', { name: 'Skip' });
		await fireEvent.keyDown(skip, { key: 'Enter' });
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it("shows an option reading as that option's own effect, not the model's sentence", () => {
		setup(
			question({
				draft: {
					via: 'text',
					text: 'keep both',
					thread: [],
					reading: {
						option_id: 'rec',
						instruction: null,
						readback: 'Keeps both docs as they are.'
					}
				}
			})
		);
		expect(screen.getByText('Move them to Beyond Exit: effect of rec')).toBeInTheDocument();
		expect(screen.queryByText('Keeps both docs as they are.')).toBeNull();
	});

	it('reads typed text back before anything runs, then confirms it', async () => {
		const { onSubmit } = setup();
		await fireEvent.keyDown(screen.getByRole('radiogroup'), { key: '3' });
		const box = screen.getByLabelText('Your answer');
		await fireEvent.input(box, { target: { value: 'move them but keep the May prep' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Read it back' }));
		expect(onSubmit).toHaveBeenCalledWith({
			via: 'text',
			text: 'move them but keep the May prep'
		});
		cleanup();

		// The server stored a reading as a draft: the card shows it and Confirm sends `confirm`.
		const withDraft = question({
			draft: {
				via: 'text',
				text: 'move them but keep the May prep',
				thread: [],
				reading: {
					option_id: null,
					instruction: 'Move all but the May prep to Beyond Exit',
					readback: 'Move 10 docs to Beyond Exit; keep the May prep in Wayne.'
				}
			}
		});
		const second = setup(withDraft);
		expect(
			screen.getByText('Move 10 docs to Beyond Exit; keep the May prep in Wayne.')
		).toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
		expect(second.onSubmit).toHaveBeenCalledWith({ via: 'confirm' });
	});

	it('chats about the card and offers the reading it ends in', async () => {
		const withThread = question({
			draft: {
				via: 'chat',
				text: null,
				thread: [
					{
						role: 'user',
						text: 'Is the May prep still useful?',
						at: '2026-10-03T00:00:00Z'
					},
					{
						role: 'assistant',
						text: 'It holds the questions for Rod that are still open.',
						at: '2026-10-03T00:00:01Z'
					}
				],
				reading: null
			}
		});
		const { onSubmit } = setup(withThread);
		expect(
			screen.getByText('It holds the questions for Rod that are still open.')
		).toBeInTheDocument();
		await fireEvent.input(screen.getByLabelText('Message'), {
			target: { value: 'ok, move them' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Send' }));
		expect(onSubmit).toHaveBeenCalledWith({ via: 'chat', message: 'ok, move them' });
	});
});
