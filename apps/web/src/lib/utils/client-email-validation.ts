// apps/web/src/lib/utils/client-email-validation.ts
/**
 * Client-side email validation for better UX
 *
 * This provides instant feedback to users before they submit forms.
 * Backend validation is still required for security (never trust the client).
 *
 * Uses the same validation logic as the backend for consistency.
 *
 * @see /lib/utils/email-validation.ts - Backend validation (authoritative)
 * @see /thoughts/shared/research/2025-10-21_00-00-00_input-validation-security-audit.md
 */

/**
 * Validate an email address on the client side
 *
 * @param email - Email address to validate
 * @returns { valid: boolean, error?: string }
 */
export function validateEmailClient(email: string): {
	valid: boolean;
	error?: string;
} {
	// Check if empty
	if (!email || email.trim() === '') {
		return {
			valid: false,
			error: 'Email address is required'
		};
	}

	// Check length (RFC 5321 limit)
	if (email.length > 254) {
		return {
			valid: false,
			error: 'Email address is too long (maximum 254 characters)'
		};
	}

	// Check for SMTP header injection characters
	if (email.includes('\r') || email.includes('\n')) {
		return {
			valid: false,
			error: 'Email contains invalid characters'
		};
	}

	// Basic email format validation
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	if (!emailRegex.test(email)) {
		return {
			valid: false,
			error: 'Please enter a valid email address'
		};
	}

	// Validate local part length (RFC 5321: max 64 chars before @)
	const parts = email.split('@');
	if (parts.length !== 2) {
		return {
			valid: false,
			error: 'Email format is invalid'
		};
	}

	if (parts[0]!.length > 64) {
		return {
			valid: false,
			error: 'Email format is invalid (local part must be 64 characters or less)'
		};
	}

	// More strict email validation
	const strictEmailRegex =
		/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
	if (!strictEmailRegex.test(email)) {
		return {
			valid: false,
			error: 'Please enter a valid email address'
		};
	}

	return {
		valid: true
	};
}

/**
 * Validate an optional email address
 *
 * @param email - Email address to validate (can be empty/undefined)
 * @returns { valid: boolean, error?: string }
 */
export function validateOptionalEmailClient(email?: string): {
	valid: boolean;
	error?: string;
} {
	// Empty is valid for optional fields
	if (!email || email.trim() === '') {
		return {
			valid: true
		};
	}

	// Otherwise validate as normal
	return validateEmailClient(email);
}

/**
 * Quick check if email is valid (returns boolean only)
 *
 * @param email - Email address to check
 * @returns boolean
 */
export function isValidEmailClient(email: string): boolean {
	return validateEmailClient(email).valid;
}

/**
 * Get a user-friendly error message for an email validation error
 *
 * @param email - Email address that failed validation
 * @returns string - User-friendly error message
 */
export function getEmailErrorMessage(email: string): string {
	const result = validateEmailClient(email);
	return result.error || 'Invalid email address';
}
