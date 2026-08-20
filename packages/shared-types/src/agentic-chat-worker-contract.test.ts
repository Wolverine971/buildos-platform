// packages/shared-types/src/agentic-chat-worker-contract.test.ts
import { describe, expect, it } from 'vitest';
import {
	AGENTIC_CHAT_CANCEL_OBSERVATION_INTERVAL_MS,
	AGENTIC_CHAT_CANCEL_OBSERVATION_MAX_PAIRS,
	AGENTIC_CHAT_CLIENT_BUFFER_MAX_BYTES,
	AGENTIC_CHAT_CLIENT_BUFFER_MAX_EVENTS,
	AGENTIC_CHAT_CLIENT_MAX_TRACKED_TURNS,
	AGENTIC_CHAT_INPUT_ARTIFACT_VERSION,
	AGENTIC_CHAT_INPUT_ARTIFACT_VERSION_V2,
	buildAgenticChatCheckpointResumeSystemMessageV1,
	AGENTIC_CHAT_INPUT_HISTORY_MAX_BYTES,
	AGENTIC_CHAT_LIVE_VISION_MAX_IMAGES,
	AGENTIC_CHAT_RECONCILE_MAX_DURABLE_EVENTS,
	AGENTIC_CHAT_REALTIME_RECONCILE_EVENT,
	AGENTIC_CHAT_REALTIME_STREAM_EVENT,
	AGENTIC_CHAT_RECOVERY_FAILURE_CLASSES_V1,
	AGENTIC_CHAT_REQUEST_HASH_VERSION,
	AGENTIC_CHAT_SIGNAL_VERSION,
	AGENTIC_CHAT_STREAM_SPILL_THRESHOLD_BYTES,
	AGENTIC_CHAT_STREAM_TEXT_MAX_BYTES,
	AGENTIC_CHAT_TEXT_BATCH_FLUSH_MAX_BYTES,
	AGENTIC_CHAT_TEXT_BATCH_FLUSH_MAX_ITEMS,
	AGENTIC_CHAT_TEXT_BATCH_MAX_BYTES,
	AGENTIC_CHAT_TERMINAL_RETENTION_MS,
	canPublishAgenticChatStreamWriteV1,
	assessAgenticChatLiveVisionEligibilityV1,
	canonicalizeAdmissionRequestV1,
	canonicalizeAgenticChatJson,
	classifyAgenticChatRetryV1,
	createAgentStreamEventIdV1,
	decideAgenticChatRecoveryV1,
	decideTerminalFinalizationV1,
	deriveAgenticChatExpectedWriteToolNamesV1,
	didAcknowledgeAgenticChatStreamDeliveryV1,
	freezeTurnInputHistoryV1,
	hashCanonicalAdmissionRequestV1,
	hashTurnInputArtifactContentV1,
	normalizeTurnInputArtifactContentV1,
	parseAgentStreamEventIdV1,
	shouldUseAgenticChatLiveVisionV1,
	validateTurnInputArtifactV1,
	type CanonicalAdmissionRequestV1,
	type AgenticChatCancellationObservationRpcResultV1,
	type AgenticChatCancelRpcResultV1,
	type AgenticChatReconcileRpcResultV1,
	type AgenticChatRealtimeBroadcastV1,
	type AgenticChatSemanticEventRpcResultV1,
	type AgenticChatStreamDeliveryAckRpcResultV1,
	type AgenticChatTerminalFinalizeRpcResultV1,
	type AgenticChatTextBatchFlushRpcResultV1,
	type AgenticChatTextBatchRpcResultV1,
	type NormalizedChatAttachmentV1,
	type TurnInputArtifactV1
} from './agentic-chat-worker-contract';

const ATTACHMENT_A: NormalizedChatAttachmentV1 = {
	attachment_kind: 'onto_asset',
	media_type: 'image',
	asset_id: '10000000-0000-4000-8000-000000000001',
	temporary_attachment_id: null,
	project_id: '20000000-0000-4000-8000-000000000001',
	role: 'attachment',
	display_order: 2,
	file_name: 'diagram.png',
	content_type: 'image/png',
	file_size_bytes: 2048,
	width: 1200,
	height: 800,
	checksum_sha256: 'a'.repeat(64),
	ocr_status: 'completed',
	extraction_summary: null,
	extracted_text_preview: 'Release plan'
};

const ATTACHMENT_B: NormalizedChatAttachmentV1 = {
	...ATTACHMENT_A,
	asset_id: '10000000-0000-4000-8000-000000000002',
	display_order: 1,
	file_name: 'timeline.png',
	checksum_sha256: 'b'.repeat(64)
};

function admissionFixture(overrides: Partial<CanonicalAdmissionRequestV1> = {}) {
	return {
		version: AGENTIC_CHAT_REQUEST_HASH_VERSION,
		clientTurnId: '40000000-0000-4000-8000-000000000001',
		streamRunId: '50000000-0000-4000-8000-000000000001',
		context: {
			type: 'project',
			entityId: '20000000-0000-4000-8000-000000000001',
			projectId: '20000000-0000-4000-8000-000000000001'
		},
		message: '  Re\u0301sume\r\nthis plan.  ',
		attachments: [ATTACHMENT_A, ATTACHMENT_B],
		voiceNoteGroupId: null,
		preparedPromptLineage: {
			id: '60000000-0000-4000-8000-000000000001',
			acceptedSurfaceProfile: 'project_default'
		},
		...overrides
	} satisfies CanonicalAdmissionRequestV1;
}

