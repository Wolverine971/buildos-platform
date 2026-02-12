// apps/web/src/lib/services/ontology/edge-relationship-resolver.test.ts
import { describe, it, expect } from 'vitest';
import { normalizeRelationshipToken, resolveEdgeRelationship } from './edge-relationship-resolver';

describe('edge-relationship-resolver', () => {
	describe('normalizeRelationshipToken', () => {
		it('normalizes camelCase to snake_case', () => {
			expect(normalizeRelationshipToken('supportsGoal')).toBe('supports_goal');
		});

		it('normalizes separators and trims', () => {
			expect(normalizeRelationshipToken('  blocked-by  ')).toBe('blocked_by');
			expect(normalizeRelationshipToken('Has Task')).toBe('has_task');
		});
	});

	describe('resolveEdgeRelationship', () => {
		it('keeps known relationships (including deprecated aliases)', () => {
			const res = resolveEdgeRelationship({
				srcKind: 'task',
				dstKind: 'task',
				rel: 'blockedBy'
			});
			expect(res.rel).toBe('blocked_by');
			expect(res.original_rel).toBeUndefined();
		});

		it('infers a default relationship from kinds when unknown', () => {
			const res = resolveEdgeRelationship({
				srcKind: 'task',
				dstKind: 'goal',
				rel: 'contributes_to'
			});
			expect(res.rel).toBe('supports_goal');
			expect(res.original_rel).toBe('contributes_to');
		});

		it('infers risk-document as documented_in when unknown', () => {
			const res = resolveEdgeRelationship({
				srcKind: 'risk',
				dstKind: 'document',
				rel: 'related'
			});
			expect(res.rel).toBe('documented_in');
			expect(res.original_rel).toBe('related');
		});
	});
});
