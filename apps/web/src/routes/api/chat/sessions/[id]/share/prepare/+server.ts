import type { RequestHandler } from './$types';
import { handleChatShare } from '$lib/server/chat-share.service';
export const POST: RequestHandler = (event) => handleChatShare(event, 'prepare');
