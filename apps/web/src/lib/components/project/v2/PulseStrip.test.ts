// apps/web/src/lib/components/project/v2/PulseStrip.test.ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import type { OntoEvent } from '$lib/types/onto';
import PulseStrip from './PulseStrip.svelte';

const { fetchProjectLogsMock } = vi.hoisted(() => ({
	fetchProjectLogsMock: vi.fn()
}));

vi.mock('$lib/components/project/project-page-data-controller', () => ({
	fetchProjectLogs: fetchProjectLogsMock
}));

const NOW = new Date('2026-05-09T16:00:00.000Z');

function createEvent(overrides: Partial<OntoEvent>): OntoEvent {
	return {
		id: crypto.randomUUID(),
		org_id: null,
		project_id: '11111111-1111-4111-8111-111111111111',
		owner_entity_type: 'project',
		owner_entity_id: '11111111-1111-4111-8111-111111111111',
		type_key: 'meeting',
		state_key: 'scheduled',
		title: 'Project event',
		description: null,
		location: null,
		start_at: '2026-05-09T17:00:00.000Z',
		end_at: '2026-05-09T18:00:00.000Z',
		all_day: false,
		timezone: null,
		recurrence: {},
		external_link: null,
		props: {},
		last_synced_at: null,
		sync_status: 'not_synced',
		sync_error: null,
		deleted_at: null,
		facet_context: null,
		facet_scale: null,
		facet_stage: null,
		created_by: '22222222-2222-4222-8222-222222222222',
		created_at: '2026-05-01T12:00:00.000Z',
		updated_at: '2026-05-01T12:00:00.000Z',
		...overrides
	};
}

function renderPulseStrip(events: OntoEvent[]) {
	render(PulseStrip, {
		props: {
			projectId: '11111111-1111-4111-8111-111111111111',
			tasks: [],
			milestones: [],
			goals: [],
			events,
			onOpenEntity: vi.fn()
		}
	});
}

describe('PulseStrip', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(NOW);
		fetchProjectLogsMock.mockResolvedValue({ logs: [] });
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.clearAllMocks();
	});

	// Both mobile (tabbed) and desktop (two-column) layouts are in the DOM,
	// gated only by CSS. The mobile tab defaults to "Up next" with its panel
	// rendered, so an upcoming item appears in both layouts.
	it('does not show events that have already ended in Up next', () => {
		renderPulseStrip([
			createEvent({
				title: 'Past review',
				start_at: '2026-05-09T14:00:00.000Z',
				end_at: '2026-05-09T15:00:00.000Z'
			}),
			createEvent({
				title: 'Future review',
				start_at: '2026-05-09T17:00:00.000Z',
				end_at: '2026-05-09T18:00:00.000Z'
			})
		]);

		expect(screen.queryByText('Past review')).not.toBeInTheDocument();
		expect(screen.getAllByText('Future review').length).toBeGreaterThan(0);
	});

	it('keeps an in-progress event without marking it late', () => {
		renderPulseStrip([
			createEvent({
				title: 'Live planning session',
				start_at: '2026-05-09T15:30:00.000Z',
				end_at: '2026-05-09T16:30:00.000Z'
			})
		]);

		expect(screen.getAllByText('Live planning session').length).toBeGreaterThan(0);
		expect(screen.getAllByText('now').length).toBeGreaterThan(0);
		expect(screen.queryByText(/late/i)).not.toBeInTheDocument();
	});
});
