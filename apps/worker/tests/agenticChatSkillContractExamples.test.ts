// apps/worker/tests/agenticChatSkillContractExamples.test.ts
/**
 * The operational playbooks (task, document, calendar, plan, project creation)
 * show the acting model literal turn-contract shapes. A shape that drifts from
 * the validator teaches the model to fail: every validator rejection costs a
 * repair round and a malformed contract can end the turn. This test pulls each
 * `{"outcomes":…}` example out of the shipped SKILL.md files and runs it through
 * the worker's real pre-review validation on the worker surface that skill
 * renders on, so an example can never drift from the schema or the rules.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
	TURN_CONTRACT_TOOL_DEFINITION,
	getGatewaySurfaceForProfile,
	type GatewaySurfaceProfileName
} from '@buildos/agentic-chat-runtime/catalog';
import {
	getSafeWriteToolNamesForTurnContract,
	getWriteLedgerChangedFields,
	parseDeclaredTurnContract,
	type TurnContract
} from '@buildos/agentic-chat-runtime/loop';
import { canonicalizeAgenticChatJson, type JsonObject } from '@buildos/shared-types';
import type {
	AgenticChatTurnProviderRequestV1,
	AgenticChatTurnProviderToolV1
} from '../src/workers/agentic-chat/provider/contracts';
// Importing the worker tool surface installs the worker's own loop catalog.
import { reviewedWorkerProviderToolDefinitionV1 } from '../src/workers/agentic-chat/provider/tool-surface';
import { reviewedAgenticChatMutationSpecV1 } from '../src/workers/agentic-chat/mutations/tool-catalog';
import {
	contractSha256,
	validateApprovedTurnContractMutations,
	validateCompletedProviderCalls
} from '../src/workers/agentic-chat/provider/validation';

const DEFINITIONS_DIR = fileURLToPath(
	new URL('../../web/src/lib/services/agentic-chat/tools/skills/definitions/', import.meta.url)
);
const PROJECT_ID = '5c000000-0000-4000-8000-00000000005c';

/** Worker surfaces each playbook renders on (see operational-skill-intent.ts). */
const SKILL_SURFACES: Record<string, GatewaySurfaceProfileName[]> = {
	task_management: ['project', 'global'],
	document_workspace: ['project'],
	calendar_management: ['project', 'global'],
	plan_management: ['project', 'global'],
	project_creation: ['global', 'project_create']
};

type SkillContractExample = { skillId: string; index: number; raw: string };