function artifactFixture(): TurnInputArtifactV1 {
	return {
		artifactVersion: AGENTIC_CHAT_INPUT_ARTIFACT_VERSION,
		historySource: 'admission_window',
		history: [
			{
				sourceMessageId: '70000000-0000-4000-8000-000000000001',
				role: 'user',
				content: 'Keep the exact historical text.',
				attachments: [],
				toolCalls: [],
				toolCallId: null
			},
			{
				sourceMessageId: '70000000-0000-4000-8000-000000000002',
				role: 'assistant',
				content: 'Acknowledged.',
				attachments: [ATTACHMENT_B],
				toolCalls: [{ function: { name: 'onto_project_read' }, id: 'call-1' }],
				toolCallId: null
			}
		],
		prepared: {
			sourcePreparedPromptId: '60000000-0000-4000-8000-000000000001',
			contextPayload: { project: { id: ATTACHMENT_A.project_id, title: 'Launch' } },
			conversationSummary: 'The user is preparing a launch.',
			surfaceProfile: 'project_default',
			systemPrompt: 'You are the BuildOS project agent.',
			promptSections: [{ id: 'context', enabled: true }],
			toolSurface: { names: ['onto_project_read'] },
			sessionSnapshot: {
				summary: 'The user is preparing a launch.',
				agent_metadata: { trusted: true }
			},
			contextUsageSnapshot: {
				estimatedTokens: 120,
				tokenBudget: 15_000,
				usagePercent: 1,
				tokensRemaining: 14_880,
				status: 'ok',
				lastCompressedAt: null,
				lastCompression: null
			}
		},
		createdAt: '2026-07-29T20:00:00.000Z',
		retainUntil: '2026-08-05T20:00:00.000Z',
		contentHash: 'not-part-of-the-content-hash'
	};
}

