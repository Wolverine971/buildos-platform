// src/lib/services/synthesis/__tests__/task-synthesis-prompt.test.ts
import { describe, it, expect } from 'vitest';
import {
	buildPrompt,
	buildAnalysisInstructions,
	getConsolidationInstructions,
	getBaseInstruction
} from '../task-synthesis-helpers';
import type { CompositeTask } from '$lib/types';

describe('Task Synthesis Prompt', () => {
	const mockTasks: CompositeTask[] = [
		{
			id: 'task-1',
			title: 'Write unit tests',
			description: 'Create comprehensive unit tests for the authentication module',
			details: 'Cover login, logout, and session management',
			status: 'in_progress',
			priority: 'high',
			task_type: 'one_off',
			duration_minutes: 120,
			project_id: 'project-1',
			created_at: '2024-01-01T00:00:00Z',
			updated_at: '2024-01-01T00:00:00Z',
			user_id: 'user-1'
		},
		{
			id: 'task-2',
			title: 'Write integration tests',
			description: 'Create integration tests for auth flow',
			details: 'Test the full authentication workflow',
			status: 'backlog',
			priority: 'high',
			task_type: 'one_off',
			duration_minutes: 90,
			project_id: 'project-1',
			created_at: '2024-01-01T00:00:00Z',
			updated_at: '2024-01-01T00:00:00Z',
			user_id: 'user-1'
		},
		{
			id: 'task-3',
			title: 'Update documentation',
			description: 'Update API documentation',
			details: 'Document all new endpoints',
			status: 'backlog',
			priority: 'low',
			task_type: 'one_off',
			duration_minutes: 30,
			project_id: 'project-1',
			created_at: '2024-01-01T00:00:00Z',
			updated_at: '2024-01-01T00:00:00Z',
			user_id: 'user-1'
		}
	];

	const mockProjectContext = {
		name: 'Test Project',
		description: 'A project for testing',
		goals: 'Complete authentication system',
		constraints: 'Must be done by end of month'
	};

	describe('getBaseInstruction', () => {
		it('should include three-step reorganization process', () => {
			const instruction = getBaseInstruction();

			expect(instruction).toContain('Three-Step Reorganization Process');
			expect(instruction).toContain('Step 1: LOGICAL SEQUENCING');
			expect(instruction).toContain('Step 2: LOGICAL GROUPING');
			expect(instruction).toContain('Step 3: LOGICAL SCOPING & TIMEBLOCKING');
		});

		it('should include timeblocking guidance', () => {
			const instruction = getBaseInstruction();

			expect(instruction).toContain('Big/Complex Tasks');
			expect(instruction).toContain('2+ hours or multiple days');
			expect(instruction).toContain('Medium Tasks');
			expect(instruction).toContain('30-90 minutes');
			expect(instruction).toContain('Small Tasks');
			expect(instruction).toContain('15-30 minutes each');
		});
	});

	describe('buildAnalysisInstructions', () => {
		it('should include comprehensive reorganization instructions', () => {
			const instructions = buildAnalysisInstructions();

			expect(instructions).toContain('COMPREHENSIVE REORGANIZATION');
			expect(instructions).toContain('Dependency Management');
			expect(instructions).toContain('Efficient Grouping');
			expect(instructions).toContain('Time Estimation');
		});

		it('should include task batching rules', () => {
			const instructions = buildAnalysisInstructions();

			expect(instructions).toContain('Group similar small tasks');
			expect(instructions).toContain('same tools or context');
			expect(instructions).toContain('can be done in one sitting');
		});

		it('should include prioritization guidance', () => {
			const instructions = buildAnalysisInstructions();

			expect(instructions).toContain('High-priority blockers first');
			expect(instructions).toContain('Quick wins early');
			expect(instructions).toContain('Deep work blocks');
		});
	});

	describe('getConsolidationInstructions', () => {
		it('should include CRITICAL writing rules', () => {
			const instructions = getConsolidationInstructions();

			expect(instructions).toContain('CRITICAL');
			expect(instructions).toContain('DO NOT mention "combined", "merged", "consolidated"');
			expect(instructions).toContain('description should read as if it was always one task');
		});

		it('should provide examples of good vs bad descriptions', () => {
			const instructions = getConsolidationInstructions();

			expect(instructions).toContain('BAD');
			expect(instructions).toContain('This combines task A and task B');
			expect(instructions).toContain('GOOD');
			expect(instructions).toContain(
				'Implement comprehensive test coverage for authentication module'
			);
		});

		it('should specify where to put consolidation explanation', () => {
			const instructions = getConsolidationInstructions();

			expect(instructions).toContain('reasoning field');
			expect(instructions).toContain('explain that tasks were consolidated');
		});
	});

	describe('buildPrompt', () => {
		it('should build complete prompt with all sections', () => {
			const prompt = buildPrompt(mockTasks, mockProjectContext);

			// Check for main sections
			expect(prompt).toContain('Three-Step Reorganization Process');
			expect(prompt).toContain('Project Context');
			expect(prompt).toContain('Current Tasks (3 tasks)');
			expect(prompt).toContain('COMPREHENSIVE REORGANIZATION');
			expect(prompt).toContain('Response Format');
		});

		it('should include project context when provided', () => {
			const prompt = buildPrompt(mockTasks, mockProjectContext);

			expect(prompt).toContain('Test Project');
			expect(prompt).toContain('A project for testing');
			expect(prompt).toContain('Complete authentication system');
			expect(prompt).toContain('Must be done by end of month');
		});

		it('should handle missing project context gracefully', () => {
			const prompt = buildPrompt(mockTasks, undefined);

			expect(prompt).toContain('Project Context');
			expect(prompt).toContain('No specific project context provided');
		});

		it('should include all tasks in JSON format', () => {
			const prompt = buildPrompt(mockTasks, mockProjectContext);

			// Check for task titles in the JSON
			expect(prompt).toContain('Write unit tests');
			expect(prompt).toContain('Write integration tests');
			expect(prompt).toContain('Update documentation');

			// Check for task properties
			expect(prompt).toContain('"priority": "high"');
			expect(prompt).toContain('"status": "in_progress"');
			expect(prompt).toContain('"duration_minutes": 120');
		});

		it('should include consolidation instructions', () => {
			const prompt = buildPrompt(mockTasks, mockProjectContext);

			expect(prompt).toContain('When Consolidating Tasks');
			expect(prompt).toContain('CRITICAL');
			expect(prompt).toContain('DO NOT mention');
		});

		it('should include response format specification', () => {
			const prompt = buildPrompt(mockTasks, mockProjectContext);

			expect(prompt).toContain('"operations": [');
			expect(prompt).toContain('"comparison": [');
			expect(prompt).toContain('"insights":');
			expect(prompt).toContain('"summary":');
		});

		it('should include IMPORTANT WRITING RULES section', () => {
			const prompt = buildPrompt(mockTasks, mockProjectContext);

			expect(prompt).toContain('IMPORTANT WRITING RULES');
			expect(prompt).toContain('Never use words like "combined", "merged", "consolidated"');
			expect(prompt).toContain('task descriptions and details');
		});

		it('should handle empty task list', () => {
			const prompt = buildPrompt([], mockProjectContext);

			expect(prompt).toContain('Current Tasks (0 tasks)');
			expect(prompt).toContain('[]');
		});

		it('should handle large task lists', () => {
			const manyTasks = Array.from({ length: 100 }, (_, i) => ({
				...mockTasks[0],
				id: `task-${i}`,
				title: `Task ${i}`
			}));

			const prompt = buildPrompt(manyTasks, mockProjectContext);

			expect(prompt).toContain('Current Tasks (100 tasks)');
			expect(prompt).toContain('Task 0');
			expect(prompt).toContain('Task 99');
		});
	});

	describe('Time Estimation Guidance', () => {
		it('should provide clear duration guidelines', () => {
			const prompt = buildPrompt(mockTasks, mockProjectContext);

			// Check for time estimation rules
			expect(prompt).toContain('realistic duration');
			expect(prompt).toContain('Big/Complex Tasks');
			expect(prompt).toContain('Small Tasks');
			expect(prompt).toContain('Medium Tasks');
		});

		it('should encourage proper timeblocking', () => {
			const instructions = buildAnalysisInstructions();

			expect(instructions).toContain('Be realistic about time');
			expect(instructions).toContain('complex tasks need more time');
			expect(instructions).toContain("Don't underestimate");
		});
	});

	describe('Sequencing and Dependencies', () => {
		it('should include dependency management instructions', () => {
			const instructions = buildAnalysisInstructions();

			expect(instructions).toContain('Identify tasks that block others');
			expect(instructions).toContain('Create logical chains');
			expect(instructions).toContain('prerequisites');
		});

		it('should encourage logical workflow', () => {
			const baseInstruction = getBaseInstruction();

			expect(baseInstruction).toContain('logical order');
			expect(baseInstruction).toContain('dependencies');
			expect(baseInstruction).toContain('natural workflow progression');
		});
	});

	describe('Operation Types', () => {
		it('should support all operation types in response format', () => {
			const prompt = buildPrompt(mockTasks, mockProjectContext);

			// Check for operation structure
			expect(prompt).toContain('"operation": "update" | "create"');
			expect(prompt).toContain('"deleted_at": "ISO timestamp" | null');
			expect(prompt).toContain('"enabled": true');
		});

		it('should include reasoning for all operations', () => {
			const prompt = buildPrompt(mockTasks, mockProjectContext);

			expect(prompt).toContain('"reasoning":');
			expect(prompt).toContain('Explanation for this change');
		});
	});
});
