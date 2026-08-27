// apps/worker/tests/fixtures/agenticChatToolExecutionGraphModelScenarios.ts
export type ToolGraphModelToolCall = {
	function: {
		name: string;
		arguments: Record<string, unknown>;
	};
};

export type ToolGraphModelTrace = {
	toolCallRounds: ToolGraphModelToolCall[][];
	finalContent: string;
};

type ExpectedCall = {
	alias: string;
	toolName: string;
	arguments: Record<string, string>;
	/** Empty means default-parallel: the call must not declare a dependency. */
	afterAliases: readonly string[];
};

export type ToolGraphModelScenario = {
	id: string;
	title: string;
	userPrompt: string;
	expectedRounds: readonly (readonly ExpectedCall[])[];
};

const SCHEDULING_PROPERTIES = {
	call_ref: {
		type: 'string',
		description:
			'Stable reference for this call, required only when another same-response call names it in after.'
	},
	after: {
		type: 'array',
		items: { type: 'string' },
		description:
			'Stable call_ref values in this same response whose side effects must finish successfully before this call starts.'
	}
} as const;

function tool(
	name: string,
	description: string,
	required: readonly string[],
	properties: Record<string, unknown>
) {
	return {
		type: 'function' as const,
		function: {
			name,
			description,
			parameters: {
				type: 'object',
				additionalProperties: false,
				required,
				properties: { ...properties, ...SCHEDULING_PROPERTIES }
			}
		}
	};
}

export const TOOL_GRAPH_MODEL_TOOLS = [
	tool('get_task', 'Read one task by its exact ID.', ['task_id'], {
		task_id: { type: 'string' }
	}),
	tool('update_task', 'Update one existing task by its exact ID.', ['task_id', 'state_key'], {
		task_id: { type: 'string' },
		state_key: { type: 'string', enum: ['todo', 'in_progress', 'done', 'blocked'] }
	}),
	tool(
		'update_project',
		'Update the status of one existing project by its exact ID.',
		['project_id', 'status'],
		{
			project_id: { type: 'string' },
			status: { type: 'string', enum: ['planned', 'in_progress', 'complete'] }
		}
	),
	tool(
		'append_project_log',
		'Append an exact activity message to an existing project.',
		['project_id', 'message'],
		{
			project_id: { type: 'string' },
			message: { type: 'string' }
		}
	),
	tool('notify_project_owner', 'Notify the owner of an existing project.', ['project_id'], {
		project_id: { type: 'string' }
	}),
	tool(
		'create_milestone',
		'Create a milestone and return its new milestone_id.',
		['project_id', 'title'],
		{
			project_id: { type: 'string' },
			title: { type: 'string' }
		}
	),
	tool(
		'create_task',
		'Create a task. milestone_id must be an exact ID returned by create_milestone when linking a newly created milestone.',
		['project_id', 'title', 'milestone_id'],
		{
			project_id: { type: 'string' },
			title: { type: 'string' },
			milestone_id: { type: 'string' }
		}
	)
] as const;

export const TOOL_GRAPH_MODEL_SYSTEM_PROMPT = [
	'You are the acting model for a BuildOS project agent. Fulfill the request with the supplied tools.',
	'One assistant response containing tool calls is one execution batch.',
	'Calls in the same response run in parallel by default, so put independent work in that response together.',
	'Use call_ref and after only when a same-response call must wait for another side effect and every domain argument is already known.',
	'Never reference a call_ref from an earlier response; once that response has completed, omit after.',
	'When a call needs a value returned by another call, do not guess or use a placeholder: emit the prerequisite alone, wait for its tool result, then emit the dependent call in a later response.',
	'Do not serialize independent work. Do not write a prose plan in place of tool calls. After all requested tools finish, answer briefly.'
].join(' ');

