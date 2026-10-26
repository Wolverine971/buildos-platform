// apps/web/src/lib/email-campaigns/client.ts
// Browser wrapper for /api/admin/email-campaigns. Every call returns the
// ApiResponse `data` payload or throws an Error carrying the server's own
// sentence, so screens can show it as-is.

import type {
	CampaignAudience,
	CampaignDetail,
	CampaignRecipientView,
	CampaignRow,
	CampaignSummary,
	PersonSearchResult,
	SegmentCount
} from './types';

const BASE = '/api/admin/email-campaigns';

export interface CampaignPatch {
	name?: string;
	subject_template?: string;
	body_template?: string;
	from_name?: string;
	tailoring_instructions?: string | null;
	wave_size?: number;
	wave_interval_minutes?: number;
	starts_at?: string | null;
}

export interface RecipientPatch {
	subject_override?: string | null;
	body_override?: string | null;
	included?: boolean;
	reset?: boolean;
}

export interface QueuePlan {
	starts_at: string | null;
	wave_size: number;
	wave_interval_minutes: number;
}

interface ApiPayload<T> {
	success?: boolean;
	data?: T;
	error?: string;
	message?: string;
}

async function request<T>(
	url: string,
	init: RequestInit & { json?: unknown } = {},
	fallback = 'Something went wrong'
): Promise<T> {
	const { json, headers, ...rest } = init;
	const response = await fetch(url, {
		...rest,
		headers: json === undefined ? headers : { 'Content-Type': 'application/json', ...headers },
		body: json === undefined ? rest.body : JSON.stringify(json)
	});

	let payload: ApiPayload<T> | null = null;
	try {
		payload = (await response.json()) as ApiPayload<T>;
	} catch {
		payload = null;
	}

	if (!response.ok || !payload || payload.success === false) {
		throw new Error(payload?.error || payload?.message || `${fallback} (${response.status})`);
	}

	return payload.data as T;
}

export const campaignApi = {
	async list(signal?: AbortSignal): Promise<CampaignSummary[]> {
		const data = await request<{ campaigns: CampaignSummary[] }>(
			BASE,
			{ signal },
			'Could not load campaigns'
		);
		return data?.campaigns ?? [];
	},

	async create(name?: string): Promise<CampaignRow> {
		const data = await request<{ campaign: CampaignRow }>(
			BASE,
			{ method: 'POST', json: name ? { name } : {} },
			'Could not create the campaign'
		);
		return data.campaign;
	},

	async segments(signal?: AbortSignal): Promise<SegmentCount[]> {
		const data = await request<{ segments: SegmentCount[] }>(
			`${BASE}/segments`,
			{ signal },
			'Could not load audiences'
		);
		return data?.segments ?? [];
	},

	async searchPeople(search: string, signal?: AbortSignal): Promise<PersonSearchResult[]> {
		const params = new URLSearchParams({ search });
		const data = await request<{ people: PersonSearchResult[] }>(
			`${BASE}/people?${params}`,
			{ signal },
			'Search failed'
		);
		return data?.people ?? [];
	},

	get(id: string, signal?: AbortSignal): Promise<CampaignDetail> {
		return request<CampaignDetail>(`${BASE}/${id}`, { signal }, 'Could not load the campaign');
	},

	async update(id: string, patch: CampaignPatch): Promise<CampaignRow> {
		const data = await request<{ campaign: CampaignRow }>(
			`${BASE}/${id}`,
			{ method: 'PATCH', json: patch },
			'Could not save'
		);
		return data.campaign;
	},

	async remove(id: string): Promise<void> {
		await request<{ deleted: boolean }>(
			`${BASE}/${id}`,
			{ method: 'DELETE' },
			'Could not delete the campaign'
		);
	},

	setAudience(id: string, audience: CampaignAudience): Promise<CampaignDetail> {
		return request<CampaignDetail>(
			`${BASE}/${id}/audience`,
			{ method: 'PUT', json: { audience } },
			'Could not update the list'
		);
	},

	async updateRecipient(
		id: string,
		recipientId: string,
		patch: RecipientPatch
	): Promise<CampaignRecipientView> {
		const data = await request<{ recipient: CampaignRecipientView }>(
			`${BASE}/${id}/recipients/${recipientId}`,
			{ method: 'PATCH', json: patch },
			'Could not save this person'
		);
		return data.recipient;
	},

	async retryRecipient(id: string, recipientId: string): Promise<CampaignRecipientView> {
		const data = await request<{ recipient: CampaignRecipientView }>(
			`${BASE}/${id}/recipients/${recipientId}/retry`,
			{ method: 'POST' },
			'Could not retry'
		);
		return data.recipient;
	},

	async tailor(
		id: string,
		recipientIds: string[],
		instructions?: string | null
	): Promise<CampaignRecipientView[]> {
		const data = await request<{ recipients: CampaignRecipientView[] }>(
			`${BASE}/${id}/tailor`,
			{
				method: 'POST',
				json: instructions?.trim()
					? { recipient_ids: recipientIds, instructions: instructions.trim() }
					: { recipient_ids: recipientIds }
			},
			'Tailoring failed'
		);
		return data?.recipients ?? [];
	},

	async sendTest(
		id: string,
		options: { recipient_id?: string; to?: string } = {}
	): Promise<{ sent_to: string; logged_only?: boolean }> {
		return request<{ sent_to: string; logged_only?: boolean }>(
			`${BASE}/${id}/test`,
			{ method: 'POST', json: options },
			'Could not send the test'
		);
	},

	queue(id: string, plan: QueuePlan): Promise<CampaignDetail> {
		return request<CampaignDetail>(
			`${BASE}/${id}/queue`,
			{ method: 'POST', json: plan },
			'Could not queue the campaign'
		);
	},

	pause(id: string): Promise<CampaignDetail> {
		return request<CampaignDetail>(
			`${BASE}/${id}/pause`,
			{ method: 'POST' },
			'Could not pause'
		);
	},

	resume(id: string): Promise<CampaignDetail> {
		return request<CampaignDetail>(
			`${BASE}/${id}/resume`,
			{ method: 'POST' },
			'Could not resume'
		);
	},

	cancel(id: string): Promise<CampaignDetail> {
		return request<CampaignDetail>(
			`${BASE}/${id}/cancel`,
			{ method: 'POST' },
			'Could not cancel'
		);
	},

	async followUp(id: string): Promise<CampaignRow> {
		const data = await request<{ campaign: CampaignRow }>(
			`${BASE}/${id}/follow-up`,
			{ method: 'POST' },
			'Could not create the follow-up'
		);
		return data.campaign;
	}
};

export function isAbortError(error: unknown): boolean {
	return error instanceof DOMException
		? error.name === 'AbortError'
		: error instanceof Error && error.name === 'AbortError';
}

export function errorMessage(error: unknown, fallback = 'Something went wrong'): string {
	return error instanceof Error && error.message ? error.message : fallback;
}
