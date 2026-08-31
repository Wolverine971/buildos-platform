import type { LibriAssetBrokerPort } from './assetBroker';
import type { LibriAssetGrantPort } from './assetGrant';
import type { LibriCostLedgerPort } from './costLedger';
import type { ClaimedLibriStep } from './lifecycle';
import {
	LibriMaintenanceProcessorError,
	type LibriMaintenanceProcessorPort
} from './maintenanceConsumer';
import type { LibriOcrExecutionPort } from './ocrExecution';
import type { LibriOcrProviderPort } from './ocrProvider';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MODEL_PATTERN = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/i;

export type LibriOcrProcessorOptions = {
	model: string;
	maxOutputTokens: number;
	reservedMicrousd: bigint;
};

export type LibriOcrProcessorDependencies = {
	costLedger: Pick<LibriCostLedgerPort, 'reserveProviderCost' | 'releaseProviderCost'>;
	assetGrants: LibriAssetGrantPort;
	assetBroker: LibriAssetBrokerPort;
	execution: LibriOcrExecutionPort;
	provider: LibriOcrProviderPort;
};

type OcrImagePayload = {
	version: 1;
	kind: 'ocr_image';
	imageId: string;
	expectedOcrVersion: number;
	maxOutputChars: number;
};

export function createLibriOcrProcessor(
	dependencies: LibriOcrProcessorDependencies,
	options: LibriOcrProcessorOptions
): LibriMaintenanceProcessorPort {
	const model = normalizeModel(options.model);
	if (
		!Number.isSafeInteger(options.maxOutputTokens) ||
		options.maxOutputTokens < 1 ||
		options.maxOutputTokens > 4_096
	) {
		throw new Error('Libri OCR maxOutputTokens must be an integer between 1 and 4096');
	}
	if (typeof options.reservedMicrousd !== 'bigint' || options.reservedMicrousd <= 0n) {
		throw new Error('Libri OCR reservedMicrousd must be a positive bigint');
	}

	return {
		async execute(claim, signal) {
			if (signal.aborted) throw interrupted();
			if (claim.queueType !== 'libri_ingest') {
				throw permanent(
					'unsupported_queue_type',
					`Libri OCR cannot process ${claim.queueType}`
				);
			}
			const payload = parsePayload(claim.payload);
			const reservationKey = `ocr:image:${payload.imageId}:version:${payload.expectedOcrVersion}`;
			let reservationId: string | null = null;
			let paidAuthorityStarted = false;

			try {
				const reservation = await dependencies.costLedger.reserveProviderCost({
					stepId: claim.stepId,
					executionGeneration: claim.executionGeneration,
					leaseToken: claim.leaseToken,
					reservationKey,
					provider: 'openrouter',
					model,
					reservedMicrousd: options.reservedMicrousd
				});
				reservationId = reservation.reservationId;
				if (reservation.outcome !== 'reserved' || reservationId === null) {
					if (reservation.outcome === 'started' || reservation.outcome === 'settled') {
						paidAuthorityStarted = true;
						throw reconciliation('OCR cost reservation already crossed paid authority');
					}
					throw permanent(
						`ocr_cost_${reservation.outcome}`,
						`Libri OCR cost reservation was denied: ${reservation.outcome}`
					);
				}

				const grant = await dependencies.assetGrants.issueOcrAssetGrant({
					stepId: claim.stepId,
					executionGeneration: claim.executionGeneration,
					leaseToken: claim.leaseToken,
					imageId: payload.imageId
				});
				const asset = await dependencies.assetBroker.redeemOcrAssetGrant({
					grantId: grant.grantId,
					expiresAt: grant.expiresAt,
					signal
				});
				if (signal.aborted) throw interrupted();

				const authorization = await dependencies.execution.authorizeOcrProviderCall({
					...ownership(claim),
					reservationId,
					imageId: payload.imageId
				});
				if (!authorization.authorized) {
					if (
						authorization.outcome === 'started' ||
						authorization.outcome === 'settled'
					) {
						paidAuthorityStarted = true;
						throw reconciliation(
							'OCR provider authority is already ambiguous or settled'
						);
					}
					throw permanent(
						`ocr_authorization_${authorization.outcome}`,
						`Libri OCR provider authorization was denied: ${authorization.outcome}`
					);
				}
				paidAuthorityStarted = true;
				if (
					authorization.provider !== 'openrouter' ||
					authorization.model !== model ||
					authorization.maxOutputChars !== payload.maxOutputChars
				) {
					throw reconciliation(
						'OCR authorization receipt contradicted the reserved execution'
					);
				}

				const providerResult = await dependencies.provider.execute({
					imageUrl: asset.signedUrl,
					mimeType: asset.mimeType,
					model,
					maxOutputTokens: options.maxOutputTokens,
					maxOutputChars: payload.maxOutputChars,
					signal
				});
				if (providerResult.estimatedCostMicrousd === null) {
					throw reconciliation('OCR provider response omitted billable cost');
				}
				const completion = await dependencies.execution.completeOcrStep({
					...ownership(claim),
					reservationId,
					imageId: payload.imageId,
					extractedText: providerResult.extractedText,
					summary: providerResult.summary,
					...(providerResult.confidence === undefined
						? {}
						: { confidence: providerResult.confidence }),
					...(providerResult.language === undefined
						? {}
						: { language: providerResult.language }),
					actualCostMicrousd: BigInt(providerResult.estimatedCostMicrousd),
					promptTokens: BigInt(providerResult.promptTokens),
					completionTokens: BigInt(providerResult.completionTokens),
					providerRequestId: providerResult.providerRequestId
				});
				if (!completion.accepted) {
					throw reconciliation(`OCR atomic completion was denied: ${completion.outcome}`);
				}
				return;
			} catch (error) {
				if (reservationId && !paidAuthorityStarted) {
					const release = await dependencies.costLedger
						.releaseProviderCost({
							reservationId,
							executionGeneration: claim.executionGeneration,
							leaseToken: claim.leaseToken,
							reason: `pre_authorization:${errorCode(error)}`
						})
						.catch(() => null);
					if (!release?.accepted) {
						throw reconciliation('OCR cost reservation could not be safely released');
					}
				}
				if (paidAuthorityStarted && !isReconciliation(error)) {
					throw reconciliation(
						error instanceof Error
							? `OCR paid execution requires reconciliation: ${error.message}`
							: 'OCR paid execution requires reconciliation'
					);
				}
				if (error instanceof LibriMaintenanceProcessorError) throw error;
				throw new LibriMaintenanceProcessorError(
					'ocr_pre_authorization_failed',
					error instanceof Error ? error.message : 'Libri OCR preparation failed',
					true
				);
			}
		}
	};
}

