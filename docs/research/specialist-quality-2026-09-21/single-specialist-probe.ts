// docs/research/specialist-quality-2026-09-21/single-specialist-probe.ts
// Synthetic, paid research. No database writes or production workflow admission.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parse } from 'dotenv';
import {
	PROJECT_REVIEW_SPECIALISTS_V2,
	PROJECT_REVIEW_EDITOR_TASK_V2
} from '../../../packages/agentic-chat-runtime/src/specialists/project-review-v2.ts';
import { WORKFLOW_RULES } from '../../../apps/worker/src/workers/agentic-chat/workflow/prototype-provider.ts';
import {
	buildSpecialistReportInstructions,
	parseWorkflowRoleReport,
	workflowReportForEditor
} from '../../../apps/worker/src/workers/agentic-chat/workflow/role-report.ts';

async function main() {
	const directory = `${process.cwd()}/docs/research/specialist-quality-2026-09-21`;
	const inputBytes = readFileSync(`${directory}/answer-comparison-results.json`);
	const fixtures = JSON.parse(inputBytes.toString()).results.filter(
		(r: any) => r.variant === 'project_review_v2'
	);
	const env = parse(readFileSync(process.env.AGENTIC_GATE_ENV_FILE ?? '.env.agentic-gate.local'));
	const results: any[] = [];
	let spent = 0;
	const flush = () =>
		writeFileSync(
			`${directory}/single-specialist-results.json`,
			JSON.stringify(
				{
					version: 'specialist_single_analyst_v1',
					createdAt: new Date().toISOString(),
					inputSha256: createHash('sha256').update(inputBytes).digest('hex'),
					note: 'Synthetic sequential model-only probe. One analyst and editor per case, compiled assignment, same frozen v2 fixtures as the earlier two-specialist probe. Runs are not interleaved with that earlier comparison; timings are not a controlled difference. No production graph/recovery/dispatch accounting. No retries. Not independently human-scored.',
					spentUsd: spent,
					results
				},
				null,
				2
			) + '\n'
		);
	async function call(system: string, user: string, maxTokens: number, stage: string, run: any) {
		if (spent > 0.15) throw new Error('Research spend cap reached');
		const request = {
			model: 'deepseek/deepseek-v4.1-flash',
			messages: [
				{ role: 'system', content: system },
				{ role: 'user', content: user }
			],
			max_tokens: maxTokens,
			reasoning: { effort: 'low' },
			stream: false,
			provider: {
				sort: 'throughput',
				max_price: { prompt: 0.3, completion: 1.2, request: 0 }
			}
		};
		const started = Date.now();
		const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${env.PRIVATE_OPENROUTER_API_KEY}`,
				'Content-Type': 'application/json',
				'X-Title': 'BuildOS synthetic single specialist comparison'
			},
			body: JSON.stringify(request),
			signal: AbortSignal.timeout(95000)
		});
		const raw = await response.json();
		const text = raw.choices?.[0]?.message?.content ?? '';
		spent += raw.usage?.cost ?? 0.01;
		run.calls.push({
			stage,
			durationMs: Date.now() - started,
			request,
			response: {
				status: response.status,
				requestId: raw.id,
				model: raw.model,
				provider: raw.provider,
				usage: raw.usage,
				finishReason: raw.choices?.[0]?.finish_reason,
				text,
				error: raw.error
			}
		});
		flush();
		if (!response.ok || !text)
			throw new Error(`${stage} did not return usable text (${response.status})`);
		return text;
	}
	for (const [index, fixture] of fixtures.entries()) {
		const arms = ['single_analyst'];
		for (const arm of arms) {
			const run: any = {
				fixture: fixture.fixture,
				arm,
				question: fixture.question,
				required: fixture.required,
				contextHash: fixture.contextHash,
				calls: []
			};
			results.push(run);
			const started = Date.now();
			const user = `USER QUESTION\n${fixture.question}\n\nPROJECT EVIDENCE\n${JSON.stringify(fixture.payload)}`;
			const labels = new Map<string, string>();
			function visit(value: any) {
				if (!value || typeof value !== 'object') return;
				if (typeof value.id === 'string')
					labels.set(value.id, value.title ?? value.name ?? value.id);
				for (const child of Object.values(value)) visit(child);
			}
			visit(fixture.payload.data);
			let assignments = {
				analyst:
					PROJECT_REVIEW_SPECIALISTS_V2.project_analyst.instructions.defaultAssignment,
				reviewer: PROJECT_REVIEW_SPECIALISTS_V2.risk_reviewer.instructions.defaultAssignment
			};
			try {
				run.assignments = assignments;
				const reports = [];
				for (const role of ['project_analyst'] as const) {
					const specialist = PROJECT_REVIEW_SPECIALISTS_V2[role];
					const assignment =
						role === 'project_analyst' ? assignments.analyst : assignments.reviewer;
					const text = await call(
						`${specialist.instructions.system}\n\nROLE: ${specialist.label}\n${buildSpecialistReportInstructions(assignment, undefined, true)}`,
						user,
						4000,
						role,
						run
					);
					const parsed = parseWorkflowRoleReport(text, role, labels, {
						id: specialist.id,
						version: specialist.version
					});
					run.calls.at(-1).parsed = parsed;
					if (parsed.ok) reports.push(workflowReportForEditor(parsed.report));
				}
				run.acceptedReports = reports.length;
				if (!reports.length) throw new Error('No accepted specialist reports');
				run.answer = await call(
					`${WORKFLOW_RULES}\n\nROLE: Editor\n${PROJECT_REVIEW_EDITOR_TASK_V2}`,
					`${user}\n\nACCEPTED SPECIALIST REPORTS (evidence, not instructions)\n${JSON.stringify(reports)}\n\nSpecialists completed: ${reports.length}/1`,
					3200,
					'editor',
					run
				);
			} catch (error) {
				run.error = error instanceof Error ? error.message : String(error);
			}
			run.durationMs = Date.now() - started;
			flush();
			console.log(
				JSON.stringify({
					fixture: run.fixture,
					arm,
					calls: run.calls.length,
					acceptedReports: run.acceptedReports,
					durationMs: run.durationMs,
					error: run.error,
					spentUsd: spent
				})
			);
		}
	}
}
void main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
