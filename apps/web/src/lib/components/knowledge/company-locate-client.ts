// apps/web/src/lib/components/knowledge/company-locate-client.ts
// Browser-side calls for "find where my companies are" (tasker 170): the free company lookup
// that runs after a contacts import, its "Which one?" questions, and the optional web search
// for what it could not place.

import type {
	CompanyOption,
	CompanyQuestionChoice,
	KnowledgeCompanyQuestion,
	KnowledgeLocateTray
} from '@buildos/shared-agent-ops/knowledge';
import { requireApiData } from '$lib/utils/api-client-helpers';

export type { CompanyOption, CompanyQuestionChoice, KnowledgeCompanyQuestion, KnowledgeLocateTray };

async function call<T>(input: string, init?: RequestInit): Promise<T> {
	return requireApiData<T>(await fetch(input, init));
}

const json = (body: unknown): RequestInit => ({
	method: 'POST',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify(body)
});

export interface LocateStarted {
	run_id: string | null;
	queued: number;
	reason: 'nothing_to_locate' | 'already_running' | null;
}

export interface LocateSearchStarted {
	queued: number;
	remaining: number;
	budget_usd?: number;
	refused: string | null;
}

export interface CompanyAnswered {
	status: 'answered' | 'none_of_these' | 'skipped';
	facts_added: number;
}

export const companyLocateApi = {
	tray() {
		return call<{ locate: KnowledgeLocateTray | null }>(`/api/knowledge/locate`);
	},
	/** Look up the listed organizations (what an import touched), or all without a place. */
	start(body: { entity_ids?: string[]; origin: 'import' | 'manual' }) {
		return call<LocateStarted>(`/api/knowledge/locate`, json(body));
	},
	stop(runId: string) {
		return call<{ stopped: boolean }>(
			`/api/knowledge/locate?run_id=${encodeURIComponent(runId)}`,
			{ method: 'DELETE' }
		);
	},
	questions(entityId?: string) {
		return call<{ questions: KnowledgeCompanyQuestion[] }>(
			`/api/knowledge/locate/questions${entityId ? `?entity_id=${encodeURIComponent(entityId)}` : ''}`
		);
	},
	answer(questionId: string, choice: CompanyQuestionChoice) {
		return call<CompanyAnswered>(`/api/knowledge/locate/questions/${questionId}`, json(choice));
	},
	/** Paid, and only where it is turned on: web research for companies still without a place. */
	searchRest() {
		return call<LocateSearchStarted>(`/api/knowledge/locate/search`, json({}));
	}
};

/** "Washington, DC · summitllc.com" */
export function optionLine(option: Pick<CompanyOption, 'place' | 'domain'>): string {
	return [option.place?.name, option.domain].filter(Boolean).join(' · ');
}

/** "Federal program evaluation" or "Management Consulting · 51-200 people". */
export function optionAbout(
	option: Pick<CompanyOption, 'description' | 'industry' | 'size'>
): string | null {
	if (option.description) return option.description;
	const parts = [option.industry, option.size ? `${option.size} people` : null].filter(Boolean);
	return parts.length ? parts.join(' · ') : null;
}

/** "Jane Doe works here · Senior Analyst", "Jane Doe and 2 others work here". */
export function peopleLine(people: KnowledgeCompanyQuestion['people']): string | null {
	const first = people[0];
	if (!first) return null;
	if (people.length === 1)
		return `${first.name} works here${first.title ? ` · ${first.title}` : ''}`;
	const others = people.length - 1;
	return `${first.name} and ${others} other${others === 1 ? '' : 's'} work here`;
}
