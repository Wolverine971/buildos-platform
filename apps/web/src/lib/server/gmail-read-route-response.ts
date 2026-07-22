// apps/web/src/lib/server/gmail-read-route-response.ts
import { GmailOAuthError } from './gmail-read-oauth.service';
import { GmailReadGatewayError } from './gmail-read-gateway';
import { ApiResponse, HttpStatus } from '$lib/utils/api-response';

export function noStore(response: Response, headers: Record<string, string> = {}): Response {
	response.headers.set('Cache-Control', 'private, no-store');
	response.headers.delete('ETag');
	for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
	return response;
}

export function gmailReadErrorResponse(error: unknown): Response {
	if (error instanceof GmailReadGatewayError) {
		switch (error.code) {
			case 'invalid_request':
				return noStore(ApiResponse.badRequest(error.message));
			case 'connection_not_found':
				return noStore(
					ApiResponse.error(
						error.message,
						HttpStatus.NOT_FOUND,
						'GMAIL_CONNECTION_NOT_FOUND'
					)
				);
			case 'message_not_found':
				return noStore(
					ApiResponse.error(
						error.message,
						HttpStatus.NOT_FOUND,
						'GMAIL_MESSAGE_NOT_FOUND'
					)
				);
			case 'provider_response_too_large':
			case 'unsupported_message':
				return noStore(
					ApiResponse.error(
						error.message,
						HttpStatus.UNPROCESSABLE_ENTITY,
						'GMAIL_MESSAGE_UNSUPPORTED'
					)
				);
			case 'provider_error':
				return noStore(
					ApiResponse.error(
						'Google could not complete this read-only Gmail request',
						HttpStatus.SERVICE_UNAVAILABLE,
						'GMAIL_PROVIDER_UNAVAILABLE'
					)
				);
		}
	}

	if (error instanceof GmailOAuthError) {
		if (error.code === 'connection_not_found') {
			return noStore(
				ApiResponse.error(error.message, HttpStatus.NOT_FOUND, 'GMAIL_CONNECTION_NOT_FOUND')
			);
		}
		if (error.code === 'reconnect_required' || error.code === 'read_capability_disabled') {
			return noStore(
				ApiResponse.error(error.message, HttpStatus.CONFLICT, 'GMAIL_RECONNECT_REQUIRED')
			);
		}
	}

	return noStore(
		ApiResponse.error(
			'Unable to read Gmail right now',
			HttpStatus.INTERNAL_SERVER_ERROR,
			'GMAIL_READ_FAILED'
		)
	);
}
