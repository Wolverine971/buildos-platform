export type NormalizedAgentRunAllowedOps = {
	allowedOps: string[] | null;
	error?: string;
};

/** Normalize the optional operation allowlist shared by run and operative inputs. */
export function normalizeAgentRunAllowedOps(input: unknown): NormalizedAgentRunAllowedOps {
	if (input === undefined || input === null) return { allowedOps: null };
	if (!Array.isArray(input)) {
		return { allowedOps: null, error: '`allowed_ops` must be an array of strings' };
	}

	const allowedOps: string[] = [];
	for (const op of input) {
		if (typeof op !== 'string' || !op.trim()) {
			return { allowedOps: null, error: '`allowed_ops` must contain only non-empty strings' };
		}
		allowedOps.push(op.trim());
	}

	return { allowedOps };
}
