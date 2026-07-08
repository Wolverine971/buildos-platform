// apps/web/src/lib/services/agentic-chat-v2/prompt-evaluator.ts
import type { Json } from '@buildos/shared-types';
import { getSkillByReference } from '$lib/services/agentic-chat/tools/skills/registry';
import type { PromptEvalScenario } from './prompt-eval-scenarios';

export type PromptEvalAssertionStatus = 'passed' | 'failed' | 'skipped';

export type PromptEvalAssertion = {
	assertionKey: string;
	status: PromptEvalAssertionStatus;
	expected: Json | null;
	actual: Json | null;
	details: string | null;
};

export type PromptEvalTurnRun = {
	id: string;
	status?: string | null;
	finished_reason?: string | null;
	first_lane?: string | null;
	first_skill_path?: string | null;
	first_canonical_op?: string | null;
	validation_failure_count?: number | null;
	prompt_snapshot?: {
		id?: string | null;
		prompt_variant?: string | null;
		approx_prompt_tokens?: number | null;
		rendered_dump_text?: string | null;
	} | null;
};

export type PromptEvalTurnEvent = {
	event_type?: string | null;
	payload?: Record<string, unknown> | null;
};

export type PromptEvalToolExecution = {
	tool_name?: string | null;
	gateway_op?: string | null;
	help_path?: string | null;
	success?: boolean | null;
	error_message?: string | null;
};

export type PromptEvalTarget = {
	turnRun: PromptEvalTurnRun;
	assistantMessage?: { id?: string | null; content?: string | null } | null;
	userMessage?: { id?: string | null; content?: string | null } | null;
	events: PromptEvalTurnEvent[];
	toolExecutions?: PromptEvalToolExecution[];
};

export type PromptEvalResult = {
	status: 'passed' | 'failed' | 'error';
	summary: Json;
	assertions: PromptEvalAssertion[];
};

function toJson(value: unknown): Json | null {
	if (value === undefined) return null;
	if (
		value === null ||
		typeof value === 'string' ||
		typeof value === 'number' ||
		typeof value === 'boolean'
	) {
		return value as Json;
	}
	if (Array.isArray(value) || typeof value === 'object') {
		return JSON.parse(JSON.stringify(value)) as Json;
	}
	return String(value) as Json;
}

function pushAssertion(
	assertions: PromptEvalAssertion[],
	params: {
		assertionKey: string;
		passed: boolean;
		expected?: unknown;
		actual?: unknown;
		details?: string | null;
	}
): void {
	assertions.push({
		assertionKey: params.assertionKey,
		status: params.passed ? 'passed' : 'failed',
		expected: toJson(params.expected),
		actual: toJson(params.actual),
		details: params.details ?? null
	});
}

function collectObservedOps(target: PromptEvalTarget): string[] {
	const observed = new Set<string>();
	for (const op of target.toolExecutions?.map((item) => item.gateway_op).filter(Boolean) ?? []) {
		observed.add(op as string);
	}
	for (const event of target.events) {
		const payload =
			event.payload && typeof event.payload === 'object' ? event.payload : undefined;
		const op = typeof payload?.canonical_op === 'string' ? payload.canonical_op : null;
		if (op) observed.add(op);
	}
	return Array.from(observed).sort();
}

function canonicalizeSkillReference(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const reference = value.trim();
	if (!reference) return null;
	return getSkillByReference(reference)?.id ?? reference;
}

function canonicalizeSkillReferences(values: string[]): string[] {
	const observed = new Set<string>();
	for (const value of values) {
		const canonical = canonicalizeSkillReference(value);
		if (canonical) observed.add(canonical);
	}
	return Array.from(observed).sort();
}

function collectObservedToolNames(target: PromptEvalTarget): string[] {
	const observed = new Set<string>();
	const toolNames = target.toolExecutions?.map((item) => item.tool_name).filter(Boolean) ?? [];
	for (const toolName of toolNames) {
		observed.add(toolName as string);
	}
	for (const event of target.events) {
		const payload =
			event.payload && typeof event.payload === 'object' ? event.payload : undefined;
		const toolName = typeof payload?.tool_name === 'string' ? payload.tool_name : null;
		if (toolName) observed.add(toolName);
	}
	return Array.from(observed).sort();
}

