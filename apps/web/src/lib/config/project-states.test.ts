// apps/web/src/lib/config/project-states.test.ts
import { describe, expect, it } from 'vitest';
import {
	PROJECT_STATE_ORDER,
	PROJECT_STATE_META,
	emptyProjectStateCounts,
	formatAccessRole,
	isActiveFacing,
	isPrimaryTier,
	normalizeProjectState
} from './project-states';

describe('PROJECT_STATE_ORDER', () => {
	it('renders primary tiers first, then secondary tiers', () => {
		const tiers = PROJECT_STATE_ORDER.map((state) => PROJECT_STATE_META[state].tier);
		const primaryCount = tiers.filter((t) => t === 'primary').length;
		const firstSecondaryIndex = tiers.indexOf('secondary');

		// All primary tiers come before any secondary tier.
		expect(firstSecondaryIndex).toBe(primaryCount);
	});

	it('matches the spec-locked order Planning → Active → Completed → Cancelled → Paused', () => {
		expect([...PROJECT_STATE_ORDER]).toEqual([
			'planning',
			'active',
			'completed',
			'cancelled',
			'paused'
		]);
	});

	it('has metadata for every state in the order list', () => {
		for (const state of PROJECT_STATE_ORDER) {
			expect(PROJECT_STATE_META[state]).toBeDefined();
			expect(PROJECT_STATE_META[state].label).toBeTruthy();
			expect(PROJECT_STATE_META[state].chipClass).toBeTruthy();
		}
	});
});

describe('normalizeProjectState', () => {
	it('returns the input when it is a known state', () => {
		expect(normalizeProjectState('active')).toBe('active');
		expect(normalizeProjectState('planning')).toBe('planning');
		expect(normalizeProjectState('paused')).toBe('paused');
	});

	it('lowercases and trims input', () => {
		expect(normalizeProjectState('  Active  ')).toBe('active');
		expect(normalizeProjectState('COMPLETED')).toBe('completed');
	});

	it('falls back to planning for unknown or missing states', () => {
		expect(normalizeProjectState(null)).toBe('planning');
		expect(normalizeProjectState(undefined)).toBe('planning');
		expect(normalizeProjectState('')).toBe('planning');
		expect(normalizeProjectState('in_progress')).toBe('planning');
		expect(normalizeProjectState('archived')).toBe('planning');
	});
});

describe('isPrimaryTier / isActiveFacing', () => {
	it('treats planning and active as primary', () => {
		expect(isPrimaryTier('planning')).toBe(true);
		expect(isPrimaryTier('active')).toBe(true);
	});

	it('treats completed, cancelled, paused as secondary', () => {
		expect(isPrimaryTier('completed')).toBe(false);
		expect(isPrimaryTier('cancelled')).toBe(false);
		expect(isPrimaryTier('paused')).toBe(false);
	});

	it('isActiveFacing normalizes unknown states and treats them as primary', () => {
		// Unknown → planning → primary
		expect(isActiveFacing('archived')).toBe(true);
		expect(isActiveFacing(null)).toBe(true);
		expect(isActiveFacing('paused')).toBe(false);
		expect(isActiveFacing('active')).toBe(true);
	});
});

describe('formatAccessRole', () => {
	it('title-cases editor and viewer', () => {
		expect(formatAccessRole('editor')).toBe('Editor');
		expect(formatAccessRole('viewer')).toBe('Viewer');
	});

	it('returns null for owner and missing roles', () => {
		expect(formatAccessRole('owner')).toBeNull();
		expect(formatAccessRole(null)).toBeNull();
		expect(formatAccessRole(undefined)).toBeNull();
	});
});

describe('emptyProjectStateCounts', () => {
	it('returns zero counts for every state and tier total', () => {
		const counts = emptyProjectStateCounts();
		expect(counts.planning).toBe(0);
		expect(counts.active).toBe(0);
		expect(counts.completed).toBe(0);
		expect(counts.cancelled).toBe(0);
		expect(counts.paused).toBe(0);
		expect(counts.primaryTotal).toBe(0);
		expect(counts.secondaryTotal).toBe(0);
		expect(counts.total).toBe(0);
	});
});
