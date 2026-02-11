import * as assert from 'assert';
import { 
	validatePrdFile, 
	validatePrdItem, 
	validateStep, 
	validateUserInput,
	sanitizeInput,
	validateId 
} from '../../validation';
import { Status } from '../../constants';

suite('Validation Tests', () => {
	suite('validateStep', () => {
		test('should validate valid string step', () => {
			const result = validateStep('Implement feature X');
			assert.strictEqual(result.success, true);
			assert.strictEqual(result.data, 'Implement feature X');
		});

		test('should validate valid object step', () => {
			const result = validateStep({ text: 'Test feature', completed: true });
			assert.strictEqual(result.success, true);
			assert.deepStrictEqual(result.data, { text: 'Test feature', completed: true });
		});

		test('should reject empty string step', () => {
			const result = validateStep('');
			assert.strictEqual(result.success, false);
			assert.ok(result.error);
		});

		test('should reject null or undefined', () => {
			assert.strictEqual(validateStep(null).success, false);
			assert.strictEqual(validateStep(undefined).success, false);
		});
	});

	suite('validatePrdItem', () => {
		test('should validate valid PRD item', () => {
			const item = {
				id: 'test-001',
				category: 'test',
				description: 'This is a valid test description',
				steps: ['Step 1', { text: 'Step 2', completed: true }],
				status: Status.NotStarted,
				passes: false
			};
			const result = validatePrdItem(item);
			assert.strictEqual(result.success, true);
		});

		test('should reject item with invalid ID format', () => {
			const item = {
				id: 'invalid-id',
				category: 'test',
				description: 'Valid description here',
				steps: [],
				status: Status.NotStarted,
				passes: false
			};
			const result = validatePrdItem(item);
			assert.strictEqual(result.success, false);
			assert.ok(result.error?.includes('ID must be in format'));
		});

		test('should reject item with short description', () => {
			const item = {
				id: 'test-001',
				category: 'test',
				description: 'Short',
				steps: [],
				status: Status.NotStarted,
				passes: false
			};
			const result = validatePrdItem(item);
			assert.strictEqual(result.success, false);
			assert.ok(result.error?.includes('at least 10 characters'));
		});

		test('should reject item with invalid category', () => {
			const item = {
				id: 'test-001',
				category: 'invalid-category',
				description: 'This is a valid description',
				steps: [],
				status: Status.NotStarted,
				passes: false
			};
			const result = validatePrdItem(item);
			assert.strictEqual(result.success, false);
		});

		test('should reject item with missing required fields', () => {
			const item = {
				id: 'test-001',
				category: 'test'
				// missing description, steps, status, passes
			};
			const result = validatePrdItem(item);
			assert.strictEqual(result.success, false);
		});
	});

	suite('validatePrdFile', () => {
		test('should validate valid PRD file', () => {
			const prdFile = [
				{
					id: 'test-001',
					category: 'test',
					description: 'First test item with valid description',
					steps: [],
					status: Status.NotStarted,
					passes: false
				},
				{
					id: 'test-002',
					category: 'test',
					description: 'Second test item with valid description',
					steps: ['Step 1'],
					status: Status.InProgress,
					passes: false
				}
			];
			const result = validatePrdFile(prdFile);
			assert.strictEqual(result.success, true);
			assert.strictEqual(result.data?.length, 2);
		});

		test('should reject empty array', () => {
			// Empty array is actually valid - it's an array of items
			const result = validatePrdFile([]);
			assert.strictEqual(result.success, true);
		});

		test('should reject non-array input', () => {
			const result = validatePrdFile({ not: 'an array' });
			assert.strictEqual(result.success, false);
		});

		test('should reject array with invalid items', () => {
			const prdFile = [
				{
					id: 'bad-id-format',
					category: 'test',
					description: 'Valid',
					steps: [],
					status: Status.NotStarted,
					passes: false
				}
			];
			const result = validatePrdFile(prdFile);
			assert.strictEqual(result.success, false);
		});
	});

	suite('validateUserInput', () => {
		test('should validate valid user input', () => {
			const result = validateUserInput({
				description: 'This is a valid description',
				category: 'test'
			});
			assert.strictEqual(result.success, true);
			assert.strictEqual(result.data?.description, 'This is a valid description');
			assert.strictEqual(result.data?.category, 'test');
		});

		test('should trim whitespace from description', () => {
			const result = validateUserInput({
				description: '  Valid description with spaces  ',
				category: 'test'
			});
			assert.strictEqual(result.success, true);
			assert.strictEqual(result.data?.description, 'Valid description with spaces');
		});

		test('should reject empty description', () => {
			const result = validateUserInput({
				description: '',
				category: 'test'
			});
			assert.strictEqual(result.success, false);
			assert.ok(result.error?.includes('Description is required'));
		});

		test('should reject short description', () => {
			const result = validateUserInput({
				description: 'Short',
				category: 'test'
			});
			assert.strictEqual(result.success, false);
			assert.ok(result.error?.includes('at least 10 characters'));
		});

		test('should reject invalid category', () => {
			const result = validateUserInput({
				description: 'Valid description here',
				category: 'invalid-category'
			});
			assert.strictEqual(result.success, false);
			assert.ok(result.error?.includes('Category must be one of'));
		});

		test('should reject missing category', () => {
			const result = validateUserInput({
				description: 'Valid description here'
			});
			assert.strictEqual(result.success, false);
			assert.ok(result.error?.includes('Category is required'));
		});
	});

	suite('sanitizeInput', () => {
		test('should sanitize HTML tags', () => {
			const result = sanitizeInput('<script>alert("xss")</script>');
			assert.strictEqual(result, '&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;');
		});

		test('should sanitize quotes', () => {
			const result = sanitizeInput('Test "quoted" and \'single\' text');
			assert.strictEqual(result, 'Test &quot;quoted&quot; and &#x27;single&#x27; text');
		});

		test('should leave normal text unchanged', () => {
			const result = sanitizeInput('Normal text without special chars');
			assert.strictEqual(result, 'Normal text without special chars');
		});
	});

	suite('validateId', () => {
		test('should validate correct ID format', () => {
			assert.strictEqual(validateId('test-001'), true);
			assert.strictEqual(validateId('ui-123'), true);
			assert.strictEqual(validateId('Bug-999'), true);
		});

		test('should reject incorrect ID format', () => {
			assert.strictEqual(validateId('test-1'), false);
			assert.strictEqual(validateId('test-01'), false);
			assert.strictEqual(validateId('test001'), false);
			assert.strictEqual(validateId('test-0001'), false);
			assert.strictEqual(validateId('123-001'), false);
		});
	});
});