function collectObservedSkillPaths(target: PromptEvalTarget): string[] {
	const observed = new Set<string>();
	const firstSkillPath = canonicalizeSkillReference(target.turnRun.first_skill_path);
	if (firstSkillPath) {
		observed.add(firstSkillPath);
	}
	for (const event of target.events) {
		const payload =
			event.payload && typeof event.payload === 'object' ? event.payload : undefined;
		const path = canonicalizeSkillReference(payload?.path);
		if (
			path &&
			(event.event_type === 'skill_requested' || event.event_type === 'skill_loaded')
		) {
			observed.add(path);
		}
	}
	return Array.from(observed).sort();
}

function collectEventTypes(target: PromptEvalTarget): string[] {
	return Array.from(
		new Set(
			target.events
				.map((event) => (typeof event.event_type === 'string' ? event.event_type : null))
				.filter(Boolean) as string[]
		)
	).sort();
}

function getLatestEventPayload(
	target: PromptEvalTarget,
	eventType: string
): Record<string, unknown> | null {
	for (let index = target.events.length - 1; index >= 0; index -= 1) {
		const event = target.events[index];
		if (event?.event_type !== eventType) continue;
		return event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload)
			? event.payload
			: {};
	}
	return null;
}

function getRecordField(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function getSkillLoadFormatForReference(
	loadedSkillFormats: Record<string, unknown>,
	skillReference: string
): unknown {
	if (Object.prototype.hasOwnProperty.call(loadedSkillFormats, skillReference)) {
		return loadedSkillFormats[skillReference];
	}

	const canonicalSkillId = canonicalizeSkillReference(skillReference);
	if (
		canonicalSkillId &&
		Object.prototype.hasOwnProperty.call(loadedSkillFormats, canonicalSkillId)
	) {
		return loadedSkillFormats[canonicalSkillId];
	}

	return null;
}

export function evaluatePromptScenario(
	scenario: PromptEvalScenario,
	target: PromptEvalTarget
): PromptEvalResult {
	const assertions: PromptEvalAssertion[] = [];
	const assistantText = target.assistantMessage?.content?.trim() ?? '';
	const eventTypes = collectEventTypes(target);
	const observedOps = collectObservedOps(target);
	const observedToolNames = collectObservedToolNames(target);
	const observedSkills = collectObservedSkillPaths(target);
	const validationFailures = Number(target.turnRun.validation_failure_count ?? 0);
	const skillGatePayload = getLatestEventPayload(target, 'skill_gate_evaluated');

	if (scenario.requireCompletedStatus !== false) {
		pushAssertion(assertions, {
			assertionKey: 'turn_completed',
			passed: target.turnRun.status === 'completed',
			expected: 'completed',
			actual: target.turnRun.status ?? null,
			details:
				target.turnRun.status === 'completed'
					? null
					: `Turn status was ${target.turnRun.status ?? 'unknown'}.`
		});
	}

	if (scenario.requirePromptSnapshot) {
		pushAssertion(assertions, {
			assertionKey: 'prompt_snapshot_present',
			passed: Boolean(target.turnRun.prompt_snapshot?.id),
			expected: true,
			actual: Boolean(target.turnRun.prompt_snapshot?.id),
			details: target.turnRun.prompt_snapshot?.id ? null : 'Prompt snapshot was missing.'
		});
	}

	if (scenario.expectedFinishedReason) {
		pushAssertion(assertions, {
			assertionKey: 'finished_reason_matches',
			passed: target.turnRun.finished_reason === scenario.expectedFinishedReason,
			expected: scenario.expectedFinishedReason,
			actual: target.turnRun.finished_reason ?? null,
			details:
				target.turnRun.finished_reason === scenario.expectedFinishedReason
					? null
					: `Expected finished_reason=${scenario.expectedFinishedReason}, got ${target.turnRun.finished_reason ?? 'none'}.`
		});
	}

	if (scenario.requireAssistantAnswer !== false) {
		pushAssertion(assertions, {
			assertionKey: 'assistant_answer_present',
			passed: assistantText.length > 0,
			expected: 'non-empty assistant answer',
			actual: assistantText.length > 0 ? `${assistantText.length} chars` : '',
			details: assistantText.length > 0 ? null : 'Assistant answer was empty.'
		});
	}

	if (
		Array.isArray(scenario.forbiddenAssistantPatterns) &&
		scenario.forbiddenAssistantPatterns.length > 0
	) {
		const matchedPattern = scenario.forbiddenAssistantPatterns.find((pattern) =>
			assistantText.toLowerCase().includes(pattern.toLowerCase())
		);
		pushAssertion(assertions, {
			assertionKey: 'assistant_answer_clean',
			passed: !matchedPattern,
			expected: scenario.forbiddenAssistantPatterns,
			actual: matchedPattern ?? null,
			details: matchedPattern
				? `Assistant answer matched forbidden pattern "${matchedPattern}".`
				: null
		});
	}

	if (scenario.expectedFirstLane) {
		pushAssertion(assertions, {
			assertionKey: 'first_lane_matches',
			passed: target.turnRun.first_lane === scenario.expectedFirstLane,
			expected: scenario.expectedFirstLane,
			actual: target.turnRun.first_lane ?? null,
			details:
				target.turnRun.first_lane === scenario.expectedFirstLane
					? null
					: `Expected first_lane=${scenario.expectedFirstLane}, got ${target.turnRun.first_lane ?? 'none'}.`
		});
	}

	if (Array.isArray(scenario.expectedFirstOps) && scenario.expectedFirstOps.length > 0) {
		pushAssertion(assertions, {
			assertionKey: 'first_op_matches',
			passed: scenario.expectedFirstOps.includes(target.turnRun.first_canonical_op ?? ''),
			expected: scenario.expectedFirstOps,
			actual: target.turnRun.first_canonical_op ?? null,
			details: scenario.expectedFirstOps.includes(target.turnRun.first_canonical_op ?? '')
				? null
				: `Expected first op in ${scenario.expectedFirstOps.join(', ')}, got ${target.turnRun.first_canonical_op ?? 'none'}.`
		});
	}

	if (Array.isArray(scenario.expectedFirstSkills) && scenario.expectedFirstSkills.length > 0) {
		const expectedFirstSkills = canonicalizeSkillReferences(scenario.expectedFirstSkills);
		const actualFirstSkill = canonicalizeSkillReference(target.turnRun.first_skill_path);
		pushAssertion(assertions, {
			assertionKey: 'first_skill_matches',
			passed: expectedFirstSkills.includes(actualFirstSkill ?? ''),
			expected: expectedFirstSkills,
			actual: actualFirstSkill,
			details: expectedFirstSkills.includes(actualFirstSkill ?? '')
				? null
				: `Expected first skill in ${expectedFirstSkills.join(', ')}, got ${actualFirstSkill ?? 'none'}.`
		});
	}

	if (Array.isArray(scenario.requiredObservedOps) && scenario.requiredObservedOps.length > 0) {
		for (const op of scenario.requiredObservedOps) {
			pushAssertion(assertions, {
				assertionKey: `observed_op:${op}`,
				passed: observedOps.includes(op),
				expected: op,
				actual: observedOps,
				details: observedOps.includes(op) ? null : `Observed ops did not include ${op}.`
			});
		}
	}

	if (
		Array.isArray(scenario.requiredObservedToolNames) &&
		scenario.requiredObservedToolNames.length > 0
	) {
		for (const toolName of scenario.requiredObservedToolNames) {
			pushAssertion(assertions, {
				assertionKey: `observed_tool:${toolName}`,
				passed: observedToolNames.includes(toolName),
				expected: toolName,
				actual: observedToolNames,
				details: observedToolNames.includes(toolName)
					? null
					: `Observed tool names did not include ${toolName}.`
			});
		}
	}

	if (
		Array.isArray(scenario.forbiddenObservedToolNames) &&
		scenario.forbiddenObservedToolNames.length > 0
	) {
		for (const toolName of scenario.forbiddenObservedToolNames) {
			pushAssertion(assertions, {
				assertionKey: `forbidden_tool:${toolName}`,
				passed: !observedToolNames.includes(toolName),
				expected: `not ${toolName}`,
				actual: observedToolNames,
				details: observedToolNames.includes(toolName)
					? `Observed forbidden tool name ${toolName}.`
					: null
			});
		}
	}

	if (
		Array.isArray(scenario.requiredObservedSkillPaths) &&
		scenario.requiredObservedSkillPaths.length > 0
	) {
		for (const path of scenario.requiredObservedSkillPaths) {
			const canonicalPath = canonicalizeSkillReference(path) ?? path;
			pushAssertion(assertions, {
				assertionKey: `observed_skill:${path}`,
				passed: observedSkills.includes(canonicalPath),
				expected: canonicalPath,
				actual: observedSkills,
				details: observedSkills.includes(canonicalPath)
					? null
					: `Observed skill paths did not include ${canonicalPath}.`
			});
		}
	}

	if (scenario.requireSkillGateSatisfied) {
		const satisfied = skillGatePayload?.skill_gate_satisfied;
		pushAssertion(assertions, {
			assertionKey: 'skill_gate_satisfied',
			passed: satisfied === true,
			expected: true,
			actual: satisfied ?? null,
			details:
				satisfied === true
					? null
					: 'Expected skill gate telemetry to report a satisfied gate.'
		});
	}

	if (scenario.requireSkillContractPresent) {
		const contractPresent = skillGatePayload?.skill_contract_present;
		pushAssertion(assertions, {
			assertionKey: 'skill_contract_present',
			passed: contractPresent === true,
			expected: true,
			actual: contractPresent ?? null,
			details:
				contractPresent === true
					? null
					: 'Expected matching skill load to include an output contract.'
		});
	}

	if (
		scenario.requiredSkillLoadFormats &&
		Object.keys(scenario.requiredSkillLoadFormats).length > 0
	) {
		const loadedSkillFormats = getRecordField(skillGatePayload?.loaded_skill_formats);
		for (const [skillId, expectedFormat] of Object.entries(scenario.requiredSkillLoadFormats)) {
			const actualFormat = getSkillLoadFormatForReference(loadedSkillFormats, skillId);
			pushAssertion(assertions, {
				assertionKey: `skill_format:${skillId}`,
				passed: actualFormat === expectedFormat,
				expected: expectedFormat,
				actual: actualFormat,
				details:
					actualFormat === expectedFormat
						? null
						: `Expected ${skillId} to load as ${expectedFormat}, got ${actualFormat ?? 'none'}.`
			});
		}
	}

	if (Array.isArray(scenario.requiredEventTypes) && scenario.requiredEventTypes.length > 0) {
		for (const eventType of scenario.requiredEventTypes) {
			pushAssertion(assertions, {
				assertionKey: `event_type:${eventType}`,
				passed: eventTypes.includes(eventType),
				expected: eventType,
				actual: eventTypes,
				details: eventTypes.includes(eventType)
					? null
					: `Observed event types did not include ${eventType}.`
			});
		}
	}

	if (typeof scenario.maxValidationFailures === 'number') {
		pushAssertion(assertions, {
			assertionKey: 'validation_failures_within_limit',
			passed: validationFailures <= scenario.maxValidationFailures,
			expected: scenario.maxValidationFailures,
			actual: validationFailures,
			details:
				validationFailures <= scenario.maxValidationFailures
					? null
					: `Validation failures (${validationFailures}) exceeded limit ${scenario.maxValidationFailures}.`
		});
	}

	const passedCount = assertions.filter((assertion) => assertion.status === 'passed').length;
	const failedCount = assertions.filter((assertion) => assertion.status === 'failed').length;
	const status: PromptEvalResult['status'] = failedCount > 0 ? 'failed' : 'passed';

	return {
		status,
		summary: {
			scenario_slug: scenario.slug,
			scenario_version: scenario.version,
			turn_run_id: target.turnRun.id,
			status,
			assertion_counts: {
				passed: passedCount,
				failed: failedCount,
				total: assertions.length
			},
			first_lane: target.turnRun.first_lane ?? null,
			first_skill_path: target.turnRun.first_skill_path ?? null,
			first_canonical_op: target.turnRun.first_canonical_op ?? null,
			observed_ops: observedOps,
			observed_tool_names: observedToolNames,
			observed_skill_paths: observedSkills,
			event_types: eventTypes,
			finished_reason: target.turnRun.finished_reason ?? null,
			validation_failure_count: validationFailures
		} as Json,
		assertions
	};
}
