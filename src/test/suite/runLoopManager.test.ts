import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { RunLoopManager, RunLoopOptions } from '../../runLoopManager';
import { PrdFileManager } from '../../prdFileManager';
import { PrdItem } from '../../prdTreeDataProvider';
import { Status } from '../../constants';

suite('RunLoopManager Test Suite', () => {
	let runLoopManager: RunLoopManager;
	let fileManager: PrdFileManager;
	let testWorkspacePath: string;
	let plansDir: string;
	let prdPath: string;

	/**
	 * Helper to create a mock PRD item
	 */
	function createMockItem(
		id: string,
		status: Status = Status.NotStarted,
		passes: boolean = false,
		category: string = 'test'
	): PrdItem {
		return {
			id,
			category,
			description: `Test item ${id}`,
			steps: [],
			status,
			passes
		};
	}

	/**
	 * Helper to write PRD file with items
	 */
	function writePrdFile(items: PrdItem[]): void {
		fs.writeFileSync(prdPath, JSON.stringify(items, null, '\t'), 'utf-8');
	}

	setup(() => {
		// Create a temporary directory for test workspace
		testWorkspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'ralph-runloop-test-'));
		plansDir = path.join(testWorkspacePath, 'plans');
		prdPath = path.join(plansDir, 'prd.json');
		
		// Create plans directory
		if (!fs.existsSync(plansDir)) {
			fs.mkdirSync(plansDir, { recursive: true });
		}

		// Initialize managers
		fileManager = PrdFileManager.getInstance();
		runLoopManager = new RunLoopManager();
	});

	teardown(() => {
		// Clean up temporary directory
		if (fs.existsSync(testWorkspacePath)) {
			fs.rmSync(testWorkspacePath, { recursive: true, force: true });
		}
	});

	suite('buildQueue', () => {
		test('Returns all items when no filters applied', () => {
			const items = [
				createMockItem('test-001', Status.NotStarted),
				createMockItem('test-002', Status.InProgress),
				createMockItem('test-003', Status.Completed, true)
			];
			writePrdFile(items);
			fileManager.initialize(testWorkspacePath);

			const queue = runLoopManager.buildQueue({});
			
			assert.strictEqual(queue.length, 3, 'Should return all 3 items');
			assert.strictEqual(queue[0].id, 'test-001');
			assert.strictEqual(queue[1].id, 'test-002');
			assert.strictEqual(queue[2].id, 'test-003');
		});

		test('Filters items by status', () => {
			const items = [
				createMockItem('test-001', Status.NotStarted),
				createMockItem('test-002', Status.NotStarted),
				createMockItem('test-003', Status.InProgress),
				createMockItem('test-004', Status.Completed, true)
			];
			writePrdFile(items);
			fileManager.initialize(testWorkspacePath);

			const queue = runLoopManager.buildQueue({ 
				statusFilter: Status.NotStarted 
			});
			
			assert.strictEqual(queue.length, 2, 'Should return 2 not-started items');
			assert.strictEqual(queue[0].status, Status.NotStarted);
			assert.strictEqual(queue[1].status, Status.NotStarted);
		});

		test('Filters items by category', () => {
			const items = [
				createMockItem('setup-001', Status.NotStarted, false, 'setup'),
				createMockItem('ui-001', Status.NotStarted, false, 'ui'),
				createMockItem('ui-002', Status.NotStarted, false, 'ui'),
				createMockItem('test-001', Status.NotStarted, false, 'test')
			];
			writePrdFile(items);
			fileManager.initialize(testWorkspacePath);

			const queue = runLoopManager.buildQueue({ 
				categoryFilter: 'ui' 
			});
			
			assert.strictEqual(queue.length, 2, 'Should return 2 ui items');
			assert.strictEqual(queue[0].category, 'ui');
			assert.strictEqual(queue[1].category, 'ui');
		});

		test('Applies maxItems limit', () => {
			const items = [
				createMockItem('test-001', Status.NotStarted),
				createMockItem('test-002', Status.NotStarted),
				createMockItem('test-003', Status.NotStarted),
				createMockItem('test-004', Status.NotStarted)
			];
			writePrdFile(items);
			fileManager.initialize(testWorkspacePath);

			const queue = runLoopManager.buildQueue({ maxItems: 2 });
			
			assert.strictEqual(queue.length, 2, 'Should return only 2 items');
			assert.strictEqual(queue[0].id, 'test-001');
			assert.strictEqual(queue[1].id, 'test-002');
		});

		test('Combines multiple filters', () => {
			const items = [
				createMockItem('setup-001', Status.NotStarted, false, 'setup'),
				createMockItem('ui-001', Status.NotStarted, false, 'ui'),
				createMockItem('ui-002', Status.InProgress, false, 'ui'),
				createMockItem('ui-003', Status.NotStarted, false, 'ui'),
				createMockItem('test-001', Status.NotStarted, false, 'test')
			];
			writePrdFile(items);
			fileManager.initialize(testWorkspacePath);

			const queue = runLoopManager.buildQueue({ 
				statusFilter: Status.NotStarted,
				categoryFilter: 'ui',
				maxItems: 1
			});
			
			assert.strictEqual(queue.length, 1, 'Should return 1 item matching all filters');
			assert.strictEqual(queue[0].id, 'ui-001');
			assert.strictEqual(queue[0].status, Status.NotStarted);
			assert.strictEqual(queue[0].category, 'ui');
		});

		test('Returns empty array when no items match filters', () => {
			const items = [
				createMockItem('test-001', Status.Completed, true),
				createMockItem('test-002', Status.Completed, true)
			];
			writePrdFile(items);
			fileManager.initialize(testWorkspacePath);

			const queue = runLoopManager.buildQueue({ 
				statusFilter: Status.NotStarted 
			});
			
			assert.strictEqual(queue.length, 0, 'Should return empty array');
		});

		test('Handles "all" filter value', () => {
			const items = [
				createMockItem('test-001', Status.NotStarted),
				createMockItem('test-002', Status.InProgress),
				createMockItem('test-003', Status.Completed, true)
			];
			writePrdFile(items);
			fileManager.initialize(testWorkspacePath);

			const queue = runLoopManager.buildQueue({ 
				statusFilter: 'all',
				categoryFilter: 'all'
			});
			
			assert.strictEqual(queue.length, 3, 'Should return all items when filters are "all"');
		});
	});

	suite('Loop State Management', () => {
		test('isLoopRunning returns false initially', () => {
			assert.strictEqual(runLoopManager.isLoopRunning(), false, 'Loop should not be running initially');
		});

		test('isLoopRunning returns true during execution', async () => {
			const items = [createMockItem('test-001', Status.NotStarted)];
			writePrdFile(items);
			fileManager.initialize(testWorkspacePath);
			runLoopManager.initialize(testWorkspacePath);

			// Start the loop in the background
			const loopPromise = runLoopManager.startLoop({
				onItemStart: () => {
					assert.strictEqual(runLoopManager.isLoopRunning(), true, 'Loop should be running');
					runLoopManager.stopLoop();
				}
			});

			await loopPromise;
			assert.strictEqual(runLoopManager.isLoopRunning(), false, 'Loop should not be running after completion');
		});

		test('Throws error when starting loop while already running', async () => {
			const items = [createMockItem('test-001', Status.NotStarted)];
			writePrdFile(items);
			fileManager.initialize(testWorkspacePath);
			runLoopManager.initialize(testWorkspacePath);

			let errorThrown = false;
			
			// Start first loop
			const loop1Promise = runLoopManager.startLoop({
				onItemStart: async () => {
					// Try to start second loop while first is running
					try {
						await runLoopManager.startLoop({});
					} catch (error: any) {
						errorThrown = true;
						assert.strictEqual(error.message, 'Run loop is already running');
					}
					runLoopManager.stopLoop();
				}
			});

			await loop1Promise;
			assert.strictEqual(errorThrown, true, 'Should throw error when starting loop while running');
		});
	});

	suite('Cancellation', () => {
		test('stopLoop cancels running loop', async () => {
			const items = [
				createMockItem('test-001', Status.NotStarted),
				createMockItem('test-002', Status.NotStarted),
				createMockItem('test-003', Status.NotStarted)
			];
			writePrdFile(items);
			fileManager.initialize(testWorkspacePath);
			runLoopManager.initialize(testWorkspacePath);

			let itemsProcessed = 0;
			
			const loopPromise = runLoopManager.startLoop({
				onItemStart: (item) => {
					itemsProcessed++;
					if (itemsProcessed === 1) {
						// Stop after first item starts
						runLoopManager.stopLoop();
					}
				}
			});

			await loopPromise;
			
			assert.strictEqual(itemsProcessed, 1, 'Should process only 1 item before stopping');
			assert.strictEqual(runLoopManager.isLoopRunning(), false, 'Loop should not be running after stop');
		});

		test('Cancellation prevents processing remaining items', async () => {
			const items = [
				createMockItem('test-001', Status.NotStarted),
				createMockItem('test-002', Status.NotStarted),
				createMockItem('test-003', Status.NotStarted)
			];
			writePrdFile(items);
			fileManager.initialize(testWorkspacePath);
			runLoopManager.initialize(testWorkspacePath);

			const processedItems: string[] = [];
			
			const loopPromise = runLoopManager.startLoop({
				onItemComplete: (item) => {
					processedItems.push(item.id);
					if (processedItems.length === 1) {
						runLoopManager.stopLoop();
					}
				}
			});

			await loopPromise;
			
			assert.strictEqual(processedItems.length, 1, 'Should only complete 1 item');
			assert.strictEqual(processedItems[0], 'test-001');
		});
	});

	suite('Callbacks', () => {
		test('onItemStart callback is called for each item', async () => {
			const items = [
				createMockItem('test-001', Status.NotStarted),
				createMockItem('test-002', Status.NotStarted)
			];
			writePrdFile(items);
			fileManager.initialize(testWorkspacePath);
			runLoopManager.initialize(testWorkspacePath);

			const startedItems: string[] = [];
			
			const loopPromise = runLoopManager.startLoop({
				onItemStart: (item) => {
					startedItems.push(item.id);
					runLoopManager.stopLoop();
				}
			});

			await loopPromise;
			
			assert.strictEqual(startedItems.length, 1, 'Should call onItemStart for first item');
			assert.strictEqual(startedItems[0], 'test-001');
		});

		test('onItemComplete callback receives success status', async () => {
			const items = [createMockItem('test-001', Status.NotStarted)];
			writePrdFile(items);
			fileManager.initialize(testWorkspacePath);
			runLoopManager.initialize(testWorkspacePath);

			let completedItem: PrdItem | undefined = undefined;
			let successStatus: boolean | undefined = undefined;
			
			const loopPromise = runLoopManager.startLoop({
				onItemComplete: (item, success) => {
					completedItem = item;
					successStatus = success;
					runLoopManager.stopLoop();
				}
			});

			await loopPromise;
			
			assert.notStrictEqual(completedItem, undefined, 'Should call onItemComplete');
			assert.strictEqual(completedItem!.id, 'test-001');
			assert.strictEqual(typeof successStatus, 'boolean', 'Success should be a boolean');
		});

		test('onLoopComplete callback provides summary statistics', async () => {
			const items = [
				createMockItem('test-001', Status.NotStarted)
			];
			writePrdFile(items);
			fileManager.initialize(testWorkspacePath);
			runLoopManager.initialize(testWorkspacePath);

			let processedCount: number | null = null;
			let successCount: number | null = null;
			let failureCount: number | null = null;
			
			const loopPromise = runLoopManager.startLoop({
				onItemStart: () => {
					runLoopManager.stopLoop();
				},
				onLoopComplete: (processed, success, failure) => {
					processedCount = processed;
					successCount = success;
					failureCount = failure;
				}
			});

			await loopPromise;
			
			assert.strictEqual(typeof processedCount, 'number', 'processedCount should be a number');
			assert.strictEqual(typeof successCount, 'number', 'successCount should be a number');
			assert.strictEqual(typeof failureCount, 'number', 'failureCount should be a number');
		});

		test('Iteration parameter passed to callbacks when iterationsPerItem > 1', async () => {
			const items = [createMockItem('test-001', Status.NotStarted)];
			writePrdFile(items);
			fileManager.initialize(testWorkspacePath);
			runLoopManager.initialize(testWorkspacePath);

			const startIterations: number[] = [];
			const completeIterations: number[] = [];
			
			const loopPromise = runLoopManager.startLoop({
				iterationsPerItem: 3,
				onItemStart: (item, iteration) => {
					if (iteration !== undefined) {
						startIterations.push(iteration);
					}
					if (startIterations.length === 2) {
						runLoopManager.stopLoop();
					}
				},
				onItemComplete: (item, success, iteration) => {
					if (iteration !== undefined) {
						completeIterations.push(iteration);
					}
				}
			});

			await loopPromise;
			
			assert.ok(startIterations.length >= 1, 'Should have at least one iteration');
			assert.strictEqual(startIterations[0], 1, 'First iteration should be 1');
			if (startIterations.length > 1) {
				assert.strictEqual(startIterations[1], 2, 'Second iteration should be 2');
			}
		});
	});

	suite('Empty Queue Handling', () => {
		test('Handles empty queue gracefully', async () => {
			const items: PrdItem[] = [];
			writePrdFile(items);
			fileManager.initialize(testWorkspacePath);
			runLoopManager.initialize(testWorkspacePath);

			let loopCompleted = false;
			
			const loopPromise = runLoopManager.startLoop({
				onLoopComplete: () => {
					loopCompleted = true;
				}
			});

			await loopPromise;
			
			assert.strictEqual(loopCompleted, false, 'onLoopComplete should not be called for empty queue');
			assert.strictEqual(runLoopManager.isLoopRunning(), false);
		});

		test('Shows message when no items match filters', async () => {
			const items = [createMockItem('test-001', Status.Completed, true)];
			writePrdFile(items);
			fileManager.initialize(testWorkspacePath);
			runLoopManager.initialize(testWorkspacePath);

			await runLoopManager.startLoop({ 
				statusFilter: Status.NotStarted 
			});
			
			assert.strictEqual(runLoopManager.isLoopRunning(), false);
		});
	});

	suite('Integration Tests', () => {
		test('End-to-end queue execution with multiple items', async () => {
			const items = [
				createMockItem('test-001', Status.NotStarted, false, 'setup'),
				createMockItem('test-002', Status.NotStarted, false, 'ui'),
				createMockItem('test-003', Status.NotStarted, false, 'test')
			];
			writePrdFile(items);
			fileManager.initialize(testWorkspacePath);
			runLoopManager.initialize(testWorkspacePath);

			const processedIds: string[] = [];
			let loopComplete = false;
			
			const loopPromise = runLoopManager.startLoop({
				onItemStart: (item) => {
					processedIds.push(item.id);
					runLoopManager.stopLoop();
				},
				onLoopComplete: (processed, success, failure) => {
					loopComplete = true;
				}
			});

			await loopPromise;
			
			assert.strictEqual(processedIds.length, 1, 'Should process first item before stopping');
			assert.strictEqual(processedIds[0], 'test-001');
			assert.strictEqual(loopComplete, true, 'Should call completion callback');
		});

		test('Queue respects order and processes sequentially', async () => {
			const items = [
				createMockItem('test-001', Status.NotStarted),
				createMockItem('test-002', Status.NotStarted),
				createMockItem('test-003', Status.NotStarted)
			];
			writePrdFile(items);
			fileManager.initialize(testWorkspacePath);
			runLoopManager.initialize(testWorkspacePath);

			const processingOrder: string[] = [];
			
			const loopPromise = runLoopManager.startLoop({
				onItemStart: (item) => {
					processingOrder.push(item.id);
					if (processingOrder.length === 2) {
						runLoopManager.stopLoop();
					}
				}
			});

			await loopPromise;
			
			assert.strictEqual(processingOrder.length, 2);
			assert.strictEqual(processingOrder[0], 'test-001', 'First item should be test-001');
			assert.strictEqual(processingOrder[1], 'test-002', 'Second item should be test-002');
		});
	});
});
