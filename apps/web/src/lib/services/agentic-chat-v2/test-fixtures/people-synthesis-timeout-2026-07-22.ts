// apps/web/src/lib/services/agentic-chat-v2/test-fixtures/people-synthesis-timeout-2026-07-22.ts
import type { ChatToolResult } from '@buildos/shared-types';

/**
 * Redacted reconstruction of the 2026-07-22 people-identification incident.
 *
 * The failed turn did not durably retain its full read-result payloads, so this
 * cannot be a byte-for-byte replay. It preserves the observed request, pass
 * shape, candidate names, read-only evidence shape, and terminal timeout that
 * matter for orchestration regression coverage. Synthetic identifiers replace
 * user/session/project data.
 */
export const PEOPLE_SYNTHESIS_TIMEOUT_INCIDENT = {
	id: 'people-synthesis-timeout-2026-07-22',
	projectId: '00000000-0000-4000-8000-000000000072',
	message:
		'Who are the relevant people in this project? What people am I talking about and mentioning here? Tell me the rules.',
	observed: {
		readToolCallsAcrossAffectedTurn: 11,
		forcedSynthesisPromptTokens: 5211,
		streamAttempts: 2,
		attemptTimeoutMs: 60_000,
		assistantRepliesPersisted: 0
	},
	searches: [
		{
			query: 'Brian Hicks',
			result: {
				query: 'Brian Hicks',
				search_scope: 'project',
				total_returned: 1,
				maybe_more: false,
				results: [
					{
						id: '10000000-0000-4000-8000-000000000001',
						type: 'person_mention',
						title: 'Brian Hicks',
						status: 'candidate',
						source_title: 'Genesis Air outreach notes',
						excerpt: 'Brian Hicks is mentioned in connection with Genesis Air.'
					}
				]
			}
		},
		{
			query: 'Anton Gorshkov',
			result: {
				query: 'Anton Gorshkov',
				search_scope: 'project',
				total_returned: 1,
				maybe_more: false,
				results: [
					{
						id: '10000000-0000-4000-8000-000000000002',
						type: 'person_mention',
						title: 'Anton Gorshkov',
						status: 'candidate',
						source_title: 'Follow up on Govini opportunity',
						excerpt: 'Anton Gorshkov is named in the Govini follow-up context.'
					}
				]
			}
		},
		{
			query: 'Adam Eklund Ryan Curri',
			result: {
				query: 'Adam Eklund Ryan Curri',
				search_scope: 'project',
				total_returned: 3,
				maybe_more: true,
				results: [
					{
						id: '10000000-0000-4000-8000-000000000003',
						type: 'person_mention',
						title: 'Adam Eklund',
						status: 'candidate',
						source_title: 'Job-search contact notes',
						excerpt: 'Adam Eklund is a named person in the notes.'
					},
					{
						id: '10000000-0000-4000-8000-000000000004',
						type: 'person_mention',
						title: 'Ryan',
						status: 'ambiguous',
						source_title: 'Networking follow-ups',
						excerpt:
							'Ryan is mentioned without enough context to verify a surname or role.'
					},
					{
						id: '10000000-0000-4000-8000-000000000005',
						type: 'person_mention',
						title: 'Curri',
						status: 'ambiguous',
						source_title: 'Networking follow-ups',
						excerpt: 'Curri appears as an ambiguous person-like mention.'
					}
				]
			}
		}
	],
	expectedCurrentTerminal: {
		outcome: 'timed_out',
		forcedNoToolSynthesis: true,
		terminalEventReceived: false,
		assistantTextCharsReceived: 0,
		visibleAnswerProduced: false
	},
	expectedRecoveryTerminal: {
		outcome: 'completed_degraded',
		answerSource: 'deterministic_evidence',
		mustQualifyAmbiguousNames: ['Ryan', 'Curri']
	}
} as const;

export function buildPeopleIncidentSearchResult(index: number, toolCallId: string): ChatToolResult {
	const search = PEOPLE_SYNTHESIS_TIMEOUT_INCIDENT.searches[index];
	if (!search) {
		return {
			tool_call_id: toolCallId,
			success: false,
			result: {},
			error: `No reconstructed incident evidence at index ${index}`
		};
	}
	return {
		tool_call_id: toolCallId,
		success: true,
		result: {
			...search.result,
			project_id: PEOPLE_SYNTHESIS_TIMEOUT_INCIDENT.projectId
		}
	};
}
