// apps/worker/src/workers/knowledge/documentNer.ts
//
// Free local named-entity recognition for documents (tasker 165): a BERT model fine-tuned on
// CoNLL-2003 (PER / ORG / LOC / MISC), run on the CPU through transformers.js + onnxruntime-node
// (already shipped with the worker for Kokoro TTS). No network call after the one-time model
// download (~109 MB, quantized), no per-document cost.
//
// The model is loaded lazily, once per process, so workers that never read documents never pay
// its ~150 MB of memory. One CPU thread by default (≈ 0.85 s per 10,000 characters measured on
// DJ's documents) so a backfill never starves the other queues; KNOWLEDGE_NER_THREADS raises it.

import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const DOCUMENT_NER_MODEL = 'Xenova/bert-base-NER';
export const DOCUMENT_NER_DTYPE = 'q8';

export type NerLabel = 'PER' | 'ORG' | 'LOC' | 'MISC';

export interface NerSpan {
	type: NerLabel;
	/** The exact characters of the chunk the model marked. */
	text: string;
	/** Mean softmax probability of the span's word labels. */
	score: number;
	chunk: number;
	start: number;
	end: number;
	/** The span was completed to (or matches) a name the user already has an entry for. */
	known?: boolean;
}

export interface DocumentNer {
	model: string;
	extract(chunks: string[]): Promise<NerSpan[]>;
}

/** Per token: the winning label index and its probability. */
export interface TokenLabel {
	token: string;
	label: string;
	prob: number;
}

/**
 * Pure: word-piece labels → spans with character offsets. The cased model's tokens appear
 * verbatim in the text, so walking a cursor through the chunk finds each one. A word takes the
 * label of its first piece; B-X starts a span, I-X of the same type continues it.
 */
export function spansFromTokenLabels(chunk: string, tokens: TokenLabel[], index = 0): NerSpan[] {
	const spans: NerSpan[] = [];
	let cursor = 0;
	let open: { type: NerLabel; start: number; end: number; probs: number[] } | null = null;
	const close = () => {
		if (open) {
			spans.push({
				type: open.type,
				text: chunk.slice(open.start, open.end),
				score: open.probs.reduce((sum, p) => sum + p, 0) / open.probs.length,
				chunk: index,
				start: open.start,
				end: open.end
			});
		}
		open = null;
	};
	for (const { token, label, prob } of tokens) {
		if (token === '[CLS]' || token === '[SEP]' || token === '[PAD]') continue;
		if (token === '[UNK]') {
			close();
			continue;
		}
		const piece = token.startsWith('##') ? token.slice(2) : token;
		const start = chunk.indexOf(piece, cursor);
		if (start < 0) continue;
		// A name never runs across a line break or a list/cell separator ("Logan / Redline").
		if (chunk.slice(cursor, start).includes('\n')) close();
		cursor = start + piece.length;
		if (token.startsWith('##')) {
			if (open) open.end = cursor;
			continue;
		}
		if (label === 'O' || label.length < 3 || SEPARATORS.has(piece)) {
			close();
			continue;
		}
		const type = label.slice(2) as NerLabel;
		if (label.startsWith('I-') && open && open.type === type) {
			open.end = cursor;
			open.probs.push(prob);
		} else {
			close();
			open = { type, start, end: cursor, probs: [prob] };
		}
	}
	close();
	return spans;
}

const SEPARATORS = new Set(['/', ';', '|', '•', '·']);

let shared: Promise<DocumentNer> | null = null;

/** The process-wide reader; the first call downloads (once) and loads the model. */
export function loadDocumentNer(
	options: { cacheDir?: string; threads?: number } = {}
): Promise<DocumentNer> {
	if (!shared) {
		shared = createDocumentNer(options).catch((error) => {
			shared = null;
			throw error;
		});
	}
	return shared;
}

async function createDocumentNer(options: {
	cacheDir?: string;
	threads?: number;
}): Promise<DocumentNer> {
	const tf = await import('@huggingface/transformers');
	tf.env.cacheDir =
		options.cacheDir ??
		process.env.KNOWLEDGE_NER_CACHE_DIR ??
		join(tmpdir(), 'buildos-ner-models');
	const threads = Math.max(1, options.threads ?? Number(process.env.KNOWLEDGE_NER_THREADS || 1));
	const tokenizer = await tf.AutoTokenizer.from_pretrained(DOCUMENT_NER_MODEL);
	const model = await tf.AutoModelForTokenClassification.from_pretrained(DOCUMENT_NER_MODEL, {
		dtype: DOCUMENT_NER_DTYPE,
		device: 'cpu',
		session_options: { intraOpNumThreads: threads, interOpNumThreads: 1 }
	});
	const id2label = (model.config as unknown as { id2label: Record<number, string> }).id2label;
	const vocab: string[] = (tokenizer as unknown as { model: { vocab: string[] } }).model.vocab;

	return {
		model: DOCUMENT_NER_MODEL,
		async extract(chunks: string[]): Promise<NerSpan[]> {
			const spans: NerSpan[] = [];
			for (let index = 0; index < chunks.length; index++) {
				const chunk = chunks[index]!;
				const inputs = await tokenizer(chunk, { truncation: true, max_length: 512 });
				const { logits } = await model(inputs);
				const [, length, labels] = logits.dims as number[];
				const data = logits.data as Float32Array;
				const ids = Array.from(inputs.input_ids.data as ArrayLike<bigint | number>, Number);
				const tokens: TokenLabel[] = [];
				for (let i = 0; i < length!; i++) {
					let best = 0;
					let max = -Infinity;
					for (let j = 0; j < labels!; j++) {
						const v = data[i * labels! + j]!;
						if (v > max) {
							max = v;
							best = j;
						}
					}
					let sum = 0;
					for (let j = 0; j < labels!; j++) sum += Math.exp(data[i * labels! + j]! - max);
					tokens.push({
						token: vocab[ids[i]!] ?? '[UNK]',
						label: id2label[best] ?? 'O',
						prob: 1 / sum
					});
				}
				spans.push(...spansFromTokenLabels(chunk, tokens, index));
			}
			return spans;
		}
	};
}
