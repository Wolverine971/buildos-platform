// packages/shared-agent-ops/src/knowledge/contacts-import.test.ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
	detectContactFileFormat,
	parseContactFile,
	parseCsv,
	parseLinkedInDate,
	planContactImport
} from './contacts-import';
import {
	linkedinKey,
	normalizeEmail,
	normalizePhone,
	normalizeUrl,
	youtubeChannelKey,
	youtubeVideoId
} from './normalize';
import { KNOWLEDGE_KINDS, KNOWLEDGE_PREDICATES } from './vocabulary';

const IPHONE_VCF = [
	'BEGIN:VCARD',
	'VERSION:3.0',
	'PRODID:-//Apple Inc.//iPhone OS 26.1//EN',
	'N:Rivera;Sam;;;',
	'FN:Sam Rivera',
	'ORG:Palantir Technologies;Forward Deployed',
	'TITLE:Engineer',
	'EMAIL;type=INTERNET;type=WORK;type=pref:sam@palantir.example',
	'TEL;type=CELL;type=VOICE;type=pref:(410) 555-0101',
	'item1.URL;type=pref:https://www.linkedin.com/in/sam-rivera-123/',
	'item1.X-ABLabel:_$!<HomePage>!$_',
	'ADR;type=HOME;type=pref:;;12 Main St;Glen Burnie;MD;21061;United States',
	'BDAY;value=date:1604-07-04',
	'NOTE:Met at the Baltimore meetup\\, owes me an intro\\nlong note',
	'END:VCARD',
	'BEGIN:VCARD',
	'VERSION:3.0',
	'FN:Dr. Pat',
	'N:;Pat;;Dr.;',
	'TEL;type=WORK:+44 20 7946 0958',
	'END:VCARD',
	'BEGIN:VCARD',
	'VERSION:2.1',
	'N;ENCODING=QUOTED-PRINTABLE;CHARSET=UTF-8:M=C3=BCller;J=C3=BCrgen;;;',
	'TEL;CELL:4105550199',
	'END:VCARD'
].join('\r\n');

const LINKEDIN_CSV = `Notes:
"When exporting your connection data, you may notice that some of the email addresses are missing. You will only see email addresses for connections who have allowed their connections to see or download their email address using this setting https://www.linkedin.com/psettings/privacy/email. You can learn more about this here https://www.linkedin.com/help/linkedin/answer/261"

First Name,Last Name,URL,Email Address,Company,Position,Connected On
Maya,Chen,https://www.linkedin.com/in/maya-chen,,Palantir,"Deployment Strategist, Commercial",03 Feb 2025
Sam,Rivera,https://www.linkedin.com/in/sam-rivera-123,sam@palantir.example,Palantir Technologies,Engineer,16 Nov 2026
,,,,,,
`;

const GOOGLE_CSV = `First Name,Middle Name,Last Name,Nickname,Birthday,Notes,Organization Name,Organization Title,E-mail 1 - Label,E-mail 1 - Value,Phone 1 - Label,Phone 1 - Value,Website 1 - Label,Website 1 - Value
Jordan,,Lee,JL,1990-05-01,,Acme,CEO,* Work,jordan@acme.example ::: jl@personal.example,Mobile,+1 410-555-0123,Profile,https://linkedin.com/in/jordanlee
`;

describe('normalizers', () => {
	it('normalizes emails, phones and URLs', () => {
		expect(normalizeEmail(' Mailto:Sam@Example.COM ')).toBe('sam@example.com');
		expect(normalizeEmail('not an email')).toBeNull();
		expect(normalizePhone('(410) 555-0101')).toBe('+14105550101');
		expect(normalizePhone('1-410-555-0101')).toBe('+14105550101');
		expect(normalizePhone('+44 20 7946 0958')).toBe('+442079460958');
		expect(normalizePhone('0044 20 7946 0958')).toBe('+442079460958');
		expect(normalizePhone('410-555-0101 ext. 22')).toBe('+14105550101');
		expect(normalizePhone('123')).toBeNull();
		expect(normalizeUrl('WWW.Example.com/About/?utm_source=x&id=2#top')).toBe(
			'https://example.com/About?id=2'
		);
		expect(normalizeUrl('javascript:alert(1)')).toBeNull();
	});

	it('extracts LinkedIn and YouTube identifiers', () => {
		expect(linkedinKey('https://www.linkedin.com/in/Sam-Rivera-123/')).toBe(
			'in/sam-rivera-123'
		);
		expect(linkedinKey('https://example.com/in/sam')).toBeNull();
		expect(youtubeVideoId('https://youtu.be/FeAysJe6FGA?si=abc')).toBe('FeAysJe6FGA');
		expect(youtubeVideoId('https://www.youtube.com/watch?v=FeAysJe6FGA&t=31s')).toBe(
			'FeAysJe6FGA'
		);
		expect(youtubeVideoId('https://youtube.com/shorts/FeAysJe6FGA')).toBe('FeAysJe6FGA');
		expect(youtubeChannelKey('https://www.youtube.com/@Pronskiy/videos')).toBe('@pronskiy');
		expect(youtubeChannelKey('https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv')).toBe(
			'UCabcdefghijklmnopqrstuv'
		);
	});
});

