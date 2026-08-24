// packages/agentic-chat-runtime/src/loop/project-semantics.test.ts
import { describe, expect, it } from 'vitest';
import {
	buildAgenticChatProjectContextDocumentV1,
	normalizeAgenticChatProjectStateV1
} from './project-semantics';

describe('Agentic Chat project semantics', () => {
	it('normalizes shared project-state aliases and fails closed for unknown states', () => {
		expect(normalizeAgenticChatProjectStateV1(' in progress ')).toBe('active');
		expect(normalizeAgenticChatProjectStateV1('archived')).toBe('cancelled');
		expect(normalizeAgenticChatProjectStateV1('invented')).toBeNull();
	});

	it('builds the same complete context template for every host', () => {
		const document = buildAgenticChatProjectContextDocumentV1({
			name: 'Launch',
			description: 'Ship the product.',
			spark: 'Customer interviews',
			goals: [{ name: 'Release', description: 'Reach production' }],
			tasks: [{ title: 'Run smoke test', stateKey: 'todo' }],
			generatedAt: '2026-08-24T12:00:00.000Z'
		});

		expect(document.content).toContain('- Release — Reach production');
		expect(document.content).toContain('- Run smoke test · todo');
		expect(document.body_markdown).toBe(document.content);
		expect(document.props).toMatchObject({
			source: 'agent_project_creation',
			source_notes: 'Customer interviews'
		});
	});
});
