// Minimal client layout - just passes through server data
export const load = async ({ data }) => {
	return {
		...data
	};
};
