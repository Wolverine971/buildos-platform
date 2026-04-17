// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/assistant-text-sanitization.test.ts
import { describe, it, expect } from 'vitest';
import { sanitizeAssistantFinalText } from './assistant-text-sanitization';

describe('sanitizeAssistantFinalText', () => {
	it('returns text unchanged when no scratchpad markers are present', () => {
		const raw =
			"I've created the project **The Last Ember** (ID: abc-123). It has 1 goal and 7 tasks. What next?";
		expect(sanitizeAssistantFinalText(raw)).toBe(raw);
	});

	it('strips the Grok-style "Final-response rules:" scratchpad prefix observed in 2026-04-17 replay', () => {
		const raw = [
			'Follow additional instructions.',
			'',
			'This is post-tool response.',
			'',
			'The tool call succeeded: create_onto_project created the project with ID abc-123.',
			'',
			'Final-response rules:',
			'',
			'- Mention every Successful write that materially matters: Yes, mention the project creation, goals, tasks, etc., grounded in the result.',
			'',
			'- Ground in actual results: counts: goals:1, tasks:7, documents:1 (probably the context_document), edges:9.',
			'',
			'- Do not claim anything not in successful writes.',
			'',
			'- Context shifted to the new project.',
			'',
			'Operating Strategy:',
			'',
			'- After tool call, anchor in what the tool returned: Project created, now in project context.',
			'',
			'- Keep conversation useful for next step.',
			'',
			'Response should:',
			'',
			'- Confirm creation with ID.',
			'',
			'- List entities accurately.',
			'',
			'- Offer next steps, like working on a task, since now in project context.',
			'',
			"I've created the project **The Last Ember** (ID: abc-123), a `project.creative.novel` in **planning** state."
		].join('\n');

		const cleaned = sanitizeAssistantFinalText(raw);
		expect(cleaned).toContain("I've created the project");
		expect(cleaned).toContain('The Last Ember');
		// The prompt-header echoes must be gone.
		expect(cleaned).not.toContain('Final-response rules');
		expect(cleaned).not.toContain('Operating Strategy:');
		expect(cleaned).not.toContain('Response should:');
		expect(cleaned).not.toContain('Follow additional instructions');
		expect(cleaned).not.toContain('post-tool response');
		expect(cleaned).not.toContain('Mention every Successful write');
		expect(cleaned).not.toContain('Do not claim anything');
	});

	it('strips lines that paraphrase the write ledger wrapper or final-response rules', () => {
		const raw = [
			'<write_ledger>',
			'Use the ledger as the source of truth for this response.',
			'Mention every successful write.',
			'',
			"Here's what I did: created 3 tasks and updated the outline."
		].join('\n');

		const cleaned = sanitizeAssistantFinalText(raw);
		expect(cleaned).toContain('created 3 tasks');
		expect(cleaned).not.toContain('<write_ledger>');
		expect(cleaned).not.toContain('Use the ledger');
		expect(cleaned).not.toContain('Mention every successful write');
	});

	it('preserves legitimate content that happens to mention "rules" in prose', () => {
		// Sanity check that we did not over-match. The scratchpad patterns all
		// anchor on `^` and specific phrases; regular prose should pass through.
		const raw =
			"The agent follows BuildOS rules for task placement. I've updated the task and linked it to the goal.";
		const cleaned = sanitizeAssistantFinalText(raw);
		expect(cleaned).toContain('BuildOS rules');
		expect(cleaned).toContain("I've updated the task");
	});

	it('strips legacy scratchpad patterns (actually/no, wait/tool schema echoes)', () => {
		const raw = [
			'No, wait. I should fetch schema first.',
			'Actually, let me reconsider.',
			'args need to include project_id.',
			"I've created the task successfully."
		].join('\n');

		const cleaned = sanitizeAssistantFinalText(raw);
		expect(cleaned).toContain("I've created the task");
		expect(cleaned).not.toContain('No, wait');
		expect(cleaned).not.toContain('Actually');
		expect(cleaned).not.toContain('args need');
	});
});
