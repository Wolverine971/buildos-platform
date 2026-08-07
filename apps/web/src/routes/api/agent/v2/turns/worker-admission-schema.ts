// apps/web/src/routes/api/agent/v2/turns/worker-admission-schema.ts
//
// Request-envelope schema for the worker turn admission route, extracted from
// +server.ts to keep the route under the route-size-guard limit.
import { z } from 'zod';
import type { ChatAttachmentRef } from '@buildos/shared-types';
import { normalizeFastContextType } from '$lib/services/agentic-chat-v2/scope';

const canonicalText = (maximum: number) =>
	z
		.string()
		.min(1)
		.max(maximum)
		.refine((value) => value === value.trim(), 'Value must not have surrounding whitespace');
const nullableUuid = z
	.string()
	.uuid()
	.transform((value) => value.toLowerCase())
	.nullable();
const boundedRecord = z
	.record(z.unknown())
	.refine((value) => JSON.stringify(value).length <= 32 * 1024, 'Object is too large');
const projectFocusSchema = z
	.object({
		focusType: z.enum([
			'project-wide',
			'task',
			'goal',
			'plan',
			'document',
			'milestone',
			'risk',
			'requirement'
		]),
		focusEntityId: nullableUuid,
		focusEntityName: z.string().max(1000).nullable(),
		projectId: z
			.string()
			.uuid()
			.transform((value) => value.toLowerCase()),
		projectName: z.string().min(1).max(1000)
	})
	.strict();
const projectAttachmentSchema = z
	.object({
		attachmentKind: z.literal('onto_asset'),
		mediaType: z.literal('image'),
		assetId: z
			.string()
			.uuid()
			.transform((value) => value.toLowerCase()),
		projectId: nullableUuid.optional().default(null),
		displayOrder: z.number().int().min(0).max(100).optional()
	})
	.strict()
	.transform(
		(value): ChatAttachmentRef => ({
			attachment_kind: 'onto_asset',
			media_type: 'image',
			asset_id: value.assetId,
			project_id: value.projectId,
			display_order: value.displayOrder
		})
	);
const temporaryAttachmentSchema = z
	.object({
		attachmentKind: z.literal('temporary_file'),
		mediaType: z.literal('image'),
		temporaryAttachmentId: canonicalText(256),
		storageBucket: canonicalText(128),
		storagePath: canonicalText(2048),
		fileName: z.string().max(1024).nullable().optional().default(null),
		contentType: canonicalText(256),
		fileSizeBytes: z
			.number()
			.int()
			.positive()
			.max(100 * 1024 * 1024),
		width: z.number().int().positive().max(100_000).nullable().optional().default(null),
		height: z.number().int().positive().max(100_000).nullable().optional().default(null),
		checksumSha256: z
			.string()
			.regex(/^[0-9a-f]{64}$/)
			.nullable()
			.optional()
			.default(null),
		expiresAt: z.string().datetime().nullable().optional().default(null),
		displayOrder: z.number().int().min(0).max(100).optional()
	})
	.strict()
	.transform(
		(value): ChatAttachmentRef => ({
			attachment_kind: 'temporary_file',
			media_type: 'image',
			temporary_attachment_id: value.temporaryAttachmentId,
			storage_bucket: value.storageBucket,
			storage_path: value.storagePath,
			file_name: value.fileName,
			content_type: value.contentType,
			file_size_bytes: value.fileSizeBytes,
			width: value.width,
			height: value.height,
			checksum_sha256: value.checksumSha256,
			expires_at: value.expiresAt,
			display_order: value.displayOrder,
			role: 'analysis_target'
		})
	);
export const workerAdmissionRequestSchema = z
	.object({
		leaseToken: canonicalText(8 * 1024),
		clientTurnId: canonicalText(256),
		streamRunId: canonicalText(256),
		sessionId: nullableUuid.optional().default(null),
		context: z
			.object({
				type: z.enum([
					'global',
					'project',
					'calendar',
					'daily_brief',
					'general',
					'project_create',
					'daily_brief_update',
					'ontology'
				]),
				entityId: nullableUuid,
				projectId: nullableUuid
			})
			.strict()
			.transform((context) => ({
				...context,
				type: normalizeFastContextType(context.type)
			})),
		message: z.string().max(100_000),
		attachments: z
			.array(z.union([projectAttachmentSchema, temporaryAttachmentSchema]))
			.max(16)
			.optional()
			.default([]),
		projectFocus: projectFocusSchema.nullable().optional().default(null),
		lastTurnContext: boundedRecord.nullable().optional().default(null),
		voiceNoteGroupId: nullableUuid.optional().default(null),
		preparedPromptKey: canonicalText(2048).nullable().optional().default(null)
	})
	.strict()
	.superRefine((value, context) => {
		if (
			value.context.type === 'project' &&
			(!value.context.entityId ||
				!value.context.projectId ||
				value.context.entityId !== value.context.projectId)
		) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['context'],
				message: 'Project context must identify one exact project'
			});
		}
		if (value.projectFocus && value.projectFocus.projectId !== value.context.projectId) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['projectFocus', 'projectId'],
				message: 'Project focus must match the leased context'
			});
		}
	});
