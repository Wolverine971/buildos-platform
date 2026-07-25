export interface WebResearchPort {
	search?: (args: Record<string, unknown>) => Promise<unknown>;
	visit?: (args: Record<string, unknown>) => Promise<unknown>;
}
