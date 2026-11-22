// apps/worker/src/workers/agentic-chat/provider/knowledge-focus.test.ts
import { describe, expect, it } from 'vitest';
import {
	KNOWLEDGE_FOCUS_GUIDANCE,
	KNOWLEDGE_FOCUS_TOOL_PINS,
	buildKnowledgeFocusSection,
	readKnowledgeFocusSection,
	type KnowledgeFocusBrief
} from '@buildos/shared-agent-ops/knowledge';
import type { AgenticChatTurnProviderRequestV1 } from './contracts';
import { appendKnowledgeFocus, knowledgeFocusOf } from './knowledge-focus';

const ENTITY = '11111111-1111-4111-8111-111111111111';
const TWIN = '22222222-2222-4222-8222-222222222222';

const brief: KnowledgeFocusBrief = {
	entity: {
		id: ENTITY,
		kind: 'org',
		name: 'Griffin Davis',
		summary: null,
		circle: 'inner',
		known_by_me: false,
		own: true,
		researched_at: null
	},
	facts: [],
	incoming: [],
	missing: ['Description', 'Website'],
	twins: [
		{
			id: TWIN,
			kind: 'person',
			name: 'Griffin Davis',
			why: 'same_name',
			facts: [
				{
					predicate: 'works_at',
					label: 'Works at',
					value: 'Breaking Points',
					status: 'active'
				}
			],
			records: 4
		}
	],
	records: [],
	projects: [],
	research: [],
	not: []
};

const request = {
	messages: [
		{ role: 'system', content: 'system prompt' },
		{ role: 'user', content: 'find out more about him' }
	],
	tools: []
} as unknown as AgenticChatTurnProviderRequestV1;

const input = (promptSections: unknown[]) =>
	({ artifact: { prepared: { promptSections } } }) as never;

describe('a chat turn about one knowledge entry', () => {
	const section = JSON.parse(JSON.stringify(buildKnowledgeFocusSection(brief)));

	it('places the brief after the user message, with the copy and how to work', () => {
		const out = appendKnowledgeFocus(request, input([{ id: 'other' }, section]));
		expect(out.messages).toHaveLength(3);
		const last = out.messages.at(-1)!;
		expect(last.role).toBe('system');
		expect(last.content).toContain(`entry id ${ENTITY}`);
		expect(last.content).toContain('Works at: Breaking Points');
		expect(last.content).toContain(KNOWLEDGE_FOCUS_GUIDANCE);
		// The request it was given is untouched.
		expect(request.messages).toHaveLength(2);
	});

	it('leaves an ordinary turn exactly as it was', () => {
		expect(appendKnowledgeFocus(request, input([{ id: 'situational_rules' }]))).toBe(request);
		expect(knowledgeFocusOf([{ id: 'situational_rules' }])).toBeNull();
	});

	it('names the entry for the tool pins, and ignores a section without a real entry', () => {
		expect(knowledgeFocusOf([section])).toEqual({
			entity_id: ENTITY,
			name: 'Griffin Davis',
			kind: 'org'
		});
		expect(KNOWLEDGE_FOCUS_TOOL_PINS).toEqual(
			expect.arrayContaining(['web_search', 'web_visit', 'record_knowledge'])
		);
		const forged = { ...section, slots: { ...section.slots, entity_id: 'not-a-uuid' } };
		expect(readKnowledgeFocusSection([forged])).toBeNull();
		expect(appendKnowledgeFocus(request, input([forged]))).toBe(request);
	});
});
