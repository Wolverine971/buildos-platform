// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/assistant-text-sanitization.test.ts
import { describe, it, expect } from 'vitest';
import { sanitizeAssistantFinalText, sanitizeToolPassLeadIn } from './assistant-text-sanitization';

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

	it('does not treat short conversational confirmations as final scratchpad by themselves', () => {
		expect(sanitizeAssistantFinalText('This is fine.')).toBe('This is fine.');
		expect(sanitizeAssistantFinalText('Perfect.')).toBe('Perfect.');
	});

	it('does not emit short scratchpad filler as a tool-pass lead-in', () => {
		expect(sanitizeToolPassLeadIn('This is fine.', 'create a project')).toBe(
			"I'll look that up in BuildOS and gather the relevant project details."
		);
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

	it('strips the April 18 Grok project-creation scratchpad leak before persistence', () => {
		const raw = [
			'This is fine.',
			'',
			"I'm in project creation mode, but the project has now been created successfully via create_onto_project.",
			'',
			'The tool result gave project_id: 8a2dd40f-e7d2-4b39-b0b0-41a6a9967cc0, counts, and a context_shift to the new project.',
			'',
			'The system message provides a <write_ledger> with successful_writes: 1 (create_onto_project, entity_id: 8a2dd40f-e7d2-4b39-b0b0-41a6a9967cc0), no failed_writes.',
			'',
			'Previous assistant response already handled the creation summary perfectly, matching the ledger.',
			'',
			'Now, this is the next turn.',
			'',
			'The human message was the initial one, tool was called, result came back, previous assistant responded with the summary.',
			'',
			'This might be a mistake in the prompt setup.',
			'',
			'I think the expectation is that the previous Assistant response is what was generated.',
			'',
			'I\'ve created your project **"The Last Ember"** (ID: `8a2dd40f-e7d2-4b39-b0b0-41a6a9967cc0`).'
		].join('\n');

		const cleaned = sanitizeAssistantFinalText(raw);
		expect(cleaned).toBe(
			'I\'ve created your project **"The Last Ember"** (ID: `8a2dd40f-e7d2-4b39-b0b0-41a6a9967cc0`).'
		);
		expect(cleaned).not.toContain('This is fine');
		expect(cleaned).not.toContain('project creation mode');
		expect(cleaned).not.toContain('The tool result gave');
		expect(cleaned).not.toContain('<write_ledger>');
		expect(cleaned).not.toContain('Previous assistant response');
		expect(cleaned).not.toContain('prompt setup');
	});

	it('strips the April 20 Grok project-creation rubric leak before persistence', () => {
		const raw = [
			'The tool result confirms: project_id "51b0a010-a90c-412e-acda-871509362493", with 1 goal, 7 tasks, 1 document, 9 edges.',
			'',
			'The write_ledger shows: successful_writes: 1 (create_onto_project), failed_writes: 0.',
			'',
			'Safety rules: Final response must ground in actual tool results.',
			'',
			'Name each successful write by title or what changed.',
			'',
			'Keep conversation useful for next user input.',
			'',
			'Current Focus: After creation succeeds, continue inside the created project instead of staying in abstract creation mode.',
			'',
			'Context has shifted to the new project.',
			'',
			'User-facing response: Direct prose, no planning or instructions echoed.',
			'',
			'Pre-tool lead-ins were intent only; now summarize outcomes precisely.',
			'',
			'Structure the response:',
			'',
			'- Announce the creation with exact details from result: project name, ID, type_key, state_key if specified.',
			'',
			'- Note the context shift.',
			'',
			'- Invite next action to keep proactive.',
			'',
			'Do not use tools unless needed now; context is sufficient, answer directly.',
			'',
			'It includes:',
			'',
			'- **Goal**: "Write the fantasy novel \'The Last Ember\'" - with a description tying to your main plot.',
			'',
			"Now we're focused here in the project.",
			'',
			'What would you like to do next - tackle a task, add more structure, or something else?'
		].join('\n');

		const cleaned = sanitizeAssistantFinalText(raw);
		expect(cleaned).toContain('Write the fantasy novel');
		expect(cleaned).toContain("Now we're focused here");
		expect(cleaned).toContain('What would you like to do next');
		expect(cleaned).not.toContain('The tool result confirms');
		expect(cleaned).not.toContain('write_ledger');
		expect(cleaned).not.toContain('Safety rules');
		expect(cleaned).not.toContain('Current Focus');
		expect(cleaned).not.toContain('User-facing response');
		expect(cleaned).not.toContain('Structure the response');
		expect(cleaned).not.toContain('It includes:');
		expect(cleaned).not.toContain('Do not use tools');
	});

	it('strips the April 20 Grok visible-channel contract failure before persistence', () => {
		const raw = [
			'User-facing response rules:',
			'',
			"Here, it's the project creation.",
			'',
			'- Do not claim things not in results.',
			'',
			'- After creation, continue inside the created project.',
			'',
			'- End by keeping conversation useful: suggest next steps.',
			'',
			'- Lead with success: Created project "The Last Ember" with ID.',
			'',
			"- List what's in it: 1 goal, 7 tasks linked.",
			'',
			'- Note context shift: now focused on this project.',
			'',
			'My previous assistant message was already a good draft, but ensure it matches exactly:',
			'',
			'- Mention successful write: project created.',
			'',
			'Structure:',
			'',
			'- Announce creation with details from result.',
			'',
			'- List entities briefly.',
			'',
			'- Prompt for next action.',
			'',
			'I\'ve created your project **"The Last Ember"** (ID: `bd47ae5b-d3ab-487f-9a2a-05b5ebc07e06`), a `project.creative.novel` in **planning** state.',
			'',
			'- **Goal**: "Write and complete the fantasy novel \'The Last Ember\'" - with your main plot description.',
			'',
			'- **7 tasks** linked to the goal: Develop main character backstory, Create magic system, Map out the kingdom, Write antagonist profiles, Outline first three chapters, Research medieval blacksmithing, and Design the prophecy.',
			'',
			"We're now focused on this project.",
			'',
			'What would you like to do next - maybe start on one of these tasks, add more details, or something else?'
		].join('\n');

		const cleaned = sanitizeAssistantFinalText(raw);
		expect(cleaned).toContain('I\'ve created your project **"The Last Ember"**');
		expect(cleaned).toContain('Write and complete the fantasy novel');
		expect(cleaned).toContain('7 tasks');
		expect(cleaned).toContain("We're now focused on this project");
		expect(cleaned).toContain('What would you like to do next');
		expect(cleaned).not.toContain('User-facing response rules');
		expect(cleaned).not.toContain("Here, it's the project creation");
		expect(cleaned).not.toContain('Do not claim things');
		expect(cleaned).not.toContain('After creation');
		expect(cleaned).not.toContain('Lead with success');
		expect(cleaned).not.toContain("List what's in it");
		expect(cleaned).not.toContain('My previous assistant message');
		expect(cleaned).not.toContain('Mention successful write');
		expect(cleaned).not.toContain('Structure:');
		expect(cleaned).not.toContain('Announce creation');
		expect(cleaned).not.toContain('List entities briefly');
		expect(cleaned).not.toContain('Prompt for next action');
	});

	it('strips the April 20 Grok task-write scratchpad and splits no-space final text', () => {
		const raw = [
			'All state_key: todo, type_key: task.execute.',
			'',
			'Safety rules: Name each successful write by title.',
			'',
			'Previous response already did this exactly, but now respond to the next user message?',
			'',
			'My previous thought was a sample, but now craft the actual final response.',
			'',
			'User reported progress: Finished Chapter 2, issues, Chapter 3 plans, continuity issue.',
			'',
			'Tools created tasks for those.',
			'',
			'Loaded context has existing tasks like "Outline first three chapters".',
			'',
			'Project has a context document: "The Last Ember Context Document".',
			'',
			'Perhaps suggest updating it or marking tasks done.',
			'',
			'User might want to track progress: e.g., mark "Outline first three chapters" as in_progress or done?',
			'',
			'But they said "Finished chapter 2", implying writing, not just outline.',
			'',
			'Existing tasks: Design prophecy, Research blacksmithing, Outline first three.',
			'',
			'For Chapter 3, tool had connections to outline task, but result does not show it explicitly.',
			'',
			'Keep proactive: Offer to update document, mark tasks, create chapter doc, etc.',
			'',
			'- Congratulate on Chapter 2.',
			'',
			'- Confirm the three new tasks created, list by title and ID.',
			'',
			'- Note linkages: all under main goal.',
			'',
			'- Ask what\'s next: update context doc with summaries?',
			'',
			'Mark research done?',
			'',
			'Start on revisions?',
			'',
			'Create a Chapter 2 doc?Great progress on Chapter 2 - 4,500 words and a strong dragon forge scene is a solid milestone for *The Last Ember*!',
			'',
			"I've captured your updates as three new tasks, all linked under the main goal:",
			'',
			'- "Revise Chapter 2: dialogue, pacing, sensory details" (ID: 64f34211-6131-4320-ac93-31430d2ac56c)',
			'',
			'- "Outline Chapter 3" (ID: 3ae35418-3a15-4a3f-9700-0970e30d5deb), which builds on your existing "Outline first three chapters" task',
			'',
			'These are all set to todo.'
		].join('\n');

		const cleaned = sanitizeAssistantFinalText(raw);
		expect(cleaned).toContain('Great progress on Chapter 2');
		expect(cleaned).toContain("I've captured your updates");
		expect(cleaned).toContain('Revise Chapter 2');
		expect(cleaned).toContain('Outline Chapter 3');
		expect(cleaned).toContain('These are all set to todo');
		expect(cleaned).not.toContain('All state_key');
		expect(cleaned).not.toContain('Previous response already');
		expect(cleaned).not.toContain('My previous thought');
		expect(cleaned).not.toContain('Tools created tasks');
		expect(cleaned).not.toContain('Create a Chapter 2 doc?');
	});
});
