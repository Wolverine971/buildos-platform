// docs/technical/reviews/agentic-chat-harness-audit-2026-09-08/evidence/lane-C-measure-prompt-sizes.mjs
import { readFileSync } from 'node:fs';
const src = (p) => readFileSync(p, 'utf8');
function grab(s, startMarker, endMarker) {
	const i = s.indexOf(startMarker);
	if (i < 0) throw new Error('no start ' + startMarker);
	const j = s.indexOf(endMarker, i + startMarker.length);
	if (j < 0) throw new Error('no end ' + endMarker);
	return s.slice(i, j + endMarker.length);
}
const lits = (text) => [...text.matchAll(/(['"])((?:(?!\1)[^\\]|\\.)*)\1/g)].map((m) => m[2]);
const j = (a) => a.join(' ');

const controls = src('apps/worker/src/workers/agentic-chat/provider/review/controls.ts');
const SEMANTIC = lits(
	grab(controls, 'export const SEMANTIC_COMMISSION_GUIDANCE = Object.freeze([', ']);')
);
const ACTOR = lits(
	grab(controls, 'export const ACTOR_COMMISSION_GUIDANCE = Object.freeze([', ']);')
);
console.log('SEMANTIC_COMMISSION_GUIDANCE lines', SEMANTIC.length, 'chars', j(SEMANTIC).length);
console.log('ACTOR_COMMISSION_GUIDANCE lines', ACTOR.length, 'chars', j(ACTOR).length);

const tc = src('apps/worker/src/workers/agentic-chat/provider/review/turn-contract.ts');
const CDG = lits(grab(tc, 'const CONTRACT_DECLARATION_GUIDANCE = [', '\n];'));
console.log('CONTRACT_DECLARATION_GUIDANCE lines', CDG.length, 'chars', j(CDG).length);
const rspBlock = grab(tc, 'const TURN_CONTRACT_REVIEW_SYSTEM_PROMPT = [', "].join(' ');");
const rspLines = lits(rspBlock).filter((s) => s !== ' ');
const reviewerPrompt = [...rspLines, ...SEMANTIC, ...CDG].join(' ');
console.log(
	'TURN_CONTRACT_REVIEW_SYSTEM_PROMPT own lines',
	rspLines.length,
	'total lines',
	rspLines.length + SEMANTIC.length + CDG.length,
	'total chars',
	reviewerPrompt.length,
	'~tokens',
	Math.ceil(reviewerPrompt.length / 4)
);

const disp = src('apps/worker/src/workers/agentic-chat/provider/review/disposition.ts');
const gateBlock = grab(disp, "'Semantic disposition gate:", "].join(' ')");
const gateStrings = lits(gateBlock);
const gateChars = j(gateStrings).length + j(ACTOR).length;
console.log(
	'Semantic disposition gate instruction lines',
	gateStrings.length + ACTOR.length,
	'chars (incl ACTOR)',
	gateChars,
	'~tokens',
	Math.ceil(gateChars / 4)
);

const wsm = grab(
	tc,
	"'Worker write routing: classify a commissioned durable change",
	"].join(' ');"
);
const wsmStrings = lits(wsm).filter((s) => !s.startsWith(' '));
console.log(
	'Worker write routing (full) lines',
	wsmStrings.length,
	'chars',
	j(wsmStrings).length,
	'+ACTOR',
	j(ACTOR).length,
	'= ',
	j(wsmStrings).length + 1 + j(ACTOR).length
);
const wsmLazy = grab(
	tc,
	"'Worker write routing: the large complex-write contract route is deferred",
	"].join(' ');"
);
const wsmLazyStrings = lits(wsmLazy);
console.log(
	'Worker write routing (lazy/opening) lines',
	wsmLazyStrings.length,
	'chars',
	j(wsmLazyStrings).length,
	'+ACTOR',
	j(ACTOR).length,
	'= total',
	j(wsmLazyStrings).length + 1 + j(ACTOR).length,
	'~tokens',
	Math.ceil((j(wsmLazyStrings).length + 1 + j(ACTOR).length) / 4)
);

const rb = src('apps/worker/src/workers/agentic-chat/provider/request-builders.ts');
const teb = rb.match(/TOOL_EXECUTION_BATCHING_INSTRUCTION =\s*'([^']*)'/)[1];
console.log('TOOL_EXECUTION_BATCHING_INSTRUCTION chars', teb.length);

const ctl = src('packages/agentic-chat-runtime/src/catalog/definitions/controls.ts');
function evalDef(name) {
	const block = grab(ctl, `export const ${name}: ChatToolDefinition = {`, '\n};');
	return eval(
		'(' +
			block
				.replace(`export const ${name}: ChatToolDefinition = `, '')
				.replace(/;$/, '')
				.replace(/DECLARE_TURN_CONTRACT_TOOL_NAME/, "'declare_turn_contract'")
				.replace(/CANCEL_TURN_CONTRACT_TOOL_NAME/, "'cancel_turn_contract'")
				.replace(/DECLARE_READ_ONLY_TURN_TOOL_NAME/, "'declare_read_only_turn'")
				.replace(/REQUEST_TURN_CLARIFICATION_TOOL_NAME/, "'request_turn_clarification'") +
			')'
	);
}
const defs = {};
for (const n of [
	'TURN_CONTRACT_TOOL_DEFINITION',
	'CANCEL_TURN_CONTRACT_TOOL_DEFINITION',
	'DECLARE_READ_ONLY_TURN_TOOL_DEFINITION',
	'REQUEST_TURN_CLARIFICATION_TOOL_DEFINITION'
]) {
	const d = evalDef(n);
	defs[n] = d;
	const s = JSON.stringify(d);
	console.log(
		n,
		'JSON chars',
		s.length,
		'~tokens',
		Math.ceil(s.length / 4),
		'properties',
		Object.keys(d.function.parameters.properties).length
	);
}
const tcd = defs.TURN_CONTRACT_TOOL_DEFINITION;
const oc = tcd.function.parameters.properties.outcomes.items;
console.log(
	'declare_turn_contract outcome fields',
	Object.keys(oc.properties).length,
	'required',
	oc.required.length,
	'optional',
	Object.keys(oc.properties).length - oc.required.length,
	'actions',
	oc.properties.action.enum.length,
	'entity_kinds',
	oc.properties.entity_kind.enum.length
);

const REF = grab(controls, 'export const REFERENCE_CANDIDATES_PROPERTY = Object.freeze(', '\n});');
const refObj = eval(
	'(' +
		REF.replace('export const REFERENCE_CANDIDATES_PROPERTY = Object.freeze(', '').replace(
			/\);$/,
			''
		) +
		')'
);
console.log('REFERENCE_CANDIDATES_PROPERTY JSON chars', JSON.stringify(refObj).length);
const approvalDesc = controls
	.match(/'Approve the exact proposed turn contract[^']*'/)[0]
	.slice(1, -1);
const approvalObj = {
	type: 'function',
	function: {
		name: 'approve_turn_contract_review',
		description: approvalDesc,
		parameters: {
			type: 'object',
			additionalProperties: false,
			required: ['reason', 'contract_sha256', 'reference_candidates'],
			properties: {
				reason: {
					type: 'string',
					description:
						'Concise semantic evidence that the exact contract is safe to execute.'
				},
				contract_sha256: {
					type: 'string',
					description:
						'The exact SHA-256 quoted in this request. The harness rejects an approval whose value differs from it.'
				},
				reference_candidates: refObj
			}
		}
	}
};
console.log('TURN_CONTRACT_REVIEW_APPROVAL_TOOL JSON chars', JSON.stringify(approvalObj).length);
const revisionDesc = controls
	.match(/"Return the acting model's contract for an exact machine-readable correction[^"]*"/)[0]
	.slice(1, -1);
const revApprox = JSON.stringify({
	type: 'function',
	function: {
		name: 'request_proposal_revision',
		description: revisionDesc,
		parameters: {
			type: 'object',
			additionalProperties: false,
			required: [
				'reason',
				'required_correction',
				'corrected_contract',
				'reference_candidates'
			],
			properties: {
				reason: {
					type: 'string',
					maxLength: 400,
					description: 'What is wrong with the proposal, citing the turn evidence.'
				},
				required_correction: {
					type: 'string',
					maxLength: 400,
					description:
						'The structural correction needed to match the user commission. For text edits, name the content postcondition and refer to the original user request for exact wording and preservation rules. Do not copy or abbreviate source text into this short field.'
				},
				reference_candidates: refObj,
				corrected_contract: {
					...tcd.function.parameters,
					description:
						'The complete corrected turn contract. It must contain only outcomes already commissioned and values resolved by the turn evidence.'
				}
			}
		}
	}
});
console.log('CONTRACT_PROPOSAL_REVISION_TOOL JSON chars', revApprox.length);
const reviewerTools =
	JSON.stringify(approvalObj).length +
	JSON.stringify(defs.DECLARE_READ_ONLY_TURN_TOOL_DEFINITION).length +
	revApprox.length +
	JSON.stringify(defs.REQUEST_TURN_CLARIFICATION_TOOL_DEFINITION).length;
console.log(
	'Reviewer tools total chars (first review: approval+read_only+revision+clarification)',
	reviewerTools,
	'~tokens',
	Math.ceil(reviewerTools / 4)
);
console.log(
	'Reviewer fixed prefix (system prompt + tools) chars',
	reviewerPrompt.length + reviewerTools,
	'~tokens',
	Math.ceil((reviewerPrompt.length + reviewerTools) / 4)
);

const rp = src('apps/worker/src/workers/agentic-chat/provider/repair-policy.ts');
console.log('repair-policy.ts literal string chars total', lits(rp).join('').length);
const ce = src('apps/worker/src/workers/agentic-chat/provider/review/contract-execution.ts');
const carve = lits(grab(ce, "'Supervisor exception:", "].join(' ')"));
console.log(
	'Carve-out instruction chars (excl contract JSON)',
	j(carve).length,
	'+ batching',
	teb.length
);
