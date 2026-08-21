// packages/agentic-chat-runtime/src/loop/model-routing-types.ts
//
// Pure routing vocabulary shared by the loop's pass measurements.
// Model lists and env-driven routing configuration stay host-side.

export type FastChatForcedSynthesisRoutingVariant = 'control' | 'dedicated';

export type FastChatLlmPassRole =
	| 'initial_plan'
	| 'tool_followup'
	| 'forced_synthesis'
	| 'write_intent'
	| 'synthesis';
