// src/lib/services/synthesis/task-synthesis-prompt.test.ts

import { describe, it, expect } from 'vitest';
import { TaskSynthesisPrompt } from './task-synthesis-prompt';
import type { TaskSynthesisConfig } from '$lib/types/synthesis';

describe('TaskSynthesisPrompt', () => {
	const mockProjectData = `
Project: BuildOS
Tasks:
1. Task A - Implement feature X
2. Task B - Implement feature X with improvements
3. Task C - Design UI for feature Y
4. Task D - Create tests for feature X
`;
	const projectId = 'test-project-123';

	describe('generate', () => {
		it('should include the three-step reorganization process in base instruction', () => {
			const config: TaskSynthesisConfig = {
				consolidation: {
					enabled: false,
					aggressiveness: 'moderate',
					preserveDetails: true
				},
				sequencing: {
					enabled: false,
					considerDependencies: true,
					optimizeForParallel: false
				},
				grouping: { enabled: false, strategy: 'automatic', maxGroupSize: 5 },
				timeEstimation: {
					enabled: false,
					includeBufferTime: true,
					confidenceLevel: 'realistic'
				},
				gapAnalysis: {
					enabled: false,
					includePrerequisites: true,
					includeFollowUps: true,
					suggestMilestones: false
				},
				dependencies: { enabled: false, autoDetect: true, strictMode: false }
			};

			const prompt = TaskSynthesisPrompt.generate(mockProjectData, projectId, config);

			// Verify the three-step process is prominent
			expect(prompt).toContain('Three-Step Reorganization Process');
			expect(prompt).toContain('Step 1: LOGICAL SEQUENCING');
			expect(prompt).toContain('Step 2: LOGICAL GROUPING');
			expect(prompt).toContain('Step 3: LOGICAL SCOPING & TIMEBLOCKING');

			// Verify core analysis areas
			expect(prompt).toContain('Core Analysis Areas');
			expect(prompt).toContain('Task Overlaps');
			expect(prompt).toContain('Task Gaps');
			expect(prompt).toContain('Task Timeframes');
			expect(prompt).toContain('Task Dependencies');

			// Verify timeblocking guidance
			expect(prompt).toContain('Big/Complex Tasks');
			expect(prompt).toContain('Medium Tasks');
			expect(prompt).toContain('Small Tasks');
		});

		it('should generate a basic prompt with all features disabled', () => {
			const config: TaskSynthesisConfig = {
				consolidation: {
					enabled: false,
					aggressiveness: 'moderate',
					preserveDetails: true
				},
				sequencing: {
					enabled: false,
					considerDependencies: true,
					optimizeForParallel: false
				},
				grouping: { enabled: false, strategy: 'automatic', maxGroupSize: 5 },
				timeEstimation: {
					enabled: false,
					includeBufferTime: true,
					confidenceLevel: 'realistic'
				},
				gapAnalysis: {
					enabled: false,
					includePrerequisites: true,
					includeFollowUps: true,
					suggestMilestones: false
				},
				dependencies: { enabled: false, autoDetect: true, strictMode: false }
			};

			const prompt = TaskSynthesisPrompt.generate(mockProjectData, projectId, config);

			expect(prompt).toContain(
				'Your job is to synthesize and reorganize the tasks in this project'
			);
			expect(prompt).toContain(mockProjectData);
			expect(prompt).toContain(projectId);
			expect(prompt).not.toContain('Task Consolidation');
			expect(prompt).not.toContain('Task Sequencing');
			expect(prompt).not.toContain('Gap Analysis');
		});

		it('should include consolidation instructions when enabled', () => {
			const config: TaskSynthesisConfig = {
				consolidation: {
					enabled: true,
					aggressiveness: 'aggressive',
					preserveDetails: false
				},
				sequencing: {
					enabled: false,
					considerDependencies: true,
					optimizeForParallel: false
				},
				grouping: { enabled: false, strategy: 'automatic', maxGroupSize: 5 },
				timeEstimation: {
					enabled: false,
					includeBufferTime: true,
					confidenceLevel: 'realistic'
				},
				gapAnalysis: {
					enabled: false,
					includePrerequisites: true,
					includeFollowUps: true,
					suggestMilestones: false
				},
				dependencies: { enabled: false, autoDetect: true, strictMode: false }
			};

			const prompt = TaskSynthesisPrompt.generate(mockProjectData, projectId, config);

			expect(prompt).toContain('Task Consolidation');
			expect(prompt).toContain('Aggressiveness Level: aggressive');
			expect(prompt).toContain('Aggressively consolidate any related tasks');
			expect(prompt).toContain('Focus on essential details, summarize where appropriate');
			expect(prompt).toContain('CRITICAL: How to Write Consolidated Tasks');
			expect(prompt).toContain('DO NOT mention "combined", "merged", "consolidated"');
		});

		it('should include sequencing instructions when enabled', () => {
			const config: TaskSynthesisConfig = {
				consolidation: {
					enabled: false,
					aggressiveness: 'moderate',
					preserveDetails: true
				},
				sequencing: {
					enabled: true,
					considerDependencies: true,
					optimizeForParallel: true
				},
				grouping: { enabled: false, strategy: 'automatic', maxGroupSize: 5 },
				timeEstimation: {
					enabled: false,
					includeBufferTime: true,
					confidenceLevel: 'realistic'
				},
				gapAnalysis: {
					enabled: false,
					includePrerequisites: true,
					includeFollowUps: true,
					suggestMilestones: false
				},
				dependencies: { enabled: false, autoDetect: true, strictMode: false }
			};

			const prompt = TaskSynthesisPrompt.generate(mockProjectData, projectId, config);

			expect(prompt).toContain(
				'Task Sequencing & Logical Ordering (STEP 1 of Reorganization)'
			);
			expect(prompt).toContain('Consider Dependencies: true');
			expect(prompt).toContain('Optimize for Parallel Execution: true');
			expect(prompt).toContain('PARALLEL TRACKS');
		});

		it('should include gap analysis instructions when enabled', () => {
			const config: TaskSynthesisConfig = {
				consolidation: {
					enabled: false,
					aggressiveness: 'moderate',
					preserveDetails: true
				},
				sequencing: {
					enabled: false,
					considerDependencies: true,
					optimizeForParallel: false
				},
				grouping: { enabled: false, strategy: 'automatic', maxGroupSize: 5 },
				timeEstimation: {
					enabled: false,
					includeBufferTime: true,
					confidenceLevel: 'realistic'
				},
				gapAnalysis: {
					enabled: true,
					includePrerequisites: true,
					includeFollowUps: true,
					suggestMilestones: true
				},
				dependencies: { enabled: false, autoDetect: true, strictMode: false }
			};

			const prompt = TaskSynthesisPrompt.generate(mockProjectData, projectId, config);

			expect(prompt).toContain('Gap Analysis & Task Steps');
			expect(prompt).toContain('Identify Prerequisites');
			expect(prompt).toContain('Identify Follow-ups');
			expect(prompt).toContain('Add Milestones');
		});

		it('should include time estimation instructions with conservative level', () => {
			const config: TaskSynthesisConfig = {
				consolidation: {
					enabled: false,
					aggressiveness: 'moderate',
					preserveDetails: true
				},
				sequencing: {
					enabled: false,
					considerDependencies: true,
					optimizeForParallel: false
				},
				grouping: { enabled: false, strategy: 'automatic', maxGroupSize: 5 },
				timeEstimation: {
					enabled: true,
					includeBufferTime: true,
					confidenceLevel: 'conservative'
				},
				gapAnalysis: {
					enabled: false,
					includePrerequisites: true,
					includeFollowUps: true,
					suggestMilestones: false
				},
				dependencies: { enabled: false, autoDetect: true, strictMode: false }
			};

			const prompt = TaskSynthesisPrompt.generate(mockProjectData, projectId, config);

			expect(prompt).toContain('Time Estimation & Timeblocking');
			expect(prompt).toContain('Confidence Level: conservative');
			expect(prompt).toContain('conservative estimates with built-in contingency');
			expect(prompt).toContain('Add 15-20% buffer for unexpected issues');
		});

		it('should include grouping instructions with theme strategy', () => {
			const config: TaskSynthesisConfig = {
				consolidation: {
					enabled: false,
					aggressiveness: 'moderate',
					preserveDetails: true
				},
				sequencing: {
					enabled: false,
					considerDependencies: true,
					optimizeForParallel: false
				},
				grouping: { enabled: true, strategy: 'theme', maxGroupSize: 8 },
				timeEstimation: {
					enabled: false,
					includeBufferTime: true,
					confidenceLevel: 'realistic'
				},
				gapAnalysis: {
					enabled: false,
					includePrerequisites: true,
					includeFollowUps: true,
					suggestMilestones: false
				},
				dependencies: { enabled: false, autoDetect: true, strictMode: false }
			};

			const prompt = TaskSynthesisPrompt.generate(mockProjectData, projectId, config);

			expect(prompt).toContain('Task Grouping & Batching (STEP 2 of Reorganization)');
			expect(prompt).toContain('Strategy: theme');
			expect(prompt).toContain('Group tasks by similar topics or functional areas');
			expect(prompt).toContain('Maximum Group Size: 8');
		});

		it('should include dependencies instructions with strict mode', () => {
			const config: TaskSynthesisConfig = {
				consolidation: {
					enabled: false,
					aggressiveness: 'moderate',
					preserveDetails: true
				},
				sequencing: {
					enabled: false,
					considerDependencies: true,
					optimizeForParallel: false
				},
				grouping: { enabled: false, strategy: 'automatic', maxGroupSize: 5 },
				timeEstimation: {
					enabled: false,
					includeBufferTime: true,
					confidenceLevel: 'realistic'
				},
				gapAnalysis: {
					enabled: false,
					includePrerequisites: true,
					includeFollowUps: true,
					suggestMilestones: false
				},
				dependencies: { enabled: true, autoDetect: true, strictMode: true }
			};

			const prompt = TaskSynthesisPrompt.generate(mockProjectData, projectId, config);

			expect(prompt).toContain('Task Dependencies');
			expect(prompt).toContain('Auto-detect Dependencies: true');
			expect(prompt).toContain('Strict Mode: true');
			expect(prompt).toContain('Enforce strict dependency chains');
		});

		it('should include multiple enabled features in correct order', () => {
			const config: TaskSynthesisConfig = {
				consolidation: { enabled: true, aggressiveness: 'moderate', preserveDetails: true },
				sequencing: {
					enabled: true,
					considerDependencies: false,
					optimizeForParallel: false
				},
				grouping: { enabled: true, strategy: 'resource', maxGroupSize: 5 },
				timeEstimation: {
					enabled: false,
					includeBufferTime: true,
					confidenceLevel: 'realistic'
				},
				gapAnalysis: {
					enabled: true,
					includePrerequisites: true,
					includeFollowUps: false,
					suggestMilestones: false
				},
				dependencies: { enabled: false, autoDetect: true, strictMode: false }
			};

			const prompt = TaskSynthesisPrompt.generate(mockProjectData, projectId, config);

			// Check all enabled features are present
			expect(prompt).toContain('Task Consolidation');
			expect(prompt).toContain('Task Sequencing');
			expect(prompt).toContain('Task Grouping');
			expect(prompt).toContain('Gap Analysis');

			// Check disabled features are not present in the instructions section
			expect(prompt).not.toContain('Time Estimation & Timeblocking');
			// Note: "Task Dependencies" appears in Core Analysis Areas but not as a feature section

			// Check specific configurations
			expect(prompt).toContain('moderate');
			expect(prompt).toContain('Consider Dependencies: false');
			expect(prompt).toContain('Strategy: resource');
			expect(prompt).toContain('Include Prerequisites: true');
		});

		it('should include proper JSON response format', () => {
			const config: TaskSynthesisConfig = {
				consolidation: { enabled: true, aggressiveness: 'moderate', preserveDetails: true },
				sequencing: {
					enabled: false,
					considerDependencies: true,
					optimizeForParallel: false
				},
				grouping: { enabled: false, strategy: 'automatic', maxGroupSize: 5 },
				timeEstimation: {
					enabled: false,
					includeBufferTime: true,
					confidenceLevel: 'realistic'
				},
				gapAnalysis: {
					enabled: false,
					includePrerequisites: true,
					includeFollowUps: true,
					suggestMilestones: false
				},
				dependencies: { enabled: false, autoDetect: true, strictMode: false }
			};

			const prompt = TaskSynthesisPrompt.generate(mockProjectData, projectId, config);

			expect(prompt).toContain('Required JSON Response Format');
			expect(prompt).toContain('"operation": "update|create"');
			expect(prompt).toContain('"table": "tasks"');
			expect(prompt).toContain('"reasoning"');
			expect(prompt).toContain('"comparison"');
			expect(prompt).toContain(`"project_id": "${projectId}"`);

			// Verify the important writing rules
			expect(prompt).toContain('IMPORTANT WRITING RULES');
			expect(prompt).toContain('NEVER** write "this task combines X and Y"');
			expect(prompt).toContain(
				'ONLY** mention consolidation/merging in the "reasoning" field'
			);
		});

		it('should show comprehensive reorganization message when all major features enabled', () => {
			const config: TaskSynthesisConfig = {
				consolidation: { enabled: true, aggressiveness: 'moderate', preserveDetails: true },
				sequencing: {
					enabled: true,
					considerDependencies: true,
					optimizeForParallel: false
				},
				grouping: { enabled: true, strategy: 'automatic', maxGroupSize: 5 },
				timeEstimation: {
					enabled: true,
					includeBufferTime: true,
					confidenceLevel: 'realistic'
				},
				gapAnalysis: {
					enabled: true,
					includePrerequisites: true,
					includeFollowUps: true,
					suggestMilestones: false
				},
				dependencies: { enabled: false, autoDetect: true, strictMode: false }
			};

			const prompt = TaskSynthesisPrompt.generate(mockProjectData, projectId, config);

			// Should show comprehensive reorganization instead of individual instructions
			expect(prompt).toContain('COMPREHENSIVE TASK REORGANIZATION');
			expect(prompt).toContain('You are performing a FULL PROJECT REORGANIZATION');

			// Verify the three steps are explained
			expect(prompt).toContain('STEP 1: SEQUENCE');
			expect(prompt).toContain('Natural workflow progression');
			expect(prompt).toContain('STEP 2: GROUP & BATCH');
			expect(prompt).toContain('Tasks using same tools/resources');
			expect(prompt).toContain('STEP 3: SCOPE & TIMEBLOCK');
			expect(prompt).toContain('Major Initiatives');
			expect(prompt).toContain('Deep Work Blocks');
			expect(prompt).toContain('CRITICAL');
		});

		it('should handle edge case with all features enabled', () => {
			const config: TaskSynthesisConfig = {
				consolidation: {
					enabled: true,
					aggressiveness: 'conservative',
					preserveDetails: true
				},
				sequencing: {
					enabled: true,
					considerDependencies: true,
					optimizeForParallel: true
				},
				grouping: { enabled: true, strategy: 'timeline', maxGroupSize: 10 },
				timeEstimation: {
					enabled: true,
					includeBufferTime: false,
					confidenceLevel: 'optimistic'
				},
				gapAnalysis: {
					enabled: true,
					includePrerequisites: true,
					includeFollowUps: true,
					suggestMilestones: true
				},
				dependencies: { enabled: true, autoDetect: false, strictMode: false }
			};

			const prompt = TaskSynthesisPrompt.generate(mockProjectData, projectId, config);

			// Verify all sections are present
			expect(prompt).toContain('Task Consolidation');
			expect(prompt).toContain('Task Sequencing');
			expect(prompt).toContain('Task Grouping');
			expect(prompt).toContain('Time Estimation');
			expect(prompt).toContain('Gap Analysis');
			expect(prompt).toContain('Task Dependencies');

			// Verify the comprehensive reorganization message
			expect(prompt).toContain('COMPREHENSIVE TASK REORGANIZATION');
			expect(prompt).toContain('STEP 1: SEQUENCE');
			expect(prompt).toContain('STEP 2: GROUP & BATCH');
			expect(prompt).toContain('STEP 3: SCOPE & TIMEBLOCK');

			// Verify guidelines section reflects enabled features
			expect(prompt).toContain('Consolidate overlapping tasks to eliminate redundancy');
			expect(prompt).toContain('Create a logical workflow that minimizes context switching');
			expect(prompt).toContain('Batch similar tasks for efficient execution');
			expect(prompt).toContain('Assign realistic timeblocks - longer for complex tasks!');
			expect(prompt).toContain('Add missing prework, postwork, and intermediate steps');
			expect(prompt).toContain('Map clear task dependencies and prerequisites');
		});
	});
});
