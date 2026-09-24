// docs/research/specialist-quality-2026-09-21/answer-comparison-probe.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parse } from 'dotenv';
import { PROJECT_REVIEW_SPECIALISTS_V1 } from '../../../packages/agentic-chat-runtime/src/specialists/project-review-v1.ts';
import { PROJECT_REVIEW_SPECIALISTS_V2 } from '../../../packages/agentic-chat-runtime/src/specialists/project-review-v2.ts';
import { buildAgenticChatWorkflowContextV1 } from '../../../apps/worker/src/workers/agentic-chat/workflow/prepared-context.ts';
import {
	buildSpecialistReportInstructions,
	parseWorkflowRoleReport
} from '../../../apps/worker/src/workers/agentic-chat/workflow/role-report.ts';
async function main() {
	const root = process.cwd() + '/docs/research/specialist-quality-2026-09-21';
	const env = parse(readFileSync(process.env.AGENTIC_GATE_ENV_FILE ?? '.env.agentic-gate.local'));
	const date = '2026-09-21T04:00:00Z';
	const fixtures = [
		{
			id: 'harbor-launch',
			question: 'What is the most important saved blocker to opening this launch?',
			data: {
				tasks: [
					{ id: 'task-room', title: 'Confirm room', state_key: 'done', updated_at: date }
				],
				documents: [],
				risks: [
					{
						id: 'risk-permit',
						title: 'Permit approval outstanding',
						state_key: 'open',
						impact: 'high',
						content:
							'Opening depends on permit approval. The application is submitted; approval has not been received.',
						updated_at: date
					}
				],
				relationships: [
					{
						id: 'edge-permit',
						src_id: 'opening',
						rel: 'depends_on',
						dst_id: 'permit',
						created_at: date
					}
				]
			},
			required:
				'Identify missing permit approval; do not treat the done room task as the blocker.'
		},
		{
			id: 'sparse-project',
			question:
				'Does the saved evidence establish whether our launch is on track? State when evidence is insufficient.',
			data: { tasks: [], documents: [], risks: [], relationships: [] },
			required:
				'Explicit insufficient evidence; do not fabricate a finding about launch health.'
		},
		{
			id: 'birch-workshop',
			question:
				'Does the saved risk register contain an open catering risk? Review only the supplied register.',
			data: {
				tasks: [],
				documents: [],
				risks: [
					{
						id: 'risk-catering',
						title: 'Caterer unavailable',
						state_key: 'mitigated',
						mitigated_at: date,
						updated_at: date,
						content: 'An alternative caterer confirmed the booking.'
					}
				],
				relationships: []
			},
			required:
				'The saved catering risk is mitigated; do not invent another open catering issue.'
		},
		{
			id: 'atlas-migration',
			question:
				'What do the saved migration plans say about the cutover date and permitted downtime?',
			data: {
				tasks: [],
				documents: [
					{
						id: 'doc-cutover',
						title: 'Migration plan',
						content:
							'The current approved cutover is October 12, 2026. Downtime must not exceed 30 minutes.',
						content_coverage: 'full',
						updated_at: date
					}
				],
				risks: [],
				relationships: []
			},
			required:
				'October 12, 2026; 30 minutes; acknowledge missing text under the old inventory-only recipe.'
		}
	];
	const results: any[] = [];
	let spent = 0;
	for (const fixture of fixtures)
		for (const v2 of [false, true]) {
			const definition = (v2 ? PROJECT_REVIEW_SPECIALISTS_V2 : PROJECT_REVIEW_SPECIALISTS_V1)
				.risk_reviewer;
			const data: any = {
				project: { id: fixture.id, name: fixture.id, updated_at: date },
				goals: [],
				milestones: [],
				plans: [],
				events: [],
				activity: [],
				prior_suggestions: [],
				...fixture.data
			};
			if (!v2)
				data.documents = data.documents.map(
					({ content, content_coverage, ...d }: any) => d
				);
			data.review_coverage = Object.fromEntries(
				Object.entries(data)
					.filter(([, v]) => Array.isArray(v))
					.map(([k, v]: any) => [k, { total: v.length }])
			);
			const context = buildAgenticChatWorkflowContextV1({
				context: {
					contextType: 'project',
					contextLoadSource: 'rpc',
					timezone: 'UTC',
					data
				} as any,
				userId: 'synthetic-user',
				projectId: fixture.id,
				accessCheckedAt: date,
				contextLoadedAt: date,
				projectReviewV2: v2
			});
			const system =
				definition.instructions.system +
				'\n\n' +
				buildSpecialistReportInstructions(
					definition.instructions.defaultAssignment,
					undefined,
					v2
				);
			const user = `USER QUESTION\n${fixture.question}\n\nPROJECT EVIDENCE\n${JSON.stringify(context.payload)}`;
			const request = {
				model: definition.modelPolicy.primaryModel,
				messages: [
					{ role: 'system', content: system },
					{ role: 'user', content: user }
				],
				max_tokens: 4000,
				reasoning: { effort: 'low' },
				provider: {
					sort: 'throughput',
					max_price: { prompt: 0.3, completion: 1.2, request: 0 }
				},
				stream: false
			};
			if (spent > 0.15) throw new Error('Synthetic research spend stop reached');
			const started = Date.now();
			const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${env.PRIVATE_OPENROUTER_API_KEY}`,
					'Content-Type': 'application/json',
					'X-Title': 'BuildOS synthetic specialist evidence comparison'
				},
				body: JSON.stringify(request),
				signal: AbortSignal.timeout(95000)
			});
			const raw = await response.json();
			const text = raw.choices?.[0]?.message?.content ?? '';
			const labels = new Map(
				context.evidenceVersions.map((e) => [e.id, `${e.kind}: ${e.id}`])
			);
			const parsed = parseWorkflowRoleReport(
				text,
				'risk_reviewer',
				labels,
				v2 ? { id: definition.id, version: definition.version } : undefined
			);
			spent += raw.usage?.cost ?? 0.01;
			results.push({
				fixture: fixture.id,
				variant: v2 ? 'project_review_v2' : 'project_review_v1',
				question: fixture.question,
				required: fixture.required,
				contextHash: context.contextHash,
				payload: context.payload,
				requestSha256: createHash('sha256').update(JSON.stringify(request)).digest('hex'),
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
				},
				durationMs: Date.now() - started,
				parsed
			});
			writeFileSync(
				`${root}/answer-comparison-results.json`,
				JSON.stringify(
					{
						version: 'specialist_answer_comparison_v1',
						createdAt: new Date().toISOString(),
						note: 'Synthetic single-specialist research, one trial per case, not the durable workflow or a production quality guarantee. No planner/editor, no retries. Synthetic labels authored by the implementing agent.',
						results
					},
					null,
					2
				) + '\n'
			);
			console.log(
				JSON.stringify({
					fixture: fixture.id,
					v2,
					status: response.status,
					valid: parsed.ok,
					durationMs: Date.now() - started,
					costUsd: raw.usage?.cost,
					spent
				})
			);
		}
}
void main().catch((e) => {
	console.error(e);
	process.exitCode = 1;
});
