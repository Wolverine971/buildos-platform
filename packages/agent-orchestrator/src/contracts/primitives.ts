// packages/agent-orchestrator/src/contracts/primitives.ts
import { z } from 'zod';

import {
	MAX_ARRAY_ITEMS,
	MAX_ARTIFACT_PAYLOAD_BYTES,
	MAX_DESCRIPTION_CHARS,
	MAX_SUMMARY_CHARS
} from './limits';

export type JsonValue =
	| null
	| boolean
	| number
	| string
	| JsonValue[]
	| { [key: string]: JsonValue };

export const NonEmptyStringSchema = z.string().trim().min(1);
export const DescriptionSchema = NonEmptyStringSchema.max(MAX_DESCRIPTION_CHARS);
export const SummarySchema = NonEmptyStringSchema.max(MAX_SUMMARY_CHARS);
export const UuidSchema = z.string().uuid();
export const DateTimeSchema = z.string().datetime({ offset: true });
export const ConfidenceSchema = z.number().min(0).max(1);
export const CanonicalIdSchema = z
	.string()
	.trim()
	.min(1)
	.max(200)
	.regex(/^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)*$/);

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
	z.union([
		z.null(),
		z.boolean(),
		z.number().finite(),
		z.string(),
		z.array(JsonValueSchema),
		z.record(JsonValueSchema)
	])
);

export const JsonObjectSchema = z.record(JsonValueSchema);

function utf8ByteLength(value: string): number {
	let bytes = 0;

	for (let index = 0; index < value.length; index += 1) {
		const codePoint = value.charCodeAt(index);

		if (codePoint < 0x80) {
			bytes += 1;
		} else if (codePoint < 0x800) {
			bytes += 2;
		} else if (codePoint >= 0xd800 && codePoint <= 0xdbff) {
			const next = value.charCodeAt(index + 1);
			if (next >= 0xdc00 && next <= 0xdfff) {
				bytes += 4;
				index += 1;
			} else {
				bytes += 3;
			}
		} else {
			bytes += 3;
		}
	}

	return bytes;
}

export const BoundedJsonValueSchema = JsonValueSchema.refine(
	(value) => utf8ByteLength(JSON.stringify(value)) <= MAX_ARTIFACT_PAYLOAD_BYTES,
	`JSON payload must not exceed ${MAX_ARTIFACT_PAYLOAD_BYTES} bytes`
);

export const StringListSchema = z.array(DescriptionSchema).max(MAX_ARRAY_ITEMS);
