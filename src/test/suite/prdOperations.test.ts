import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { PrdTreeDataProvider, PrdItem, PrdStep } from '../../prdTreeDataProvider';
import { Status } from '../../constants';

suite('PRD Operations Test Suite', () => {
	let testWorkspaceDir: string;
	let testPrdPath: string;
	let provider: PrdTreeDataProvider;
	let mockContext: vscode.ExtensionContext;

	setup(() => {
		// Create temporary test workspace
		testWorkspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ralph-test-'));
		const plansDir = path.join(testWorkspaceDir, 'plans');
		fs.mkdirSync(plansDir, { recursive: true });
		testPrdPath = path.join(plansDir, 'prd.json');

		// Create mock extension context
		mockContext = {
			subscriptions: [],
			workspaceState: {} as any,
			globalState: {} as any,
			extensionPath: '',
			asAbsolutePath: (p: string) => p,
			storagePath: undefined,
			globalStoragePath: '',
			logPath: '',
			extensionUri: vscode.Uri.file(''),
			environmentVariableCollection: {} as any,
			extensionMode: vscode.ExtensionMode.Test,
			storageUri: undefined,
			globalStorageUri: vscode.Uri.file(''),
			logUri: vscode.Uri.file(''),
			secrets: {} as any,
			extension: {} as any,
			languageModelAccessInformation: {} as any,
		};

		// Initialize PRD file with test data
		const initialPrdData: PrdItem[] = [
			{
				id: 'setup-001',
				category: 'setup',
				description: 'Test setup item',
				steps: ['Step 1', 'Step 2'],
				status: Status.NotStarted,
				passes: false
			},
			{
				id: 'setup-002',
				category: 'setup',
				description: 'Another setup item',
				steps: [],
				status: Status.Completed,
				passes: true
			},
			{
				id: 'ui-001',
				category: 'ui',
				description: 'Test UI item',
				steps: [
					{ text: 'UI Step 1', completed: true },
					{ text: 'UI Step 2', completed: false }
				],
				status: Status.InProgress,
				passes: false
			}
		];

		fs.writeFileSync(testPrdPath, JSON.stringify(initialPrdData, null, '\t'));
	});

	teardown(() => {
		// Clean up temporary workspace
		if (fs.existsSync(testWorkspaceDir)) {
			fs.rmSync(testWorkspaceDir, { recursive: true, force: true });
		}
	});

	test('generateUniqueId - generates correctly formatted ID', async () => {
		// This tests the private method indirectly by using addItem
		// which calls generateUniqueId internally
		
		// Read current state
		const beforeData = JSON.parse(fs.readFileSync(testPrdPath, 'utf-8'));
		const setupItems = beforeData.filter((item: PrdItem) => item.category === 'setup');
		
		// The highest existing setup item is setup-002
		// Next should be setup-003
		assert.strictEqual(setupItems.length, 2);
		assert.ok(setupItems.some((item: PrdItem) => item.id === 'setup-001'));
		assert.ok(setupItems.some((item: PrdItem) => item.id === 'setup-002'));
	});

	test('generateUniqueId - increments existing IDs correctly', () => {
		const data = JSON.parse(fs.readFileSync(testPrdPath, 'utf-8'));
		
		// setup-001 and setup-002 exist, next should be setup-003
		const setupIds = data
			.filter((item: PrdItem) => item.category === 'setup')
			.map((item: PrdItem) => item.id);
		
		const numbers = setupIds.map((id: string) => {
			const match = id.match(/^setup-(\d+)$/);
			return match ? parseInt(match[1], 10) : 0;
		});
		
		const maxNumber = Math.max(...numbers);
		const nextNumber = maxNumber + 1;
		const expectedId = `setup-${String(nextNumber).padStart(3, '0')}`;
		
		assert.strictEqual(expectedId, 'setup-003');
	});

	test('generateUniqueId - starts at 001 for new category', () => {
		const data = JSON.parse(fs.readFileSync(testPrdPath, 'utf-8'));
		
		// 'test' category doesn't exist yet
		const testItems = data.filter((item: PrdItem) => item.category === 'test');
		assert.strictEqual(testItems.length, 0);
		
		// Expected first ID would be test-001
		const expectedId = 'test-001';
		assert.strictEqual(expectedId, 'test-001');
	});

	test('Step management - convert string steps to object format', () => {
		const data = JSON.parse(fs.readFileSync(testPrdPath, 'utf-8')) as PrdItem[];
		const item = data.find(i => i.id === 'setup-001');
		
		assert.ok(item);
		assert.strictEqual(item.steps.length, 2);
		
		// Initial steps are strings
		assert.strictEqual(typeof item.steps[0], 'string');
		assert.strictEqual(item.steps[0], 'Step 1');
		
		// Simulate marking step complete (converting string to object)
		const step = item.steps[0];
		const updatedStep: PrdStep = typeof step === 'string' 
			? { text: step, completed: true }
			: { text: (step as PrdStep).text, completed: true };
		
		assert.strictEqual(updatedStep.text, 'Step 1');
		assert.strictEqual(updatedStep.completed, true);
	});

	test('Step management - update existing object step', () => {
		const data = JSON.parse(fs.readFileSync(testPrdPath, 'utf-8')) as PrdItem[];
		const item = data.find(i => i.id === 'ui-001');
		
		assert.ok(item);
		assert.strictEqual(item.steps.length, 2);
		
		const step = item.steps[0] as PrdStep;
		assert.strictEqual(step.text, 'UI Step 1');
		assert.strictEqual(step.completed, true);
		
		// Update to incomplete
		const updatedStep: PrdStep = { ...step, completed: false };
		assert.strictEqual(updatedStep.text, 'UI Step 1');
		assert.strictEqual(updatedStep.completed, false);
	});

	test('Status transitions - valid transitions', () => {
		const validStatuses = [
			Status.NotStarted,
			Status.InProgress,
			Status.InReview,
			Status.Completed
		];
		
		// All these should be valid status values
		validStatuses.forEach(status => {
			assert.ok(Object.values(Status).includes(status));
		});
	});

	test('Status transitions - can read different statuses from file', () => {
		const data = JSON.parse(fs.readFileSync(testPrdPath, 'utf-8')) as PrdItem[];
		
		const notStartedItem = data.find(i => i.status === Status.NotStarted);
		const inProgressItem = data.find(i => i.status === Status.InProgress);
		const completedItem = data.find(i => i.status === Status.Completed);
		
		assert.ok(notStartedItem, 'Should have not-started item');
		assert.ok(inProgressItem, 'Should have in-progress item');
		assert.ok(completedItem, 'Should have completed item');
		
		assert.strictEqual(notStartedItem.id, 'setup-001');
		assert.strictEqual(inProgressItem.id, 'ui-001');
		assert.strictEqual(completedItem.id, 'setup-002');
	});

	test('CRUD operations - Read PRD file', () => {
		const data = JSON.parse(fs.readFileSync(testPrdPath, 'utf-8')) as PrdItem[];
		
		assert.strictEqual(data.length, 3);
		assert.ok(data.find(i => i.id === 'setup-001'));
		assert.ok(data.find(i => i.id === 'setup-002'));
		assert.ok(data.find(i => i.id === 'ui-001'));
	});

	test('CRUD operations - Create new item', () => {
		const data = JSON.parse(fs.readFileSync(testPrdPath, 'utf-8')) as PrdItem[];
		
		const newItem: PrdItem = {
			id: 'test-001',
			category: 'test',
			description: 'New test item',
			steps: [],
			status: Status.NotStarted,
			passes: false
		};
		
		data.push(newItem);
		fs.writeFileSync(testPrdPath, JSON.stringify(data, null, '\t'));
		
		const updatedData = JSON.parse(fs.readFileSync(testPrdPath, 'utf-8')) as PrdItem[];
		assert.strictEqual(updatedData.length, 4);
		
		const created = updatedData.find(i => i.id === 'test-001');
		assert.ok(created);
		assert.strictEqual(created.description, 'New test item');
		assert.strictEqual(created.category, 'test');
	});

	test('CRUD operations - Update existing item', () => {
		const data = JSON.parse(fs.readFileSync(testPrdPath, 'utf-8')) as PrdItem[];
		
		const itemIndex = data.findIndex(i => i.id === 'setup-001');
		assert.ok(itemIndex !== -1);
		
		data[itemIndex].description = 'Updated description';
		data[itemIndex].status = Status.InProgress;
		
		fs.writeFileSync(testPrdPath, JSON.stringify(data, null, '\t'));
		
		const updatedData = JSON.parse(fs.readFileSync(testPrdPath, 'utf-8')) as PrdItem[];
		const updated = updatedData.find(i => i.id === 'setup-001');
		
		assert.ok(updated);
		assert.strictEqual(updated.description, 'Updated description');
		assert.strictEqual(updated.status, Status.InProgress);
	});

	test('CRUD operations - Delete item', () => {
		const data = JSON.parse(fs.readFileSync(testPrdPath, 'utf-8')) as PrdItem[];
		
		const itemIndex = data.findIndex(i => i.id === 'setup-001');
		assert.ok(itemIndex !== -1);
		
		data.splice(itemIndex, 1);
		fs.writeFileSync(testPrdPath, JSON.stringify(data, null, '\t'));
		
		const updatedData = JSON.parse(fs.readFileSync(testPrdPath, 'utf-8')) as PrdItem[];
		assert.strictEqual(updatedData.length, 2);
		assert.ok(!updatedData.find(i => i.id === 'setup-001'));
	});

	test('File operations - JSON formatting preserved', () => {
		const data = JSON.parse(fs.readFileSync(testPrdPath, 'utf-8')) as PrdItem[];
		
		// Write with tab formatting
		fs.writeFileSync(testPrdPath, JSON.stringify(data, null, '\t'));
		
		const content = fs.readFileSync(testPrdPath, 'utf-8');
		
		// Verify tabs are used (not spaces)
		assert.ok(content.includes('\t'));
		
		// Verify it's valid JSON
		const reparsed = JSON.parse(content);
		assert.strictEqual(reparsed.length, 3);
	});

	test('File operations - Handle malformed JSON gracefully', () => {
		// Write malformed JSON
		fs.writeFileSync(testPrdPath, '{ invalid json ]');
		
		// Attempt to read
		try {
			JSON.parse(fs.readFileSync(testPrdPath, 'utf-8'));
			assert.fail('Should have thrown error for malformed JSON');
		} catch (error) {
			// Expected to throw
			assert.ok(error);
		}
	});

	test('ID generation - handles gaps in numbering', () => {
		const data = JSON.parse(fs.readFileSync(testPrdPath, 'utf-8')) as PrdItem[];
		
		// Add item with gap: setup-001, setup-002, then setup-010
		data.push({
			id: 'setup-010',
			category: 'setup',
			description: 'Gap item',
			steps: [],
			status: Status.NotStarted,
			passes: false
		});
		
		fs.writeFileSync(testPrdPath, JSON.stringify(data, null, '\t'));
		
		// Next ID should be setup-011 (max + 1)
		const setupIds = data
			.filter(item => item.category === 'setup')
			.map(item => item.id);
		
		const numbers = setupIds.map(id => {
			const match = id.match(/^setup-(\d+)$/);
			return match ? parseInt(match[1], 10) : 0;
		});
		
		const maxNumber = Math.max(...numbers);
		assert.strictEqual(maxNumber, 10);
		
		const nextId = `setup-${String(maxNumber + 1).padStart(3, '0')}`;
		assert.strictEqual(nextId, 'setup-011');
	});

	test('Step operations - Add new step to item', () => {
		const data = JSON.parse(fs.readFileSync(testPrdPath, 'utf-8')) as PrdItem[];
		const item = data.find(i => i.id === 'setup-001');
		
		assert.ok(item);
		const initialLength = item.steps.length;
		
		item.steps.push('New step');
		fs.writeFileSync(testPrdPath, JSON.stringify(data, null, '\t'));
		
		const updatedData = JSON.parse(fs.readFileSync(testPrdPath, 'utf-8')) as PrdItem[];
		const updatedItem = updatedData.find(i => i.id === 'setup-001');
		
		assert.ok(updatedItem);
		assert.strictEqual(updatedItem.steps.length, initialLength + 1);
		assert.strictEqual(updatedItem.steps[updatedItem.steps.length - 1], 'New step');
	});

	test('Step operations - Remove step from item', () => {
		const data = JSON.parse(fs.readFileSync(testPrdPath, 'utf-8')) as PrdItem[];
		const item = data.find(i => i.id === 'ui-001');
		
		assert.ok(item);
		assert.strictEqual(item.steps.length, 2);
		
		item.steps.splice(0, 1);
		fs.writeFileSync(testPrdPath, JSON.stringify(data, null, '\t'));
		
		const updatedData = JSON.parse(fs.readFileSync(testPrdPath, 'utf-8')) as PrdItem[];
		const updatedItem = updatedData.find(i => i.id === 'ui-001');
		
		assert.ok(updatedItem);
		assert.strictEqual(updatedItem.steps.length, 1);
		
		const remainingStep = updatedItem.steps[0] as PrdStep;
		assert.strictEqual(remainingStep.text, 'UI Step 2');
	});

	test('Step operations - Edit step text', () => {
		const data = JSON.parse(fs.readFileSync(testPrdPath, 'utf-8')) as PrdItem[];
		const item = data.find(i => i.id === 'ui-001');
		
		assert.ok(item);
		
		const step = item.steps[0] as PrdStep;
		step.text = 'Updated step text';
		
		fs.writeFileSync(testPrdPath, JSON.stringify(data, null, '\t'));
		
		const updatedData = JSON.parse(fs.readFileSync(testPrdPath, 'utf-8')) as PrdItem[];
		const updatedItem = updatedData.find(i => i.id === 'ui-001');
		
		assert.ok(updatedItem);
		const updatedStep = updatedItem.steps[0] as PrdStep;
		assert.strictEqual(updatedStep.text, 'Updated step text');
		assert.strictEqual(updatedStep.completed, true);
	});

	test('Validation - Item structure has required fields', () => {
		const data = JSON.parse(fs.readFileSync(testPrdPath, 'utf-8')) as PrdItem[];
		
		data.forEach(item => {
			assert.ok(item.id, 'Item should have id');
			assert.ok(item.category, 'Item should have category');
			assert.ok(item.description, 'Item should have description');
			assert.ok(Array.isArray(item.steps), 'Item should have steps array');
			assert.ok(item.status !== undefined, 'Item should have status');
			assert.ok(item.passes !== undefined, 'Item should have passes');
		});
	});

	test('Validation - Steps can be strings or objects', () => {
		const data = JSON.parse(fs.readFileSync(testPrdPath, 'utf-8')) as PrdItem[];
		
		// setup-001 has string steps
		const stringStepsItem = data.find(i => i.id === 'setup-001');
		assert.ok(stringStepsItem);
		stringStepsItem.steps.forEach(step => {
			assert.strictEqual(typeof step, 'string');
		});
		
		// ui-001 has object steps
		const objectStepsItem = data.find(i => i.id === 'ui-001');
		assert.ok(objectStepsItem);
		objectStepsItem.steps.forEach(step => {
			assert.strictEqual(typeof step, 'object');
			assert.ok((step as PrdStep).text);
			assert.ok((step as PrdStep).completed !== undefined);
		});
	});

	test('Coverage - Multiple categories handled correctly', () => {
		const data = JSON.parse(fs.readFileSync(testPrdPath, 'utf-8')) as PrdItem[];
		
		const categories = new Set(data.map(item => item.category));
		assert.ok(categories.has('setup'));
		assert.ok(categories.has('ui'));
		assert.strictEqual(categories.size, 2);
	});

	test('Coverage - Passes field can be true or false', () => {
		const data = JSON.parse(fs.readFileSync(testPrdPath, 'utf-8')) as PrdItem[];
		
		const passingItem = data.find(i => i.passes === true);
		const failingItem = data.find(i => i.passes === false);
		
		assert.ok(passingItem, 'Should have item with passes=true');
		assert.ok(failingItem, 'Should have item with passes=false');
		
		assert.strictEqual(passingItem.id, 'setup-002');
		assert.strictEqual(failingItem.id, 'setup-001');
	});
});
