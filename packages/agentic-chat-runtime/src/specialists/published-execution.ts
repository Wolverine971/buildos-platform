// packages/agentic-chat-runtime/src/specialists/published-execution.ts
// Executable copy of one explicitly selected catalog version. Recovery needs no catalog reads.
import { canonicalizeAgenticChatJson, type JsonValue } from '@buildos/shared-types';
import {
	buildDocumentReadSnapshotV2,
	buildDocumentEvidenceSnapshotV2,
	DOCUMENT_ORGANIZER_V2,
	DOCUMENT_READ_TOOL_ID,
	hashSpecialistSnapshotV2,
	parseSpecialistSnapshotV2,
	type SpecialistSnapshotV2
} from './document-organization';
import {
	hashSpecialistWorkbenchValue,
	resolveSpecialistWorkbenchVersionV1,
	specialistReferencePromptV1,
	type SpecialistWorkbenchVersionV1
} from './workbench';

export const PUBLISHED_SPECIALIST_SNAPSHOT_VERSION = 'agentic_chat_specialist_snapshot_v3';
export type PublishedSpecialistRefV1 = { draftId: string; version: number; snapshotHash: string };
export type PublishedSpecialistSnapshotV3 = Omit<
	SpecialistSnapshotV2,
	'version' | 'selector' | 'profileVersion'
> & {
	version: typeof PUBLISHED_SPECIALIST_SNAPSHOT_VERSION;
	profileVersion: 2 | 3;
	selector: { id: 'explicit_published_specialist'; version: 1 };
	published: { snapshotHash: string; snapshot: SpecialistWorkbenchVersionV1 };
};
export type ExecutableSpecialistSnapshot = SpecialistSnapshotV2 | PublishedSpecialistSnapshotV3;
const canonical = (value: unknown) => canonicalizeAgenticChatJson(value as JsonValue);
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);
function invalid(): never {
	throw new Error('Invalid or unsupported published specialist snapshot');
}
function bounded(value: unknown, max: number): boolean {
	return (
		typeof value === 'string' &&
		value.trim().length > 0 &&
		[...value].length <= max &&
		!value.includes('\0')
	);
}

/** The catalog is authorable; model, budget, contracts and available tools remain host-owned. */
async function resolveExecutableVersion(value: unknown, hash: string) {
	const v = await resolveSpecialistWorkbenchVersionV1(value, hash);
	const d = v.definition;
	const baseline = DOCUMENT_ORGANIZER_V2;
	if (
		d.id !== `custom_${v.draftId.replaceAll('-', '')}` ||
		!Number.isSafeInteger(d.version) ||
		d.version < 1 ||
		d.version > 50 ||
		!Number.isSafeInteger(v.draftRevision) ||
		v.draftRevision < 1 ||
		!bounded(d.label, 80) ||
		!bounded(d.description, 600) ||
		!bounded(d.instructions?.system, 12000) ||
		!bounded(d.instructions?.defaultAssignment, 2000) ||
		!Array.isArray(d.expertise) ||
		d.expertise.length < 1 ||
		d.expertise.length > 8 ||
		d.expertise.some((e) => !bounded(e, 60)) ||
		!same(d.capabilities, {
			domainAccess: 'read_only',
			allowedWorkflowIds: [],
			allowedToolIds:
				d.capabilities?.allowedToolIds?.length === 0 ? [] : [DOCUMENT_READ_TOOL_ID]
		}) ||
		!same(d.knowledge, [
			...baseline.knowledge,
			{
				id: 'reference_packet',
				version: 1,
				source: 'pinned_reference_packet_v1',
				contentHash: v.knowledgePacketHash
			}
		]) ||
		!same(d, {
			...baseline,
			id: d.id,
			version: d.version,
			label: d.label,
			description: d.description,
			expertise: d.expertise,
			instructions: d.instructions,
			knowledge: d.knowledge,
			capabilities: d.capabilities
		})
	)
		invalid();
	return v;
}

export async function buildPublishedSpecialistSnapshotV3(input: {
	snapshot: SpecialistWorkbenchVersionV1;
	snapshotHash: string;
	evidenceHandoff?: boolean;
}): Promise<PublishedSpecialistSnapshotV3> {
	const version = await resolveExecutableVersion(input.snapshot, input.snapshotHash);
	const base = input.evidenceHandoff
		? buildDocumentEvidenceSnapshotV2()
		: buildDocumentReadSnapshotV2();
	const snapshot: PublishedSpecialistSnapshotV3 = {
		...base,
		profileVersion: input.evidenceHandoff ? 3 : 2,
		version: PUBLISHED_SPECIALIST_SNAPSHOT_VERSION,
		selector: { id: 'explicit_published_specialist', version: 1 },
		published: { snapshotHash: input.snapshotHash, snapshot: version },
		slots: {
			...base.slots,
			project_analyst: {
				definition: version.definition,
				assignment: version.definition.instructions.defaultAssignment
			}
		},
		plannerTask: `${base.plannerTask}\nThe project_analyst slot is the explicitly selected specialist. Its assignment: ${version.definition.instructions.defaultAssignment}`,
		editorTask: `${base.editorTask}\nThe first report is from the user's selected specialist. Preserve its relevant domain expertise; reference knowledge is not evidence of project state.`
	};
	await hashExecutableSpecialistSnapshot(snapshot);
	return snapshot;
}
export async function hashExecutableSpecialistSnapshot(value: unknown): Promise<string> {
	if (new TextEncoder().encode(canonical(value)).length > 196608) invalid();
	return hashSpecialistWorkbenchValue(value);
}
export async function parseExecutableSpecialistSnapshot(
	value: unknown,
	hash: string
): Promise<ExecutableSpecialistSnapshot> {
	if ((value as { version?: unknown })?.version !== PUBLISHED_SPECIALIST_SNAPSHOT_VERSION)
		return parseSpecialistSnapshotV2(value, hash);
	if ((await hashExecutableSpecialistSnapshot(value)) !== hash) invalid();
	const s = value as PublishedSpecialistSnapshotV3;
	if (
		![2, 3].includes(s.profileVersion) ||
		!same(s.selector, { id: 'explicit_published_specialist', version: 1 }) ||
		!s.published ||
		!s.slots
	)
		invalid();
	const version = await resolveExecutableVersion(s.published.snapshot, s.published.snapshotHash);
	if (
		!same(s.slots.project_analyst, {
			definition: version.definition,
			assignment: version.definition.instructions.defaultAssignment
		})
	)
		invalid();
	// Reuse the established validator for the immutable reviewer, topology and host instructions.
	const base =
		s.profileVersion === 3 ? buildDocumentEvidenceSnapshotV2() : buildDocumentReadSnapshotV2();
	const { published: _published, ...withoutCatalog } = s;
	const surrogate = {
		...withoutCatalog,
		version: base.version,
		selector: base.selector,
		slots: { ...s.slots, project_analyst: base.slots.project_analyst }
	};
	await parseSpecialistSnapshotV2(surrogate, await hashSpecialistSnapshotV2(surrogate));
	return structuredClone(s);
}
export function publishedSpecialistReferencePrompt(
	snapshot: ExecutableSpecialistSnapshot | undefined
): string {
	return snapshot?.version === PUBLISHED_SPECIALIST_SNAPSHOT_VERSION
		? `\n\n${specialistReferencePromptV1(snapshot.published.snapshot.knowledgePacket.notes)}`
		: '';
}
