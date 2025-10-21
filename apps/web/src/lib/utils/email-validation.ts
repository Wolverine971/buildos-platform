// apps/web/src/lib/utils/email-validation.ts
import { z } from 'zod';

/**
 * Comprehensive email validation schema using Zod
 *
 * Security features:
 * - RFC 5321 compliant (max 254 chars total, max 64 chars local part)
 * - Prevents SMTP header injection via \r and \n characters
 * - Normalizes to lowercase
 * - Validates email format
 *
 * @see /thoughts/shared/research/2025-10-21_00-00-00_input-validation-security-audit.md
 */
export const emailSchema = z
	.string()
	.email('Please enter a valid email address')
	.max(254, 'Email address is too long (maximum 254 characters)')
	.toLowerCase()
	.refine((email) => !email.includes('\r') && !email.includes('\n'), {
		message: 'Email contains invalid characters'
	})
	.refine(
		(email) => {
			const parts = email.split('@');
			return parts.length === 2 && parts[0] && parts[0].length <= 64;
		},
		{
			message: 'Email format is invalid (local part must be 64 characters or less)'
		}
	);

/**
 * Optional email schema - allows empty string or null, but validates if provided
 */
export const optionalEmailSchema = z
	.string()
	.optional()
	.refine(
		(email) => {
			if (!email || email.trim() === '') return true;
			const result = emailSchema.safeParse(email);
			return result.success;
		},
		{
			message: 'Please enter a valid email address'
		}
	);

/**
 * Validate an email address
 *
 * @param email - Email address to validate
 * @returns { success: boolean, email?: string, error?: string }
 */
export function validateEmail(email: string): {
	success: boolean;
	email?: string;
	error?: string;
} {
	const result = emailSchema.safeParse(email);

	if (result.success) {
		return {
			success: true,
			email: result.data
		};
	}

	return {
		success: false,
		error: result.error.errors[0]?.message || 'Invalid email address'
	};
}

/**
 * Validate an optional email address
 *
 * @param email - Email address to validate (can be undefined, null, or empty string)
 * @returns { success: boolean, email?: string | null, error?: string }
 */
export function validateOptionalEmail(email?: string | null): {
	success: boolean;
	email?: string | null;
	error?: string;
} {
	// If no email provided, that's valid for optional fields
	if (!email || email.trim() === '') {
		return {
			success: true,
			email: null
		};
	}

	// Otherwise, validate as normal email
	return validateEmail(email);
}

/**
 * Quick check if email is valid (returns boolean only)
 *
 * @param email - Email address to check
 * @returns boolean
 */
export function isValidEmail(email: string): boolean {
	return emailSchema.safeParse(email).success;
}
