// apps/web/src/lib/services/agentic-chat-v2/turn-intent.ts
export {
	FASTCHAT_PENDING_TURN_INTENT_METADATA_KEY,
	buildFastChatPendingTurnIntent,
	buildPendingTurnIntentSystemMessage,
	getAutonomousWriteToolNamesForTurnIntent,
	getWriteToolNamesForTurnIntent,
	readFastChatPendingTurnIntent,
	resolveFastChatTurnIntent,
	shouldBypassDomainSensingForTurnIntent,
	type FastChatMutationAction,
	type FastChatMutationEntityKind,
	type FastChatMutationOperation,
	type FastChatPendingTurnIntent,
	type FastChatTurnIntent,
	type FastChatTurnIntentSource
} from '@buildos/agentic-chat-runtime/loop';
