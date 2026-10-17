// apps/web/src/routes/api/agent/v2/turns/worker-admission-responses.ts
import { AgenticChatWorkerAdmissionGatewayError } from '$lib/services/agentic-chat-v2/worker-turn-admission.server';
import { AgenticChatWorkerPreparationError } from '$lib/services/agentic-chat-v2/worker-turn-preparation.server';
import { ApiResponse, HttpStatus } from '$lib/utils/api-response';

export function privateResponse(response: Response): Response {
	response.headers.set('Cache-Control', 'private, no-store');
	response.headers.set('Vary', 'Authorization');
	return response;
}

export function withWorkerAdmissionTiming(
	response: Response,
	timing: {
		preparationMs: number;
		admissionMs: number;
		preparedAdmissionLease?: {
			hit: boolean;
			missReason: string | null;
			inspectionMs: number;
		};
	}
): Response {
	const lease = timing.preparedAdmissionLease;
	const leaseDescription = lease?.hit ? 'hit' : (lease?.missReason ?? 'unavailable');
	response.headers.set(
		'Server-Timing',
		[
			`prepared-admission;dur=${Math.max(0, lease?.inspectionMs ?? 0)};desc="${leaseDescription}"`,
			`worker-preparation;dur=${Math.max(0, timing.preparationMs)}`,
			`worker-admission;dur=${Math.max(0, timing.admissionMs)}`
		].join(', ')
	);
	return response;
}

/**
 * Where a failed send stopped. Anything thrown during `preparation` ran before the
 * admission RPC; during `admission` the turn may exist unless the error proves the
 * transaction rolled back.
 */
export type WorkerAdmissionPhase = 'preparation' | 'admission';

/** Provably nothing was written: the browser may keep the draft and offer a resend. */
export function workerAdmissionNotAdmittedResponse(): Response {
	return privateResponse(
		ApiResponse.error(
			"Your message wasn't sent. Try again.",
			HttpStatus.SERVICE_UNAVAILABLE,
			'WORKER_ADMISSION_NOT_ADMITTED'
		)
	);
}

/** Commit is unknown: only an identical resend (same clientTurnId) is safe. */
export function workerAdmissionUnavailableResponse(): Response {
	return privateResponse(
		ApiResponse.error(
			'Worker turn admission is temporarily unavailable',
			HttpStatus.SERVICE_UNAVAILABLE,
			'WORKER_ADMISSION_UNAVAILABLE'
		)
	);
}

/** A turn with this clientTurnId already exists under a different request. */
export function workerIdempotencyConflictResponse(): Response {
	return privateResponse(
		ApiResponse.error(
			'A turn with this request id already exists',
			HttpStatus.CONFLICT,
			'WORKER_IDEMPOTENCY_CONFLICT'
		)
	);
}

/** Maps a failed preparation or admission to the private error response. */
export function workerAdmissionErrorResponse(
	error: unknown,
	phase: WorkerAdmissionPhase
): Response {
	if (error instanceof AgenticChatWorkerPreparationError) {
		if (error.code === 'capability_unavailable') {
			return privateResponse(
				ApiResponse.error(
					'BuildOS cannot run this turn right now: a required capability is unavailable.',
					HttpStatus.CONFLICT,
					'WORKER_CAPABILITY_UNAVAILABLE'
				)
			);
		}
		if (error.code === 'invalid_command') {
			return privateResponse(
				ApiResponse.error(
					'Worker turn command is invalid',
					HttpStatus.UNPROCESSABLE_ENTITY,
					'INVALID_WORKER_COMMAND'
				)
			);
		}
		if (error.code === 'access_denied') {
			return privateResponse(ApiResponse.forbidden('Worker turn access denied'));
		}
		if (error.code === 'session_conflict') {
			return privateResponse(
				ApiResponse.error(
					'Worker turn session conflicts with the request',
					HttpStatus.CONFLICT,
					'WORKER_SESSION_CONFLICT'
				)
			);
		}
	}
	if (
		phase === 'preparation' ||
		(error instanceof AgenticChatWorkerAdmissionGatewayError && error.rolledBack)
	) {
		return workerAdmissionNotAdmittedResponse();
	}
	return workerAdmissionUnavailableResponse();
}
