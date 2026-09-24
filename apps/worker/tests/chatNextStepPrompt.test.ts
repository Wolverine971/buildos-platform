// apps/worker/tests/chatNextStepPrompt.test.ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/supabase', () => ({ supabase: {} }));
vi.mock('../src/lib/services/smart-llm-service', () => ({ SmartLLMService: vi.fn() }));
vi.mock('../src/lib/errorLogger', () => ({ logWorkerError: vi.fn() }));

import { buildNextStepPrompt } from '../src/workers/chat/chatSessionActivityProcessor';

const context = {
	projectId: 'project-1',
	projectName: '100-Day Nonfiction Book Project',
	projectDescription: 'Contract to self-published manuscript.',
	templateType: 'project.creative.book.nonfiction',
	goals: [],
	recentCompletedTasks: [],
	taskGoalLinks: [],
	recentActivity: [],
	sessionChanges: { created: [], updated: [], deleted: [] },
	previousNextStep: { short: 'Draft the one-page book overview.', long: null }
};

describe('buildNextStepPrompt', () => {
	it('puts START HERE ahead of the previous step and marks that step as possibly stale', () => {
		const prompt = buildNextStepPrompt(
			context,
			[],
			'## Current state\n- First-pass chapter outline written; filling gaps, starting with the AI pillar.'
		);
		const startHereAt = prompt.indexOf('## START HERE (current state and decisions)');
		const previousAt = prompt.indexOf('## Previous Next Step (may be out of date)');
		expect(startHereAt).toBeGreaterThan(-1);
		expect(previousAt).toBeGreaterThan(startHereAt);
		expect(prompt).toContain('starting with the AI pillar');
	});

	it('omits the START HERE block when the project has none', () => {
		const prompt = buildNextStepPrompt(context, [], null);
		expect(prompt).not.toContain('## START HERE');
		expect(prompt).toContain('Draft the one-page book overview.');
	});
});
