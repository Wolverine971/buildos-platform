// apps/web/src/lib/components/people/project-arrival.ts
// Every entrance opens the project first. Its authenticated page supplies the name.
export type ProjectArrivalStatus = 'joined' | 'rejoined' | 'already_member';

export function projectArrivalHref(
	projectId: string,
	status: ProjectArrivalStatus = 'joined'
): string {
	return `/projects/${encodeURIComponent(projectId)}${status === 'already_member' ? '' : '?joined=1'}`;
}

export function projectArrivalMessage(
	projectName: string | null | undefined,
	status: ProjectArrivalStatus = 'joined'
): string {
	const name = projectName?.trim() || 'this project';
	return status === 'already_member' ? `You’re already in ${name}` : `You joined ${name}`;
}
