// apps/web/src/lib/types/specialist-workbench.ts
import type { SpecialistWorkbenchDraftV1 } from '@buildos/agentic-chat-runtime/specialists';
export type WorkbenchDraftRow = {
	id: string;
	revision: number;
	draft: SpecialistWorkbenchDraftV1;
	draftHash: string;
	updatedAt: string;
};
export type WorkbenchVersionSummary = {
	draftId: string;
	version: number;
	draftRevision: number;
	snapshotHash: string;
	name: string;
	createdAt: string;
};
export type WorkbenchData = { drafts: WorkbenchDraftRow[]; versions: WorkbenchVersionSummary[] };
