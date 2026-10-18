// apps/worker/src/workers/agentic-chat/provider/openrouter/incident-redaction.ts
//
// What `llm_call_incidents` may keep of a captured request. BuildOS never stores
// what it reads on the user's behalf (Gmail, Google Calendar events it did not
// create, web pages; docs/privacy/CLAIMS.md P3/P4/G8/G11). A request sent after
// such a read carries the full result in a `tool` message, so before a row is
// written each such message becomes the same content-free trace the tool ledger
// keeps (tool-storage-projection.ts). Signed attachment URLs lose their tokens.
// Runs only for an incident, never on a healthy call.
import { createHash } from 'node:crypto';
import {
	isAgenticChatPassThroughToolNameV1,
	projectAgenticChatToolResultForStorageV1,
	redactionNoticeForAgenticChatToolV1
} from '@buildos/agentic-chat-runtime/tools';

export type StoredIncidentRequestV1 = {
	/** The stored body: the exact bytes, or their projection when anything was replaced. */
	body: string;
	/** Tool calls whose results were replaced by a trace. Non-empty: the reply is not kept either. */
	passThroughToolCallIds: string[];
	signedUrlsStripped: number;
	/** Replayed reasoning removed from assistant messages (it can repeat what was read). */
	reasoningRemoved: number;
	/** The body was not JSON; nothing of it is kept. */
	unparsed: boolean;
};

type Message = Record<string, unknown>;

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

function parsedJson(value: unknown): unknown {
	if (typeof value !== 'string') return value;
	try {
		return JSON.parse(value) as unknown;
	} catch {
		return value;
	}
}

/** `https://…/sign/x.png?token=…` → `https://…/sign/x.png`. */
function withoutQuery(url: string): string {
	const index = url.search(/[?#]/);
	return index < 0 ? url : url.slice(0, index);
}

export function projectIncidentRequestBody(raw: string): StoredIncidentRequestV1 {
	let request: Record<string, unknown>;
	try {
		request = JSON.parse(raw) as Record<string, unknown>;
	} catch {
		return {
			body: '{}',
			passThroughToolCallIds: [],
			signedUrlsStripped: 0,
			reasoningRemoved: 0,
			unparsed: true
		};
	}
	if (!request || typeof request !== 'object' || !Array.isArray(request.messages)) {
		return {
			body: raw,
			passThroughToolCallIds: [],
			signedUrlsStripped: 0,
			reasoningRemoved: 0,
			unparsed: false
		};
	}
	const messages = request.messages as Message[];
	const toolNames = new Map<string, string>();
	for (const message of messages) {
		if (message?.role !== 'assistant' || !Array.isArray(message.tool_calls)) continue;
		for (const call of message.tool_calls as Message[]) {
			const fn = (call?.function ?? {}) as Message;
			if (typeof call?.id === 'string' && typeof fn.name === 'string') {
				toolNames.set(call.id, fn.name);
			}
		}
	}
	const passThroughToolCallIds: string[] = [];
	let signedUrlsStripped = 0;
	const projected = messages.map((message): Message => {
		if (message?.role === 'tool') {
			const id = typeof message.tool_call_id === 'string' ? message.tool_call_id : '';
			const name = toolNames.get(id) ?? null;
			// A result whose call cannot be named is treated as read on the user's behalf.
			if (name !== null && !isAgenticChatPassThroughToolNameV1(name)) return message;
			passThroughToolCallIds.push(id);
			const content = typeof message.content === 'string' ? message.content : '';
			const payload = parsedJson(message.content);
			return {
				...message,
				content: JSON.stringify({
					content_redacted: true,
					tool_name: name,
					notice: redactionNoticeForAgenticChatToolV1(name),
					content_chars: content.length,
					content_sha256: sha256(content),
					// Built from structured fields only: ids, times, counts, statuses.
					trace:
						name === null
							? null
							: (projectAgenticChatToolResultForStorageV1(name, payload) ?? null)
				})
			};
		}
		if (!Array.isArray(message?.content)) return message;
		return {
			...message,
			content: (message.content as Message[]).map((part) => {
				const image = (part?.image_url ?? null) as Message | null;
				if (part?.type !== 'image_url' || typeof image?.url !== 'string') return part;
				const url = withoutQuery(image.url);
				if (url === image.url) return part;
				signedUrlsStripped += 1;
				return { ...part, image_url: { ...image, url } };
			})
		};
	});
	let reasoningRemoved = 0;
	const stored =
		passThroughToolCallIds.length === 0
			? projected
			: projected.map((message) => {
					if (message.role !== 'assistant') return message;
					if (!('reasoning' in message) && !('reasoning_details' in message)) {
						return message;
					}
					reasoningRemoved += 1;
					const { reasoning: _reasoning, reasoning_details: _details, ...rest } = message;
					return rest;
				});
	const changed = passThroughToolCallIds.length > 0 || signedUrlsStripped > 0;
	return {
		body: changed ? JSON.stringify({ ...request, messages: stored }) : raw,
		passThroughToolCallIds,
		signedUrlsStripped,
		reasoningRemoved,
		unparsed: false
	};
}

/**
 * An error body kept beside a projected request: the provider's code, message
 * and provider name only (a moderation error can quote the input it flagged).
 */
export function minimalErrorBody(raw: string): string | null {
	try {
		const parsed = JSON.parse(raw) as Record<string, unknown>;
		const error = (parsed?.error ?? parsed) as Record<string, unknown>;
		const metadata = (error?.metadata ?? {}) as Record<string, unknown>;
		return JSON.stringify({
			error: {
				code: error?.code ?? null,
				message: typeof error?.message === 'string' ? error.message.slice(0, 500) : null,
				provider_name:
					typeof metadata.provider_name === 'string' ? metadata.provider_name : null
			},
			redacted: true
		});
	} catch {
		return null;
	}
}
