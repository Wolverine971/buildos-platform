// apps/web/src/lib/components/consolidation/ConsolidationMerge.test.ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import type { MergeDraftView, MergeLedger } from '@buildos/shared-agent-ops/consolidation';
import ConsolidationMerge from './ConsolidationMerge.svelte';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [INTAKE, DEPLOY, BEYOND] = [1, 2, 3].map(id) as [string, string, string];

const ledger: MergeLedger = {
	facts: [
		{
			id: 'F1',
			source_id: INTAKE,
			kind: 'durable',
			text: 'Rod is a referral from Phil Velayo.',
			quote: 'Referral source: Phil Velayo.',
			as_of: null
		},
		{
			id: 'F2',
			source_id: DEPLOY,
			kind: 'durable',
			text: 'Referral: Phil Velayo.',
			quote: 'Phil Velayo',
			as_of: null
		},
		{
			id: 'F3',
			source_id: DEPLOY,
			kind: 'plan',
			text: 'Demo planned Jan 20.',
			quote: 'Demo Jan 20',
			as_of: '2026-01-14'
		}
	],
	fates: [
		{ fact_id: 'F1', fate: 'keep', with: null, reason: null, section: 'Who Rod is' },
		{ fact_id: 'F2', fate: 'merged', with: 'F1', reason: null, section: null },
		{ fact_id: 'F3', fate: 'history', with: null, reason: null, section: 'Website history' }
	],
	sections: ['Who Rod is', 'Website history'],
	flags: [
		{
			source_id: INTAKE,
			kind: 'hollow',
			note: 'Claims team bios that are not here.',
			quote: null
		}
	],
	unverified: [{ source_id: INTAKE, text: 'Rod has a $10M book.' }]
};

function merge(overrides: Partial<MergeDraftView> = {}): MergeDraftView {
	return {
		cluster_key: 'c3',
		status: 'ready',
		title: 'Rod & Magnum: what we know',
		target_project_id: BEYOND,
		source_ids: [INTAKE, DEPLOY],
		ledger,
		markdown: '## Who Rod is\nA referral from Phil Velayo.',
		coverage: { placed: 2, stated: 1, appended_fact_ids: ['F3'] },
		error: null,
		created_document_id: null,
		...overrides
	};
}

function setup(view: MergeDraftView) {
	const onRetry = vi.fn();
	render(ConsolidationMerge, {
		props: {
			merge: view,
			questions: [],
			sourceTitle: (docId: string) =>
				docId === INTAKE ? 'Rod intake' : 'Rod deployment plan',
			projectName: () => 'Beyond Exit Planning',
			onRetry
		}
	});
	return { onRetry };
}

afterEach(() => cleanup());

describe('ConsolidationMerge', () => {
	it('accounts for every fact: placed, added word for word, folded in', () => {
		setup(merge());
		expect(
			screen.getByText(/3 facts found\. 2 in the doc, 1 of them added word for word/)
		).toBeInTheDocument();
		expect(screen.getByText(/1\s+said twice, folded in/)).toBeInTheDocument();
		expect(screen.getByText(/Claims team bios that are not here/)).toBeInTheDocument();
		expect(
			screen.getByText(/1 note the reader could not find word for word/)
		).toBeInTheDocument();
	});

	it('lists every fact with where it went', async () => {
		setup(merge());
		await fireEvent.click(screen.getByRole('button', { name: 'See every fact' }));
		expect(screen.getByText('Same as another fact · 1')).toBeInTheDocument();
		expect(screen.getByText('Referral: Phil Velayo.')).toBeInTheDocument();
		expect(screen.getByText(/see “Rod is a referral from Phil Velayo\.”/)).toBeInTheDocument();
	});

	it('shows progress while working, and a retry when it failed', async () => {
		setup(merge({ status: 'extracting', ledger: null, markdown: null, coverage: null }));
		expect(screen.getByText('Reading 2 docs…')).toBeInTheDocument();
		cleanup();
		const { onRetry } = setup(
			merge({
				status: 'failed',
				error: 'Found nothing to keep in these docs.',
				markdown: null
			})
		);
		expect(screen.getByRole('alert')).toHaveTextContent(
			'Found nothing to keep in these docs. Nothing changed.'
		);
		await fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
		expect(onRetry).toHaveBeenCalled();
	});
});
