import * as assert from 'assert';
import { 
	PrdFileError, 
	GitOperationError, 
	UserInputError, 
	EnvironmentError,
	isMikeyError,
	getErrorMessage,
	getUserFriendlyMessage
} from '../../errors';

suite('Error Handling Test Suite', () => {
	suite('PrdFileError', () => {
		test('should create notFound error with correct properties', () => {
			const error = PrdFileError.notFound('/path/to/prd.json');
			
			assert.strictEqual(error.name, 'PrdFileError');
			assert.strictEqual(error.code, 'PRD_FILE_NOT_FOUND');
			assert.ok(error.message.includes('/path/to/prd.json'));
			assert.ok(error.suggestion.length > 0);
		});

		test('should create parseError with cause', () => {
			const cause = new Error('Invalid JSON');
			const error = PrdFileError.parseError('/path/to/prd.json', cause);
			
			assert.strictEqual(error.code, 'PRD_FILE_PARSE_ERROR');
			assert.strictEqual(error.cause, cause);
			assert.ok(error.message.includes('/path/to/prd.json'));
		});

		test('should create writeError with actionable suggestion', () => {
			const cause = new Error('Permission denied');
			const error = PrdFileError.writeError('/path/to/prd.json', cause);
			
			assert.strictEqual(error.code, 'PRD_FILE_WRITE_ERROR');
			assert.ok(error.suggestion.includes('permissions'));
		});

		test('should provide user-friendly message', () => {
			const error = PrdFileError.notFound('/path/to/prd.json');
			const userMessage = error.getUserMessage();
			
			assert.ok(userMessage.includes('💡'));
			assert.ok(userMessage.includes(error.message));
			assert.ok(userMessage.includes(error.suggestion));
		});

		test('should provide log message with cause', () => {
			const cause = new Error('Underlying error');
			const error = PrdFileError.readError('/path/to/prd.json', cause);
			const logMessage = error.getLogMessage();
			
			assert.ok(logMessage.includes('[PRD_FILE_READ_ERROR]'));
			assert.ok(logMessage.includes('Caused by:'));
			assert.ok(logMessage.includes('Underlying error'));
		});
	});

	suite('GitOperationError', () => {
		test('should create branchCreationFailed error', () => {
			const cause = new Error('Git not found');
			const error = GitOperationError.branchCreationFailed('feature/test', cause);
			
			assert.strictEqual(error.code, 'GIT_BRANCH_CREATE_FAILED');
			assert.ok(error.message.includes('feature/test'));
			assert.strictEqual(error.cause, cause);
		});

		test('should create mergeFailed error with conflict suggestion', () => {
			const cause = new Error('Merge conflict');
			const error = GitOperationError.mergeFailed('feature/test', cause);
			
			assert.ok(error.suggestion.includes('conflict'));
		});

		test('should create notAGitRepository error', () => {
			const error = GitOperationError.notAGitRepository();
			
			assert.strictEqual(error.code, 'GIT_NOT_A_REPO');
			assert.ok(error.suggestion.includes('git init'));
		});
	});

	suite('UserInputError', () => {
		test('should create cancelled error', () => {
			const error = UserInputError.cancelled('Add Item');
			
			assert.strictEqual(error.code, 'INPUT_CANCELLED');
			assert.ok(error.message.includes('Add Item'));
		});

		test('should create invalid error', () => {
			const error = UserInputError.invalid('description', 'too short');
			
			assert.strictEqual(error.code, 'INPUT_INVALID');
			assert.ok(error.message.includes('description'));
			assert.ok(error.message.includes('too short'));
		});

		test('should create required error', () => {
			const error = UserInputError.required('category');
			
			assert.strictEqual(error.code, 'INPUT_REQUIRED');
			assert.ok(error.suggestion.includes('category'));
		});
	});

	suite('EnvironmentError', () => {
		test('should create noWorkspace error', () => {
			const error = EnvironmentError.noWorkspace();
			
			assert.strictEqual(error.code, 'ENV_NO_WORKSPACE');
			assert.ok(error.suggestion.includes('workspace'));
		});

		test('should create noGitExecutable error', () => {
			const error = EnvironmentError.noGitExecutable();
			
			assert.strictEqual(error.code, 'ENV_NO_GIT');
			assert.ok(error.suggestion.includes('PATH'));
		});
	});

	suite('Error Utilities', () => {
		test('isMikeyError should identify MikeyError instances', () => {
			const ralphError = PrdFileError.notFound('test.json');
			const standardError = new Error('Standard error');
			
			assert.strictEqual(isMikeyError(ralphError), true);
			assert.strictEqual(isMikeyError(standardError), false);
			assert.strictEqual(isMikeyError('string'), false);
			assert.strictEqual(isMikeyError(null), false);
		});

		test('getErrorMessage should handle different error types', () => {
			const ralphError = PrdFileError.notFound('test.json');
			const standardError = new Error('Standard error');
			const stringError = 'String error';
			
			assert.ok(getErrorMessage(ralphError).includes('not found'));
			assert.strictEqual(getErrorMessage(standardError), 'Standard error');
			assert.strictEqual(getErrorMessage(stringError), 'String error');
		});

		test('getUserFriendlyMessage should provide actionable messages', () => {
			const ralphError = PrdFileError.notFound('test.json');
			const standardError = new Error('Standard error');
			
			const ralphMessage = getUserFriendlyMessage(ralphError);
			const standardMessage = getUserFriendlyMessage(standardError);
			
			assert.ok(ralphMessage.includes('💡'));
			assert.ok(standardMessage.includes('An error occurred'));
		});
	});

	suite('Error Inheritance', () => {
		test('MikeyError instances should be instanceof Error', () => {
			const error = PrdFileError.notFound('test.json');
			
			assert.ok(error instanceof Error);
			assert.ok(error instanceof PrdFileError);
		});

		test('Error stack trace should be preserved', () => {
			const error = PrdFileError.notFound('test.json');
			
			assert.ok(error.stack);
			assert.ok(error.stack!.length > 0);
		});
	});

	suite('Error Messages', () => {
		test('should have descriptive messages for common scenarios', () => {
			const errors = [
				PrdFileError.notFound('prd.json'),
				GitOperationError.branchCreationFailed('feature/test', new Error()),
				UserInputError.required('description'),
				EnvironmentError.noWorkspace()
			];

			errors.forEach(error => {
				assert.ok(error.message.length > 0, 'Message should not be empty');
				assert.ok(error.suggestion.length > 0, 'Suggestion should not be empty');
				assert.ok(error.code.length > 0, 'Code should not be empty');
			});
		});

		test('should include actionable suggestions', () => {
			const fileError = PrdFileError.notFound('prd.json');
			const gitError = GitOperationError.mergeFailed('feature/test', new Error());
			
			assert.ok(fileError.suggestion.toLowerCase().includes('ensure') || 
			          fileError.suggestion.toLowerCase().includes('check'));
			assert.ok(gitError.suggestion.toLowerCase().includes('resolve') ||
			          gitError.suggestion.toLowerCase().includes('manually'));
		});
	});
});
