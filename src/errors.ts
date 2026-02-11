/**
 * Custom error types for domain-specific error handling
 */

/**
 * Base class for all Ralph extension errors
 */
export abstract class RalphError extends Error {
	public readonly code: string;
	public readonly suggestion: string;
	public readonly cause?: Error;

	constructor(message: string, code: string, suggestion: string, cause?: Error) {
		super(message);
		this.name = this.constructor.name;
		this.code = code;
		this.suggestion = suggestion;
		this.cause = cause;
		
		// Maintains proper stack trace for where our error was thrown
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, this.constructor);
		}
	}

	/**
	 * Get user-friendly error message with actionable suggestion
	 */
	public getUserMessage(): string {
		return `${this.message}\n\n💡 ${this.suggestion}`;
	}

	/**
	 * Get full error details for logging
	 */
	public getLogMessage(): string {
		let msg = `[${this.code}] ${this.message}`;
		if (this.cause) {
			msg += `\nCaused by: ${this.cause.message}`;
		}
		return msg;
	}
}

/**
 * Errors related to PRD file operations
 */
export class PrdFileError extends RalphError {
	constructor(message: string, code: string, suggestion: string, cause?: Error) {
		super(message, `PRD_FILE_${code}`, suggestion, cause);
	}

	static notFound(filePath: string): PrdFileError {
		return new PrdFileError(
			`PRD file not found: ${filePath}`,
			'NOT_FOUND',
			'Ensure a prd.json file exists in your workspace\'s plans/ folder.',
		);
	}

	static parseError(filePath: string, cause: Error): PrdFileError {
		return new PrdFileError(
			`Failed to parse PRD file: ${filePath}`,
			'PARSE_ERROR',
			'Check that prd.json contains valid JSON. Fix any syntax errors and try again.',
			cause
		);
	}

	static writeError(filePath: string, cause: Error): PrdFileError {
		return new PrdFileError(
			`Failed to write to PRD file: ${filePath}`,
			'WRITE_ERROR',
			'Check file permissions and ensure the file is not open in another application.',
			cause
		);
	}

	static readError(filePath: string, cause: Error): PrdFileError {
		return new PrdFileError(
			`Failed to read PRD file: ${filePath}`,
			'READ_ERROR',
			'Check file permissions and ensure the file exists.',
			cause
		);
	}

	static validationError(message: string): PrdFileError {
		return new PrdFileError(
			message,
			'VALIDATION_ERROR',
			'Ensure the PRD file follows the correct schema. Check the documentation for the expected format.',
		);
	}
}

/**
 * Errors related to Git operations
 */
export class GitOperationError extends RalphError {
	constructor(message: string, code: string, suggestion: string, cause?: Error) {
		super(message, `GIT_${code}`, suggestion, cause);
	}

	static branchCreationFailed(branchName: string, cause: Error): GitOperationError {
		return new GitOperationError(
			`Failed to create branch: ${branchName}`,
			'BRANCH_CREATE_FAILED',
			'Ensure Git is installed and the repository is initialized. Check that the branch name is valid.',
			cause
		);
	}

	static branchSwitchFailed(branchName: string, cause: Error): GitOperationError {
		return new GitOperationError(
			`Failed to switch to branch: ${branchName}`,
			'BRANCH_SWITCH_FAILED',
			'Ensure the branch exists and there are no uncommitted changes blocking the switch.',
			cause
		);
	}

	static mergeFailed(branchName: string, cause: Error): GitOperationError {
		return new GitOperationError(
			`Failed to merge branch: ${branchName}`,
			'MERGE_FAILED',
			'Resolve any merge conflicts manually and try again. Use Git tools to complete the merge.',
			cause
		);
	}

	static commitFailed(cause: Error): GitOperationError {
		return new GitOperationError(
			'Failed to commit changes',
			'COMMIT_FAILED',
			'Ensure there are changes to commit and Git is properly configured with user name and email.',
			cause
		);
	}

	static notAGitRepository(): GitOperationError {
		return new GitOperationError(
			'Not a Git repository',
			'NOT_A_REPO',
			'Initialize a Git repository in your workspace with: git init'
		);
	}

	static operationFailed(operation: string, cause: Error): GitOperationError {
		return new GitOperationError(
			`Git operation failed: ${operation}`,
			'OPERATION_FAILED',
			'Check the Git output for details and ensure your repository is in a valid state.',
			cause
		);
	}
}

/**
 * Errors related to user input
 */
export class UserInputError extends RalphError {
	constructor(message: string, code: string, suggestion: string) {
		super(message, `INPUT_${code}`, suggestion);
	}

	static cancelled(operation: string): UserInputError {
		return new UserInputError(
			`Operation cancelled: ${operation}`,
			'CANCELLED',
			'No action taken.'
		);
	}

	static invalid(field: string, reason: string): UserInputError {
		return new UserInputError(
			`Invalid ${field}: ${reason}`,
			'INVALID',
			`Please provide a valid ${field} and try again.`
		);
	}

	static required(field: string): UserInputError {
		return new UserInputError(
			`${field} is required`,
			'REQUIRED',
			`Please provide a ${field} to continue.`
		);
	}
}

/**
 * Errors related to workspace/environment setup
 */
export class EnvironmentError extends RalphError {
	constructor(message: string, code: string, suggestion: string, cause?: Error) {
		super(message, `ENV_${code}`, suggestion, cause);
	}

	static noWorkspace(): EnvironmentError {
		return new EnvironmentError(
			'No workspace folder open',
			'NO_WORKSPACE',
			'Open a workspace folder to use Ralph extension.'
		);
	}

	static noGitExecutable(): EnvironmentError {
		return new EnvironmentError(
			'Git executable not found',
			'NO_GIT',
			'Install Git and ensure it is available in your PATH.'
		);
	}
}

/**
 * Type guard to check if an error is a RalphError
 */
export function isRalphError(error: unknown): error is RalphError {
	return error instanceof RalphError;
}

/**
 * Safely convert any error to a readable message
 */
export function getErrorMessage(error: unknown): string {
	if (isRalphError(error)) {
		return error.message;
	}
	if (error instanceof Error) {
		return error.message;
	}
	return String(error);
}

/**
 * Get user-friendly message from any error
 */
export function getUserFriendlyMessage(error: unknown): string {
	if (isRalphError(error)) {
		return error.getUserMessage();
	}
	if (error instanceof Error) {
		return `An error occurred: ${error.message}`;
	}
	return `An unexpected error occurred: ${String(error)}`;
}
