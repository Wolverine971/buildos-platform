// packages/agentic-chat-runtime/src/loop/model-routing-types.ts
//
// Pure routing-variant vocabulary shared by the loop's pass measurements.
// Web's model-tiering module re-exports these; its runtime tiering logic
// (model lists, env-driven config) stays host-side.

export type FastChatModelTieringVariant = 'control' | 'fast_initial_plan';

export type FastChatForcedSynthesisRoutingVariant = 'control' | 'dedicated';

export type FastChatLlmPassRole =
	| 'initial_plan'
	| 'tool_followup'
	| 'forced_synthesis'
	| 'write_intent'
	| 'synthesis';
