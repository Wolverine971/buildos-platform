// apps/web/src/routes/api/chat/sessions/[id]/share/+server.ts
import type { RequestHandler } from './$types';
import { handleChatShare } from '$lib/server/chat-share.service';
// Publishing can re-run the safety review when the chat changed (bounded parallel model calls,
// stopped at CHAT_SHARE_REVIEW_DEADLINE_MS); the 10 s default would cut it off.
export const config = { maxDuration: 60 };
export const GET: RequestHandler = (event) => handleChatShare(event, 'get');
export const POST: RequestHandler = (event) => handleChatShare(event, 'publish');
export const DELETE: RequestHandler = (event) => handleChatShare(event, 'revoke');
