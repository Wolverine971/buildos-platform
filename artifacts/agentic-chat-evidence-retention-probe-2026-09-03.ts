// artifacts/agentic-chat-evidence-retention-probe-2026-09-03.ts
// Read-only deterministic probe: no database, network, or model calls.
// Run from apps/web: pnpm exec vite-node --config ../worker/vitest.config.ts ../../artifacts/agentic-chat-evidence-retention-probe-2026-09-03.ts
// 2026-09-03 morning: reproduced evidence LOSS (continuation stubbing, f28e8f7bc).
// 2026-09-03 evening: stubbing removed; this probe now asserts RETENTION.
import { buildContinuationRequest } from '../apps/worker/src/workers/agentic-chat/provider/request-builders';
import { buildMemoServedResult } from '../packages/agentic-chat-runtime/src/loop/read-memo';

const documentId = '1d651834-5dee-4e08-9f62-3072c2e61f4d';
const projectId = '9ea4700f-4bda-43c5-9b38-32df75bb9fc0';
// Exact successful Audience result recorded in the browser audit.
const audience = {
	anchor: 'audience',
	content: '## Audience\nLocal homeowners considering a kitchen renovation.',
	document_id: documentId,
	heading: 'Audience',
	level: 2,
	message: 'Section "Audience" loaded.',
	project_id: projectId,
	title: 'QA — Cedar House Marketing Brief'
};
const call = (id: string, name: string, args: object) => ({
	id,
	name,
	kind: 'read' as const,
	arguments: args,
	canonicalArguments: JSON.stringify(args),
	canonicalProviderArguments: JSON.stringify(args)
});
const feedback = (id: string, result: object) => ({
	providerToolCallId: id,
	execution: { result }
});
const initial: any = {
	messages: [{ role: 'user', content: 'Quote the exact saved Audience and Call to action.' }],
	logicalProviderRound: 1,
	tools: [{ function: { name: 'read_document_section' } }]
};
const audienceCall = call('audience-1', 'read_document_section', {
	document_id: documentId,
	anchor: 'audience'
});
const afterAudience = buildContinuationRequest(
	initial,
	[audienceCall as any],
	[feedback('audience-1', audience) as any]
);
const nextCall = call('cta-1', 'read_document_section', {
	document_id: documentId,
	anchor: 'call-to-action'
});
const afterNextRead = buildContinuationRequest(
	afterAudience,
	[nextCall as any],
	[
		feedback('cta-1', {
			...audience,
			anchor: 'call-to-action',
			heading: 'Call to action',
			content: '## Call to action\nBook a 20-minute discovery call.'
		}) as any
	]
);
const cached = buildMemoServedResult(
	{ success: true, tool_call_id: 'audience-1', result: audience } as any,
	'audience-repeat'
);
const repeatedCall = call('audience-repeat', 'read_document_section', {
	document_id: documentId,
	anchor: 'audience'
});
const afterRepeat = buildContinuationRequest(
	afterNextRead,
	[repeatedCall as any],
	[feedback('audience-repeat', cached.result as object) as any]
);
const toolTexts = (request: any) =>
	request.messages.filter((m: any) => m.role === 'tool').map((m: any) => m.content);
const quote = 'Local homeowners considering a kitchen renovation.';
const result = {
	source: 'Current local source after removing continuation stubbing (2026-09-03)',
	after_initial_read: {
		quote_available: toolTexts(afterAudience).some((s: string) => s.includes(quote)),
		result_chars: toolTexts(afterAudience)[0].length
	},
	after_one_more_read: {
		quote_available: toolTexts(afterNextRead).some((s: string) => s.includes(quote)),
		old_result: JSON.parse(toolTexts(afterNextRead)[0])
	},
	after_identical_memo_read: {
		quote_available_anywhere: toolTexts(afterRepeat).some((s: string) => s.includes(quote)),
		repeat_result: JSON.parse(toolTexts(afterRepeat).at(-1))
	}
};
console.log(JSON.stringify(result, null, 2));
if (
	!result.after_initial_read.quote_available ||
	!result.after_one_more_read.quote_available ||
	!result.after_identical_memo_read.quote_available_anywhere
)
	throw new Error(
		'Evidence retention regressed: a prior read result was removed from the request.'
	);
