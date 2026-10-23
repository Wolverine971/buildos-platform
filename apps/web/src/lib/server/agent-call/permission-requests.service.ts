// apps/web/src/lib/server/agent-call/permission-requests.service.ts
import type {
	AgentCallScope,
	AgentCredentialReference,
	AgentPermissionRequest,
	BuildosAgentProjectScopeMode,
	BuildosAgentToolDefinition
} from '@buildos/shared-types';
import {
	normalizePermissionProposal,
	buildPermissionMutation
} from '@buildos/shared-agent-ops/permissions/proposal';
import { z } from 'zod';
import { defaultAllowedOpsForMode } from './agent-call-policy';
import { ensureWorkspaceProjectId } from '$lib/services/ontology/ontology-projects.service';

/**
 * Workspace guidance for connector agents (2026-10-23,
 * docs/specs/WORKSPACE_ARCHITECTURE_2026-10-23.md). The agent's project_id is
 * the decision; nothing classifies the user's words.
 */
const WORKSPACE_USE =
	"The user's Workspace: loose notes, docs and tasks, not a project. When the user wants something saved and no project clearly fits, create it here (create_onto_task / create_onto_document with this project_id) and tell the user it went to their Workspace. Never create a project to hold a single item, or out of Workspace items on your own; turning loose items into a project is the user's call in BuildOS.";
const WORKSPACE_NOT_SHARED =
	"This connection can't write to the user's Workspace (their home for loose notes and tasks). When no project fits, ask the user to share their Workspace with this connection (grant_url) or to name a project. Don't create a project to hold a single item.";

