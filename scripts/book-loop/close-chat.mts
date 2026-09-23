// scripts/book-loop/close-chat.mts
// Book dogfood loop: run the end-of-chat pipeline (classify → activity → START HERE
// capture proposal → context snapshot enqueue) for one session on the ISOLATED QA db,
// the same work the production worker does after POST /api/chat/sessions/:id/close.
// Usage (from repo root): scripts/book-loop/close-chat.sh <session-id>
import { randomUUID } from 'node:crypto';

const sessionId = process.argv[2];
if (!sessionId) throw new Error('session id required');
if (process.env.AGENTIC_GATE_DATABASE_ISOLATED !== 'true')
	throw new Error('Isolated database required');
const { supabase } = await import('../../apps/worker/src/lib/supabase');
const { processChatClassificationJob } = await import(
	'../../apps/worker/src/workers/chat/chatSessionClassifier'
);
const { data: session, error } = await supabase
	.from('chat_sessions')
	.select('user_id')
	.eq('id', sessionId)
	.single();
if (error || !session) throw new Error(`session not found: ${error?.message}`);
const result = await processChatClassificationJob({
	id: randomUUID(),
	processingToken: null,
	correlationId: null,
	signal: new AbortController().signal,
	data: { sessionId, userId: session.user_id },
	opts: {},
	timestamp: Date.now(),
	attemptsMade: 0,
	updateProgress: async () => {},
	log: async (message: string) => console.info(message)
} as never);
console.info(JSON.stringify(result, null, 2));
process.exit(0);
