// apps/worker/tests/agenticChatProjectCreateName.test.ts
//
// The explicit-project-name check on create_onto_project exists to stop the
// model shortening a long explicit name ("Agentic Worker PC1" -> "Agentic
// Worker", 841fbe501). It only reads a name the user delimited with ASCII or
// typographic quotes; an unquoted name is never validated, and every
// difference other than a strict shortened prefix must pass.

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
		'Create a project called "Agentic Worker PC1". The goal is due September 15, with three starter tasks.';

	it('rejects a name cut short of the quoted explicit name', () => {
		const errors = nameErrors(pc1Brief, 'Agentic Worker');
		expect(errors).toHaveLength(1);
		expect(errors[0]).toContain(
			'create_onto_project.project.name must preserve that exact name'
		);
		expect(errors[0]).toContain('"Agentic Worker PC1"');
	});

	it.each([
		'Create a project called “Agentic Worker PC1”. The goal is due September 15.',
		'Create a project named ‘Agentic Worker PC1’. The goal is due September 15.',
		"Create a project called 'Agentic Worker PC1'. The goal is due September 15."
	])('rejects a shortened name inside typographic or single quotes: %s', (message) => {
		const errors = nameErrors(message, 'Agentic Worker');
		expect(errors).toHaveLength(1);
		// The wrapping quote characters are not part of the expected name.
		expect(errors[0]).toContain('The user explicitly named this project "Agentic Worker PC1".');
	});

	it('accepts the explicit name as given', () => {
		expect(nameErrors(pc1Brief, 'Agentic Worker PC1')).toEqual([]);
	});

	it.each([
		// An unquoted name has no reliable end: this once read "Kitchen Remodel
		// for my mom" and rejected the correct name as a shortening.
		[
			'Create a project called Kitchen Remodel for my mom. The goal is to finish by spring.',
			'Kitchen Remodel'
		],
		// Unquoted names are no longer validated at all, even a real shortening.
		[
			'Create a project called Agentic Worker PC1. The goal is due September 15, with three starter tasks.',
			'Agentic Worker'
		],
		// The quoted form stops at the possessive apostrophe and reads "Dad".
		[
			"Create a project called 'Dad's Garage'. The garage needs a cleanup plan.",
			"Dad's Garage"
		],
		["Create a project called 'Mom's Birthday'. The party is in May.", "Mom's Birthday"],
		// A description, not a name.
		['Create a project named after my dog. I call him Rex.', "Rex's Projects"],
		// An invitation to choose.
		[
			'Create a project called something short, you pick. The garden needs a plan.',
			'Garden Plan'
		],
		// Same name, different case.
		['Create a project called "q3 launch". The goal is to ship by October.', 'Q3 Launch']
	])('accepts a sensible name when the prose misleads: %s', (message, proposedName) => {
		expect(nameErrors(message, proposedName)).toEqual([]);
	});
});
