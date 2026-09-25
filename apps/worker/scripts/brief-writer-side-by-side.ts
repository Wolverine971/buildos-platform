// apps/worker/scripts/brief-writer-side-by-side.ts
//
// Tasker 108 item 2: which model should write the daily brief's executive
// summary and analysis? Rebuilds the exact prompts the brief worker would send
// for one user and date (same data loader, prompt builders, and project-brief
// selection; the per-project briefs are read from that day's stored brief),
// then asks each candidate model and writes the answers side by side to a
// private markdown file for DJ to read.
//
//   Dry run (free):  pnpm --filter @buildos/worker exec tsx scripts/brief-writer-side-by-side.ts \
//                      --user <user uuid> [--date YYYY-MM-DD]
//   Live (paid):     ... --live --max-usd 0.05
//   Options:         --models google/gemini-3.7-flash,deepseek/deepseek-v4-flash,openai/gpt-6-luna
//
// Reads use apps/worker/.env, which points at production. The data loader gets
// a read-only client: any insert/update/upsert/delete/rpc throws. Model calls
// go straight to OpenRouter with the ZDR policy and are not written to
// llm_usage_logs, so replay spend never mixes into prod spend.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse } from 'dotenv';

const DEFAULT_MODELS = [
	'google/gemini-3.7-flash',
	'deepseek/deepseek-v4-flash',
	'openai/gpt-6-luna'
];
// Mirrors ontologyBriefGenerator.ts: executive summary and standard analysis.
const CALLS = [
	{ key: 'executive_summary', maxTokens: 1_500, temperature: 0.7 },
	{ key: 'analysis', maxTokens: 3_000, temperature: 0.4 }
] as const;
// Worst-case rates across the candidates (Gemini standard endpoint, per token).
const PROMPT_USD_PER_TOKEN = 0.75e-6;
const COMPLETION_USD_PER_TOKEN = 3.75e-6;

function arg(name: string, fallback?: string): string | undefined {
	const at = process.argv.indexOf(`--${name}`);
	return at >= 0 ? process.argv[at + 1] : fallback;
}

function readOnly<T extends object>(client: T): T {
	const blocked = new Set(['insert', 'update', 'upsert', 'delete']);
	return new Proxy(client, {
		get(target, prop, receiver) {
			if (prop === 'rpc') {
				return () => {
					throw new Error('read-only replay: rpc blocked');
				};
			}
			if (prop === 'from') {
				return (table: string) => {
					const builder = (target as any).from(table);
					return new Proxy(builder, {
						get(inner, innerProp, innerReceiver) {
							if (blocked.has(String(innerProp))) {
								return () => {
									throw new Error(
										`read-only replay: ${String(innerProp)} on ${table} blocked`
									);
								};
							}
							const value = Reflect.get(inner, innerProp, innerReceiver);
							return typeof value === 'function' ? value.bind(inner) : value;
						}
					});
				};
			}
			const value = Reflect.get(target, prop, receiver);
			return typeof value === 'function' ? value.bind(target) : value;
		}
	});
}

