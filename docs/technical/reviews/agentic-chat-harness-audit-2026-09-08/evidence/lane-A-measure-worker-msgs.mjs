// docs/technical/reviews/agentic-chat-harness-audit-2026-09-08/evidence/lane-A-measure-worker-msgs.mjs
import { read, sliceBlock, sliceString, evalArr, est } from './lane-A-extract.mjs';
const controls = read('apps/worker/src/workers/agentic-chat/provider/review/controls.ts');
const SEMANTIC = evalArr(
	sliceBlock(controls, 'export const SEMANTIC_COMMISSION_GUIDANCE = Object.freeze(')
);
const ACTOR = evalArr(
	sliceBlock(controls, 'export const ACTOR_COMMISSION_GUIDANCE = Object.freeze(')
);
const tc = read('apps/worker/src/workers/agentic-chat/provider/review/turn-contract.ts');
const CDG = evalArr(sliceBlock(tc, 'const CONTRACT_DECLARATION_GUIDANCE = '));
const REVIEW_SYS = evalArr(sliceBlock(tc, 'const TURN_CONTRACT_REVIEW_SYSTEM_PROMPT = '), {
	SEMANTIC_COMMISSION_GUIDANCE: SEMANTIC,
	CONTRACT_DECLARATION_GUIDANCE: CDG
}).join(' ');
// worker semantic mutation ordering: two variants
const orderingFn = tc.slice(tc.indexOf('export function buildWorkerSemanticMutationOrdering'));
const deferredBlock = sliceBlock(orderingFn, 'return [');
const deferred = evalArr(deferredBlock, { ACTOR_COMMISSION_GUIDANCE: ACTOR }).join(' ');
const afterDeferred = orderingFn.slice(orderingFn.indexOf(deferredBlock) + deferredBlock.length);
const fullBlock = sliceBlock(afterDeferred, 'return [');
const full = evalArr(fullBlock, {
	ACTOR_COMMISSION_GUIDANCE: ACTOR,
	projectCreateShellGuidance: () => [],
	contextType: 'project',
	tools: []
}).join(' ');
const rb = read('apps/worker/src/workers/agentic-chat/provider/request-builders.ts');
const BATCH = sliceString(rb, 'export const TOOL_EXECUTION_BATCHING_INSTRUCTION =');
const disp = read('apps/worker/src/workers/agentic-chat/provider/review/disposition.ts');
const gateFn = disp.slice(disp.indexOf('export function buildSemanticTurnDispositionGateRequest'));
const gateBlock = sliceBlock(gateFn, 'appendSystemInstruction(\n\t\t\trequest,\n\t\t\t[');
const gate = evalArr(gateBlock, { ACTOR_COMMISSION_GUIDANCE: ACTOR, allowReads: true }).join(' ');
const sr = read('apps/web/src/lib/services/agentic-chat-lite/prompt/situational-rules.ts');
const CLAR = sliceString(sr, 'export const CLARIFICATION_RULE_LINE =');
const EXACT = sliceString(sr, 'const EXACT_ID_RULE_LINE =');
const TASKSTATE = sliceString(sr, 'const TASK_STATE_RULE_LINE =');
const WWRITE = evalArr(sliceBlock(sr, 'export const WORKER_WRITE_TURN_RULE_LINES = '), {
	EXACT_ID_RULE_LINE: EXACT,
	CLARIFICATION_RULE_LINE: CLAR,
	TASK_STATE_RULE_LINE: TASKSTATE
});
const WWEB = evalArr(sliceBlock(sr, 'const WORKER_WEB_RESEARCH_RULE_LINES = '));
const WEBWEB = evalArr(sliceBlock(sr, 'export const WEB_RESEARCH_RULE_LINES = '));
const REVDEL = evalArr(sliceBlock(sr, 'export const REVIEW_DELEGATION_RULE_LINES = '));
const LIVING = evalArr(sliceBlock(sr, 'export const LIVING_WORKSPACE_RULE_LINES = '));
const tpc = read('packages/agentic-chat-runtime/src/loop/tool-payload-compaction.ts');
const NOTICE = sliceString(tpc, 'const TOOL_RESULT_SECURITY_NOTICE =');
const noticeWrapper = JSON.stringify({
	model_context_notice: NOTICE,
	model_context_source: 'tool_result_untrusted',
	tool_name: 'list_onto_tasks'
});
const ri = read('packages/agentic-chat-runtime/src/loop/repair-instructions.ts');
const valFn = ri.slice(ri.indexOf('export function buildToolValidationRepairInstruction'));
const valBase = evalArr(sliceBlock(valFn, 'const lines = [')).join(' ');
const rows = [
	['Reviewer system prompt (TURN_CONTRACT_REVIEW_SYSTEM_PROMPT)', REVIEW_SYS],
	['  of which SEMANTIC_COMMISSION_GUIDANCE (14 rules)', SEMANTIC.join(' ')],
	['  of which CONTRACT_DECLARATION_GUIDANCE (2)', CDG.join(' ')],
	['ACTOR_COMMISSION_GUIDANCE (5 rules)', ACTOR.join(' ')],
	['Worker write routing msg: opening pass (contract deferred)', deferred],
	['Worker write routing msg: contract mounted (full)', full],
	['Semantic disposition gate instruction (allowReads)', gate],
	['TOOL_EXECUTION_BATCHING_INSTRUCTION', BATCH],
	[
		'Situational: worker write rules (4 lines)',
		'This turn can write to project data:\n' + WWRITE.join('\n')
	],
	[
		'Situational: worker web research rules (5 lines)',
		'This turn involves web research:\n' + WWEB.join('\n')
	],
	[
		'Situational: review delegation rules (3 lines)',
		'Review-staged Agent Runs are available:\n' + REVDEL.join('\n')
	],
	['Situational: living workspace rules (4 lines)', LIVING.join('\n')],
	['Situational: web-lane WEB_RESEARCH_RULE_LINES (dead on worker)', WEBWEB.join('\n')],
	['Tool-result security wrapper per result (canonical JSON)', noticeWrapper],
	['Validation repair base lines (8)', valBase]
];
for (const [name, s] of rows)
	console.log(String(s.length).padStart(6), String(est(s)).padStart(5) + 't', name);
export {
	SEMANTIC,
	ACTOR,
	REVIEW_SYS,
	deferred,
	full,
	gate,
	WWRITE,
	WWEB,
	REVDEL,
	CLAR,
	EXACT,
	TASKSTATE
};
