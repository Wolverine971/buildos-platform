// packages/shared-agent-ops/src/google/google-agent-ports.ts
import {
	GoogleAgentOAuthError,
	GoogleAgentOAuthService,
	type GoogleAgentDatabase,
	type GoogleAgentEnv
} from './google-agent-oauth';
import { GmailOAuthError } from '../email/gmail-read-oauth.service';
import { GoogleCalendarConnectionError } from '../calendar/google-calendar-credential.service';

export function createGmailAgentAuthPort(db: GoogleAgentDatabase, readEnv?: GoogleAgentEnv) {
	const service = new GoogleAgentOAuthService(db, { readEnv });
	return {
		async getAuthorizedReadAccessToken(
			userId: string,
			connectionId: string,
			options: { forceRefresh?: boolean } = {}
		) {
			try {
				return await service.getAccessToken(
					{ userId, connectionId, kind: 'gmail' },
					options.forceRefresh
				);
			} catch (error) {
				if (!(error instanceof GoogleAgentOAuthError)) throw error;
				throw new GmailOAuthError(
					error.code === 'agent_authorization_required'
						? 'reconnect_required'
						: error.code,
					error.message
				);
			}
		}
	};
}

export function createCalendarAgentAuthPort(db: GoogleAgentDatabase, readEnv?: GoogleAgentEnv) {
	const service = new GoogleAgentOAuthService(db, { readEnv });
	return {
		async getAuthenticatedClient(userId: string, connectionId: string) {
			try {
				return await service.getCalendarClient(userId, connectionId);
			} catch (error) {
				if (!(error instanceof GoogleAgentOAuthError)) throw error;
				throw new GoogleCalendarConnectionError(
					error.code === 'agent_authorization_required'
						? 'reconnect_required'
						: error.code,
					error.message
				);
			}
		}
	};
}
