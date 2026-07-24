// packages/agent-orchestrator/src/contracts/transition-action.ts
import { z } from 'zod';

export const TransitionActionSchema = z.enum([
	'continue_existing_graph',
	'append_stage',
	'request_user_input',
	'complete',
	'complete_partial',
	'capability_gap',
	'fail'
]);

export type TransitionAction = z.infer<typeof TransitionActionSchema>;