describe('agentic chat worker v1 contract fixtures', () => {
	it('pins the stream, signal, and terminal-retention operating values', () => {
		expect(AGENTIC_CHAT_STREAM_TEXT_MAX_BYTES).toBe(2 * 1024 * 1024);
		expect(AGENTIC_CHAT_STREAM_SPILL_THRESHOLD_BYTES).toBe(512 * 1024);
		expect(AGENTIC_CHAT_TERMINAL_RETENTION_MS).toBe(7 * 24 * 60 * 60 * 1000);
		expect(AGENTIC_CHAT_SIGNAL_VERSION).toBe('agentic_chat_signal_v1');
		expect(AGENTIC_CHAT_CANCEL_OBSERVATION_INTERVAL_MS).toBe(500);
		expect(AGENTIC_CHAT_CANCEL_OBSERVATION_MAX_PAIRS).toBe(128);
	});

	it('canonicalizes JSON recursively while preserving array order and explicit null', () => {
		expect(
			canonicalizeAgenticChatJson({
				z: null,
				omit: undefined,
				nested: { b: 2, a: 1 },
				array: [{ y: true, x: false }, 'second']
			})
		).toBe('{"array":[{"x":false,"y":true},"second"],"nested":{"a":1,"b":2},"z":null}');
		expect(() => canonicalizeAgenticChatJson([undefined] as never)).toThrow(/Undefined/);
		expect(() => canonicalizeAgenticChatJson({ value: Number.NaN })).toThrow(/Non-finite/);
	});

	it('pins shared live-vision intent and immutable source eligibility', () => {
		expect(
			shouldUseAgenticChatLiveVisionV1({
				message: 'Inspect this diagram.',
				attachmentCount: 1,
				liveVisionEnabled: true
			})
		).toBe(true);
		expect(
			shouldUseAgenticChatLiveVisionV1({
				message: 'Store this as context for later.',
				attachmentCount: 1,
				liveVisionEnabled: true
			})
		).toBe(false);

		const source = {
			...ATTACHMENT_A,
			display_order: 0,
			storage_bucket: 'onto-assets',
			storage_path: 'projects/project/diagram.png',
			expires_at: null
		};
		expect(assessAgenticChatLiveVisionEligibilityV1(source, { maxBytes: 4096 })).toEqual({
			eligible: true
		});
		expect(
			assessAgenticChatLiveVisionEligibilityV1(
				{ ...source, checksum_sha256: null },
				{ maxBytes: 4096 }
			)
		).toEqual({ eligible: false, reason: 'missing_checksum' });
		const expiredTemporarySource = {
			...source,
			attachment_kind: 'temporary_file' as const,
			asset_id: null,
			temporary_attachment_id: 'temp-1',
			expires_at: '2026-08-12T00:00:00.000Z'
		};
		expect(
			assessAgenticChatLiveVisionEligibilityV1(expiredTemporarySource, {
				maxBytes: 4096,
				nowMs: Date.parse('2026-08-12T00:00:01.000Z')
			})
		).toEqual({ eligible: false, reason: 'expired_temporary_attachment' });
	});

	it('pins the normalized semantic admission request SHA-256 fixture', async () => {
		const equivalent = admissionFixture({
			message: 'R\u00e9sume\nthis plan.',
			attachments: [ATTACHMENT_B, ATTACHMENT_A],
			context: {
				type: 'project',
				projectId: '20000000-0000-4000-8000-000000000001',
				entityId: '20000000-0000-4000-8000-000000000001'
			}
		});

		const hash = await hashCanonicalAdmissionRequestV1(admissionFixture());
		expect(await hashCanonicalAdmissionRequestV1(equivalent)).toBe(hash);
		expect(
			await hashCanonicalAdmissionRequestV1({
				...admissionFixture(),
				transportDecisionId: 'excluded-decision',
				executionMode: 'worker_realtime',
				correlationId: 'excluded-correlation'
			} as CanonicalAdmissionRequestV1)
		).toBe(hash);
		expect(hash).toBe('7c29017bba32b451f7529519ab0191bf67947ade1ea0e27258d3fd9bfa71e72b');
		expect(
			await hashCanonicalAdmissionRequestV1(
				admissionFixture({ message: 'Resume another plan.' })
			)
		).not.toBe(hash);
	});

	it('excludes client-recomputed state from the v2 admission hash (F1)', async () => {
		const hash = await hashCanonicalAdmissionRequestV1(admissionFixture());
		const withClientRecomputedState = {
			...admissionFixture(),
			sessionId: '30000000-0000-4000-8000-000000000001',
			lastTurnContext: { selected: ['timeline', 'risks'], timestamp: '2026-07-29T20:00:00Z' },
			context: {
				...admissionFixture().context,
				projectFocus: { title: 'Launch', state: { lane: 2, active: true } }
			}
		} as unknown as CanonicalAdmissionRequestV1;

		expect(await hashCanonicalAdmissionRequestV1(withClientRecomputedState)).toBe(hash);
	});

	it('pins the canonicalizer field sets so a type change cannot silently escape the hash (F13/S2)', () => {
		const admission = canonicalizeAdmissionRequestV1(admissionFixture());

		// Compare against the FIXTURE's own key sets, so adding a field to the type
		// (and therefore to the fixture) fails here unless the canonicalizer copies it.
		expect(Object.keys(admission).sort()).toEqual(Object.keys(admissionFixture()).sort());
		expect(Object.keys(admission.context).sort()).toEqual(
			Object.keys(admissionFixture().context).sort()
		);
		expect(Object.keys(admission.preparedPromptLineage).sort()).toEqual(
			Object.keys(admissionFixture().preparedPromptLineage).sort()
		);
		expect(Object.keys(admission.attachments[0]!).sort()).toEqual(
			Object.keys(ATTACHMENT_A).sort()
		);

		const artifactSource = artifactFixture();
		const normalized = normalizeTurnInputArtifactContentV1(artifactSource);
		expect(Object.keys(normalized.prepared).sort()).toEqual(
			Object.keys(artifactSource.prepared).sort()
		);
		expect(Object.keys(normalized.history[0]!).sort()).toEqual(
			Object.keys(artifactSource.history[0]!).sort()
		);

		// Absolute pins, so a field silently dropped from BOTH type and canonicalizer still fails.
		expect(Object.keys(admission).sort()).toEqual([
			'attachments',
			'clientTurnId',
			'context',
			'message',
			'preparedPromptLineage',
			'streamRunId',
			'version',
			'voiceNoteGroupId'
		]);
		expect(Object.keys(admission.context).sort()).toEqual(['entityId', 'projectId', 'type']);
		expect(Object.keys(admission.preparedPromptLineage).sort()).toEqual([
			'acceptedSurfaceProfile',
			'id'
		]);
		expect(Object.keys(admission.attachments[0]!).sort()).toEqual([
			'asset_id',
			'attachment_kind',
			'checksum_sha256',
			'content_type',
			'display_order',
			'extracted_text_preview',
			'extraction_summary',
			'file_name',
			'file_size_bytes',
			'height',
			'media_type',
			'ocr_status',
			'project_id',
			'role',
			'temporary_attachment_id',
			'width'
		]);

		const artifact = normalizeTurnInputArtifactContentV1(artifactFixture());
		expect(Object.keys(artifact).sort()).toEqual([
			'artifactVersion',
			'history',
			'historySource',
			'prepared'
		]);
		expect(Object.keys(artifact.prepared).sort()).toEqual([
			'contextPayload',
			'contextUsageSnapshot',
			'conversationSummary',
			'promptSections',
			'sessionSnapshot',
			'sourcePreparedPromptId',
			'surfaceProfile',
			'systemPrompt',
			'toolSurface'
		]);
		expect(Object.keys(artifact.history[0]!).sort()).toEqual([
			'attachments',
			'content',
			'role',
			'sourceMessageId',
			'toolCallId',
			'toolCalls'
		]);
	});

	it('hashes immutable execution inputs without retention metadata', async () => {
		const artifact = artifactFixture();
		const hash = await hashTurnInputArtifactContentV1(artifact);
		const sameContentDifferentRetention = {
			...artifact,
			createdAt: '2030-01-01T00:00:00.000Z',
			retainUntil: '2030-01-08T00:00:00.000Z',
			contentHash: 'different-stored-value'
		};

		expect(await hashTurnInputArtifactContentV1(sameContentDifferentRetention)).toBe(hash);
		expect(hash).toBe('2a5e1353cc90e102286b3be6da68570f4c2034e40af12cb221a29f23c68ad9ae');

		const legacyArtifact = artifactFixture();
		if (legacyArtifact.artifactVersion !== AGENTIC_CHAT_INPUT_ARTIFACT_VERSION) {
			throw new Error('Expected the current artifact fixture');
		}
		const {
			sessionSnapshot: _sessionSnapshot,
			contextUsageSnapshot: _usage,
			...legacyPrepared
		} = legacyArtifact.prepared;
		const legacyV2 = {
			...legacyArtifact,
			artifactVersion: AGENTIC_CHAT_INPUT_ARTIFACT_VERSION_V2,
			prepared: legacyPrepared
		} satisfies TurnInputArtifactV1;
		expect(await hashTurnInputArtifactContentV1(legacyV2)).toBe(
			'8c7fcdbdb7e4135ab27e6ce869e90221fbfe456d27f1dfecaf5b0ff705dfd69e'
		);

		const changedHistory = artifactFixture();
		changedHistory.history[0]!.content = 'Source history changed after admission.';
		expect(await hashTurnInputArtifactContentV1(changedHistory)).not.toBe(hash);
	});

	it('validates the retained artifact hash, byte bounds, lineage, and retention', async () => {
		const artifact = artifactFixture();
		artifact.contentHash = await hashTurnInputArtifactContentV1(artifact);

		const valid = await validateTurnInputArtifactV1(artifact, {
			excludedMessageId: '70000000-0000-4000-8000-000000000099'
		});
		expect(valid).toMatchObject({
			ok: true,
			contentHash: artifact.contentHash
		});
		if (valid.ok) {
			expect(valid.contentBytes).toBeGreaterThan(valid.historyBytes);
			expect(valid.historyBytes).toBeLessThan(AGENTIC_CHAT_INPUT_HISTORY_MAX_BYTES);
		}

		expect(
			await validateTurnInputArtifactV1({ ...artifact, contentHash: '0'.repeat(64) })
		).toMatchObject({ ok: false, code: 'hash_mismatch' });
		if (artifact.artifactVersion !== AGENTIC_CHAT_INPUT_ARTIFACT_VERSION) {
			throw new Error('fixture must use the current input artifact version');
		}
		const scopedSessionOverride = {
			...artifact,
			prepared: {
				...artifact.prepared,
				sessionSnapshot: {
					...artifact.prepared.sessionSnapshot,
					id: 'ffffffff-ffff-4fff-8fff-ffffffffffff'
				}
			}
		} as unknown as TurnInputArtifactV1;
		expect(await validateTurnInputArtifactV1(scopedSessionOverride)).toMatchObject({
			ok: false,
			code: 'invalid_lifecycle_snapshot'
		});
		expect(
			await validateTurnInputArtifactV1({
				...artifact,
				retainUntil: '2026-08-05T19:59:59.999Z'
			})
		).toMatchObject({ ok: false, code: 'invalid_retention' });

		const preparedHistory = {
			...artifact,
			historySource: 'prepared_prompt' as const
		};
		preparedHistory.contentHash = await hashTurnInputArtifactContentV1(preparedHistory);
		expect(await validateTurnInputArtifactV1(preparedHistory)).toMatchObject({
			ok: false,
			code: 'prepared_history_has_source_ids'
		});

		const withAdmittedMessage = artifactFixture();
		withAdmittedMessage.history.push({
			sourceMessageId: '70000000-0000-4000-8000-000000000099',
			role: 'user',
			content: 'Current request',
			attachments: [],
			toolCalls: [],
			toolCallId: null
		});
		withAdmittedMessage.contentHash = await hashTurnInputArtifactContentV1(withAdmittedMessage);
		expect(
			await validateTurnInputArtifactV1(withAdmittedMessage, {
				excludedMessageId: '70000000-0000-4000-8000-000000000099'
			})
		).toMatchObject({ ok: false, code: 'admitted_message_in_history' });

		const oversizeHistory = artifactFixture();
		oversizeHistory.history[0]!.content = 'x'.repeat(AGENTIC_CHAT_INPUT_HISTORY_MAX_BYTES);
		oversizeHistory.contentHash = await hashTurnInputArtifactContentV1(oversizeHistory);
		expect(await validateTurnInputArtifactV1(oversizeHistory)).toMatchObject({
			ok: false,
			code: 'history_too_large'
		});
	});

	it('freezes a canonical supervisor resume snapshot into the artifact hash', async () => {
		const resumeContext = {
			missing_field: 'task_id',
			instruction: 'Continue after the user identifies the task.'
		};
		const resumeMessage = buildAgenticChatCheckpointResumeSystemMessageV1({
			question: 'Which exact task should I use?',
			resumeContext
		});
		expect(resumeMessage).toContain(
			'Checkpoint resume context: {"instruction":"Continue after the user identifies the task.","missing_field":"task_id"}'
		);

		const artifact = artifactFixture();
		if (artifact.artifactVersion !== AGENTIC_CHAT_INPUT_ARTIFACT_VERSION) {
			throw new Error('fixture must use the current input artifact version');
		}
		artifact.prepared.resumeCheckpoint = {
			checkpointId: '81000000-0000-4000-8000-000000000001',
			originalTurnRunId: '82000000-0000-4000-8000-000000000002',
			checkpointType: 'supervisor_question',
			reason: 'repeated_validation_failures',
			question: 'Which exact task should I use?',
			resumeContext,
			resumeMessage,
			sourceExecutionGeneration: 1,
			supervisorTransitionId: '83000000-0000-5000-8000-000000000003',
			supervisorSequence: 2
		};
		artifact.contentHash = await hashTurnInputArtifactContentV1(artifact);
		await expect(validateTurnInputArtifactV1(artifact)).resolves.toMatchObject({ ok: true });

		const sourceDrift = structuredClone(artifact);
		if (sourceDrift.artifactVersion !== AGENTIC_CHAT_INPUT_ARTIFACT_VERSION) {
			throw new Error('fixture must use the current input artifact version');
		}
		sourceDrift.prepared.resumeCheckpoint!.resumeContext.missing_field = 'goal_id';
		await expect(validateTurnInputArtifactV1(sourceDrift)).resolves.toMatchObject({
			ok: false,
			code: 'invalid_resume_checkpoint'
		});

		const mixedIdentity = structuredClone(artifact);
		if (mixedIdentity.artifactVersion !== AGENTIC_CHAT_INPUT_ARTIFACT_VERSION) {
			throw new Error('fixture must use the current input artifact version');
		}
		mixedIdentity.prepared.resumeCheckpoint!.supervisorSequence = null;
		await expect(validateTurnInputArtifactV1(mixedIdentity)).resolves.toMatchObject({
			ok: false,
			code: 'invalid_resume_checkpoint'
		});
	});

	it('freezes and validates structured terminal turn intent while retaining rolling artifacts', async () => {
		const rollingArtifact = artifactFixture();
		rollingArtifact.contentHash = await hashTurnInputArtifactContentV1(rollingArtifact);
		await expect(validateTurnInputArtifactV1(rollingArtifact)).resolves.toMatchObject({
			ok: true
		});

		const artifact = artifactFixture();
		const structuredIntent = {
			version: 1 as const,
			requiresWrite: true,
			action: 'update' as const,
			entityKind: 'task' as const,
			operations: [
				{ action: 'update' as const, entityKind: 'task' as const },
				{ action: 'create' as const, entityKind: 'document' as const }
			],
			source: 'current_message' as const,
			originalRequestText: 'Mark the task done and create a document.',
			originatingTurnRunId: null,
			clearPending: false
		};
		artifact.prepared.turnIntent = {
			...structuredIntent,
			expectedWriteToolNames: deriveAgenticChatExpectedWriteToolNamesV1(structuredIntent)
		};
		expect(artifact.prepared.turnIntent.expectedWriteToolNames).toEqual([
			'update_onto_task',
			'create_onto_document'
		]);
		artifact.contentHash = await hashTurnInputArtifactContentV1(artifact);
		await expect(validateTurnInputArtifactV1(artifact)).resolves.toMatchObject({ ok: true });
		expect(artifact.contentHash).not.toBe(rollingArtifact.contentHash);

		const driftedExpectedTools = structuredClone(artifact);
		driftedExpectedTools.prepared.turnIntent!.expectedWriteToolNames = ['create_onto_document'];
		driftedExpectedTools.contentHash =
			await hashTurnInputArtifactContentV1(driftedExpectedTools);
		await expect(validateTurnInputArtifactV1(driftedExpectedTools)).resolves.toMatchObject({
			ok: false,
			code: 'invalid_turn_intent'
		});

		const malformedRead = artifactFixture();
		malformedRead.prepared.turnIntent = {
			...structuredIntent,
			requiresWrite: false,
			expectedWriteToolNames: []
		};
		malformedRead.contentHash = await hashTurnInputArtifactContentV1(malformedRead);
		await expect(validateTurnInputArtifactV1(malformedRead)).resolves.toMatchObject({
			ok: false,
			code: 'invalid_turn_intent'
		});
	});

	it('freezes a bounded domain projection base and immutable catalog fallback maps', async () => {
		const rollingArtifact = artifactFixture();
		rollingArtifact.contentHash = await hashTurnInputArtifactContentV1(rollingArtifact);
		await expect(validateTurnInputArtifactV1(rollingArtifact)).resolves.toMatchObject({
			ok: true
		});

		const artifact = artifactFixture();
		artifact.prepared.domainMetadata = {
			version: 1,
			sensingApplied: true,
			state: {
				version: 1,
				updated_at: '2026-08-13T12:00:00.000Z',
				active_domains: [],
				active_outcome_cards: [],
				coverage_gaps: [],
				research_backlog: [],
				used_domains: [],
				unknown_domain_interests: [],
				workflow_gap_candidates: [],
				recent_observations: []
			},
			skillDomainIds: {
				content_strategy_beyond_blogging: ['creator_growth', 'marketing.youtube_growth']
			},
			outcomeCardDomainIds: {
				youtube_growth_strategy_plan: ['creator_growth', 'marketing.youtube_growth']
			}
		};
		artifact.contentHash = await hashTurnInputArtifactContentV1(artifact);
		await expect(validateTurnInputArtifactV1(artifact)).resolves.toMatchObject({ ok: true });
		expect(artifact.contentHash).not.toBe(rollingArtifact.contentHash);

		const unsortedDomains = structuredClone(artifact);
		unsortedDomains.prepared.domainMetadata!.skillDomainIds = {
			content_strategy_beyond_blogging: ['marketing.youtube_growth', 'creator_growth']
		};
		unsortedDomains.contentHash = await hashTurnInputArtifactContentV1(unsortedDomains);
		await expect(validateTurnInputArtifactV1(unsortedDomains)).resolves.toMatchObject({
			ok: false,
			code: 'invalid_domain_metadata'
		});

		const malformedState = structuredClone(artifact);
		delete malformedState.prepared.domainMetadata!.state.used_domains;
		malformedState.contentHash = await hashTurnInputArtifactContentV1(malformedState);
		await expect(validateTurnInputArtifactV1(malformedState)).resolves.toMatchObject({
			ok: false,
			code: 'invalid_domain_metadata'
		});
	});

	it('hashes and validates immutable history strategy/count evidence while retaining old artifacts', async () => {
		const rollingArtifact = artifactFixture();
		rollingArtifact.contentHash = await hashTurnInputArtifactContentV1(rollingArtifact);
		expect(await validateTurnInputArtifactV1(rollingArtifact)).toMatchObject({ ok: true });

		const artifact = artifactFixture();
		artifact.prepared.historyState = {
			strategy: 'raw_history',
			compressed: false,
			rawHistoryCount: 2,
			historyForModelCount: 2
		};
		artifact.contentHash = await hashTurnInputArtifactContentV1(artifact);
		expect(await validateTurnInputArtifactV1(artifact)).toMatchObject({ ok: true });
		expect(artifact.contentHash).not.toBe(rollingArtifact.contentHash);

		const inconsistent = {
			...artifact,
			prepared: {
				...artifact.prepared,
				historyState: {
					...artifact.prepared.historyState,
					historyForModelCount: 1
				}
			}
		} as TurnInputArtifactV1;
		inconsistent.contentHash = await hashTurnInputArtifactContentV1(inconsistent);
		expect(await validateTurnInputArtifactV1(inconsistent)).toMatchObject({
			ok: false,
			code: 'invalid_history_state'
		});
	});

	it('validates bounded immutable current-turn attachment evidence while retaining rolling artifacts', async () => {
		const rollingArtifact = artifactFixture();
		rollingArtifact.contentHash = await hashTurnInputArtifactContentV1(rollingArtifact);
		expect(await validateTurnInputArtifactV1(rollingArtifact)).toMatchObject({ ok: true });

		const artifact = artifactFixture();
		artifact.history[1]!.attachments = [
			{
				...ATTACHMENT_B,
				display_order: 0,
				storage_bucket: 'onto-assets',
				storage_path: 'projects/20000000-0000-4000-8000-000000000001/timeline.png',
				expires_at: null
			}
		];
		artifact.prepared.currentTurn = {
			message: 'Review the diagram.',
			attachmentContextMaxChars: 7000,
			liveVision: {
				requested: true,
				maxImages: 2,
				maxImageBytes: 8 * 1024 * 1024,
				renderWidth: 1600,
				signedUrlTtlSeconds: 900
			},
			attachments: [
				{
					...ATTACHMENT_A,
					display_order: 0,
					storage_bucket: 'onto-assets',
					storage_path: 'projects/20000000-0000-4000-8000-000000000001/diagram.png',
					expires_at: null
				}
			]
		};
		artifact.contentHash = await hashTurnInputArtifactContentV1(artifact);
		expect(await validateTurnInputArtifactV1(artifact)).toMatchObject({ ok: true });

		const invalidPolicy = structuredClone(artifact);
		invalidPolicy.prepared.currentTurn!.liveVision!.maxImages =
			AGENTIC_CHAT_LIVE_VISION_MAX_IMAGES + 1;
		invalidPolicy.contentHash = await hashTurnInputArtifactContentV1(invalidPolicy);
		expect(await validateTurnInputArtifactV1(invalidPolicy)).toMatchObject({
			ok: false,
			code: 'invalid_current_turn'
		});

		const malformed = artifactFixture();
		malformed.history[1]!.attachments = [
			{
				...ATTACHMENT_B,
				display_order: 0,
				storage_bucket: 'onto-assets',
				storage_path: 'projects/20000000-0000-4000-8000-000000000001/timeline.png',
				expires_at: null
			}
		];
		malformed.prepared.currentTurn = {
			message: 'Review the diagram.',
			attachmentContextMaxChars: 7000,
			attachments: [
				{
					...ATTACHMENT_A,
					display_order: 0,
					checksum_sha256: 'not-a-checksum',
					storage_bucket: 'onto-assets',
					storage_path: 'projects/20000000-0000-4000-8000-000000000001/diagram.png',
					expires_at: null
				}
			]
		};
		malformed.contentHash = await hashTurnInputArtifactContentV1(malformed);
		expect(await validateTurnInputArtifactV1(malformed)).toMatchObject({
			ok: false,
			code: 'invalid_current_turn'
		});
	});

	it('freezes exact history and excludes the newly admitted user message', () => {
		const source = artifactFixture().history;
		source.push({
			sourceMessageId: '70000000-0000-4000-8000-000000000099',
			role: 'user',
			content: 'This is the newly admitted message.',
			attachments: [],
			toolCalls: [],
			toolCallId: null
		});

		const frozen = freezeTurnInputHistoryV1(source, '70000000-0000-4000-8000-000000000099');
		expect(frozen.map((message) => message.sourceMessageId)).toEqual([
			'70000000-0000-4000-8000-000000000001',
			'70000000-0000-4000-8000-000000000002'
		]);

		source[0]!.content = 'Mutated after the immutable snapshot was built.';
		(source[1]!.toolCalls[0]!.function as { name: string }).name = 'mutated_tool';
		expect(frozen[0]!.content).toBe('Keep the exact historical text.');
		expect(frozen[1]!.toolCalls[0]).toEqual({
			function: { name: 'onto_project_read' },
			id: 'call-1'
		});
	});

	it('uses generation-aware deterministic event identities', () => {
		const turnRunId = '80000000-0000-4000-8000-000000000001';
		expect(createAgentStreamEventIdV1(turnRunId, 0, 1)).toBe(`${turnRunId}:0:1`);
		expect(createAgentStreamEventIdV1(turnRunId, 1, 1)).toBe(`${turnRunId}:1:1`);
		expect(parseAgentStreamEventIdV1(`${turnRunId}:7:42`)).toEqual({
			turnRunId,
			executionGeneration: 7,
			sequenceIndex: 42
		});
		expect(parseAgentStreamEventIdV1(`${turnRunId}:1:0`)).toBeNull();
		expect(() => createAgentStreamEventIdV1(turnRunId, -1, 1)).toThrow(/nonnegative/);
	});

	it('pins the terminal race and stale-generation decisions', () => {
		expect(
			decideTerminalFinalizationV1({
				currentStatus: 'running',
				currentGeneration: 2,
				requestedGeneration: 2,
				requestedStatus: 'completed',
				cancelRequestedAt: '2026-07-29T20:00:00.000Z'
			})
		).toEqual({ decision: 'cancel_requested' });
		expect(
			decideTerminalFinalizationV1({
				currentStatus: 'completed',
				currentGeneration: 2,
				requestedGeneration: 1,
				requestedStatus: 'cancelled',
				cancelRequestedAt: null
			})
		).toEqual({ decision: 'already_terminal', status: 'completed' });
		expect(
			decideTerminalFinalizationV1({
				currentStatus: 'running',
				currentGeneration: 3,
				requestedGeneration: 2,
				requestedStatus: 'failed',
				cancelRequestedAt: null
			})
		).toEqual({ decision: 'stale_generation' });
		expect(
			decideTerminalFinalizationV1({
				currentStatus: 'queued',
				currentGeneration: 0,
				requestedGeneration: 0,
				requestedStatus: 'cancelled',
				cancelRequestedAt: null
			})
		).toEqual({ decision: 'commit', status: 'cancelled' });
		expect(
			decideTerminalFinalizationV1({
				currentStatus: 'queued',
				currentGeneration: 0,
				requestedGeneration: 0,
				requestedStatus: 'completed',
				cancelRequestedAt: null
			})
		).toEqual({ decision: 'invalid_status' });
	});

	it('classifies every recovery failure in the Phase 5 operational retry taxonomy', () => {
		const expected = {
			transient_infra: 'transient_safe',
			provider_throttle: 'transient_safe',
			timeout_pre_start: 'safe_before_start',
			permanent: 'permanent',
			stale_context: 'permanent',
			publisher_overload: 'permanent',
			timeout_post_start: 'permanent',
			cancelled: 'cancelled',
			uncertain_external_commit: 'uncertain_external_commit',
			unknown: 'permanent'
		} as const;

		expect(AGENTIC_CHAT_RECOVERY_FAILURE_CLASSES_V1).toEqual(Object.keys(expected));
		for (const failureClass of AGENTIC_CHAT_RECOVERY_FAILURE_CLASSES_V1) {
			expect(classifyAgenticChatRetryV1(failureClass)).toBe(expected[failureClass]);
		}
	});

	it('allows whole-turn retry only before every execution boundary', () => {
		const safePreStart = {
			currentStatus: 'running' as const,
			currentGeneration: 1,
			requestedGeneration: 1,
			failureClass: 'transient_infra' as const,
			cancelRequested: false,
			executionStarted: false,
			mutationReserved: false,
			irreversibleBoundaryCrossed: false,
			effectCount: 0,
			blockingEffectCount: 0,
			queueAttempts: 0,
			queueMaxAttempts: 3,
			queueResidenceExpired: false
		};

		expect(decideAgenticChatRecoveryV1(safePreStart)).toEqual({
			decision: 'retry',
			failureCode: 'transient_infra'
		});
		expect(
			decideAgenticChatRecoveryV1({
				...safePreStart,
				failureClass: 'provider_throttle'
			})
		).toEqual({ decision: 'retry', failureCode: 'provider_throttle' });
		expect(
			decideAgenticChatRecoveryV1({
				...safePreStart,
				executionStarted: true
			})
		).toMatchObject({ decision: 'finalize_failed', retryExhausted: false });
		expect(
			decideAgenticChatRecoveryV1({
				...safePreStart,
				mutationReserved: true
			})
		).toMatchObject({ decision: 'finalize_failed', retryExhausted: false });
		expect(
			decideAgenticChatRecoveryV1({
				...safePreStart,
				irreversibleBoundaryCrossed: true
			})
		).toMatchObject({ decision: 'finalize_failed', retryExhausted: false });
		expect(
			decideAgenticChatRecoveryV1({
				...safePreStart,
				effectCount: 1
			})
		).toMatchObject({ decision: 'finalize_failed', retryExhausted: false });
	});

	it('limits pre-start timeout retry and fails closed for stale, unknown, and exhausted work', () => {
		const safePreStart = {
			currentStatus: 'running' as const,
			currentGeneration: 2,
			requestedGeneration: 2,
			failureClass: 'timeout_pre_start' as const,
			cancelRequested: false,
			executionStarted: false,
			mutationReserved: false,
			irreversibleBoundaryCrossed: false,
			effectCount: 0,
			blockingEffectCount: 0,
			queueAttempts: 0,
			queueMaxAttempts: 3,
			queueResidenceExpired: false
		};

		expect(decideAgenticChatRecoveryV1(safePreStart)).toEqual({
			decision: 'retry',
			failureCode: 'timeout_pre_start'
		});
		expect(decideAgenticChatRecoveryV1({ ...safePreStart, queueAttempts: 1 })).toEqual({
			decision: 'finalize_failed',
			failureCode: 'timeout_pre_start',
			retryExhausted: true
		});
		expect(
			decideAgenticChatRecoveryV1({
				...safePreStart,
				failureClass: 'unknown'
			})
		).toEqual({
			decision: 'finalize_failed',
			failureCode: 'unknown',
			retryExhausted: false
		});
		expect(
			decideAgenticChatRecoveryV1({
				...safePreStart,
				failureClass: 'transient_infra',
				queueResidenceExpired: true
			})
		).toEqual({
			decision: 'finalize_failed',
			failureCode: 'stale_context',
			retryExhausted: false
		});
		expect(
			decideAgenticChatRecoveryV1({
				...safePreStart,
				failureClass: 'transient_infra',
				queueAttempts: 2
			})
		).toMatchObject({ decision: 'finalize_failed', retryExhausted: true });
	});

	it('prioritizes terminal, stale-generation, cancellation, and effect reconciliation', () => {
		const input = {
			currentStatus: 'running' as const,
			currentGeneration: 3,
			requestedGeneration: 3,
			failureClass: 'transient_infra' as const,
			cancelRequested: false,
			executionStarted: false,
			mutationReserved: false,
			irreversibleBoundaryCrossed: false,
			effectCount: 0,
			blockingEffectCount: 0,
			queueAttempts: 0,
			queueMaxAttempts: 3,
			queueResidenceExpired: false
		};

		expect(decideAgenticChatRecoveryV1({ ...input, currentStatus: 'completed' })).toEqual({
			decision: 'reconcile_terminal_queue'
		});
		expect(decideAgenticChatRecoveryV1({ ...input, requestedGeneration: 2 })).toEqual({
			decision: 'stale_generation'
		});
		expect(decideAgenticChatRecoveryV1({ ...input, currentStatus: 'queued' })).toEqual({
			decision: 'already_requeued'
		});
		expect(decideAgenticChatRecoveryV1({ ...input, cancelRequested: true })).toEqual({
			decision: 'finalize_cancelled',
			failureCode: 'cancelled'
		});
		expect(decideAgenticChatRecoveryV1({ ...input, blockingEffectCount: 1 })).toEqual({
			decision: 'effect_reconciliation_required'
		});
	});

	it('pins typed database receipts for terminal finalization and cancellation', () => {
		const terminal = {
			outcome: 'finalized',
			turn_run_id: '80000000-0000-4000-8000-000000000001',
			session_id: '30000000-0000-4000-8000-000000000001',
			user_id: '10000000-0000-4000-8000-000000000001',
			queue_job_id: '90000000-0000-4000-8000-000000000001',
			execution_generation: 2,
			status: 'completed',
			finished_reason: 'stop',
			failure_code: null,
			assistant_message_id: '70000000-0000-4000-8000-000000000001',
			terminal_event_id: '80000000-0000-4000-8000-000000000001:2:8',
			terminal_sequence_index: 8,
			terminalized_at: '2026-08-02T16:00:00.000Z'
		} satisfies AgenticChatTerminalFinalizeRpcResultV1;
		const cancel = {
			outcome: 'cancel_requested',
			turn_run_id: terminal.turn_run_id,
			session_id: terminal.session_id,
			user_id: terminal.user_id,
			queue_job_id: terminal.queue_job_id,
			execution_generation: 2,
			status: 'running',
			cancel_requested_at: '2026-08-02T15:59:59.000Z',
			cancel_reason: 'user_cancelled',
			cancel_source: 'browser',
			signal_id: '60000000-0000-4000-8000-000000000001'
		} satisfies AgenticChatCancelRpcResultV1;

		expect(terminal.terminal_event_id).toContain(':2:8');
		expect(cancel.outcome).toBe('cancel_requested');
	});

	it('pins the batched current-generation cancellation observation receipt', () => {
		const observations = [
			{
				turn_run_id: '80000000-0000-4000-8000-000000000001',
				execution_generation: 2,
				signal_id: '60000000-0000-4000-8000-000000000001',
				cancel_reason: 'superseded',
				cancel_source: 'browser',
				cancel_requested_at: '2026-08-02T16:01:00.000Z',
				consumed_at: '2026-08-02T16:01:00.500Z'
			}
		] satisfies AgenticChatCancellationObservationRpcResultV1;

		expect(observations).toHaveLength(1);
		expect(observations[0]).toMatchObject({
			execution_generation: 2,
			cancel_reason: 'superseded'
		});
	});

	it('pins bounded stream-write receipts and fail-closed publication authority', () => {
		const receiptBase = {
			turn_run_id: '80000000-0000-4000-8000-000000000001',
			queue_job_id: '90000000-0000-4000-8000-000000000001',
			session_id: '30000000-0000-4000-8000-000000000001',
			user_id: '10000000-0000-4000-8000-000000000001',
			stream_run_id: 'stream-1',
			client_turn_id: 'client-turn-1',
			execution_generation: 2,
			sequence_index: 4,
			event_id: '80000000-0000-4000-8000-000000000001:2:4',
			durable: true
		} as const;
		const persistedText = {
			...receiptBase,
			outcome: 'persisted',
			publish_allowed: true,
			phase: 'llm',
			event_type: 'text_delta',
			batch_id: '60000000-0000-4000-8000-000000000001',
			text_delta: 'hello',
			assistant_text_bytes: 5,
			reconcile_required: true,
			persisted_at: '2026-08-02T17:00:00.000Z'
		} satisfies AgenticChatTextBatchRpcResultV1;
		const duplicateText = {
			...receiptBase,
			outcome: 'already_persisted',
			publish_allowed: false,
			phase: 'llm',
			event_type: 'text_delta',
			batch_id: '60000000-0000-4000-8000-000000000001',
			assistant_text_bytes: 5
		} satisfies AgenticChatTextBatchRpcResultV1;
		const semantic = {
			...receiptBase,
			outcome: 'persisted',
			publish_allowed: true,
			phase: 'tool',
			event_type: 'tool_call',
			transition_id: '60000000-0000-4000-8000-000000000002',
			event_payload: { type: 'tool_call', tool_name: 'onto_project_read' },
			reconcile_required: true,
			persisted_at: '2026-08-02T17:00:00.000Z'
		} satisfies AgenticChatSemanticEventRpcResultV1;
		const flush = {
			outcome: 'flushed',
			input_count: 2,
			persisted_count: 1,
			rejected_count: 1,
			results: [
				{ ...persistedText, input_index: 0 },
				{
					outcome: 'rejected',
					publish_allowed: false,
					input_index: 1,
					error_code: 'P0001',
					error_message: 'agentic_chat_text_write_prefix_conflict'
				}
			]
		} satisfies AgenticChatTextBatchFlushRpcResultV1;

		expect(AGENTIC_CHAT_TEXT_BATCH_MAX_BYTES).toBe(512 * 1024);
		expect(AGENTIC_CHAT_TEXT_BATCH_FLUSH_MAX_ITEMS).toBe(128);
		expect(AGENTIC_CHAT_TEXT_BATCH_FLUSH_MAX_BYTES).toBe(16 * 1024 * 1024);
		expect(canPublishAgenticChatStreamWriteV1(persistedText)).toBe(true);
		expect(canPublishAgenticChatStreamWriteV1(duplicateText)).toBe(false);
		expect(canPublishAgenticChatStreamWriteV1(semantic)).toBe(true);
		expect(canPublishAgenticChatStreamWriteV1(flush.results[1])).toBe(false);
	});

	it('treats only exact or idempotent delivery acknowledgement as reconciled', () => {
		const acknowledged = {
			outcome: 'acknowledged',
			turn_run_id: '80000000-0000-4000-8000-000000000001',
			queue_job_id: '90000000-0000-4000-8000-000000000001',
			execution_generation: 2,
			acknowledged_sequence: 4,
			current_sequence: 4,
			reconcile_required: false
		} satisfies AgenticChatStreamDeliveryAckRpcResultV1;
		const newerSnapshot = {
			...acknowledged,
			outcome: 'newer_snapshot',
			current_sequence: 5,
			reconcile_required: true
		} satisfies AgenticChatStreamDeliveryAckRpcResultV1;

		expect(didAcknowledgeAgenticChatStreamDeliveryV1(acknowledged)).toBe(true);
		expect(
			didAcknowledgeAgenticChatStreamDeliveryV1({
				...acknowledged,
				outcome: 'already_acknowledged'
			})
		).toBe(true);
		expect(didAcknowledgeAgenticChatStreamDeliveryV1(newerSnapshot)).toBe(false);
	});

	it('pins the bounded generation-consistent reconciliation receipt', () => {
		const result = {
			outcome: 'reconciled',
			contract_version: 'agentic_chat_worker_v1',
			turn_run_id: '80000000-0000-4000-8000-000000000001',
			session_id: '30000000-0000-4000-8000-000000000001',
			user_id: '10000000-0000-4000-8000-000000000001',
			stream_run_id: 'stream-1',
			client_turn_id: 'client-turn-1',
			execution_mode: 'worker_realtime',
			requested_execution_generation: 1,
			execution_generation: 2,
			generation_changed: true,
			status: 'running',
			text: 'Hello',
			projection: { phase: 'tool' },
			snapshot_sequence: 4,
			durable_through_sequence: 4,
			projection_durable_sequence: 2,
			durable_events: [],
			response_watermark: 4,
			reconcile_required: true,
			assistant_message: null,
			terminal_event_id: null,
			terminalized_at: null,
			finished_reason: null,
			failure_code: null,
			updated_at: '2026-08-02T22:00:00.000Z'
		} satisfies AgenticChatReconcileRpcResultV1;

		expect(AGENTIC_CHAT_RECONCILE_MAX_DURABLE_EVENTS).toBe(64);
		expect(result.generation_changed).toBe(true);
		expect(result.response_watermark).toBe(result.durable_through_sequence);
	});

	it('pins the shared private Realtime names and bounded client inbox', () => {
		const hint = {
			event: AGENTIC_CHAT_REALTIME_RECONCILE_EVENT,
			payload: {
				contract_version: 'agentic_chat_worker_v1',
				turn_run_id: '80000000-0000-4000-8000-000000000001',
				session_id: '30000000-0000-4000-8000-000000000001',
				execution_generation: 2,
				durable_through_sequence: 4
			}
		} satisfies AgenticChatRealtimeBroadcastV1;

		expect(AGENTIC_CHAT_REALTIME_STREAM_EVENT).toBe('agent-stream-event');
		expect(hint.event).toBe('agent-stream-reconcile');
		expect(AGENTIC_CHAT_CLIENT_BUFFER_MAX_EVENTS).toBe(128);
		expect(AGENTIC_CHAT_CLIENT_BUFFER_MAX_BYTES).toBe(1024 * 1024);
		expect(AGENTIC_CHAT_CLIENT_MAX_TRACKED_TURNS).toBe(8);
	});
});
