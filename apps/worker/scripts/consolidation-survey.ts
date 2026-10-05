// apps/worker/scripts/consolidation-survey.ts
//
// Runs a consolidation survey for one project family WITHOUT creating a run or
// writing anything (docs/research/doc-task-consolidation-2026-10-03).
//
//   cd apps/worker && NODE_OPTIONS=--conditions=development pnpm exec tsx \
//     scripts/consolidation-survey.ts --project <id> --out <dir>            # free: inventory + prompt only
//   CONSOLIDATION_SURVEY_LIVE=1 ... --project <id> --out <dir> --live       # PAID (~1-2 cents): both model calls
//
// Output holds private project content; keep --out outside the repo (a scratchpad).
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { supabase } from '../src/lib/supabase';
import { SmartLLMService, type JSONUsageEvent } from '../src/lib/services/smart-llm-service';
import { describeOps } from '@buildos/shared-agent-ops/consolidation';
import { loadInventory } from '../src/workers/consolidation/consolidationJob';
import {
	GROUPS_SYSTEM_PROMPT,
	buildDecision,
	buildKeys,
	decideSystemPrompt,
	decideUserPrompt,
	findTwins,
	groupsUserPrompt,
	parseGroups,
	twinMap
} from '../src/workers/consolidation/survey';

function arg(name: string): string | null {
	const index = process.argv.indexOf(`--${name}`);
	return index >= 0 ? (process.argv[index + 1] ?? null) : null;
}

async function main() {
	const projectId = arg('project');
	// Default outside the repo: the output holds private project content.
	const out = resolve(arg('out') ?? join(tmpdir(), 'consolidation-survey'));
	const live = process.argv.includes('--live');
	if (!projectId) throw new Error('--project <id> is required');
	if (live && process.env.CONSOLIDATION_SURVEY_LIVE !== '1')
		throw new Error(
			'--live makes paid model calls; set CONSOLIDATION_SURVEY_LIVE=1 once approved.'
		);
	mkdirSync(out, { recursive: true });

	const { data: root, error } = await supabase
		.from('onto_projects')
		.select('id, name, created_by')
		.eq('id', projectId)
		.maybeSingle();
	if (error || !root) throw new Error(`Project not found: ${error?.message ?? projectId}`);
	const { data: children } = await supabase
		.from('onto_projects')
		.select('id')
		.eq('parent_project_id', projectId)
		.is('deleted_at', null);
	const { data: owner } = await supabase
		.from('onto_actors')
		.select('user_id')
		.eq('id', root.created_by)
		.maybeSingle();
	const run = {
		id: 'dry-run',
		user_id: owner?.user_id ?? '',
		root_project_id: projectId,
		project_ids: [projectId, ...(children ?? []).map((child) => child.id)],
		status: 'surveying',
		plan: null,
		cost_usd: 0,
		created_at: new Date().toISOString()
	};

	const inventory = await loadInventory(run);
	const keys = buildKeys(inventory);
	const prompt = groupsUserPrompt(inventory, keys);
	const pinned = inventory.documents.filter((document) => document.pinned);
	const summary = {
		project: root.name,
		projects: inventory.projects.map((project) => project.name),
		documents: inventory.documents.length,
		pinned: pinned.map((document) => `${document.title} (${document.pinned})`),
		twins: findTwins(inventory).map((ids) =>
			ids.map((id) => inventory.documents.find((d) => d.id === id)?.title)
		),
		with_headings: inventory.documents.filter((document) => document.headings.length).length,
		in_folders: inventory.documents.filter((document) => document.folder).length,
		groups_prompt_chars: GROUPS_SYSTEM_PROMPT.length + prompt.length
	};
	writeFileSync(join(out, 'inventory-summary.json'), JSON.stringify(summary, null, 2));
	writeFileSync(join(out, 'groups-prompt.json'), prompt);
	console.log(JSON.stringify(summary, null, 2));
	if (!live) return;

	let cost = 0;
	const onUsage = (event: JSONUsageEvent) => {
		cost += event.totalCost ?? 0;
		return Promise.resolve();
	};
	const llm = new SmartLLMService({ supabase, appName: 'BuildOS Consolidation Survey Script' });
	const raw = await llm.getJSONResponse<Record<string, unknown>>({
		systemPrompt: GROUPS_SYSTEM_PROMPT,
		userPrompt: prompt,
		userId: run.user_id,
		profile: 'balanced',
		validation: { retryOnParseError: true, maxRetries: 2 },
		operationType: 'consolidation_find_groups',
		projectId,
		metadata: { consolidation_run_id: 'survey-script' },
		onUsage
	});
	// Saved first: the calls are paid, and a crash below must not lose them.
	writeFileSync(join(out, 'groups-raw.json'), JSON.stringify(raw, null, 2));
	const groups = parseGroups(raw, inventory, keys);
	const twins = twinMap(inventory);
	const decisions = [];
	for (const [index, group] of groups.entries()) {
		const decided = await llm.getJSONResponse<Record<string, unknown>>({
			systemPrompt: decideSystemPrompt(group),
			userPrompt: decideUserPrompt({ group, inventory, keys, twins }),
			userId: run.user_id,
			profile: 'balanced',
			validation: { retryOnParseError: true, maxRetries: 2 },
			operationType: 'consolidation_decide_group',
			projectId,
			metadata: {
				consolidation_run_id: 'survey-script',
				consolidation_cluster: `c${index + 1}`
			},
			onUsage
		});
		decisions.push({
			raw: decided,
			...buildDecision({ key: `c${index + 1}`, group, raw: decided, inventory, keys, twins })
		});
		writeFileSync(join(out, 'decisions-raw.json'), JSON.stringify(decisions, null, 2));
	}
	const title = (id: string) =>
		inventory.documents.find((document) => document.id === id)?.title ?? id;
	const project = (id: string) => inventory.projects.find((item) => item.id === id)?.name ?? id;
	const names = {
		project,
		document: title,
		task: (id: string) => inventory.tasks?.find((task) => task.id === id)?.title ?? id
	};
	const readable = decisions.map((decision) => ({
		key: decision.cluster.key,
		kind: decision.cluster.kind,
		title: decision.cluster.title,
		documents: decision.cluster.document_ids.map(title),
		reason: decision.cluster.reason,
		decided: decision.question ? null : describeOps(decision.cluster.ops, names),
		tasks: (decision.cluster.task_ids ?? []).map(
			(id) => inventory.tasks?.find((task) => task.id === id)?.title ?? id
		),
		question: decision.question && {
			header: decision.question.header,
			question: decision.question.question,
			evidence: decision.question.evidence.map((item) => `${item.source}: “${item.quote}”`),
			does: decision.question.options.map(
				(option) => `${option.label}: ${describeOps(option.ops, names)}`
			),
			options: decision.question.options.map(
				(option) =>
					`${option.id === decision.question!.recommended_option_id ? '★ ' : ''}${option.label}`
			)
		}
	}));
	writeFileSync(
		join(out, 'decisions.json'),
		JSON.stringify({ cost_usd: cost, readable, decisions }, null, 2)
	);
	console.log(
		JSON.stringify({ cost_usd: Math.round(cost * 10000) / 10000, groups: readable }, null, 2)
	);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
