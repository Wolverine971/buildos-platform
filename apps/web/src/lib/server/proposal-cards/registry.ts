// apps/web/src/lib/server/proposal-cards/registry.ts
//
// Web half of the proposal-card kind registry: each kind's click, Undo and
// preview handlers. The contract half (tool name, TTLs, choices, parsers,
// digest, wording) is PROPOSAL_CARD_KINDS in
// @buildos/shared-agent-ops/chat-cards/proposal-card. A kind missing here
// cannot be resolved.
import type { ProposalCardKind } from '@buildos/shared-agent-ops/chat-cards/proposal-card';
import { projectCombineHandler } from './project-combine.handler';
import { projectParentHandler } from './project-parent.handler';
import { workspaceFileHandler, workspaceProjectHandler } from './workspace-cards.handler';
import type { ProposalCardHandler } from './types';

export const PROPOSAL_CARD_HANDLERS: Record<ProposalCardKind, ProposalCardHandler<any>> = {
	project_parent: projectParentHandler,
	project_combine: projectCombineHandler,
	workspace_file: workspaceFileHandler,
	workspace_project: workspaceProjectHandler
};