describe('contact file parsing', () => {
	it('detects formats', () => {
		expect(detectContactFileFormat('contacts.vcf', IPHONE_VCF)).toBe('vcard');
		expect(detectContactFileFormat('Connections.csv', LINKEDIN_CSV)).toBe('linkedin_csv');
		expect(detectContactFileFormat('contacts.csv', GOOGLE_CSV)).toBe('google_csv');
		expect(detectContactFileFormat('random.csv', 'a,b,c\n1,2,3')).toBeNull();
	});

	it('parses iPhone vCards including labels, escapes, birthdays and quoted-printable', () => {
		const parsed = parseContactFile('contacts.vcf', IPHONE_VCF)!;
		expect(parsed.format).toBe('vcard');
		expect(parsed.contacts).toHaveLength(3);
		const [sam, pat, jurgen] = parsed.contacts;
		expect(sam).toMatchObject({
			name: 'Sam Rivera',
			givenName: 'Sam',
			familyName: 'Rivera',
			org: 'Palantir Technologies',
			title: 'Engineer',
			linkedinUrl: 'https://www.linkedin.com/in/sam-rivera-123/',
			birthday: '--07-04'
		});
		expect(sam!.emails).toEqual([{ value: 'sam@palantir.example', label: 'work' }]);
		expect(sam!.phones).toEqual([{ value: '(410) 555-0101', label: 'cell' }]);
		expect(sam!.urls[0]).toMatchObject({ label: 'homepage' });
		expect(sam!.addresses[0]!.value).toBe('12 Main St, Glen Burnie, MD, 21061, United States');
		expect(sam!.note).toBe('Met at the Baltimore meetup, owes me an intro\nlong note');
		expect(pat!.name).toBe('Dr. Pat');
		expect(jurgen!.name).toBe('Jürgen Müller');
	});

	it('joins multi-line quoted-printable values and names email-only contacts', () => {
		const parsed = parseContactFile(
			'contacts.vcf',
			[
				'BEGIN:VCARD',
				'VERSION:2.1',
				'FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Zo=C3=A9 Ren=C3=A9',
				'NOTE;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:line one=0D=0A=',
				'line two',
				'END:VCARD',
				'BEGIN:VCARD',
				'VERSION:3.0',
				'EMAIL:only@example.com',
				'END:VCARD'
			].join('\r\n')
		);
		expect(parsed.contacts[0]).toMatchObject({
			name: 'Zoé René',
			note: 'line one\r\nline two'
		});
		expect(parsed.contacts[1]!.name).toBe('only@example.com');
	});

	it('parses LinkedIn Connections.csv past the notes preamble', () => {
		const parsed = parseContactFile('Connections.csv', LINKEDIN_CSV)!;
		expect(parsed.contacts).toHaveLength(2);
		expect(parsed.contacts[0]).toMatchObject({
			name: 'Maya Chen',
			org: 'Palantir',
			title: 'Deployment Strategist, Commercial',
			connectedOn: '2025-02-03',
			linkedinUrl: 'https://www.linkedin.com/in/maya-chen',
			emails: []
		});
		expect(parsed.contacts[1]!.emails).toEqual([{ value: 'sam@palantir.example' }]);
	});

	it('parses Google Contacts CSV with multi-value cells', () => {
		const parsed = parseContactFile('contacts.csv', GOOGLE_CSV)!;
		const jordan = parsed.contacts[0]!;
		expect(jordan).toMatchObject({
			name: 'Jordan Lee',
			nickname: 'JL',
			org: 'Acme',
			title: 'CEO',
			birthday: '1990-05-01'
		});
		expect(jordan.emails.map((e) => e.value)).toEqual([
			'jordan@acme.example',
			'jl@personal.example'
		]);
		expect(jordan.emails[0]!.label).toBe('work');
		expect(jordan.linkedinUrl).toBe('https://linkedin.com/in/jordanlee');
	});

	it('handles quoted CSV fields with commas, quotes and newlines', () => {
		expect(parseCsv('a,"b, c","d ""e""","f\ng"\n1,2,3,4')).toEqual([
			['a', 'b, c', 'd "e"', 'f\ng'],
			['1', '2', '3', '4']
		]);
		expect(parseLinkedInDate('3 Feb 2025')).toBe('2025-02-03');
		expect(parseLinkedInDate('11/16/26')).toBe('2026-11-16');
	});
});

