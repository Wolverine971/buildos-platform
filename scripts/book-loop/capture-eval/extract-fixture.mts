// scripts/book-loop/capture-eval/extract-fixture.mts
// Tasker 95 eval harness: freeze the book project's START HERE, its entities, and the
// book-loop chat sessions from the ISOLATED QA db into a JSON fixture the capture
// eval replays offline. Read-only.
// Usage (repo root): scripts/book-loop/capture-eval/extract-fixture.sh [out.json]
import { writeFileSync } from 'node:fs';

if (process.env.AGENTIC_GATE_DATABASE_ISOLATED !== 'true') {
	throw new Error('Isolated database required');
}
const { supabase } = await import('../../../apps/worker/src/lib/supabase');

const PROJECT_ID = process.env.BOOK_LOOP_PROJECT_ID ?? '445dd429-db93-4878-90a9-b3ab1627a9f2';
// Book-loop sessions in replay order: t01c→t03 (restructure) and t04→t05 (theme).
const SESSION_IDS = (
	process.env.CAPTURE_EVAL_SESSIONS ??
	'8f709665-5354-45f0-b0cf-4f5f9639832b,0c16b8c9-380f-40bb-9c7c-6456b326803c'
).split(',');
const out = process.argv[2] ?? 'scripts/book-loop/capture-eval/fixtures/book-loop.json';

const { data: project, error: projectError } = await supabase
	.from('onto_projects')
	.select('id, name, description, type_key, created_at, created_by')
	.eq('id', PROJECT_ID)
	.single();
if (projectError || !project) throw new Error(`project: ${projectError?.message}`);

const { data: documents, error: docError } = await supabase
	.from('onto_documents')
	.select('id, title, type_key, content, updated_at')
	.eq('project_id', PROJECT_ID)
	.is('deleted_at', null);
if (docError) throw docError;
const startHere = (documents ?? []).find((doc) => doc.type_key === 'document.context.project');
if (!startHere) throw new Error('START HERE not found');

const entityIds: Record<string, string[]> = {};
for (const [kind, table] of [
	['task', 'onto_tasks'],
	['goal', 'onto_goals'],
	['plan', 'onto_plans'],
	['milestone', 'onto_milestones'],
	['risk', 'onto_risks']
] as const) {
	const { data, error } = await supabase
		.from(table)
		.select('id')
		.eq('project_id', PROJECT_ID)
		.is('deleted_at', null);
	if (error) throw error;
	entityIds[kind] = (data ?? []).map((row) => row.id as string);
}

const sessions = [];
for (const sessionId of SESSION_IDS) {
	const { data: session, error } = await supabase
		.from('chat_sessions')
		.select('id, title, auto_title, user_id')
		.eq('id', sessionId)
		.single();
	if (error || !session) throw new Error(`session ${sessionId}: ${error?.message}`);
	const { data: messages, error: messageError } = await supabase
		.from('chat_messages')
		.select('id, role, content, created_at')
		.eq('session_id', sessionId)
		.order('created_at', { ascending: true });
	if (messageError) throw messageError;
	sessions.push({
		id: session.id,
		userId: session.user_id,
		title: session.title ?? session.auto_title ?? null,
		messages: (messages ?? []).filter((m) => m.role === 'user' || m.role === 'assistant')
	});
}

const fixture = {
	extractedAt: new Date().toISOString(),
	timezone: 'America/New_York',
	project,
	startHere: {
		id: startHere.id,
		title: startHere.title,
		type_key: startHere.type_key,
		content: startHere.content,
		updated_at: startHere.updated_at
	},
	documents: (documents ?? []).map(({ id, title, type_key }) => ({ id, title, type_key })),
	entityIds,
	sessions
};
writeFileSync(out, `${JSON.stringify(fixture, null, '\t')}\n`);
console.info(
	`wrote ${out}: ${sessions.length} sessions, ${sessions.reduce((n, s) => n + s.messages.length, 0)} messages, ${fixture.documents.length} docs`
);
process.exit(0);
