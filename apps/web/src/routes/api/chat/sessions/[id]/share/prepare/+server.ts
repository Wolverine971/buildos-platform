// apps/web/src/routes/api/chat/sessions/[id]/share/prepare/+server.ts
import type { RequestHandler } from './$types';
import { handleChatShare } from '$lib/server/chat-share.service';
// The safety review runs bounded parallel model calls, stopped at
// CHAT_SHARE_REVIEW_DEADLINE_MS (40 s); the 10 s default would cut long chats off.
export const config = { maxDuration: 60 };
export const POST: RequestHandler = (event) => handleChatShare(event, 'prepare');
