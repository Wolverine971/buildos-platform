// apps/web/src/lib/components/project/project-sharing-copy.ts
//
// Plain wording for the people on a shared project. Shared by the delete confirmation,
// the Projects trash, and account deletion's shared-projects step so they read alike.

/** "1 person" / "3 people". */
export function countPeople(count: number): string {
	return count === 1 ? '1 person' : `${count} people`;
}

/** Names as a phrase: "Sam", "Sam and Lee", "Sam, Lee, and Ana", "Sam, Lee, Ana, and 2 more". */
export function formatPeopleList(names: readonly string[], max = 3): string {
	if (names.length === 0) return '';
	if (names.length > max) {
		return `${names.slice(0, max).join(', ')}, and ${names.length - max} more`;
	}
	if (names.length === 1) return names[0] ?? '';
	if (names.length === 2) return `${names[0]} and ${names[1]}`;
	return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

/** What to call a person: their name, else their email, else the fallback. */
export function personLabel(
	name: string | null | undefined,
	email: string | null | undefined,
	fallback = 'Someone'
): string {
	return name?.trim() || email?.trim() || fallback;
}