function extractContractExamples(skillId: string): SkillContractExample[] {
	const markdown = readFileSync(`${DEFINITIONS_DIR}${skillId}/SKILL.md`, 'utf8');
	// Structured-format extraction: backticked JSON objects that open with "outcomes".
	return [...markdown.matchAll(/`(\{"outcomes":[^`]*\})`/g)].map((match, index) => ({
		skillId,
		index,
		raw: match[1]!
	}));
}

/**
 * Examples use readable placeholders (`"<task UUID>"`); the model copies real
 * UUIDs from context. Give each distinct placeholder its own canonical UUID.
 */
function bindPlaceholders(raw: string): JsonObject {
	const ids = new Map<string, string>();
	const bound = raw.replace(/"<[^">]+>"/g, (placeholder) => {
		if (!ids.has(placeholder)) {
			const n = String(ids.size + 1).padStart(2, '0');
			ids.set(placeholder, `a${n}00000-0000-4000-8000-0000000000${n}`);
		}
		return JSON.stringify(ids.get(placeholder));
	});
	return JSON.parse(bound) as JsonObject;
}

function surfaceTools(profile: GatewaySurfaceProfileName): AgenticChatTurnProviderToolV1[] {
	const tools = getGatewaySurfaceForProfile(profile)
		.map((tool) =>
			reviewedWorkerProviderToolDefinitionV1(tool as unknown as AgenticChatTurnProviderToolV1)
		)
		.filter((tool): tool is AgenticChatTurnProviderToolV1 => tool !== null);
	// The complex-write redirect re-mounts the contract schema for the contract pass.
	if (!tools.some((tool) => tool.function.name === TURN_CONTRACT_TOOL_DEFINITION.function.name)) {
		tools.push(TURN_CONTRACT_TOOL_DEFINITION as unknown as AgenticChatTurnProviderToolV1);
	}
	return tools;
}

function providerRequest(
	profile: GatewaySurfaceProfileName,
	tools: AgenticChatTurnProviderToolV1[]
): AgenticChatTurnProviderRequestV1 {
	const projectScoped = profile === 'project';
	return {
		messages: [{ role: 'user', content: 'Make the changes we discussed.' }],
		tools,
		toolChoice: 'auto',
		contextType: profile,
		projectId: projectScoped ? PROJECT_ID : null,
		entityId: projectScoped ? PROJECT_ID : null,
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

function call(name: string, argumentsValue: JsonObject, id = `${name}-1`) {
	return {
		id,
		name,
		arguments: argumentsValue,
		canonicalArguments: canonicalizeAgenticChatJson(argumentsValue),
		canonicalProviderArguments: canonicalizeAgenticChatJson(argumentsValue)
	};
}

/**
 * Fields an admitted write tool can report for this outcome. The worker's
 * pre-review check grounds only document, task, and goal-create fields; this
 * applies the same ledger rule to every kind, so a plan or event example can
 * never declare a field no write would ever satisfy at fulfilment.
 */
function producibleFields(
	contract: TurnContract,
	outcomeIndex: number,
	tools: readonly AgenticChatTurnProviderToolV1[]
): Set<string> {
	const outcome = contract.outcomes[outcomeIndex]!;
	const toolNames = new Set(
		getSafeWriteToolNamesForTurnContract({ ...contract, outcomes: [outcome] })
	);
	const fields = new Set<string>();
	for (const tool of tools) {
		if (!toolNames.has(tool.function.name)) continue;
		const spec = reviewedAgenticChatMutationSpecV1(tool.function.name);
		const properties = tool.function.parameters.properties as Record<string, unknown>;
		if (!spec || !properties) continue;
		const args = Object.fromEntries(
			spec.reviewedArgumentNames
				.filter((name) => Object.hasOwn(properties, name))
				.map((name) => [name, null])
		);
		for (const field of getWriteLedgerChangedFields(tool.function.name, args)) {
			fields.add(field);
		}
	}
	return fields;
}

const EXAMPLES = Object.keys(SKILL_SURFACES).flatMap(extractContractExamples);
const CASES = EXAMPLES.flatMap((example) =>
	SKILL_SURFACES[example.skillId]!.map((profile) => ({
		...example,
		profile,
		label: `${example.skillId} example ${example.index + 1} on ${profile}`
	}))
);

describe('skill turn-contract examples', () => {
	it('finds the contract examples in every operational playbook', () => {
		const counts = Object.fromEntries(
			Object.keys(SKILL_SURFACES).map((skillId) => [
				skillId,
				EXAMPLES.filter((example) => example.skillId === skillId).length
			])
		);
		expect(counts).toEqual({
			task_management: 1,
			document_workspace: 2,
			calendar_management: 2,
			plan_management: 2,
			project_creation: 1
		});
	});

	it.each(CASES)('$label passes the worker contract validator', ({ raw, profile }) => {
		const declaration = bindPlaceholders(raw);
		const issues: string[] = [];
		const notes: string[] = [];
		const contract = parseDeclaredTurnContract(declaration, issues, notes);
		expect(issues).toEqual([]);
		// A note means normalization silently dropped part of the example.
		expect(notes).toEqual([]);
		expect(contract).not.toBeNull();

		const tools = surfaceTools(profile);
		const validation = validateCompletedProviderCalls(
			[call('declare_turn_contract', declaration)],
			providerRequest(profile, tools),
			tools
		);
		expect(validation.flatMap((issue) => issue.errors)).toEqual([]);

		// Every outcome needs a write tool mounted on this surface, or the approved contract can
		// never be fulfilled and the turn ends partial.
		const mounted = new Set(tools.map((tool) => tool.function.name));
		contract!.outcomes.forEach((outcome, index) => {
			const fulfilling = getSafeWriteToolNamesForTurnContract({
				...contract!,
				outcomes: [outcome]
			}).filter((name) => mounted.has(name));
			expect(
				fulfilling.length,
				`outcome ${index + 1} (${outcome.action} ${outcome.entityKind}) has no write tool mounted on ${profile}`
			).toBeGreaterThan(0);
		});

		contract!.outcomes.forEach((outcome, index) => {
			const fields = producibleFields(contract!, index, tools);
			for (const field of outcome.requiredFields) {
				expect(
					fields.has(field),
					`outcome ${index + 1} (${outcome.action} ${outcome.entityKind}) requires ${field}; producible: ${[...fields].sort().join(', ')}`
				).toBe(true);
			}
		});
	});
});

/**
 * Pull `tool_name({ key: value, ... })` examples out of a playbook and return the top-level keys.
 * Structured-format parsing only: it walks the object literal, skipping quoted strings.
 */
function toolCallsIn(markdown: string): { tool: string; keys: string[] }[] {
	const calls: { tool: string; keys: string[] }[] = [];
	for (const match of markdown.matchAll(/`([a-z][a-z_]+)\(\{/g)) {
		const tool = match[1]!;
		let index = match.index! + match[0].length;
		let depth = 1;
		let quote: string | null = null;
		let identifier = ''; // identifier being read
		let lastIdentifier = ''; // last complete identifier, cleared by any other token
		const keys: string[] = [];
		while (index < markdown.length && depth > 0) {
			const char = markdown[index]!;
			index += 1;
			if (quote) {
				if (char === '\\') index += 1;
				else if (char === quote) quote = null;
				continue;
			}
			if (/[a-z0-9_]/.test(char)) {
				identifier += char;
				continue;
			}
			if (identifier) {
				lastIdentifier = identifier;
				identifier = '';
			}
			if (/\s/.test(char)) continue;
			if (char === ':' && depth === 1 && lastIdentifier) keys.push(lastIdentifier);
			if (char === '"' || char === "'") quote = char;
			else if (char === '{' || char === '[') depth += 1;
			else if (char === '}' || char === ']') depth -= 1;
			lastIdentifier = '';
		}
		calls.push({ tool, keys });
	}
	return calls;
}