function parsePayload(payload: Record<string, unknown>): OcrImagePayload {
	const unexpected = Object.keys(payload).filter(
		(key) =>
			!['version', 'kind', 'imageId', 'expectedOcrVersion', 'maxOutputChars'].includes(key)
	);
	if (
		unexpected.length > 0 ||
		payload.version !== 1 ||
		payload.kind !== 'ocr_image' ||
		typeof payload.imageId !== 'string' ||
		!UUID_PATTERN.test(payload.imageId) ||
		!Number.isSafeInteger(payload.expectedOcrVersion) ||
		(payload.expectedOcrVersion as number) <= 0 ||
		!Number.isSafeInteger(payload.maxOutputChars) ||
		(payload.maxOutputChars as number) < 1 ||
		(payload.maxOutputChars as number) > 100_000
	) {
		throw permanent('invalid_payload', 'Libri OCR requires one exact version 1 image payload');
	}
	return {
		version: 1,
		kind: 'ocr_image',
		imageId: payload.imageId,
		expectedOcrVersion: payload.expectedOcrVersion as number,
		maxOutputChars: payload.maxOutputChars as number
	};
}

function ownership(claim: ClaimedLibriStep) {
	return {
		queueRowId: claim.queueRowId,
		processingToken: claim.processingToken,
		stepId: claim.stepId,
		executionGeneration: claim.executionGeneration,
		leaseToken: claim.leaseToken
	};
}

function normalizeModel(value: string): string {
	const model = value.trim();
	if (model.length < 1 || model.length > 120 || !MODEL_PATTERN.test(model)) {
		throw new Error('Libri OCR model must be a provider-qualified model identifier');
	}
	return model;
}

function errorCode(error: unknown): string {
	if (error instanceof LibriMaintenanceProcessorError) return error.code.slice(0, 200);
	if (error instanceof Error && error.name) return error.name.slice(0, 200);
	return 'unknown_failure';
}

function isReconciliation(error: unknown): boolean {
	return (
		error instanceof LibriMaintenanceProcessorError &&
		error.code === 'ocr_reconciliation_required'
	);
}

function interrupted(): LibriMaintenanceProcessorError {
	return new LibriMaintenanceProcessorError(
		'worker_interrupted',
		'Libri OCR execution was interrupted',
		true
	);
}

function permanent(code: string, message: string): LibriMaintenanceProcessorError {
	return new LibriMaintenanceProcessorError(code, message, false);
}

function reconciliation(message: string): LibriMaintenanceProcessorError {
	return new LibriMaintenanceProcessorError('ocr_reconciliation_required', message, false);
}
