export function serializeJsonLd(data: unknown): string {
	const serialized = JSON.stringify(data);
	return serialized ? serialized.replace(/</g, '\\u003c') : 'null';
}

export function escapeSerializedJsonLd(json: string): string {
	return json.replace(/</g, '\\u003c');
}
