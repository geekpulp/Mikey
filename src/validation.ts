/**
 * Validation schemas for PRD data structures using Zod
 */
import { z } from 'zod';
import { Status, CATEGORIES } from './constants';

/**
 * Schema for a PRD step (can be string or object with text and completed)
 */
export const StepSchema = z.union([
	z.string().min(1, 'Step text cannot be empty'),
	z.object({
		text: z.string().min(1, 'Step text cannot be empty'),
		completed: z.boolean()
	})
]);

/**
 * Schema for a complete PRD item
 */
export const PrdItemSchema = z.object({
	id: z.string()
		.regex(/^[a-zA-Z]+-\d{3}$/, 'ID must be in format "category-XXX" (e.g., "ui-001")'),
	category: z.enum(CATEGORIES as [string, ...string[]]),
	description: z.string()
		.min(10, 'Description must be at least 10 characters')
		.max(500, 'Description must be at most 500 characters'),
	steps: z.array(StepSchema),
	status: z.nativeEnum(Status),
	passes: z.boolean()
});

/**
 * Schema for the entire PRD file (array of items)
 */
export const PrdFileSchema = z.array(PrdItemSchema);

/**
 * Type definitions inferred from schemas
 */
export type Step = z.infer<typeof StepSchema>;
export type PrdItem = z.infer<typeof PrdItemSchema>;
export type PrdFile = z.infer<typeof PrdFileSchema>;

/**
 * Validation result type
 */
export interface ValidationResult<T> {
	success: boolean;
	data?: T;
	error?: string;
	errors?: Array<{ path: string; message: string }>;
}

/**
 * Validates PRD file content
 */
export function validatePrdFile(data: unknown): ValidationResult<PrdFile> {
	const result = PrdFileSchema.safeParse(data);
	
	if (result.success) {
		return {
			success: true,
			data: result.data
		};
	}
	
	const errors = result.error.issues.map((err: any) => ({
		path: err.path.join('.'),
		message: err.message
	}));
	
	return {
		success: false,
		error: `PRD file validation failed: ${errors.map((e: any) => `${e.path}: ${e.message}`).join('; ')}`,
		errors
	};
}

/**
 * Validates a single PRD item
 */
export function validatePrdItem(data: unknown): ValidationResult<PrdItem> {
	const result = PrdItemSchema.safeParse(data);
	
	if (result.success) {
		return {
			success: true,
			data: result.data
		};
	}
	
	const errors = result.error.issues.map((err: any) => ({
		path: err.path.join('.'),
		message: err.message
	}));
	
	return {
		success: false,
		error: `PRD item validation failed: ${errors.map((e: any) => `${e.path}: ${e.message}`).join('; ')}`,
		errors
	};
}

/**
 * Validates a step (string or object)
 */
export function validateStep(data: unknown): ValidationResult<Step> {
	const result = StepSchema.safeParse(data);
	
	if (result.success) {
		return {
			success: true,
			data: result.data
		};
	}
	
	return {
		success: false,
		error: `Step validation failed: ${result.error.issues[0]?.message || 'Invalid step format'}`
	};
}

/**
 * Validates user input for creating/editing PRD items
 */
export function validateUserInput(input: {
	description?: string;
	category?: string;
}): ValidationResult<{ description: string; category: string }> {
	const errors: Array<{ path: string; message: string }> = [];
	
	// Validate description
	if (!input.description || input.description.trim().length === 0) {
		errors.push({ path: 'description', message: 'Description is required' });
	} else if (input.description.trim().length < 10) {
		errors.push({ path: 'description', message: 'Description must be at least 10 characters' });
	} else if (input.description.length > 500) {
		errors.push({ path: 'description', message: 'Description must be at most 500 characters' });
	}
	
	// Validate category
	if (!input.category || input.category.trim().length === 0) {
		errors.push({ path: 'category', message: 'Category is required' });
	} else if (!CATEGORIES.includes(input.category)) {
		errors.push({ 
			path: 'category', 
			message: `Category must be one of: ${CATEGORIES.join(', ')}` 
		});
	}
	
	if (errors.length > 0) {
		return {
			success: false,
			error: errors.map(e => `${e.path}: ${e.message}`).join('; '),
			errors
		};
	}
	
	return {
		success: true,
		data: {
			description: input.description!.trim(),
			category: input.category!
		}
	};
}

/**
 * Sanitizes user input to prevent XSS and other injection attacks
 */
export function sanitizeInput(input: string): string {
	return input
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#x27;')
		.replace(/\//g, '&#x2F;');
}

/**
 * Validates ID format
 */
export function validateId(id: string): boolean {
	return /^[a-zA-Z]+-\d{3}$/.test(id);
}