const emptySchema = { type: 'object' as const, properties: {}, additionalProperties: false };
const proposalProperties = {
	kind: { type: 'string' as const, enum: ['document', 'task'] },
	target_id: { type: 'string' as const, format: 'uuid' },
	changes: {
		type: 'object' as const,
		description:
			'Document: title, description, content + update_mode (replace/append), edits or section_edits. Task: title, description, state_key (todo/in_progress/blocked/done), priority (1 Critical, 2 High, 3 Medium, 4 Low, 5 Nice to have). Unknown fields are rejected.'
	}
};
export const PERMISSION_CONTROL_TOOLS: BuildosAgentToolDefinition[] = [
	{
		name: 'get_buildos_permissions',
		description:
			"Get current connection permission status and request capabilities, and the user's Workspace (workspace.project_id): where a note, doc, or task goes when no project fits.",
		inputSchema: emptySchema
	},
	{
		name: 'request_buildos_permission',
		description:
			'Ask the owner to review one exact document or task edit. Creates a BuildOS notification; does not edit data. Never approve your own request through a browser. Use a stable idempotency_key.',
		inputSchema: {
			type: 'object',
			properties: {
				proposal: {
					type: 'object',
					properties: proposalProperties,
					required: ['kind', 'target_id', 'changes'],
					additionalProperties: false
				},
				idempotency_key: { type: 'string' },
				reason: { type: 'string', maxLength: 2000 }
			},
			required: ['proposal', 'idempotency_key'],
			additionalProperties: false
		}
	},
	{
		name: 'get_buildos_permission_request',
		description:
			'Check a request made by this connection. Applied returns a durable receipt. Poll sparingly; a later user message may be needed to resume.',
		inputSchema: {
			type: 'object',
			properties: { request_id: { type: 'string', format: 'uuid' } },
			required: ['request_id'],
			additionalProperties: false
		}
	},
	{
		name: 'authorize_buildos_writes',
		description:
			'Check whether approved ongoing edits require OAuth reconnection. Does not grant permission or edit data.',
		inputSchema: emptySchema
	}
];
export function scopedPermissionTools(
	grants: Array<{ capability: string }>
): BuildosAgentToolDefinition[] {
	return [...new Set(grants.map((g) => g.capability))].map((cap) => {
		const kind = cap === 'document.edit.v1' ? 'document' : 'task';
		const common = {
			title: { type: 'string', minLength: 1, maxLength: 500 },
			description: { type: ['string', 'null'], maxLength: 10000 }
		};
		const properties: Record<string, unknown> = {
			...common,
			[`${kind}_id`]: { type: 'string', format: 'uuid' },
			idempotency_key: { type: 'string', minLength: 1, maxLength: 200 }
		};
		if (kind === 'document')
			Object.assign(properties, {
				content: { type: 'string' },
				update_mode: { type: 'string', enum: ['replace', 'append'] },
				edits: {
					type: 'array',
					minItems: 1,
					maxItems: 50,
					items: {
						type: 'object',
						additionalProperties: false,
						properties: {
							old_text: { type: 'string', minLength: 1 },
							new_text: { type: 'string' },
							replace_all: { type: 'boolean' }
						},
						required: ['old_text', 'new_text']
					}
				},
				section_edits: {
					type: 'array',
					minItems: 1,
					maxItems: 50,
					items: {
						type: 'object',
						additionalProperties: false,
						properties: {
							action: {
								type: 'string',
								enum: ['replace', 'delete', 'append', 'prepend', 'move']
							},
							section: { type: 'string' },
							content: { type: 'string' },
							after_section: { type: 'string' },
							before_section: { type: 'string' }
						},
						required: ['action', 'section']
					}
				}
			});
		else
			Object.assign(properties, {
				state_key: { type: 'string', enum: ['todo', 'in_progress', 'blocked', 'done'] },
				priority: {
					type: ['integer', 'null'],
					minimum: 1,
					maximum: 5,
					description: '1 Critical, 2 High, 3 Medium, 4 Low, 5 Nice to have'
				}
			});
		return {
			name: `update_onto_${kind}`,
			description: `Apply a bounded ${kind} edit in a project with an active ${cap} grant. No calendar, messages, publishing, archive, deletion, moves or model calls. A stable idempotency_key is required.`,
			inputSchema: {
				type: 'object',
				properties,
				required: [`${kind}_id`, 'idempotency_key'],
				additionalProperties: false
			}
		} as BuildosAgentToolDefinition;
	});
}
export class PermissionRequestError extends Error {
	constructor(
		message: string,
		public code = 'PERMISSION_DENIED',
		/**
		 * No scoped grant could cover this edit (the feature is off, the target is outside
		 * the connection, or it's someone else's project). A direct update then falls back
		 * to the gateway, whose refusal says what is in the way and who can clear it.
		 */
		public noScopedGrant = false
	) {
		super(message);
	}
}
export type PermissionRequestCaller = {
	/** The connection's person; resolves their Workspace for get_buildos_permissions. */
	userId?: string;
	projectScopeMode?: BuildosAgentProjectScopeMode;
};
export class PermissionRequestService {
	constructor(
		private admin: any,
		private ref: AgentCredentialReference,
		private scope: AgentCallScope,
		private origin = '',
		private caller: PermissionRequestCaller = {}
	) {}
	private async rpc(name: string, args: Record<string, unknown>): Promise<any> {
		const { data, error } = await this.admin.rpc(name, args);
		if (error)
			throw new PermissionRequestError(
				error.message,
				error.message.includes('insufficient_scope')
					? 'INSUFFICIENT_SCOPE'
					: 'PERMISSION_DENIED'
			);
		return data;
	}
	private boundary(query: any) {
		return this.ref.kind === 'oauth'
			? query.eq('grant_id', this.ref.grant_id)
			: query.is('grant_id', null);
	}
	private async feature() {
		const { data, error } = await this.admin
			.from('agent_permission_feature')
			.select('enabled,epoch')
			.eq('id', true)
			.maybeSingle();
		if (error || !data?.enabled)
			throw new PermissionRequestError(
				'Permission requests are not enabled for this BuildOS deployment.',
				'FEATURE_DISABLED',
				true
			);
		return data as { enabled: boolean; epoch: number };
	}
	async grants() {
		const feature = await this.feature();
		const { data, error } = await this.boundary(
			this.admin
				.from('agent_permission_grants')
				.select('id,project_id,capability,epoch')
				.eq('caller_id', this.ref.caller_id)
				.eq('epoch', feature.epoch)
				.is('revoked_at', null)
		);
		if (error) throw new PermissionRequestError('Could not load permissions');
		return (data ?? []).filter((r: any) => this.scope.project_ids?.includes(r.project_id));
	}
	private async summary(row: AgentPermissionRequest) {
		const { data: feature } = await this.admin
			.from('agent_permission_feature')
			.select('enabled,epoch')
			.eq('id', true)
			.maybeSingle();
		const status =
			row.status === 'pending'
				? !feature?.enabled || row.epoch !== feature.epoch
					? 'canceled'
					: Date.parse(row.expires_at) <= Date.now()
						? 'expired'
						: 'pending'
				: row.status;
		return {
			request_id: row.id,
			status,
			receipt: this.scope.project_ids?.includes(row.project_id) ? row.receipt : null,
			expires_at: row.expires_at,
			review_url: `${this.origin}/profile/agent-keys/${this.ref.caller_id}/requests/${row.id}`,
			...(row.decision === 'always' && this.ref.kind === 'oauth'
				? {
						next_step:
							'Future scoped writes require a buildos.write credential. Call authorize_buildos_writes; reconnect if requested.'
					}
				: {})
		};
	}
	/**
	 * The approver of a request is the connection's own person, so in a project someone
	 * else owns an approval (and "always allow") would let that person's agent edit the
	 * owner's items past the owner's agent setting and the guest-agent lane. Until
	 * requests route to the project owner, they only work in the person's own projects.
	 */
	private async assertOwnProject(projectId: string) {
		const refusal = new PermissionRequestError(
			'Edit requests work only in projects your person owns. In a project someone else shared, your person can make the change in BuildOS.',
			'PERMISSION_DENIED',
			true
		);
		const { data: caller } = await this.admin
			.from('external_agent_callers')
			.select('user_id')
			.eq('id', this.ref.caller_id)
			.maybeSingle();
		if (typeof caller?.user_id !== 'string') throw refusal;
		const [{ data: actor }, { data: project }] = await Promise.all([
			this.admin
				.from('onto_actors')
				.select('id')
				.eq('user_id', caller.user_id)
				.eq('kind', 'human')
				.maybeSingle(),
			this.admin.from('onto_projects').select('created_by').eq('id', projectId).maybeSingle()
		]);
		if (typeof actor?.id !== 'string' || project?.created_by !== actor.id) throw refusal;
	}
	async replay(input: unknown, key: unknown) {
		// Legacy updates accept a broader schema. Parse the bounded proposal only
		// after finding a key owned by this exact connection boundary.
		if (typeof key !== 'string') return null;
		const { data: reservation, error } = await this.admin
			.from('agent_permission_keys')
			.select('request_id')
			.eq('caller_id', this.ref.caller_id)
			.eq('boundary', this.ref.kind === 'oauth' ? this.ref.grant_id : 'key')
			.eq('key', key.trim())
			.maybeSingle();
		if (error) throw new PermissionRequestError('Could not check the prior write');
		if (!reservation) return null;
		const stableKey = z.string().trim().min(1).max(200).parse(key);
		const proposal = normalizePermissionProposal(input);
		const previous = await this.rpc('lookup_agent_permission_request', {
			p_ref: this.ref,
			p_key: stableKey,
			p_submission: proposal
		});
		return previous ? this.summary(previous) : null;
	}
	async prepare(input: unknown, key: string) {
		const proposal = normalizePermissionProposal(input);
		const previous = await this.rpc('lookup_agent_permission_request', {
			p_ref: this.ref,
			p_key: key,
			p_submission: proposal
		});
		if (previous) return { previous, proposal };
		await this.feature();
		const { data: target, error } = await this.admin
			.from(proposal.kind === 'document' ? 'onto_documents' : 'onto_tasks')
			.select('id,project_id')
			.eq('id', proposal.target_id)
			.maybeSingle();
		if (error || !target || !this.scope.project_ids?.includes(target.project_id))
			throw new PermissionRequestError(
				'Target is outside connector access',
				'PERMISSION_DENIED',
				true
			);
		await this.assertOwnProject(target.project_id);
		const before = await this.rpc('agent_edit_snapshot', {
			p_kind: `${proposal.kind}.edit.v1`,
			p_id: proposal.target_id
		});
		const mutation = buildPermissionMutation(proposal, before);
		return { proposal, before, mutation };
	}
	async submit(input: unknown) {
		const args = z
			.object({
				proposal: z.unknown(),
				idempotency_key: z.string().trim().min(1).max(200),
				reason: z.string().max(2000).optional()
			})
			.strict()
			.parse(input);
		const built = await this.prepare(args.proposal, args.idempotency_key);
		if (built.previous) return this.summary(built.previous);
		if (
			this.scope.mode === 'read_write' &&
			this.scope.write_project_ids?.includes(built.before.project_id) &&
			(this.scope.allowed_ops ?? defaultAllowedOpsForMode(this.scope.mode)).includes(
				`onto.${built.proposal.kind}.update`
			)
		)
			return {
				status: 'already_allowed',
				next_step:
					'Existing base access already permits this edit. Use the direct update tool.'
			};
		const row = await this.rpc('create_agent_permission_request', {
			p_ref: this.ref,
			p_key: args.idempotency_key,
			p_submission: built.proposal,
			p_before: built.before,
			p_mutation: built.mutation,
			p_reason: args.reason ?? null,
			p_direct: false
		});
		return this.summary(row);
	}
	async apply(input: unknown, key: unknown) {
		const stableKey = z.string().trim().min(1).max(200).parse(key);
		const built = await this.prepare(input, stableKey);
		if (built.previous) return this.summary(built.previous);
		const row = await this.rpc('apply_scoped_agent_edit', {
			p_ref: this.ref,
			p_key: stableKey,
			p_submission: built.proposal,
			p_before: built.before,
			p_mutation: built.mutation
		});
		try {
			await this.admin.rpc('maintain_agent_permission_work', {
				p_request: row.id,
				p_batch_size: 1
			});
		} catch {
			/* Durable internal work is retried by retention maintenance. */
		}
		return this.summary(row);
	}
	async status(id: unknown) {
		const requestId = z.string().uuid().parse(id);
		await this.rpc('agent_permission_credential', { p_ref: this.ref, p_write: false });
		const { data, error } = await this.boundary(
			this.admin
				.from('agent_permission_requests')
				.select('*')
				.eq('id', requestId)
				.eq('caller_id', this.ref.caller_id)
		).maybeSingle();
		if (error || !data) throw new PermissionRequestError('Request not found');
		const { data: feature } = await this.admin
			.from('agent_permission_feature')
			.select('enabled,epoch')
			.eq('id', true)
			.maybeSingle();
		if (data.status === 'pending' && (!feature?.enabled || data.epoch !== feature.epoch))
			data.status = 'canceled';
		else if (data.status === 'pending' && Date.parse(data.expires_at) <= Date.now())
			data.status = 'expired';
		const summary = await this.summary(data);
		if (!this.scope.project_ids?.includes(data.project_id)) summary.receipt = null;
		return summary;
	}
	async control(name: string, args: Record<string, unknown>) {
		if (name === 'request_buildos_permission') return this.submit(args);
		if (name === 'get_buildos_permission_request') {
			z.object({ request_id: z.string().uuid() }).strict().parse(args);
			return this.status(args.request_id);
		}
		z.object({}).strict().parse(args);
		if (name === 'get_buildos_permissions') return this.permissionStatus();
		const grants = await this.grants();
		if (name === 'authorize_buildos_writes' && grants.length && this.ref.kind === 'oauth') {
			await this.rpc('agent_permission_credential', { p_ref: this.ref, p_write: true });
		}
		return {
			legacy_scope: this.scope,
			scoped_grants: grants,
			capabilities: ['document.edit.v1', 'task.edit.v1'],
			next_step: grants.length
				? 'Use the scoped update tools with a stable idempotency_key.'
				: 'Submit a specific edit with request_buildos_permission.',
			identity_boundary: 'Ongoing access is shared by chats using this connection.'
		};
	}
	/**
	 * Permission status plus the Workspace. Answers even when edit requests are
	 * switched off, so a connector can always learn where loose items go.
	 */
	private async permissionStatus() {
		const [grants, workspace] = await Promise.all([
			this.grants().catch((error: unknown) => {
				if (error instanceof PermissionRequestError && error.code === 'FEATURE_DISABLED')
					return null;
				throw error;
			}),
			this.workspace()
		]);
		return {
			legacy_scope: this.scope,
			scoped_grants: grants ?? [],
			capabilities: grants ? ['document.edit.v1', 'task.edit.v1'] : [],
			next_step: !grants
				? 'Edit requests are not enabled for this BuildOS deployment.'
				: grants.length
					? 'Use the scoped update tools with a stable idempotency_key.'
					: 'Submit a specific edit with request_buildos_permission.',
			identity_boundary: 'Ongoing access is shared by chats using this connection.',
			...(workspace ? { workspace } : {})
		};
	}
	/**
	 * The person's own Workspace (created on first use), and whether this
	 * connection may write to it. An all-projects connection reaches it like any
	 * unrestricted project; a selected-projects connection only after the person
	 * shares it, since sharing it also exposes every loose note to the agent.
	 */
	private async workspace(): Promise<Record<string, unknown> | null> {
		const userId = this.caller.userId;
		if (!userId) return null;
		let id: string;
		try {
			id = await ensureWorkspaceProjectId(this.admin, userId);
		} catch {
			return null;
		}
		const covers = (ids: string[] | undefined) => !Array.isArray(ids) || ids.includes(id);
		let writable =
			this.scope.mode === 'read_write' &&
			covers(this.scope.project_ids) &&
			covers(this.scope.write_project_ids);
		if (
			!writable &&
			this.scope.mode === 'read_write' &&
			this.caller.projectScopeMode === 'all_unrestricted' &&
			!covers(this.scope.project_ids)
		) {
			// Created by this call, after this call's scope was resolved: the next
			// call's all-projects scope includes it unless the owner restricted it.
			const { data } = await this.admin
				.from('onto_projects')
				.select('external_agent_access')
				.eq('id', id)
				.maybeSingle();
			writable = data?.external_agent_access === 'standard';
		}
		if (writable) return { project_id: id, name: 'Workspace', use: WORKSPACE_USE };
		if (this.scope.mode !== 'read_write') return null;
		return {
			project_id: null,
			note: WORKSPACE_NOT_SHARED,
			...(this.origin
				? {
						grant_url: `${this.origin}/profile/agent-keys/${encodeURIComponent(this.ref.caller_id)}/grant?project=${encodeURIComponent(id)}`
					}
				: {})
		};
	}
}
