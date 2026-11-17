// apps/worker/src/workers/knowledge/documentEntityText.ts
//
// Turns a document's markdown into plain text chunks for the local NER model (tasker 165).
// Structural cleanup only: code, URLs, images, HTML and markdown markers go; words stay.
// Nothing here decides what the words mean; the trained model does that.

/** BERT reads 512 word pieces; ~1,200 characters of prose stays under that. */
export const DOCUMENT_NER_CHUNK_CHARS = 1200;
/** Longer documents are read up to here (≈ 8 s on one CPU thread). */
export const DOCUMENT_NER_MAX_CHARS = 100_000;

export interface DocumentNerText {
	/** Plain-text chunks in document order. */
	chunks: string[];
	/** The title and every markdown heading, cleaned the same way. */
	headings: string[];
}

function cleanInline(line: string): string {
	return line
		.replace(/`[^`\n]*`/g, ' ')
		.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
		.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/\[\[([^\]|]*)(\|[^\]]*)?\]\]/g, '$1')
		.replace(/<https?:[^>]*>/g, ' ')
		.replace(/https?:\/\/\S+/g, ' ')
		.replace(/<\/?[a-z][^>]*>/gi, ' ')
		.replace(/(\*\*|__|~~)(?=\S)(.*?\S)\1/g, '$2')
		.replace(/(^|[\s(])[*_](?=\S)([^*_\n]*?\S)[*_](?=[\s).,;:!?]|$)/g, '$1$2')
		.replace(/[ \t\u00a0]+/g, ' ')
		.trim();
}

/** Split a long paragraph at the last space before the limit. */
function splitLong(text: string, max: number): string[] {
	const out: string[] = [];
	let rest = text;
	while (rest.length > max) {
		const cut = rest.lastIndexOf(' ', max);
		const at = cut > max / 2 ? cut : max;
		out.push(rest.slice(0, at).trim());
		rest = rest.slice(at).trim();
	}
	if (rest) out.push(rest);
	return out;
}

export function documentNerText(
	title: string,
	content: string | null,
	options: { chunkChars?: number; maxChars?: number } = {}
): DocumentNerText {
	const chunkChars = options.chunkChars ?? DOCUMENT_NER_CHUNK_CHARS;
	const maxChars = options.maxChars ?? DOCUMENT_NER_MAX_CHARS;
	const headings: string[] = [];
	const paragraphs: string[] = [];
	const cleanTitle = cleanInline(title ?? '');
	if (cleanTitle) {
		headings.push(cleanTitle);
		paragraphs.push(cleanTitle);
	}

	const body = (content ?? '').replace(/\r\n?/g, '\n').replace(/```[\s\S]*?(```|$)/g, '\n');
	let paragraph: string[] = [];
	const flush = () => {
		// Lines keep their breaks: in notes a new line is usually a new item, and the reader
		// never lets a name run across one.
		if (paragraph.length) paragraphs.push(paragraph.join('\n'));
		paragraph = [];
	};
	for (const raw of body.split('\n')) {
		const line = raw.trim();
		if (!line) {
			flush();
			continue;
		}
		// Table separator rows and horizontal rules.
		if (/^\|?[\s:|-]+\|?$/.test(line) && line.includes('-')) continue;
		const heading = /^#{1,6}\s+(.*)$/.exec(line);
		if (heading) {
			flush();
			const text = cleanInline(heading[1] ?? '');
			if (text) {
				headings.push(text);
				paragraphs.push(text);
			}
			continue;
		}
		// Table rows: each cell is its own phrase.
		if (line.startsWith('|')) {
			flush();
			const cells = line
				.split('|')
				.map((cell) => cleanInline(cell))
				.filter((cell) => /\p{L}/u.test(cell));
			if (cells.length) paragraphs.push(cells.join(' ; '));
			continue;
		}
		const item = line
			.replace(/^(?:[-*+]|\d{1,3}[.)])\s+(?:\[[ xX]\]\s+)?/, '')
			.replace(/^>\s?/, '');
		const text = cleanInline(item);
		if (!text) continue;
		// List items and quotes are their own sentences.
		if (item !== line) {
			flush();
			paragraphs.push(text);
		} else {
			paragraph.push(text);
		}
	}
	flush();

	const chunks: string[] = [];
	let current = '';
	let total = 0;
	for (const para of paragraphs.flatMap((p) => splitLong(p, chunkChars))) {
		if (total + para.length > maxChars) break;
		total += para.length + 1;
		if (current && current.length + para.length + 1 > chunkChars) {
			chunks.push(current);
			current = '';
		}
		current = current ? `${current}\n${para}` : para;
	}
	if (current) chunks.push(current);
	return { chunks, headings };
}
