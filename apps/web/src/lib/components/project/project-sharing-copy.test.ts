// apps/web/src/lib/components/project/project-sharing-copy.test.ts
import { describe, expect, it } from 'vitest';
import { countPeople, formatPeopleList, personLabel } from './project-sharing-copy';

describe('project sharing copy', () => {
	it('counts people in plain words', () => {
		expect(countPeople(1)).toBe('1 person');
		expect(countPeople(4)).toBe('4 people');
	});

	it('names up to three people, then says how many more', () => {
		expect(formatPeopleList([])).toBe('');
		expect(formatPeopleList(['Sam'])).toBe('Sam');
		expect(formatPeopleList(['Sam', 'Lee'])).toBe('Sam and Lee');
		expect(formatPeopleList(['Sam', 'Lee', 'Ana'])).toBe('Sam, Lee, and Ana');
		expect(formatPeopleList(['Sam', 'Lee', 'Ana', 'Bo', 'Cy'])).toBe(
			'Sam, Lee, Ana, and 2 more'
		);
	});

	it('falls back from name to email to a placeholder', () => {
		expect(personLabel('Sam', 'sam@example.com')).toBe('Sam');
		expect(personLabel('  ', 'sam@example.com')).toBe('sam@example.com');
		expect(personLabel(null, null)).toBe('Someone');
	});
});
