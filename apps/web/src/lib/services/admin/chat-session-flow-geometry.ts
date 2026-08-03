export type SessionFlowBarPosition = {
	left: string;
	width?: string;
};

function clampPercentage(value: number): number {
	return Math.min(100, Math.max(0, value));
}

function formatPercentage(value: number): string {
	return `${Number(value.toFixed(6))}%`;
}

export function sessionFlowBarPosition(params: {
	start: number;
	length: number;
	total: number;
	minWidthPercent: number;
	isPoint?: boolean;
}): SessionFlowBarPosition {
	const scale = Math.max(params.total, Number.EPSILON);
	const left = clampPercentage((params.start / scale) * 100);
	if (params.isPoint) return { left: formatPercentage(left) };

	const naturalWidth = Math.max(0, (params.length / scale) * 100);
	const remainingWidth = 100 - left;
	const width = Math.min(remainingWidth, Math.max(params.minWidthPercent, naturalWidth));
	return { left: formatPercentage(left), width: formatPercentage(width) };
}
