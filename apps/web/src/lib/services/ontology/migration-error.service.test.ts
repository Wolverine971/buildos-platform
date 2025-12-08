// apps/web/src/lib/services/ontology/migration-error.service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MigrationErrorService } from './migration-error.service';

// Mock Supabase client
const createMockSupabase = () => {
	const mockQuery = {
		select: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		neq: vi.fn().mockReturnThis(),
		in: vi.fn().mockReturnThis(),
		ilike: vi.fn().mockReturnThis(),
		order: vi.fn().mockReturnThis(),
		range: vi.fn().mockReturnThis(),
		single: vi.fn().mockReturnThis()
	};

	return {
		from: vi.fn().mockReturnValue(mockQuery),
		_query: mockQuery
	};
};

describe('MigrationErrorService', () => {
	describe('classifyError', () => {
		let mockSupabase: ReturnType<typeof createMockSupabase>;
		let service: MigrationErrorService;

		beforeEach(() => {
			mockSupabase = createMockSupabase();
			// @ts-expect-error - Mock Supabase client
			service = new MigrationErrorService(mockSupabase);
		});

		it('should classify timeout errors as recoverable', () => {
			expect(service.classifyError('Request timeout after 30s')).toBe('recoverable');
			expect(service.classifyError('Connection timeout')).toBe('recoverable');
		});

		it('should classify rate limit errors as recoverable', () => {
			expect(service.classifyError('Rate limit exceeded')).toBe('recoverable');
			expect(service.classifyError('429 Too Many Requests')).toBe('recoverable');
		});

		it('should classify network errors as recoverable', () => {
			expect(service.classifyError('Network error: ECONNRESET')).toBe('recoverable');
			expect(service.classifyError('Socket hang up')).toBe('recoverable');
			expect(service.classifyError('Temporary unavailable')).toBe('recoverable');
		});

		it('should classify 503 errors as recoverable', () => {
			expect(service.classifyError('503 Service Unavailable')).toBe('recoverable');
		});

		it('should classify corrupted data as fatal', () => {
			expect(service.classifyError('Data corrupted')).toBe('fatal');
		});

		it('should classify circular references as fatal', () => {
			expect(service.classifyError('Circular reference detected')).toBe('fatal');
		});

		it('should classify unsupported types as fatal', () => {
			expect(service.classifyError('Unsupported type: blob')).toBe('fatal');
		});

		it('should classify JSON parse errors as fatal', () => {
			expect(service.classifyError('JSON parse error at position 42')).toBe('fatal');
			expect(service.classifyError('Invalid JSON received')).toBe('fatal');
		});

		it('should classify high retry count as fatal', () => {
			expect(service.classifyError('Some error', { retryCount: 3 })).toBe('fatal');
			expect(service.classifyError('Some error', { retryCount: 4 })).toBe('fatal');
		});

		it('should classify other errors as data errors', () => {
			expect(service.classifyError('Missing required field')).toBe('data');
			expect(service.classifyError('Invalid value')).toBe('data');
			expect(service.classifyError('Unknown error')).toBe('data');
		});

		it('should handle Error objects', () => {
			expect(service.classifyError(new Error('Connection timeout'))).toBe('recoverable');
			expect(service.classifyError(new Error('Invalid JSON'))).toBe('fatal');
		});
	});

	describe('suggestRemediation', () => {
		let mockSupabase: ReturnType<typeof createMockSupabase>;
		let service: MigrationErrorService;

		beforeEach(() => {
			mockSupabase = createMockSupabase();
			// @ts-expect-error - Mock Supabase client
			service = new MigrationErrorService(mockSupabase);
		});

		it('should suggest skip for max retries reached', () => {
			const result = service.suggestRemediation({
				errorCategory: 'recoverable',
				errorMessage: 'Connection timeout',
				entityType: 'project',
				retryCount: 3,
				metadata: {}
			});

			expect(result.action).toBe('skip');
			expect(result.autoFixAvailable).toBe(false);
		});

		it('should suggest retry for recoverable errors', () => {
			const result = service.suggestRemediation({
				errorCategory: 'recoverable',
				errorMessage: 'Connection timeout',
				entityType: 'project',
				retryCount: 0,
				metadata: {}
			});

			expect(result.action).toBe('retry');
			expect(result.autoFixAvailable).toBe(true);
		});

		it('should suggest fallback for template match issues', () => {
			const result = service.suggestRemediation({
				errorCategory: 'data',
				errorMessage: 'Template match confidence below threshold',
				entityType: 'project',
				retryCount: 0,
				metadata: {}
			});

			expect(result.action).toBe('retry_with_fallback');
			expect(result.autoFixAvailable).toBe(true);
			expect(result.fallbackTemplate).toBe('project.generic');
		});

		it('should suggest fallback for schema validation errors', () => {
			const result = service.suggestRemediation({
				errorCategory: 'data',
				errorMessage: 'Schema validation failed',
				entityType: 'task',
				retryCount: 0,
				metadata: {}
			});

			expect(result.action).toBe('retry_with_fallback');
			expect(result.fallbackTemplate).toBe('task.execute');
		});

		it('should suggest manual fix for constraint violations', () => {
			const result = service.suggestRemediation({
				errorCategory: 'data',
				errorMessage: 'Foreign key constraint violation',
				entityType: 'task',
				retryCount: 0,
				metadata: {}
			});

			expect(result.action).toBe('manual_fix');
			expect(result.autoFixAvailable).toBe(false);
			expect(result.manualFixInstructions).toBeTruthy();
		});

		it('should suggest skip for fatal errors', () => {
			const result = service.suggestRemediation({
				errorCategory: 'fatal',
				errorMessage: 'Corrupted data',
				entityType: 'project',
				retryCount: 0,
				metadata: {}
			});

			expect(result.action).toBe('skip');
			expect(result.autoFixAvailable).toBe(false);
		});

		it('should suggest retry for unknown category', () => {
			const result = service.suggestRemediation({
				errorCategory: null,
				errorMessage: 'Unknown error',
				entityType: 'project',
				retryCount: 0,
				metadata: {}
			});

			expect(result.action).toBe('retry');
			expect(result.autoFixAvailable).toBe(true);
		});

		it('should use correct fallback template for phases', () => {
			const result = service.suggestRemediation({
				errorCategory: 'data',
				errorMessage: 'Template match failed',
				entityType: 'phase',
				retryCount: 0,
				metadata: {}
			});

			expect(result.fallbackTemplate).toBe('plan.timebox.sprint');
		});

		it('should have no fallback template for calendar events', () => {
			const result = service.suggestRemediation({
				errorCategory: 'data',
				errorMessage: 'Template match failed',
				entityType: 'calendar',
				retryCount: 0,
				metadata: {}
			});

			// Calendar has no fallback
			expect(result.fallbackTemplate).toBeUndefined();
		});
	});

	describe('getFallbackTemplate', () => {
		let mockSupabase: ReturnType<typeof createMockSupabase>;
		let service: MigrationErrorService;

		beforeEach(() => {
			mockSupabase = createMockSupabase();
			// @ts-expect-error - Mock Supabase client
			service = new MigrationErrorService(mockSupabase);
		});

		it('should return correct fallback for projects', () => {
			expect(service.getFallbackTemplate('project')).toBe('project.generic');
		});

		it('should return correct fallback for tasks', () => {
			expect(service.getFallbackTemplate('task')).toBe('task.execute');
		});

		it('should return correct fallback for phases', () => {
			expect(service.getFallbackTemplate('phase')).toBe('plan.timebox.sprint');
		});

		it('should return null for calendar', () => {
			expect(service.getFallbackTemplate('calendar')).toBeNull();
		});
	});
});
