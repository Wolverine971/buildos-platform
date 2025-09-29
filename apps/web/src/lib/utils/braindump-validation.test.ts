// src/lib/utils/braindump-validation.test.ts
import { describe, it, expect } from 'vitest';
import { BrainDumpValidator } from './braindump-validation';

describe('BrainDumpValidator', () => {
	describe('validateDual', () => {
		it('should allow short content with null project ID (new project)', async () => {
			const request = {
				content: 'Short content under 500 chars',
				selectedProjectId: null,
				brainDumpId: 'test-id'
			};

			const result = await BrainDumpValidator.validateDual(request);

			expect(result.isValid).toBe(true);
			expect(result.validatedData?.selectedProjectId).toBe(null);
		});

		it('should allow short content with existing project ID', async () => {
			const request = {
				content: 'Short content under 500 chars',
				selectedProjectId: 'existing-project-123',
				brainDumpId: 'test-id'
			};

			const result = await BrainDumpValidator.validateDual(request);

			expect(result.isValid).toBe(true);
			expect(result.validatedData?.selectedProjectId).toBe('existing-project-123');
		});

		it('should allow long content with null project ID', async () => {
			const request = {
				content: 'a'.repeat(600), // Long content over 500 chars
				selectedProjectId: null,
				brainDumpId: 'test-id'
			};

			const result = await BrainDumpValidator.validateDual(request);

			expect(result.isValid).toBe(true);
			expect(result.validatedData?.selectedProjectId).toBe(null);
		});

		it('should allow long content with existing project ID', async () => {
			const request = {
				content: 'a'.repeat(600), // Long content over 500 chars
				selectedProjectId: 'existing-project-123',
				brainDumpId: 'test-id'
			};

			const result = await BrainDumpValidator.validateDual(request);

			expect(result.isValid).toBe(true);
			expect(result.validatedData?.selectedProjectId).toBe('existing-project-123');
		});

		it('should require non-empty content', async () => {
			const request = {
				content: '',
				selectedProjectId: null,
				brainDumpId: 'test-id'
			};

			const result = await BrainDumpValidator.validateDual(request);

			expect(result.isValid).toBe(false);
		});
	});

	describe('validateShort', () => {
		it('should require project ID for short endpoint', async () => {
			const request = {
				content: 'Short content',
				selectedProjectId: null,
				brainDumpId: 'test-id'
			};

			const result = await BrainDumpValidator.validateShort(request);

			expect(result.isValid).toBe(false);
			expect(result.error).toBeDefined();
		});

		it('should allow short content with project ID', async () => {
			const request = {
				content: 'Short content',
				selectedProjectId: 'existing-project-123',
				brainDumpId: 'test-id'
			};

			const result = await BrainDumpValidator.validateShort(request);

			expect(result.isValid).toBe(true);
			expect(result.validatedData?.selectedProjectId).toBe('existing-project-123');
		});

		it('should reject content over 500 chars', async () => {
			const request = {
				content: 'a'.repeat(501),
				selectedProjectId: 'existing-project-123',
				brainDumpId: 'test-id'
			};

			const result = await BrainDumpValidator.validateShort(request);

			expect(result.isValid).toBe(false);
		});
	});
});
