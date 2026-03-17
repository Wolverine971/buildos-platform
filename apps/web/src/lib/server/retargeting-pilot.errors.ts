export function getRetargetingValidationMessage(error: unknown): string | null {
	if (!(error instanceof Error)) {
		return null;
	}

	const message = error.message.trim();
	if (!message) {
		return null;
	}

	if (
		message.includes(' is required') ||
		message.includes(' must be an absolute URL') ||
		message.includes('must be updated')
	) {
		return message;
	}

	return null;
}

export function getRetargetingConflictMessage(error: unknown): string | null {
	if (!(error instanceof Error)) {
		return null;
	}

	return error.message.includes('already exists') ? error.message : null;
}