export const TOOL_GRAPH_MODEL_SCENARIOS: readonly ToolGraphModelScenario[] = [
	{
		id: 'parallel_independent_updates',
		title: 'two independent task updates in one default-parallel batch',
		userPrompt:
			'In project PROJ-ROADMAP, mark TASK-ALPHA done and mark TASK-BETA blocked. These are independent changes; do both now.',
		expectedRounds: [
			[
				{
					alias: 'alpha',
					toolName: 'update_task',
					arguments: { task_id: 'TASK-ALPHA', state_key: 'done' },
					afterAliases: []
				},
				{
					alias: 'beta',
					toolName: 'update_task',
					arguments: { task_id: 'TASK-BETA', state_key: 'blocked' },
					afterAliases: []
				}
			]
		]
	},
	{
		id: 'sequential_known_arguments',
		title: 'known-argument side effects explicitly sequenced in one batch',
		userPrompt:
			'In project PROJ-ROADMAP, first mark TASK-ALPHA done. Only after that update finishes successfully, append the exact project log message "TASK-ALPHA completed". Every ID and value is already known.',
		expectedRounds: [
			[
				{
					alias: 'finish_alpha',
					toolName: 'update_task',
					arguments: { task_id: 'TASK-ALPHA', state_key: 'done' },
					afterAliases: []
				},
				{
					alias: 'log_alpha',
					toolName: 'append_project_log',
					arguments: {
						project_id: 'PROJ-ROADMAP',
						message: 'TASK-ALPHA completed'
					},
					afterAliases: ['finish_alpha']
				}
			]
		]
	},
	{
		id: 'mixed_parallel_and_fan_in',
		title: 'parallel task updates plus a dependent summary and independent notification',
		userPrompt:
			'In project PROJ-ROADMAP, mark TASK-ALPHA done and TASK-BETA blocked independently. After both task updates finish, append the exact log message "Roadmap statuses refreshed". Also notify the project owner independently; that notification can happen immediately and must not wait for the other work.',
		expectedRounds: [
			[
				{
					alias: 'alpha',
					toolName: 'update_task',
					arguments: { task_id: 'TASK-ALPHA', state_key: 'done' },
					afterAliases: []
				},
				{
					alias: 'beta',
					toolName: 'update_task',
					arguments: { task_id: 'TASK-BETA', state_key: 'blocked' },
					afterAliases: []
				},
				{
					alias: 'summary',
					toolName: 'append_project_log',
					arguments: {
						project_id: 'PROJ-ROADMAP',
						message: 'Roadmap statuses refreshed'
					},
					afterAliases: ['alpha', 'beta']
				},
				{
					alias: 'notify',
					toolName: 'notify_project_owner',
					arguments: { project_id: 'PROJ-ROADMAP' },
					afterAliases: []
				}
			]
		]
	},
	{
		id: 'returned_value_requires_later_round',
		title: 'returned milestone ID consumed only in a later provider round',
		userPrompt:
			'In project PROJ-LAUNCH, create a milestone titled "Beta". Then create a task titled "Invite pilot users" linked to the exact milestone_id returned by that new milestone. Do not guess an ID.',
		expectedRounds: [
			[
				{
					alias: 'milestone',
					toolName: 'create_milestone',
					arguments: { project_id: 'PROJ-LAUNCH', title: 'Beta' },
					afterAliases: []
				}
			],
			[
				{
					alias: 'task',
					toolName: 'create_task',
					arguments: {
						project_id: 'PROJ-LAUNCH',
						title: 'Invite pilot users',
						milestone_id: 'MILESTONE-NEW-42'
					},
					afterAliases: []
				}
			]
		]
	},
	{
		id: 'sequential_setup_then_parallel_fan_out',
		title: 'one setup side effect followed by two parallel dependents',
		userPrompt:
			'For project PROJ-LAUNCH, set the project status to in_progress first. After that finishes, mark TASK-DESIGN and TASK-COPY in_progress in parallel. All IDs are known now, so use one execution batch with explicit ordering.',
		expectedRounds: [
			[
				{
					alias: 'project_started',
					toolName: 'update_project',
					arguments: { project_id: 'PROJ-LAUNCH', status: 'in_progress' },
					afterAliases: []
				},
				{
					alias: 'design',
					toolName: 'update_task',
					arguments: { task_id: 'TASK-DESIGN', state_key: 'in_progress' },
					afterAliases: ['project_started']
				},
				{
					alias: 'copy',
					toolName: 'update_task',
					arguments: { task_id: 'TASK-COPY', state_key: 'in_progress' },
					afterAliases: ['project_started']
				}
			]
		]
	}
] as const;

export type ToolGraphModelGrade = {
	passed: boolean;
	failures: string[];
};

function canonicalStrings(values: readonly string[]): string[] {
	return [...values].sort((left, right) => left.localeCompare(right));
}

function stringArray(value: unknown): string[] | null {
	return Array.isArray(value) && value.every((entry) => typeof entry === 'string') ? value : null;
}

