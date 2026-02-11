import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { PrdFileManager } from '../../prdFileManager';
import { Status } from '../../constants';
import { PrdItem } from '../../prdTreeDataProvider';

suite('PrdFileManager Test Suite', () => {
	let fileManager: PrdFileManager;
	let testWorkspacePath: string;
	let testPrdPath: string;

	setup(() => {
		fileManager = PrdFileManager.getInstance();
		
		// Create a temporary test workspace
		const tempDir = fs.mkdtempSync(path.join(__dirname, 'test-workspace-'));
		testWorkspacePath = tempDir;
		const plansDir = path.join(testWorkspacePath, 'plans');
		fs.mkdirSync(plansDir, { recursive: true });
		testPrdPath = path.join(plansDir, 'prd.json');
	});

	teardown(() => {
		// Clean up test files
		if (fs.existsSync(testWorkspacePath)) {
			fs.rmSync(testWorkspacePath, { recursive: true, force: true });
		}
	});

	test('Singleton pattern - getInstance returns same instance', () => {
		const instance1 = PrdFileManager.getInstance();
		const instance2 = PrdFileManager.getInstance();
		assert.strictEqual(instance1, instance2, 'getInstance should return the same instance');
	});

	test('initialize - sets file path when prd.json exists', () => {
		// Create a valid prd.json
		const testData: PrdItem[] = [{
			id: 'test-001',
			category: 'test',
			description: 'Test item',
			steps: [],
			status: Status.NotStarted,
			passes: false
		}];
		fs.writeFileSync(testPrdPath, JSON.stringify(testData), 'utf-8');

		const filePath = fileManager.initialize(testWorkspacePath);
		assert.strictEqual(filePath, testPrdPath, 'Should return correct PRD file path');
		assert.strictEqual(fileManager.getFilePath(), testPrdPath, 'getFilePath should return initialized path');
	});

	test('initialize - returns undefined when prd.json does not exist', () => {
		const filePath = fileManager.initialize(testWorkspacePath);
		assert.strictEqual(filePath, undefined, 'Should return undefined when file does not exist');
	});

	test('read - successfully reads and validates PRD file', () => {
		const testData: PrdItem[] = [
			{
				id: 'test-001',
				category: 'test',
				description: 'First test item',
				steps: ['Step 1', 'Step 2'],
				status: Status.NotStarted,
				passes: false
			},
			{
				id: 'test-002',
				category: 'test',
				description: 'Second test item',
				steps: [],
				status: Status.InProgress,
				passes: true
			}
		];
		fs.writeFileSync(testPrdPath, JSON.stringify(testData), 'utf-8');
		fileManager.initialize(testWorkspacePath);

		const items = fileManager.read();
		assert.strictEqual(items.length, 2, 'Should read 2 items');
		assert.strictEqual(items[0].id, 'test-001', 'First item ID should match');
		assert.strictEqual(items[1].status, Status.InProgress, 'Second item status should match');
	});

	test('read - throws error for malformed JSON', () => {
		fs.writeFileSync(testPrdPath, '{ invalid json }', 'utf-8');
		fileManager.initialize(testWorkspacePath);

		assert.throws(() => fileManager.read(), /parse/i, 'Should throw parse error');
	});

	test('write - successfully writes PRD items', () => {
		const testData: PrdItem[] = [{
			id: 'test-001',
			category: 'test',
			description: 'Test item',
			steps: ['Step 1'],
			status: Status.Completed,
			passes: true
		}];
		fs.writeFileSync(testPrdPath, '[]', 'utf-8');
		fileManager.initialize(testWorkspacePath);

		fileManager.write(testData);
		
		const content = fs.readFileSync(testPrdPath, 'utf-8');
		const parsed = JSON.parse(content);
		assert.strictEqual(parsed.length, 1, 'Should write 1 item');
		assert.strictEqual(parsed[0].id, 'test-001', 'Item ID should match');
	});

	test('write - creates backup before writing', () => {
		const initialData: PrdItem[] = [{
			id: 'test-001',
			category: 'test',
			description: 'Initial item',
			steps: [],
			status: Status.NotStarted,
			passes: false
		}];
		fs.writeFileSync(testPrdPath, JSON.stringify(initialData), 'utf-8');
		fileManager.initialize(testWorkspacePath);

		const updatedData: PrdItem[] = [{
			id: 'test-002',
			category: 'test',
			description: 'Updated item',
			steps: [],
			status: Status.Completed,
			passes: true
		}];
		fileManager.write(updatedData);

		const backupPath = `${testPrdPath}.backup`;
		assert.strictEqual(fs.existsSync(backupPath), true, 'Backup file should exist');
		
		const backupContent = JSON.parse(fs.readFileSync(backupPath, 'utf-8'));
		assert.strictEqual(backupContent[0].id, 'test-001', 'Backup should contain original data');
	});

	test('addItem - adds new item to file', () => {
		fs.writeFileSync(testPrdPath, '[]', 'utf-8');
		fileManager.initialize(testWorkspacePath);

		const newItem: PrdItem = {
			id: 'test-001',
			category: 'test',
			description: 'New item',
			steps: [],
			status: Status.NotStarted,
			passes: false
		};
		fileManager.addItem(newItem);

		const items = fileManager.read();
		assert.strictEqual(items.length, 1, 'Should have 1 item');
		assert.strictEqual(items[0].id, 'test-001', 'Item ID should match');
	});

	test('removeItem - removes item from file', () => {
		const testData: PrdItem[] = [
			{
				id: 'test-001',
				category: 'test',
				description: 'Item 1',
				steps: [],
				status: Status.NotStarted,
				passes: false
			},
			{
				id: 'test-002',
				category: 'test',
				description: 'Item 2',
				steps: [],
				status: Status.NotStarted,
				passes: false
			}
		];
		fs.writeFileSync(testPrdPath, JSON.stringify(testData), 'utf-8');
		fileManager.initialize(testWorkspacePath);

		fileManager.removeItem('test-001');

		const items = fileManager.read();
		assert.strictEqual(items.length, 1, 'Should have 1 item remaining');
		assert.strictEqual(items[0].id, 'test-002', 'Remaining item should be test-002');
	});

	test('updateItem - updates specific item', () => {
		const testData: PrdItem[] = [{
			id: 'test-001',
			category: 'test',
			description: 'Original description',
			steps: [],
			status: Status.NotStarted,
			passes: false
		}];
		fs.writeFileSync(testPrdPath, JSON.stringify(testData), 'utf-8');
		fileManager.initialize(testWorkspacePath);

		const updatedItem = fileManager.updateItem('test-001', (item) => ({
			...item,
			description: 'Updated description',
			status: Status.Completed
		}));

		assert.strictEqual(updatedItem.description, 'Updated description', 'Description should be updated');
		assert.strictEqual(updatedItem.status, Status.Completed, 'Status should be updated');

		const items = fileManager.read();
		assert.strictEqual(items[0].description, 'Updated description', 'File should contain updated description');
	});

	test('updateItem - throws error for non-existent item', () => {
		fs.writeFileSync(testPrdPath, '[]', 'utf-8');
		fileManager.initialize(testWorkspacePath);

		assert.throws(
			() => fileManager.updateItem('non-existent', (item) => item),
			/not found/i,
			'Should throw error for non-existent item'
		);
	});

	test('transaction - commits successful operations', () => {
		const testData: PrdItem[] = [{
			id: 'test-001',
			category: 'test',
			description: 'Original',
			steps: [],
			status: Status.NotStarted,
			passes: false
		}];
		fs.writeFileSync(testPrdPath, JSON.stringify(testData), 'utf-8');
		fileManager.initialize(testWorkspacePath);

		const result = fileManager.transaction((items) => {
			items[0].description = 'Modified in transaction';
			items[0].status = Status.Completed;
			return items[0].description;
		});

		assert.strictEqual(result, 'Modified in transaction', 'Should return transaction result');
		
		const items = fileManager.read();
		assert.strictEqual(items[0].description, 'Modified in transaction', 'Changes should be committed');
		assert.strictEqual(items[0].status, Status.Completed, 'All changes should be committed');
	});

	test('transaction - rolls back on error', () => {
		const testData: PrdItem[] = [{
			id: 'test-001',
			category: 'test',
			description: 'Original',
			steps: [],
			status: Status.NotStarted,
			passes: false
		}];
		fs.writeFileSync(testPrdPath, JSON.stringify(testData), 'utf-8');
		fileManager.initialize(testWorkspacePath);

		try {
			fileManager.transaction((items) => {
				items[0].description = 'Modified';
				throw new Error('Transaction failed');
			});
			assert.fail('Transaction should have thrown error');
		} catch (error) {
			// Expected error
		}

		const items = fileManager.read();
		assert.strictEqual(items[0].description, 'Original', 'Changes should be rolled back');
	});

	test('exists - returns true when file exists', () => {
		fs.writeFileSync(testPrdPath, '[]', 'utf-8');
		fileManager.initialize(testWorkspacePath);

		assert.strictEqual(fileManager.exists(), true, 'Should return true for existing file');
	});

	test('exists - returns false when file does not exist', () => {
		fileManager.initialize(testWorkspacePath);

		assert.strictEqual(fileManager.exists(), false, 'Should return false for non-existent file');
	});

	test('getStats - returns file statistics', () => {
		const testData: PrdItem[] = [{
			id: 'test-001',
			category: 'test',
			description: 'Test',
			steps: [],
			status: Status.NotStarted,
			passes: false
		}];
		fs.writeFileSync(testPrdPath, JSON.stringify(testData, null, '\t'), 'utf-8');
		fileManager.initialize(testWorkspacePath);

		const stats = fileManager.getStats();
		assert.notStrictEqual(stats, null, 'Stats should not be null');
		assert.ok(stats!.size > 0, 'File size should be greater than 0');
		assert.ok(stats!.modified instanceof Date, 'Modified should be a Date');
	});

	test('createNamedBackup - creates backup with custom name', () => {
		const testData: PrdItem[] = [{
			id: 'test-001',
			category: 'test',
			description: 'Test',
			steps: [],
			status: Status.NotStarted,
			passes: false
		}];
		fs.writeFileSync(testPrdPath, JSON.stringify(testData), 'utf-8');
		fileManager.initialize(testWorkspacePath);

		const backupPath = fileManager.createNamedBackup('custom');
		assert.strictEqual(fs.existsSync(backupPath), true, 'Named backup should exist');
		assert.ok(backupPath.includes('custom'), 'Backup path should include custom suffix');
		
		const backupContent = JSON.parse(fs.readFileSync(backupPath, 'utf-8'));
		assert.strictEqual(backupContent[0].id, 'test-001', 'Backup should contain original data');
	});

	test('write - validates data before writing', () => {
		fs.writeFileSync(testPrdPath, '[]', 'utf-8');
		fileManager.initialize(testWorkspacePath);

		// Create invalid data (missing required fields)
		const invalidData: any[] = [{
			id: 'test-001'
			// Missing required fields
		}];

		assert.throws(
			() => fileManager.write(invalidData),
			/validation/i,
			'Should throw validation error for invalid data'
		);
	});

	test('updateItem - preserves other fields when updating', () => {
		const testData: PrdItem[] = [{
			id: 'test-001',
			category: 'test',
			description: 'Original',
			steps: ['Step 1', 'Step 2'],
			status: Status.InProgress,
			passes: true
		}];
		fs.writeFileSync(testPrdPath, JSON.stringify(testData), 'utf-8');
		fileManager.initialize(testWorkspacePath);

		const updatedItem = fileManager.updateItem('test-001', (item) => ({
			...item,
			description: 'Updated'
		}));

		assert.strictEqual(updatedItem.description, 'Updated', 'Description should be updated');
		assert.strictEqual(updatedItem.steps.length, 2, 'Steps should be preserved');
		assert.strictEqual(updatedItem.status, Status.InProgress, 'Status should be preserved');
		assert.strictEqual(updatedItem.passes, true, 'Passes should be preserved');
	});
});
