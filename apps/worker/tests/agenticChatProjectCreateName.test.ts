// apps/worker/tests/agenticChatProjectCreateName.test.ts
//
// The explicit-project-name check on create_onto_project reads the name the
// user gave out of prose, so it misfires on possessives and descriptions. It
// exists to stop the model shortening a long explicit name ("Agentic Worker
// PC1" -> "Agentic Worker", 841fbe501); every other difference must pass.

import { beforeAll, describe, expect, it } from 'vitest';
import { ONTOLOGY_WRITE_TOOLS } from '@buildos/agentic-chat-runtime/catalog';
import { provideAgenticChatLoopToolCatalog } from '@buildos/agentic-chat-runtime/loop';
import { canonicalizeAgenticChatJson, type JsonObject } from '@buildos/shared-types';
import type {
	AgenticChatTurnProviderRequestV1,
	AgenticChatTurnProviderToolV1
} from '../src/workers/agentic-chat/provider/contracts';
import { validateCompletedProviderCalls } from '../src/workers/agentic-chat/provider/validation';

const projectCreateTools = ONTOLOGY_WRITE_TOOLS.filter(
	(tool) => tool.function.name === 'create_onto_project'
) as unknown as AgenticChatTurnProviderToolV1[];

function requestFor(message: string): AgenticChatTurnProviderRequestV1 {
	return {
		messages: [{ role: 'user', content: message }],
		tools: projectCreateTools,
		toolChoice: 'auto',
		contextType: 'project_create',
		projectId: null,
		entityId: null,
		userId: 'user-1',
		sessionId: 'session-1',
		turnRunId: 'turn-1',
		streamRunId: 'stream-1',
		clientTurnId: 'client-1',
		queueJobId: 'queue-1',
		processingToken: 'processing-1',
		executionGeneration: 1,
		providerRound: 'initial',
		logicalProviderRound: 1,
		signal: new AbortController().signal
	} as AgenticChatTurnProviderRequestV1;
}

function createProjectCall(name: string) {
	const argumentsValue: JsonObject = {
		project: { name, type_key: 'project.personal.home' },
		entities: [],
		relationships: []
	};
	return {
		id: 'create-project-1',
		name: 'create_onto_project',
		arguments: argumentsValue,
		canonicalArguments: canonicalizeAgenticChatJson(argumentsValue),
		canonicalProviderArguments: canonicalizeAgenticChatJson(argumentsValue)
	};
}

function nameErrors(message: string, proposedName: string): string[] {
	return validateCompletedProviderCalls(
		[createProjectCall(proposedName)],
		requestFor(message)
	).flatMap((issue) =>
		issue.errors.filter((error) => error.includes('The user explicitly named this project'))
	);
}

beforeAll(() => provideAgenticChatLoopToolCatalog(() => ({ ops: {}, byToolName: {} })));

describe('explicit project name on create', () => {
	const pc1Brief =
		'Create a project called Agentic Worker PC1. The goal is due September 15, with three starter tasks.';

	it('rejects a name cut short of the explicit name', () => {
		const errors = nameErrors(pc1Brief, 'Agentic Worker');
		expect(errors).toHaveLength(1);
		expect(errors[0]).toContain(
			'create_onto_project.project.name must preserve that exact name'
		);
	});

	it('accepts the explicit name as given', () => {
		expect(nameErrors(pc1Brief, 'Agentic Worker PC1')).toEqual([]);
	});

	it.each([
		// The quoted form stops at the possessive apostrophe and reads "Dad".
		[
			"Create a project called 'Dad's Garage'. The garage needs a cleanup plan.",
			"Dad's Garage"
		],
		["Create a project called 'Mom's Birthday'. The party is in May.", "Mom's Birthday"],
		// A description, not a name: reads "after my dog".
		['Create a project named after my dog. I call him Rex.', "Rex's Projects"],
		// An invitation to choose: reads "something short, you pick".
		[
			'Create a project called something short, you pick. The garden needs a plan.',
			'Garden Plan'
		],
		// Same name, different case.
		['Create a project called q3 launch. The goal is to ship by October.', 'Q3 Launch']
	])('accepts a sensible name when the prose misleads: %s', (message, proposedName) => {
		expect(nameErrors(message, proposedName)).toEqual([]);
	});
});
