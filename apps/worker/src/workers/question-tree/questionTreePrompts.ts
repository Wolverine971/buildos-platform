// apps/worker/src/workers/question-tree/questionTreePrompts.ts
import type {
	QuestionTreeContextEntry,
	QuestionTreeNode,
	QuestionTreeProposal,
	QuestionTreeRun
} from './questionTreeContracts';

export const QUESTION_TREE_PROMPT_VERSION = 'question-tree-v2';

const JSON_ONLY = `Return one valid JSON object and nothing else. Do not use markdown fences. Escape every string correctly and close every array and object. Keep every field concise so the entire object fits within the response budget. Do not include chain-of-thought, hidden reasoning, citations, URLs, or tool calls.`;

export function buildSeedPrompts(rootQuestion: string): { system: string; user: string } {
	return {
		system: `You decompose a research question into a small number of broad, high-value unknowns. This is model-only analysis: you cannot browse, call tools, or verify current facts. ${JSON_ONLY}`,
		user: `Root question:\n${rootQuestion}\n\nPropose between 2 and 5 broad research questions. Do not pad the list. Each question must frame the problem, resolve a material unknown, or test a plausible way the eventual thesis could be wrong. Prefer questions whose answers would materially change the final answer.\n\nReturn exactly this shape:\n{"questions":[{"question":"...","unknownAddressed":"...","whyItMatters":"...","purpose":"frame|resolve_unknown|falsify","expectedInformationGain":"medium|high"}]}`
	};
}

export function buildNodePrompts(params: {
	run: QuestionTreeRun;
	node: QuestionTreeNode;
	ancestry: QuestionTreeContextEntry[];
}): { system: string; user: string } {
	const context = params.ancestry
		.map(
			(entry) =>
				`Node ${entry.nodeNumber}\nQuestion: ${entry.question}\nAnswer: ${entry.answer ?? '(not answered)'}\nThesis: ${entry.thesis ?? '(none)'}`
		)
		.join('\n\n');

	return {
		system: `You are one narrow research agent in a larger question tree. Answer only from your model knowledge. You have no web access and no tools. Be concise, explicit about uncertainty, and willing to challenge the working thesis. ${JSON_ONLY}`,
		user: `Original question:\n${params.run.root_question}\n\nRelevant ancestor path:\n${context || '(root only)'}\n\nYour assigned question (node ${params.node.node_number}):\n${params.node.question}\n\nFirst answer the assigned question in at most 350 words. Then identify up to four concise claims covering what you are probably right about, probably wrong about, or unsure about. Propose zero to three follow-up questions only when the answer would resolve a material unknown, strengthen a material claim, or credibly disprove/refine the thesis. Do not pad. Prefer a falsifying question when an important assumption has not been tested. Keep the thesis to two sentences and every other string to one sentence. targetClaim and whyItMatters are useful but may be empty strings if genuinely unavailable.\n\nReturn exactly this shape:\n{"answer":"...","thesis":"...","confidence":0.0,"claims":[{"statement":"...","status":"probably_right|probably_wrong|unsure","basis":"..."}],"followUpQuestions":[{"question":"...","purpose":"strengthen|falsify|resolve_unknown","targetClaim":"...","whyItMatters":"...","expectedInformationGain":"low|medium|high","priority":0.0}],"stopReason":"..."}`
	};
}

export function buildSynthesisPrompts(params: {
	run: QuestionTreeRun;
	nodes: QuestionTreeNode[];
	proposals: QuestionTreeProposal[];
}): { system: string; user: string } {
	const completedNodes = params.nodes
		.filter((node) => node.node_kind === 'question')
		.map((node) => ({
			nodeNumber: node.node_number,
			parentNodeId: node.parent_node_id,
			question: node.question,
			answer: node.answer,
			thesis: node.thesis,
			confidence: node.confidence,
			claims: node.epistemic_assessment,
			status: node.status,
			error: node.error_message
		}));
	const unselected = params.proposals
		.filter((proposal) => proposal.status !== 'spawned')
		.slice(0, 80)
		.map((proposal) => ({
			question: proposal.question,
			purpose: proposal.purpose,
			whyItMatters: proposal.why_it_matters,
			status: proposal.status
		}));

	return {
		system: `You synthesize a bounded model-only research tree. Reconcile disagreements, distinguish confidence from fact, and do not pretend that model knowledge is externally verified. ${JSON_ONLY}`,
		user: `Original question:\n${params.run.root_question}\n\nCompleted tree packet:\n${JSON.stringify(completedNodes)}\n\nUnselected or rejected research questions:\n${JSON.stringify(unselected)}\n\nProduce the best final answer supported by the tree. Cite supporting nodes only by node number. Surface likely errors and unresolved uncertainty instead of smoothing them over.\n\nReturn exactly this shape:\n{"finalAnswer":"...","finalThesis":"...","probablyRight":["..."],"probablyWrong":["..."],"stillUnsure":["..."],"keyEvidence":[{"finding":"...","nodeNumbers":[1]}],"importantDisagreements":[{"issue":"...","nodeNumbers":[2,5]}],"recommendedNextResearch":["..."],"limitations":["..."]}`
	};
}
