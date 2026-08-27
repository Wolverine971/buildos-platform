// apps/worker/tests/agenticChatToolExecutionGraphModelScenarios.test.ts
import { describe, expect, it } from 'vitest';
import {
	TOOL_GRAPH_MODEL_SCENARIOS,
	buildPassingToolGraphModelTrace,
	gradeToolGraphModelTrace
} from './fixtures/agenticChatToolExecutionGraphModelScenarios';

function scenario(id: string) {
	const value = TOOL_GRAPH_MODEL_SCENARIOS.find((candidate) => candidate.id === id);
	if (!value) throw new Error(`Missing fixture scenario: ${id}`);
	return value;
}

describe('Agentic Chat tool execution graph model-scenario grader', () => {
	it.each(TOOL_GRAPH_MODEL_SCENARIOS)('accepts the canonical trace for $id', (fixture) => {
		expect(gradeToolGraphModelTrace(fixture, buildPassingToolGraphModelTrace(fixture))).toEqual(
			{
				passed: true,
				failures: []
			}
		);
	});

	it('rejects independent calls spread across avoidable provider rounds', () => {
		const fixture = scenario('parallel_independent_updates');
		const trace = buildPassingToolGraphModelTrace(fixture);
		trace.toolCallRounds = trace.toolCallRounds[0]!.map((call) => [call]);

		const grade = gradeToolGraphModelTrace(fixture, trace);
		expect(grade.passed).toBe(false);
		expect(grade.failures.join('\n')).toContain('expected 1 tool-call round(s), received 2');
	});

	it('rejects known-argument sequencing without an explicit after edge', () => {
		const fixture = scenario('sequential_known_arguments');
		const trace = buildPassingToolGraphModelTrace(fixture);
		delete trace.toolCallRounds[0]![1]!.function.arguments.after;

		const grade = gradeToolGraphModelTrace(fixture, trace);
		expect(grade.passed).toBe(false);
		expect(grade.failures.join('\n')).toContain('log_alpha.after expected refs');
	});

	it('rejects a fan-in call that waits for only one of two prerequisites', () => {
		const fixture = scenario('mixed_parallel_and_fan_in');
		const trace = buildPassingToolGraphModelTrace(fixture);
		const summary = trace.toolCallRounds[0]![2]!;
		summary.function.arguments.after = [
			trace.toolCallRounds[0]![0]!.function.arguments.call_ref as string
		];

		const grade = gradeToolGraphModelTrace(fixture, trace);
		expect(grade.passed).toBe(false);
		expect(grade.failures.join('\n')).toContain(
			'summary.after expected refs for [alpha, beta]'
		);
	});

	it('rejects a result-dependent call guessed into the prerequisite round', () => {
		const fixture = scenario('returned_value_requires_later_round');
		const trace = buildPassingToolGraphModelTrace(fixture);
		trace.toolCallRounds = [[...trace.toolCallRounds[0]!, ...trace.toolCallRounds[1]!]];
		trace.toolCallRounds[0]![1]!.function.arguments.milestone_id = 'MILESTONE-PLACEHOLDER';

		const grade = gradeToolGraphModelTrace(fixture, trace);
		expect(grade.passed).toBe(false);
		expect(grade.failures.join('\n')).toContain('expected 2 tool-call round(s), received 1');
		expect(grade.failures.join('\n')).toContain('missing task');
	});

	it('rejects serial chaining between dependents that should fan out in parallel', () => {
		const fixture = scenario('sequential_setup_then_parallel_fan_out');
		const trace = buildPassingToolGraphModelTrace(fixture);
		const design = trace.toolCallRounds[0]![1]!;
		const copy = trace.toolCallRounds[0]![2]!;
		design.function.arguments.call_ref = 'ref_design';
		copy.function.arguments.after = ['ref_design'];

		const grade = gradeToolGraphModelTrace(fixture, trace);
		expect(grade.passed).toBe(false);
		expect(grade.failures.join('\n')).toContain(
			'copy.after expected refs for [project_started]'
		);
	});

	it('rejects prose claiming completion when no tools were proposed', () => {
		const fixture = scenario('parallel_independent_updates');
		const grade = gradeToolGraphModelTrace(fixture, {
			toolCallRounds: [],
			finalContent: 'I updated both tasks in parallel.'
		});

		expect(grade.passed).toBe(false);
		expect(grade.failures.join('\n')).toContain('received 0');
	});
});
