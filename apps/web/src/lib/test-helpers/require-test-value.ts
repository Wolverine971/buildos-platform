/** Assert that a fixture, captured call, or query result exists before inspecting it. */
export function requireTestValue<T>(value: T | null | undefined): T {
	if (value === null || value === undefined) {
		throw new Error('Expected a test value to be present');
	}
	return value;
}