describe('planContactImport', () => {
	it('makes each contact a person the user knows, with keys and an employer', () => {
		const parsed = parseContactFile('Connections.csv', LINKEDIN_CSV)!;
		const batch = planContactImport(parsed.contacts, {
			format: parsed.format,
			sourceRef: 'src'
		});
		const people = batch.entities.filter((e) => e.kind === 'person' && !e.self);
		const orgs = batch.entities.filter((e) => e.kind === 'org');
		expect(people.map((p) => p.name)).toEqual(['Maya Chen', 'Sam Rivera']);
		expect(orgs.map((o) => o.name)).toEqual(['Palantir', 'Palantir Technologies']);
		expect(people[1]!.keys).toEqual([
			{ type: 'email', value: 'sam@palantir.example' },
			{ type: 'linkedin', value: 'https://www.linkedin.com/in/sam-rivera-123' }
		]);
		const knows = batch.facts.filter((f) => f.predicate === 'knows');
		expect(knows).toHaveLength(2);
		expect(knows[0]).toMatchObject({
			subject: 'self',
			qualifiers: { via: 'linkedin', since: '2025-02-03' },
			sources: ['src']
		});
		const worksAt = batch.facts.find(
			(f) => f.predicate === 'works_at' && f.subject === people[0]!.ref
		);
		expect(worksAt).toMatchObject({
			qualifiers: { title: 'Deployment Strategist, Commercial', current: true }
		});
		expect(people[0]!.summary).toBe('Deployment Strategist, Commercial at Palantir');
	});

	it('reuses one org entity for contacts at the same company and labels phone contacts', () => {
		const parsed = parseContactFile('contacts.vcf', IPHONE_VCF)!;
		const batch = planContactImport(
			[...parsed.contacts, { ...parsed.contacts[0]!, name: 'Other Person' }],
			{
				format: 'vcard'
			}
		);
		expect(batch.entities.filter((e) => e.kind === 'org')).toHaveLength(1);
		expect(batch.facts.find((f) => f.predicate === 'knows')!.qualifiers).toMatchObject({
			via: 'phone'
		});
		expect(batch.facts.some((f) => f.predicate === 'birthday' && f.value === '--07-04')).toBe(
			true
		);
	});
});

describe('vocabulary', () => {
	it('matches the kinds and predicates seeded by the migration', () => {
		// The original seed plus later migrations that add predicates.
		const sql = [
			'20261116230000_knowledge_graph.sql',
			'20261118120000_knowledge_educated_at.sql'
		]
			.map((file) =>
				readFileSync(
					fileURLToPath(
						new URL(`../../../../supabase/migrations/${file}`, import.meta.url)
					),
					'utf8'
				)
			)
			.join('\n');
		const kindKeys = [
			...sql.matchAll(
				/^\t\('([a-z_]+)', '[^']+', '[^']+', '(?:[^']|'')+', (?:true|false), \d+\)/gm
			)
		].map((m) => m[1]);
		expect(kindKeys.sort()).toEqual([...KNOWLEDGE_KINDS].sort());

		const predicateRows = [
			...sql.matchAll(
				/^\t\('([a-z_]+)', '(?:[^']|'')+', (?:NULL|'(?:[^']|'')+'), '(?:[^']|'')+', '([a-z]+)', '\{([a-z,]*)\}', '\{([a-z,]*)\}', '(one|many)', '\{([a-z,]*)\}', '\{([a-z,]*)\}', \d+\)/gm
			)
		];
		expect(predicateRows.length).toBe(KNOWLEDGE_PREDICATES.length);
		for (const [
			,
			key,
			valueType,
			subjects,
			objects,
			cardinality,
			shareable,
			qualifiers
		] of predicateRows) {
			const def = KNOWLEDGE_PREDICATES.find((p) => p.key === key);
			expect(def, key).toBeTruthy();
			const list = (s: string | undefined) => (s ? s.split(',') : []);
			expect({
				key,
				valueType,
				subjects: list(subjects),
				objects: list(objects),
				cardinality,
				shareable: list(shareable),
				qualifiers: list(qualifiers)
			}).toEqual({
				key,
				valueType: def!.valueType,
				subjects: [...def!.subjectKinds],
				objects: [...def!.objectKinds],
				cardinality: def!.cardinality,
				shareable: [...def!.shareableSubjectKinds],
				qualifiers: [...def!.qualifierKeys]
			});
		}
	});
});
