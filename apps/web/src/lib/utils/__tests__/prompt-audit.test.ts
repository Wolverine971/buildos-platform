// src/lib/utils/__tests__/prompt-audit.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { savePromptForAudit, determineScenarioType } from '../prompt-audit';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import path from 'path';

// Mock fs modules
vi.mock('fs/promises');
vi.mock('fs');

describe('Prompt Audit', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Set NODE_ENV to development for tests
		process.env.NODE_ENV = 'development';

		// Mock existsSync to return true (directory exists)
		vi.mocked(fsSync.existsSync).mockReturnValue(true);

		// Mock writeFile to succeed
		vi.mocked(fs.writeFile).mockResolvedValue(undefined);

		// Spy on console methods
		vi.spyOn(console, 'log').mockImplementation(() => {});
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	describe('savePromptForAudit', () => {
		it('should save dual-processing-tasks-with-questions scenario correctly', async () => {
			const params = {
				systemPrompt: 'Test system prompt',
				userPrompt: 'Test user prompt',
				scenarioType: 'dual-processing-tasks-with-questions',
				metadata: {
					userId: 'test-user',
					projectId: 'test-project'
				}
			};

			await savePromptForAudit(params);

			// Verify writeFile was called with correct path
			expect(fs.writeFile).toHaveBeenCalledWith(
				expect.stringContaining(
					'dual-processing/dual-processing-tasks-with-questions-prompt.md'
				),
				expect.stringContaining('Test system prompt'),
				'utf-8'
			);

			// Verify success log
			expect(console.log).toHaveBeenCalledWith(
				'✅ Prompt audit saved: dual-processing/dual-processing-tasks-with-questions-prompt.md'
			);
		});

		it('should save existing-project-context-update scenario correctly', async () => {
			const params = {
				systemPrompt: 'Context update system prompt',
				userPrompt: 'Context update user prompt',
				scenarioType: 'existing-project-context-update',
				metadata: {
					userId: 'test-user',
					projectId: 'test-project',
					reason: 'testing'
				}
			};

			await savePromptForAudit(params);

			expect(fs.writeFile).toHaveBeenCalledWith(
				expect.stringContaining(
					'existing-project/existing-project-context-update-prompt.md'
				),
				expect.stringContaining('Context update system prompt'),
				'utf-8'
			);
		});

		it('should save dual-processing-context scenario correctly', async () => {
			const params = {
				systemPrompt: 'DP context system prompt',
				userPrompt: 'DP context user prompt',
				scenarioType: 'dual-processing-context',
				metadata: {}
			};

			await savePromptForAudit(params);

			expect(fs.writeFile).toHaveBeenCalledWith(
				expect.stringContaining('dual-processing/dual-processing-context-prompt.md'),
				expect.stringContaining('DP context system prompt'),
				'utf-8'
			);
		});

		it('should warn for unknown scenario type', async () => {
			const params = {
				systemPrompt: 'Test',
				userPrompt: 'Test',
				scenarioType: 'unknown-scenario',
				metadata: {}
			};

			await savePromptForAudit(params);

			expect(console.warn).toHaveBeenCalledWith(
				'Unknown scenario type for prompt audit: unknown-scenario'
			);
			expect(fs.writeFile).not.toHaveBeenCalled();
		});

		it('should not save in production mode', async () => {
			process.env.NODE_ENV = 'production';

			await savePromptForAudit({
				systemPrompt: 'Test',
				userPrompt: 'Test',
				scenarioType: 'dual-processing-context',
				metadata: {}
			});

			expect(fs.writeFile).not.toHaveBeenCalled();
		});

		it('should handle file write errors gracefully', async () => {
			vi.mocked(fs.writeFile).mockRejectedValue(new Error('Write failed'));

			await savePromptForAudit({
				systemPrompt: 'Test',
				userPrompt: 'Test',
				scenarioType: 'dual-processing-context',
				metadata: {}
			});

			expect(console.error).toHaveBeenCalledWith(
				'Failed to save prompt audit:',
				expect.any(Error)
			);
		});
	});

	describe('determineScenarioType', () => {
		it('should return dual-processing-questions for dual processing with questions', () => {
			const result = determineScenarioType({
				isNewProject: false,
				brainDumpLength: 1000,
				isDualProcessing: true,
				processingType: 'questions'
			});

			expect(result).toBe('dual-processing-questions');
		});

		it('should return dual-processing-context for dual processing context', () => {
			const result = determineScenarioType({
				isNewProject: false,
				brainDumpLength: 1000,
				isDualProcessing: true,
				processingType: 'context'
			});

			expect(result).toBe('dual-processing-context');
		});

		it('should return dual-processing-tasks for dual processing tasks', () => {
			const result = determineScenarioType({
				isNewProject: false,
				brainDumpLength: 1000,
				isDualProcessing: true,
				processingType: 'tasks'
			});

			expect(result).toBe('dual-processing-tasks');
		});

		it('should return new-project-short for new project with short content', () => {
			const result = determineScenarioType({
				isNewProject: true,
				brainDumpLength: 400,
				isDualProcessing: false
			});

			expect(result).toBe('new-project-short');
		});

		it('should return new-project-long for new project with long content', () => {
			const result = determineScenarioType({
				isNewProject: true,
				brainDumpLength: 600,
				isDualProcessing: false
			});

			expect(result).toBe('new-project-long');
		});

		it('should return existing-project-short for existing project with short content', () => {
			const result = determineScenarioType({
				isNewProject: false,
				brainDumpLength: 400,
				isDualProcessing: false
			});

			expect(result).toBe('existing-project-short');
		});

		it('should return existing-project-long for existing project with long content', () => {
			const result = determineScenarioType({
				isNewProject: false,
				brainDumpLength: 600,
				isDualProcessing: false
			});

			expect(result).toBe('existing-project-long');
		});
	});
});
