// apps/worker/scripts/today-waiting-replay.ts
//
// Free dry run of the Today "waiting" pass: rebuilds the exact prompt the brief worker
// would send for one user from production data and writes it to a file. No model call.
//
//   pnpm --filter @buildos/worker exec tsx scripts/today-waiting-replay.ts \
//     --user <user uuid> [--out /path/prompt.txt]
//
// Reads use apps/worker/.env (production). The client is read-only: insert, update,
// upsert, delete and rpc throw.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'dotenv';

function arg(name: string): string | undefined {
	const at = process.argv.indexOf(`--${name}`);
	return at >= 0 ? process.argv[at + 1] : undefined;
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
										`read-only replay: ${String(innerProp)} blocked`
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
	const env = parse(readFileSync(resolve(process.cwd(), '.env')));
	for (const [key, value] of Object.entries(env)) process.env[key] ??= value;

	const { supabase } = await import('../src/lib/supabase.js');
	const { loadTodayWaitingInputs, buildRefMaps, buildTodayWaitingPrompt } = await import(
		'../src/workers/brief/todayWaitingItems.js'
	);
	const { formatInTimeZone } = await import('date-fns-tz');

	const db = readOnly(supabase);
	const { data: user } = await db.from('users').select('timezone').eq('id', userId).single();
	const timezone = user?.timezone || 'UTC';
	const { data: actor } = await db
		.from('onto_actors')
		.select('id')
		.eq('user_id', userId)
		.maybeSingle();
	if (!actor?.id) throw new Error(`No ontology actor for user ${userId}`);

	const now = new Date();
	const briefDate = formatInTimeZone(now, timezone, 'yyyy-MM-dd');
	const inputs = await loadTodayWaitingInputs(db as any, userId, actor.id, now);
	const refs = buildRefMaps(inputs);
	const { systemPrompt, userPrompt } = buildTodayWaitingPrompt(inputs, refs, {
		briefDate,
		timezone
	});

	const text = `=== SYSTEM ===\n${systemPrompt}\n\n=== USER ===\n${userPrompt}\n`;
	// ~4 characters per token is close enough for a cost estimate.
	const promptTokens = Math.ceil(text.length / 4);
	const summary = `projects=${refs.projects.size} tasks=${refs.tasks.size} existing=${inputs.existing.length} chars=${text.length} ~tokens=${promptTokens}`;
	const out = arg('out');
	if (out) writeFileSync(out, `${summary}\n\n${text}`);
	console.log(summary);
	if (!out) console.log(text);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
