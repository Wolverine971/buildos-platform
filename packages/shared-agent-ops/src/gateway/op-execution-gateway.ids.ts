// packages/shared-agent-ops/src/gateway/op-execution-gateway.ids.ts
import { isValidUUID } from '@buildos/shared-types';
import { ExternalToolGatewayError } from './op-execution-gateway.responses';

export function assertValidId(value: unknown, fieldName: string): string {
	if (typeof value !== 'string' || !isValidUUID(value.trim())) {
		throw new ExternalToolGatewayError('VALIDATION_ERROR', `${fieldName} must be a valid UUID`);
	}
	return value.trim();
}
