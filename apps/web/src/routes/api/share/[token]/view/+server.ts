import type { RequestHandler } from './$types';
import { recordChatShareView } from '$lib/server/chat-share-view';
export const POST: RequestHandler = (event) => recordChatShareView(event);
