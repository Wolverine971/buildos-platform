import type { RequestHandler } from './$types';
import { handleChatShare } from '$lib/server/chat-share.service';
export const GET: RequestHandler = (event) => handleChatShare(event, 'get');
export const POST: RequestHandler = (event) => handleChatShare(event, 'publish');
export const DELETE: RequestHandler = (event) => handleChatShare(event, 'revoke');
