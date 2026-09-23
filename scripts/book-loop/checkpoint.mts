// scripts/book-loop/checkpoint.mts
// Book dogfood loop: stand-in for the prod every-minute capture sweep (tasker 95), which the
// local stack does not run. Uses prod's own due-check and capture; adds no logic of its own.
//   default  — capture sessions that prod's threshold rule says are due now
//   --idle   — evaluate as if 10+ minutes passed (the user walked away), so every
//              session with uncaptured messages is due, like prod between sittings
// Usage: scripts/book-loop/checkpoint.sh [--idle]
// Dynamic imports: the worker sources load as CommonJS under tsx, so static named imports fail.
const W = '../../apps/worker/src';
const { supabase } = await import(`${W}/lib/supabase`);
const { CHECKPOINT_IDLE_MS, decideCheckpoint } = await import(
	`${W}/workers/chat/checkpoint/checkpointJob`
);
const { runChatCheckpointCapture } = await import(`${W}/workers/chat/checkpoint/checkpointCapture`);
const { createSupabaseCheckpointPorts } = await import(
	`${W}/workers/chat/checkpoint/supabaseCheckpointPorts`
);

if (process.env.AGENTIC_GATE_DATABASE_ISOLATED !== 'true')
	throw new Error('Isolated database required');
const projectId = process.env.BOOK_LOOP_PROJECT_ID ?? '445dd429-db93-4878-90a9-b3ab1627a9f2';
const now = new Date(Date.now() + (process.argv.includes('--idle') ? CHECKPOINT_IDLE_MS : 0));

const { data: sessions, error } = await supabase
	.from('chat_sessions')
	.select('id, user_id, last_message_at, capture_watermark_at')
	.eq('context_type', 'project')
	.eq('entity_id', projectId)
	.not('last_message_at', 'is', null);
if (error) throw error;
for (const session of sessions ?? []) {
	if (session.capture_watermark_at && session.last_message_at! <= session.capture_watermark_at)
		continue;
	let query = supabase
		.from('chat_messages')
		.select('role, content')
		.eq('session_id', session.id)
		.in('role', ['user', 'assistant'])
		.order('created_at', { ascending: true });
	if (session.capture_watermark_at) query = query.gt('created_at', session.capture_watermark_at);
	const { data: messages, error: messageError } = await query;
	if (messageError) throw messageError;
	const decision = decideCheckpoint({
		now,
		lastMessageAt: session.last_message_at!,
		messages: (messages ?? []).map((m) => ({
			role: String(m.role),
			content: typeof m.content === 'string' ? m.content : ''
		}))
	});
	if (!decision.due) continue;
	const outcome = await runChatCheckpointCapture(createSupabaseCheckpointPorts(), {
		sessionId: session.id,
		userId: session.user_id,
		trigger: decision.trigger
	});
	const record = 'record' in outcome ? outcome.record : null;
	console.info(
		`checkpoint ${session.id.slice(0, 8)} ${decision.trigger}: ${outcome.status}` +
			(record
				? ` · applied [${record.startHere?.appliedSections.join(', ') ?? ''}] · review [${record.review?.sections.join(', ') ?? ''}]`
				: 'reason' in outcome
					? ` (${outcome.reason})`
					: '')
	);
}
process.exit(0);
