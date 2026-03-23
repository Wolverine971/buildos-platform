// apps/web/src/lib/server/agent-call/public-tool-registry.ts
import type { AgentCallScope, BuildosAgentToolDefinition } from '@buildos/shared-types';
import { getBuildosAgentGatewayTools } from './external-tool-gateway';

export function getPublicBuildosAgentTools(scope: AgentCallScope): BuildosAgentToolDefinition[] {
	return getBuildosAgentGatewayTools(scope);
}
