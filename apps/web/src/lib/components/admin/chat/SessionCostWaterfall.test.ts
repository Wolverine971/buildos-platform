// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import type {
	SessionFlowEvent,
	SessionFlowProfile
} from '$lib/services/admin/chat-session-flow-profile';
import SessionCostWaterfall from './SessionCostWaterfall.svelte';

function event(
	id: string,
	passRoleLabel: string,
	costState: SessionFlowEvent['costState'],
	costUsd: number | null
): SessionFlowEvent {
	return {
		id,
		turnId: 'turn:1',
		turnIndex: 1,
		category: 'llm',
		label: `${passRoleLabel} · gpt-test`,
		passRoleLabel,
		modelLabel: 'gpt-test',
		startMs: 0,
		endMs: 100,
		durationMs: 100,
		isPoint: false,
		severity: 'info',
		costUsd,
		storedCostUsd: costUsd,
		costState,
		target: { kind: 'audit', domId: id, auditEventId: id, fallbackDomId: 'turn:1' }
	};
}

const mixedProfile: SessionFlowProfile = {
	turns: [],
	events: [
		event('acting', 'Acting', 'reported', 0.004),
		{ ...event('failed', 'Repair', 'estimated', 0.003), severity: 'error' },
		event('review', 'Contract review', 'reported', 0.002),
		event('historical', 'Earlier pass', 'unknown', 0.008),
		event('final', 'Final response', 'reported', 0)
	],
	totalActiveDurationMs: 500,
	totalCostUsd: 0.017,
	attributedCostUsd: 0.017,
	reportedCostUsd: 0.006,
	estimatedCostUsd: 0.003,
	estimatedCostCount: 1,
	unknownCostUsd: 0.008,
	unknownCostCount: 1,
	costDifferenceUsd: 0,
	slowestEvent: null
};

afterEach(() => cleanup());

describe('SessionCostWaterfall', () => {
	it('shows each call and its role while excluding estimates and unknown charges from reported totals', async () => {
		const onSelect = vi.fn();
		render(SessionCostWaterfall, { props: { profile: mixedProfile, onSelect } });

		expect(screen.getByText('$0.0060 reported')).toBeInTheDocument();
		expect(screen.getByText('$0.0030 estimated')).toBeInTheDocument();
		expect(
			screen.getByText(/1 call with unknown cost source · \$0.0080 unverified/)
		).toBeInTheDocument();
		expect(screen.getByText(/Recorded session total: \$0.0170/)).toBeInTheDocument();
		expect(screen.getByText('This call')).toBeInTheDocument();
		expect(screen.getByText('Reported total')).toBeInTheDocument();

		const estimatedRow = screen.getByRole('button', {
			name: 'Repair · gpt-test, error, this call $0.0030 est., cumulative reported spend $0.0040. Select to open details.'
		});
		expect(within(estimatedRow).getByText('$0.0030 est.')).toBeInTheDocument();
		expect(within(estimatedRow).getByText('$0.0040')).toBeInTheDocument();
		expect(estimatedRow.querySelector('.rotate-45')).not.toBeNull();

		const reviewRow = screen.getByRole('button', {
			name: 'Contract review · gpt-test, this call $0.0020, cumulative reported spend $0.0060. Select to open details.'
		});
		expect(within(reviewRow).getByText('Contract review')).toBeInTheDocument();
		expect(within(reviewRow).getByText('gpt-test')).toBeInTheDocument();
		await fireEvent.click(reviewRow);
		expect(onSelect).toHaveBeenCalledWith(mixedProfile.events[2]);

		expect(
			screen.getByRole('button', {
				name: 'Earlier pass · gpt-test, this call $0.0080 unverified, cumulative reported spend $0.0060. Select to open details.'
			})
		).toBeInTheDocument();
		expect(
			screen.getByRole('button', {
				name: 'Final response · gpt-test, this call $0.00, cumulative reported spend $0.0060. Select to open details.'
			})
		).toBeInTheDocument();
	});

	it('keeps estimated amounts visible when the entire session has no reported spend', () => {
		render(SessionCostWaterfall, {
			props: {
				profile: {
					...mixedProfile,
					events: [mixedProfile.events[1]!],
					reportedCostUsd: 0,
					unknownCostUsd: 0,
					unknownCostCount: 0,
					totalCostUsd: 0.003,
					attributedCostUsd: 0.003
				},
				onSelect: vi.fn()
			}
		});

		expect(screen.getByText('No reported spend')).toBeInTheDocument();
		expect(screen.getByText('$0.0030 estimated')).toBeInTheDocument();
		expect(
			screen.getByRole('button', {
				name: 'Repair · gpt-test, error, this call $0.0030 est., cumulative reported spend $0.00. Select to open details.'
			})
		).toBeInTheDocument();
	});
});