async function main() {
	const userId = arg('user');
	if (!userId) throw new Error('--user <uuid> is required');
	const models = (arg('models') ?? DEFAULT_MODELS.join(',')).split(',').map((m) => m.trim());
	const maxUsd = Number(arg('max-usd', '0.05'));
	const live = process.argv.includes('--live');

	const env = parse(readFileSync(resolve(process.cwd(), '.env')));
	for (const [key, value] of Object.entries(env)) process.env[key] ??= value;

	const { supabase } = await import('../src/lib/supabase.js');
	const { OntologyBriefDataLoader } = await import(
		'../src/workers/brief/ontologyBriefDataLoader.js'
	);
	const { loadYesterdayPlanContinuity, selectPromptProjectBriefContents } = await import(
		'../src/workers/brief/ontologyBriefGenerator.js'
	);
	const { OntologyAnalysisPrompt, OntologyExecutiveSummaryPrompt } = await import(
		'../src/workers/brief/ontologyPrompts.js'
	);
	const { getHoliday } = await import('../src/lib/utils/holiday-finder.js');
	const { buildOpenRouterChatCompletionBody, withOpenRouterPrivacy } = await import(
		'@buildos/smart-llm'
	);
	const { formatInTimeZone } = await import('date-fns-tz');
	const { parseISO } = await import('date-fns');

	const db = readOnly(supabase);
	const { data: user } = await db.from('users').select('timezone').eq('id', userId).single();
	const timezone = user?.timezone || 'UTC';
	const { data: actor } = await db
		.from('onto_actors')
		.select('id')
		.eq('user_id', userId)
		.maybeSingle();
	if (!actor?.id) throw new Error(`No ontology actor for user ${userId}`);
	const briefDate = arg('date') ?? formatInTimeZone(new Date(), timezone, 'yyyy-MM-dd');
	const briefDateObj = parseISO(`${briefDate}T00:00:00`);

	const loader = new OntologyBriefDataLoader(db as any);
	const projectsData = await loader.loadUserOntologyData(
		userId,
		actor.id,
		briefDateObj,
		timezone
	);
	const pausedProjects = await loader.loadRecentlyPausedProjects(userId, actor.id);
	const calendar = await loader.loadCalendarBriefData(
		userId,
		actor.id,
		projectsData,
		briefDate,
		timezone
	);
	const briefData = loader.prepareBriefData(
		projectsData,
		briefDate,
		timezone,
		calendar,
		pausedProjects
	);
	const yesterdayPlan = await loadYesterdayPlanContinuity(userId, briefDate, projectsData);

	const { data: storedBrief } = await db
		.from('ontology_daily_briefs')
		.select('id, executive_summary')
		.eq('user_id', userId)
		.eq('brief_date', briefDate)
		.maybeSingle();
	if (!storedBrief?.id)
		throw new Error(`No stored brief for ${briefDate}; project briefs are read from it`);
	const { data: projectBriefs } = await db
		.from('ontology_project_briefs')
		.select('project_id, brief_content')
		.eq('daily_brief_id', storedBrief.id);
	const projectBriefContents = selectPromptProjectBriefContents(
		briefData.projects,
		projectBriefs ?? []
	);
	const holidays = getHoliday(briefDateObj) || undefined;

	const prompts = {
		executive_summary: {
			system: OntologyExecutiveSummaryPrompt.getSystemPrompt(),
			user: OntologyExecutiveSummaryPrompt.buildUserPrompt({
				date: briefDate,
				timezone,
				briefData,
				holidays,
				projectBriefContents,
				yesterdayPlan
			})
		},
		analysis: {
			system: OntologyAnalysisPrompt.getSystemPrompt(),
			user: OntologyAnalysisPrompt.buildUserPrompt({
				date: briefDate,
				timezone,
				briefData,
				holidays,
				projectBriefContents
			})
		}
	};
	console.info(
		`${briefDate} (${timezone}): ${projectsData.length} projects, ${projectBriefContents.length} project briefs in prompt; summary prompt ${prompts.executive_summary.user.length} chars, analysis ${prompts.analysis.user.length} chars`
	);

	const apiKey = env.PRIVATE_OPENROUTER_API_KEY;
	if (live && !apiKey)
		throw new Error('PRIVATE_OPENROUTER_API_KEY missing from apps/worker/.env');
	const sections: string[] = [
		`# Brief writer side by side — ${briefDate}`,
		'',
		'Same prompts the brief worker sends; only the model changes. Caps: summary 1,500, analysis 3,000 tokens.',
		''
	];
	let spent = 0;
	for (const call of CALLS) {
		const prompt = prompts[call.key];
		sections.push(
			`## ${call.key === 'executive_summary' ? 'Executive summary' : 'Analysis'}`,
			''
		);
		for (const model of models) {
			const worst =
				((prompt.system.length + prompt.user.length) / 3) * PROMPT_USD_PER_TOKEN +
				call.maxTokens * COMPLETION_USD_PER_TOKEN;
			if (spent + worst > maxUsd) {
				console.warn(
					`skip ${call.key} ${model}: $${spent.toFixed(4)} + worst $${worst.toFixed(4)} > $${maxUsd}`
				);
				continue;
			}
			const body = buildOpenRouterChatCompletionBody({
				model,
				messages: [
					{ role: 'system', content: prompt.system },
					{ role: 'user', content: prompt.user }
				],
				temperature: call.temperature,
				max_tokens: call.maxTokens,
				stream: false
			});
			body.provider = withOpenRouterPrivacy(body.provider);
			body.usage = { include: true };
			if (!live) {
				console.info(`would send ${call.key} → ${model}: worst $${worst.toFixed(4)}`);
				continue;
			}
			const started = Date.now();
			const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${apiKey}`,
					'Content-Type': 'application/json',
					'HTTP-Referer': 'https://build-os.com',
					'X-Title': 'BuildOS brief writer side by side'
				},
				body: JSON.stringify(body),
				signal: AbortSignal.timeout(120_000)
			});
			const json = (await response.json().catch(() => null)) as Record<string, any> | null;
			const wallMs = Date.now() - started;
			const usage = json?.usage ?? {};
			const cost = typeof usage.cost === 'number' ? usage.cost : worst;
			spent += cost;
			const text = String(json?.choices?.[0]?.message?.content ?? json?.error?.message ?? '');
			const finish = json?.choices?.[0]?.finish_reason ?? 'error';
			const stats = `${(wallMs / 1000).toFixed(1)} s · ${usage.completion_tokens ?? '?'} tokens (${usage.completion_tokens_details?.reasoning_tokens ?? 0} reasoning) · $${cost.toFixed(4)} · finish ${finish}`;
			console.info(`${call.key} → ${model}: ${stats}`);
			sections.push(`### ${model}`, '', `_${stats}_`, '', text.trim(), '');
		}
	}
	sections.push(
		`## What shipped that day`,
		'',
		storedBrief.executive_summary.slice(0, 1_500),
		''
	);
	if (live) {
		const outDir = resolve(process.cwd(), '.prompt-dumps');
		mkdirSync(outDir, { recursive: true });
		const outFile = join(outDir, `brief-side-by-side-${briefDate}.md`);
		writeFileSync(outFile, sections.join('\n'), { mode: 0o600 });
		console.info(`spent $${spent.toFixed(4)} → ${outFile}`);
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