function extractToolCallExamples(skillId: string) {
	return toolCallsIn(readFileSync(`${DEFINITIONS_DIR}${skillId}/SKILL.md`, 'utf8'));
}

describe('tool calls shown in the playbooks', () => {
	const toolCalls = Object.keys(SKILL_SURFACES).flatMap((skillId) =>
		extractToolCallExamples(skillId)
			.filter(({ tool }) => reviewedAgenticChatMutationSpecV1(tool) !== null)
			.map((example) => ({ ...example, skillId }))
	);

	it('finds the write-call examples', () => {
		expect(toolCalls.length).toBeGreaterThan(0);
	});

	it('reads top-level keys only, skipping quoted text and nested objects', () => {
		expect(
			toolCallsIn(
				'`create_onto_plan({ project_id: "p", milestone_id: "m", plan: "## Risks: scope", props: { facets: {} } })`'
			)
		).toEqual([{ tool: 'create_onto_plan', keys: ['project_id', 'milestone_id', 'plan', 'props'] }]);
	});

	it.each(toolCalls)(
		'$skillId: $tool passes only arguments the worker admits',
		({ tool, keys }) => {
			const spec = reviewedAgenticChatMutationSpecV1(tool)!;
			const admitted = new Set(spec.reviewedArgumentNames);
			expect(keys.filter((key) => !admitted.has(key))).toEqual([]);
		}
	);
});

/**
 * The writes each example promises must be the writes the approved contract
 * authorizes; anything else is rejected as outside the approved contract.
 */
describe('writes authorized by the example contracts', () => {
	function approved(skillId: string, index: number) {
		const example = EXAMPLES.find(
			(candidate) => candidate.skillId === skillId && candidate.index === index
		)!;
		const contract = parseDeclaredTurnContract(bindPlaceholders(example.raw))!;
		return { contract, sha: contractSha256(contract) };
	}
	const FIRST = 'a0100000-0000-4000-8000-000000000001';
	const SECOND = 'a0200000-0000-4000-8000-000000000002';

	it('authorizes the document text edit on the declared document only', () => {
		const { contract, sha } = approved('document_workspace', 0);
		const edit = (documentId: string) =>
			call('update_onto_document', {
				document_id: documentId,
				edits: [{ old_text: 'old line', new_text: 'new line' }]
			});
		expect(validateApprovedTurnContractMutations([edit(FIRST)], contract, sha)).toEqual([]);
		const outside = validateApprovedTurnContractMutations([edit(SECOND)], contract, sha);
		expect(outside[0]?.errors.join(' ')).toContain('outside the independently approved');
	});

	it('authorizes the folder moves by the declared parent title', () => {
		const { contract, sha } = approved('document_workspace', 1);
		const moves = [FIRST, SECOND].map((documentId, index) =>
			call(
				'move_document_in_tree',
				{ project_id: PROJECT_ID, document_id: documentId, new_parent_title: 'Research' },
				`move-${index}`
			)
		);
		expect(validateApprovedTurnContractMutations(moves, contract, sha)).toEqual([]);
	});

	it('authorizes the task state update and reschedule', () => {
		const { contract, sha } = approved('task_management', 0);
		expect(
			validateApprovedTurnContractMutations(
				[
					call('update_onto_task', { task_id: FIRST, state_key: 'done' }, 'state'),
					call('update_onto_task', { task_id: SECOND, due_at: '2026-10-09' }, 'due')
				],
				contract,
				sha
			)
		).toEqual([]);
	});

	it('authorizes the ontology event reschedule addressed by onto_event_id', () => {
		const { contract, sha } = approved('calendar_management', 1);
		expect(
			validateApprovedTurnContractMutations(
				[
					call('update_calendar_event', {
						onto_event_id: FIRST,
						start_at: '2026-10-07T15:00:00-04:00'
					})
				],
				contract,
				sha
			)
		).toEqual([]);
		const otherEvent = validateApprovedTurnContractMutations(
			[call('update_calendar_event', { onto_event_id: SECOND, start_at: '2026-10-07' })],
			contract,
			sha
		);
		expect(otherEvent[0]?.errors.join(' ')).toContain('outside the independently approved');
	});

	it('authorizes the goal date update', () => {
		const { contract, sha } = approved('plan_management', 1);
		expect(
			validateApprovedTurnContractMutations(
				[call('update_onto_goal', { goal_id: FIRST, target_date: '2026-12-01' })],
				contract,
				sha
			)
		).toEqual([]);
	});
});