function callMatches(expected: ExpectedCall, actual: ToolGraphModelToolCall): boolean {
	if (actual.function.name !== expected.toolName) return false;
	return Object.entries(expected.arguments).every(
		([key, value]) => actual.function.arguments[key] === value
	);
}

export function gradeToolGraphModelTrace(
	scenario: ToolGraphModelScenario,
	trace: ToolGraphModelTrace
): ToolGraphModelGrade {
	const failures: string[] = [];
	if (trace.toolCallRounds.length !== scenario.expectedRounds.length) {
		failures.push(
			`expected ${scenario.expectedRounds.length} tool-call round(s), received ${trace.toolCallRounds.length}`
		);
	}

	for (let roundIndex = 0; roundIndex < scenario.expectedRounds.length; roundIndex += 1) {
		const expectedRound = scenario.expectedRounds[roundIndex]!;
		const actualRound = trace.toolCallRounds[roundIndex] ?? [];
		if (actualRound.length !== expectedRound.length) {
			failures.push(
				`round ${roundIndex + 1}: expected ${expectedRound.length} call(s), received ${actualRound.length}`
			);
		}

		const matched = new Map<string, ToolGraphModelToolCall>();
		const consumed = new Set<number>();
		for (const expectedCall of expectedRound) {
			const actualIndex = actualRound.findIndex(
				(actualCall, index) => !consumed.has(index) && callMatches(expectedCall, actualCall)
			);
			if (actualIndex < 0) {
				failures.push(
					`round ${roundIndex + 1}: missing ${expectedCall.alias} (${expectedCall.toolName} ${JSON.stringify(expectedCall.arguments)})`
				);
				continue;
			}
			consumed.add(actualIndex);
			matched.set(expectedCall.alias, actualRound[actualIndex]!);
		}

		for (const expectedCall of expectedRound) {
			const actualCall = matched.get(expectedCall.alias);
			if (!actualCall) continue;
			const rawAfter = actualCall.function.arguments.after;
			const actualAfter = rawAfter === undefined ? [] : stringArray(rawAfter);
			if (!actualAfter) {
				failures.push(
					`round ${roundIndex + 1}: ${expectedCall.alias}.after is not a string array`
				);
				continue;
			}

			const expectedRefs: string[] = [];
			for (const dependencyAlias of expectedCall.afterAliases) {
				const dependency = matched.get(dependencyAlias);
				const dependencyRef = dependency?.function.arguments.call_ref;
				if (typeof dependencyRef !== 'string' || dependencyRef.length === 0) {
					failures.push(
						`round ${roundIndex + 1}: ${dependencyAlias} needs a call_ref because ${expectedCall.alias} depends on it`
					);
					continue;
				}
				expectedRefs.push(dependencyRef);
			}
			if (
				JSON.stringify(canonicalStrings(actualAfter)) !==
				JSON.stringify(canonicalStrings(expectedRefs))
			) {
				failures.push(
					`round ${roundIndex + 1}: ${expectedCall.alias}.after expected refs for [${expectedCall.afterAliases.join(', ')}], received ${JSON.stringify(actualAfter)}`
				);
			}
		}
	}

	return { passed: failures.length === 0, failures };
}

export function buildPassingToolGraphModelTrace(
	scenario: ToolGraphModelScenario
): ToolGraphModelTrace {
	return {
		toolCallRounds: scenario.expectedRounds.map((round) => {
			const refs = new Map(
				round.map((expected) => [expected.alias, `ref_${expected.alias}`])
			);
			const referencedAliases = new Set(round.flatMap((expected) => expected.afterAliases));
			return round.map((expected) => ({
				function: {
					name: expected.toolName,
					arguments: {
						...expected.arguments,
						...(referencedAliases.has(expected.alias)
							? { call_ref: refs.get(expected.alias)! }
							: {}),
						...(expected.afterAliases.length > 0
							? {
									after: expected.afterAliases.map((alias) => refs.get(alias)!)
								}
							: {})
					}
				}
			}));
		}),
		finalContent: 'Done.'
	};
}

export function fixtureToolResult(call: ToolGraphModelToolCall): Record<string, unknown> {
	if (call.function.name === 'create_milestone') {
		return { success: true, milestone_id: 'MILESTONE-NEW-42' };
	}
	return { success: true };
}
