// apps/web/src/lib/utils/document-outline.test.ts
import { describe, it, expect } from 'vitest';
import {
	extractOutline,
	getSectionByAnchor,
	hashDocumentContent,
	isOutlineStale,
	type DocOutlineNode
} from './document-outline';

function flatten(nodes: DocOutlineNode[], acc: DocOutlineNode[] = []): DocOutlineNode[] {
	for (const n of nodes) {
		acc.push(n);
		if (n.children) flatten(n.children, acc);
	}
	return acc;
}

describe('extractOutline', () => {
	it('returns an empty outline for null/empty content', () => {
		for (const input of [null, undefined, '', '   \n\t']) {
			const outline = extractOutline(input);
			expect(outline.version).toBe(1);
			expect(outline.nodes).toEqual([]);
			expect(outline.content_hash).toBe(hashDocumentContent(input ?? ''));
		}
	});

	it('builds a nested tree mirroring heading hierarchy', () => {
		const md = `# Title

Intro.

## Section A
Body of A.

### Sub A1
Sub body.

## Section B
End.`;
		const { nodes } = extractOutline(md);
		expect(nodes).toHaveLength(1);
		expect(nodes[0]).toMatchObject({ level: 1, text: 'Title', anchor: 'title' });

		const top = nodes[0].children ?? [];
		expect(top.map((n) => n.text)).toEqual(['Section A', 'Section B']);

		const sectionA = top[0];
		expect(sectionA.children?.map((n) => n.text)).toEqual(['Sub A1']);
		expect(sectionA.children?.[0].level).toBe(3);
		// Section B has no children
		expect(top[1].children).toBeUndefined();
	});

	it('produces anchors that match gfm heading ids (incl. dedupe)', () => {
		const md = `# Hello World\n\n## Hello World\n`;
		const flat = flatten(extractOutline(md).nodes);
		expect(flat.map((n) => n.anchor)).toEqual(['hello-world', 'hello-world-1']);
	});

	it('ignores "#" inside fenced code blocks', () => {
		const md = `# Real Heading

\`\`\`
# not a heading
## also not
\`\`\`

## Second Real`;
		const flat = flatten(extractOutline(md).nodes);
		expect(flat.map((n) => n.text)).toEqual(['Real Heading', 'Second Real']);
	});

	it('computes char ranges that slice the correct section body', () => {
		const md = `# A
alpha

## B
bravo

## C
charlie`;
		const flat = flatten(extractOutline(md).nodes);
		const b = flat.find((n) => n.text === 'B')!;
		const slice = md.slice(b.char_start, b.char_end);
		expect(slice).toContain('## B');
		expect(slice).toContain('bravo');
		expect(slice).not.toContain('charlie');
		expect(slice).not.toContain('## C');
	});

	it('section char_end of a parent spans its children', () => {
		const md = `# Parent
p body

## Child
c body

# Next`;
		const flat = flatten(extractOutline(md).nodes);
		const parent = flat.find((n) => n.text === 'Parent')!;
		const slice = md.slice(parent.char_start, parent.char_end);
		// Parent section runs until the next h1, so it includes its child section.
		expect(slice).toContain('## Child');
		expect(slice).toContain('c body');
		expect(slice).not.toContain('# Next');
	});

	it('counts words of own body excluding child sections', () => {
		const md = `# Parent
one two three

## Child
four five`;
		const flat = flatten(extractOutline(md).nodes);
		const parent = flat.find((n) => n.text === 'Parent')!;
		const child = flat.find((n) => n.text === 'Child')!;
		expect(parent.word_count).toBe(3); // "one two three", not the child's words
		expect(child.word_count).toBe(2);
	});

	it('handles skipped heading levels without crashing', () => {
		const md = `# Top\n\n### Deep\n\n## Mid`;
		const { nodes } = extractOutline(md);
		expect(nodes).toHaveLength(1);
		const children = nodes[0].children ?? [];
		expect(children.map((n) => n.text)).toEqual(['Deep', 'Mid']);
	});

	it('content_hash depends only on content', () => {
		const a = extractOutline('# Same\nbody');
		const b = extractOutline('# Same\nbody');
		expect(a.content_hash).toBe(b.content_hash);
		expect(extractOutline('# Other').content_hash).not.toBe(a.content_hash);
	});
});

describe('getSectionByAnchor', () => {
	const md = `# Marketing

intro

## Channels
channel body

### Instagram
ig body

## Budget
budget body`;

	it('returns a leaf section without bleeding into siblings', () => {
		const section = getSectionByAnchor(md, 'instagram');
		expect(section.found).toBe(true);
		expect(section.heading).toBe('Instagram');
		expect(section.level).toBe(3);
		expect(section.content).toContain('### Instagram');
		expect(section.content).toContain('ig body');
		expect(section.content).not.toContain('## Budget');
	});

	it('includes nested subsections when reading a parent section', () => {
		const section = getSectionByAnchor(md, 'channels');
		expect(section.found).toBe(true);
		expect(section.content).toContain('channel body');
		expect(section.content).toContain('### Instagram'); // child included
		expect(section.content).toContain('ig body');
		expect(section.content).not.toContain('## Budget'); // sibling excluded
	});

	it('reports not found for an unknown anchor', () => {
		const section = getSectionByAnchor(md, 'does-not-exist');
		expect(section.found).toBe(false);
		expect(section.content).toBe('');
		expect(section.heading).toBeNull();
	});

	it('reflects live edits (re-parses, never trusts stale ranges)', () => {
		const edited = md.replace('ig body', 'ig body EDITED with extra words');
		const section = getSectionByAnchor(edited, 'instagram');
		expect(section.content).toContain('EDITED with extra words');
	});
});

describe('isOutlineStale', () => {
	it('is stale when missing', () => {
		expect(isOutlineStale(null, '# x')).toBe(true);
		expect(isOutlineStale(undefined, '# x')).toBe(true);
	});

	it('is fresh when hash matches current content', () => {
		const content = '# x\nbody';
		const outline = extractOutline(content);
		expect(isOutlineStale(outline, content)).toBe(false);
	});

	it('is stale when content changed', () => {
		const outline = extractOutline('# x\nbody');
		expect(isOutlineStale(outline, '# x\nbody edited')).toBe(true);
	});
});
