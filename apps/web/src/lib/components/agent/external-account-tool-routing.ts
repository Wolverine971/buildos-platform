// apps/web/src/lib/components/agent/external-account-tool-routing.ts
import type { UIMessage } from './agent-chat.types';

const EMAIL_ADDRESS_PATTERN = /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/i;
const EXTERNAL_ACCOUNT_TERMS =
	/\b(gmail|email|e-mail|inbox|mailbox|google account|google calendar|oauth)\b/i;
const ACCOUNT_CONNECTION_TERMS =
	/\b(connect|reconnect|connected|connection|authorize|authorization)\b.{0,32}\b(account|gmail|email|inbox|calendar)\b/i;

export function needsLegacyExternalAccountTools(
	messages: UIMessage[],
	newContent: string
): boolean {
	const recentConversation = messages
		.filter(
			(message) =>
				message.type === 'user' ||
				message.type === 'assistant' ||
				message.type === 'clarification'
		)
		.slice(-8)
		.map((message) => message.content)
		.concat(newContent)
		.join('\n');

	return (
		EMAIL_ADDRESS_PATTERN.test(recentConversation) ||
		EXTERNAL_ACCOUNT_TERMS.test(recentConversation) ||
		ACCOUNT_CONNECTION_TERMS.test(recentConversation)
	);
}
