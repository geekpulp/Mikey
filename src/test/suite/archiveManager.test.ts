import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ArchiveManager } from '../../archiveManager';
import { PrdItem } from '../../prdTreeDataProvider';
import { Status } from '../../constants';

suite('ArchiveManager Test Suite', () => {
	let archiveManager: ArchiveManager;
	let testWorkspacePath: string;
	let plansDir: string;

	/**
	 * Helper to create a mock PRD item
	 */
	function createMockItem(
		id: string,
		status: Status = Status.NotStarted,
		passes: boolean = false
	): PrdItem {
		return {
			id,
			category: 'test',
			description: `Test item ${id}`,
			steps: [],
			status,
			passes
		};
	}

	setup(() => {
		// Create a temporary directory for test workspace
		testWorkspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'ralph-archive-test-'));
		plansDir = path.join(testWorkspacePath, 'plans');
		
		// Create plans directory
		if (!fs.existsSync(plansDir)) {
			fs.mkdirSync(plansDir, { recursive: true });
		}

		// Initialize archive manager
		archiveManager = ArchiveManager.getInstance();
		archiveManager.initialize(testWorkspacePath);
	});

	teardown(() => {
		// Clean up temporary directory
		if (fs.existsSync(testWorkspacePath)) {
			fs.rmSync(testWorkspacePath, { recursive: true, force: true });
		}
	});

	suite('Archivable Item Identification', () => {
		test('should identify completed and passing item as archivable', () => {
			const item = createMockItem('test-001', Status.Completed, true);
			assert.strictEqual(archiveManager.isArchivable(item), true);
		});

		test('should not identify completed but failing item as archivable', () => {
			const item = createMockItem('test-001', Status.Completed, false);
			assert.strictEqual(archiveManager.isArchivable(item), false);
		});

		test('should not identify in-progress item as archivable', () => {
			const item = createMockItem('test-001', Status.InProgress, true);
			assert.strictEqual(archiveManager.isArchivable(item), false);
		});

		test('should not identify not-started item as archivable', () => {
			const item = createMockItem('test-001', Status.NotStarted, false);
			assert.strictEqual(archiveManager.isArchivable(item), false);
		});

		test('should filter archivable items from a list', () => {
			const items: PrdItem[] = [
				createMockItem('test-001', Status.Completed, true),  // archivable
				createMockItem('test-002', Status.Completed, false), // not archivable (fails)
				createMockItem('test-003', Status.InProgress, true), // not archivable (in progress)
				createMockItem('test-004', Status.Completed, true),  // archivable
				createMockItem('test-005', Status.NotStarted, false) // not archivable
			];

			const archivable = archiveManager.getArchivableItems(items);
			
			assert.strictEqual(archivable.length, 2);
			assert.strictEqual(archivable[0].id, 'test-001');
			assert.strictEqual(archivable[1].id, 'test-004');
		});

		test('should return empty array when no items are archivable', () => {
			const items: PrdItem[] = [
				createMockItem('test-001', Status.InProgress, true),
				createMockItem('test-002', Status.NotStarted, false)
			];

			const archivable = archiveManager.getArchivableItems(items);
			assert.strictEqual(archivable.length, 0);
		});
	});

	suite('Archive File Creation and Naming', () => {
		test('should generate correct archive filename for current date', () => {
			const today = new Date();
			const year = today.getFullYear();
			const month = String(today.getMonth() + 1).padStart(2, '0');
			const day = String(today.getDate()).padStart(2, '0');
			const expectedFilename = `prd-archive-${year}-${month}-${day}.json`;

			const items = [createMockItem('test-001', Status.Completed, true)];
			const archivePath = archiveManager.saveToArchive(items);

			assert.ok(archivePath.includes(expectedFilename));
		});

		test('should generate correct archive filename for specific date', () => {
			const testDate = new Date('2024-03-15');
			const items = [createMockItem('test-001', Status.Completed, true)];
			const archivePath = archiveManager.saveToArchive(items, testDate);

			assert.ok(archivePath.includes('prd-archive-2024-03-15.json'));
		});

		test('should save archive file in plans directory', () => {
			const items = [createMockItem('test-001', Status.Completed, true)];
			const archivePath = archiveManager.saveToArchive(items);

			assert.ok(archivePath.startsWith(plansDir));
			assert.ok(fs.existsSync(archivePath));
		});

		test('should return empty string when archiving zero items', () => {
			const archivePath = archiveManager.saveToArchive([]);
			assert.strictEqual(archivePath, '');
		});
	});

	suite('Archive File Content Validation', () => {
		test('should save items with correct JSON structure', () => {
			const items = [
				createMockItem('test-001', Status.Completed, true),
				createMockItem('test-002', Status.Completed, true)
			];

			const archivePath = archiveManager.saveToArchive(items);
			const content = fs.readFileSync(archivePath, 'utf-8');
			const savedItems = JSON.parse(content);

			assert.strictEqual(savedItems.length, 2);
			assert.strictEqual(savedItems[0].id, 'test-001');
			assert.strictEqual(savedItems[1].id, 'test-002');
		});

		test('should preserve all item fields in archive', () => {
			const item: PrdItem = {
				id: 'test-001',
				category: 'functional',
				description: 'Test description',
				steps: [
					{ text: 'Step 1', completed: true },
					{ text: 'Step 2', completed: false }
				],
				status: Status.Completed,
				passes: true
			};

			const archivePath = archiveManager.saveToArchive([item]);
			const content = fs.readFileSync(archivePath, 'utf-8');
			const savedItems = JSON.parse(content);

			assert.deepStrictEqual(savedItems[0], item);
		});

		test('should merge with existing archive file', () => {
			const firstBatch = [createMockItem('test-001', Status.Completed, true)];
			const secondBatch = [createMockItem('test-002', Status.Completed, true)];

			const archivePath1 = archiveManager.saveToArchive(firstBatch);
			const archivePath2 = archiveManager.saveToArchive(secondBatch);

			// Should use same file
			assert.strictEqual(archivePath1, archivePath2);

			const content = fs.readFileSync(archivePath1, 'utf-8');
			const savedItems = JSON.parse(content);

			assert.strictEqual(savedItems.length, 2);
		});

		test('should deduplicate items when merging', () => {
			const item1 = createMockItem('test-001', Status.Completed, true);
			const item2 = { ...item1, description: 'Updated description' };

			archiveManager.saveToArchive([item1]);
			const archivePath = archiveManager.saveToArchive([item2]);

			const content = fs.readFileSync(archivePath, 'utf-8');
			const savedItems = JSON.parse(content);

			// Should have only one item with updated description
			assert.strictEqual(savedItems.length, 1);
			assert.strictEqual(savedItems[0].description, 'Updated description');
		});

		test('should format JSON with tabs', () => {
			const items = [createMockItem('test-001', Status.Completed, true)];
			const archivePath = archiveManager.saveToArchive(items);
			const content = fs.readFileSync(archivePath, 'utf-8');

			// Check that content uses tabs (not spaces)
			assert.ok(content.includes('\t'));
			assert.ok(!content.match(/^  /m)); // No lines starting with double space
		});
	});

	suite('Archiving Workflow End-to-End', () => {
		test('should archive completed items and return remaining items', () => {
			const items: PrdItem[] = [
				createMockItem('test-001', Status.Completed, true),  // archivable
				createMockItem('test-002', Status.InProgress, true), // not archivable
				createMockItem('test-003', Status.Completed, true),  // archivable
				createMockItem('test-004', Status.NotStarted, false) // not archivable
			];

			const result = archiveManager.archiveCompleted(items);

			assert.strictEqual(result.archivedCount, 2);
			assert.strictEqual(result.remainingItems.length, 2);
			assert.ok(result.archiveFile.length > 0);
			assert.ok(fs.existsSync(result.archiveFile));
		});

		test('should return all items when nothing to archive', () => {
			const items: PrdItem[] = [
				createMockItem('test-001', Status.InProgress, true),
				createMockItem('test-002', Status.NotStarted, false)
			];

			const result = archiveManager.archiveCompleted(items);

			assert.strictEqual(result.archivedCount, 0);
			assert.strictEqual(result.remainingItems.length, 2);
			assert.strictEqual(result.archiveFile, '');
		});

		test('should list archive files', () => {
			const items1 = [createMockItem('test-001', Status.Completed, true)];
			const items2 = [createMockItem('test-002', Status.Completed, true)];

			archiveManager.saveToArchive(items1, new Date('2024-03-15'));
			archiveManager.saveToArchive(items2, new Date('2024-03-16'));

			const archiveFiles = archiveManager.listArchiveFiles();

			assert.strictEqual(archiveFiles.length, 2);
			// Should be sorted with most recent first
			assert.ok(archiveFiles[0].includes('2024-03-16'));
			assert.ok(archiveFiles[1].includes('2024-03-15'));
		});

		test('should load items from archive file', () => {
			const items = [
				createMockItem('test-001', Status.Completed, true),
				createMockItem('test-002', Status.Completed, true)
			];

			const archivePath = archiveManager.saveToArchive(items);
			const loadedItems = archiveManager.loadArchive(archivePath);

			assert.strictEqual(loadedItems.length, 2);
			assert.strictEqual(loadedItems[0].id, 'test-001');
			assert.strictEqual(loadedItems[1].id, 'test-002');
		});

		test('should handle archiving to multiple different dates', () => {
			const items1 = [createMockItem('test-001', Status.Completed, true)];
			const items2 = [createMockItem('test-002', Status.Completed, true)];

			const archive1 = archiveManager.saveToArchive(items1, new Date('2024-03-15'));
			const archive2 = archiveManager.saveToArchive(items2, new Date('2024-03-16'));

			assert.notStrictEqual(archive1, archive2);
			assert.ok(fs.existsSync(archive1));
			assert.ok(fs.existsSync(archive2));
		});
	});

	suite('Archive Cleanup and Retention', () => {
		test('should delete archives older than retention period', () => {
			// Create archives with different dates
			const oldDate = new Date();
			oldDate.setDate(oldDate.getDate() - 100); // 100 days ago
			
			const recentDate = new Date();
			recentDate.setDate(recentDate.getDate() - 10); // 10 days ago

			archiveManager.saveToArchive([createMockItem('old', Status.Completed, true)], oldDate);
			archiveManager.saveToArchive([createMockItem('recent', Status.Completed, true)], recentDate);

			// Clean up archives older than 90 days
			const deletedCount = archiveManager.cleanupOldArchives(90);

			assert.strictEqual(deletedCount, 1);
			const remaining = archiveManager.listArchiveFiles();
			assert.strictEqual(remaining.length, 1);
		});

		test('should not delete archives when retention is 0', () => {
			archiveManager.saveToArchive([createMockItem('test', Status.Completed, true)]);
			
			const deletedCount = archiveManager.cleanupOldArchives(0);
			
			assert.strictEqual(deletedCount, 0);
			const remaining = archiveManager.listArchiveFiles();
			assert.strictEqual(remaining.length, 1);
		});

		test('should handle cleanup when no archives exist', () => {
			const deletedCount = archiveManager.cleanupOldArchives(90);
			assert.strictEqual(deletedCount, 0);
		});
	});

	suite('Error Handling', () => {
		test('should throw error when trying to load non-existent archive', () => {
			const fakePath = path.join(plansDir, 'non-existent-archive.json');
			
			assert.throws(() => {
				archiveManager.loadArchive(fakePath);
			}, /Failed to load archive/);
		});

		test('should handle invalid JSON in archive file', () => {
			const archivePath = path.join(plansDir, 'prd-archive-2024-01-01.json');
			fs.writeFileSync(archivePath, 'invalid json content', 'utf-8');

			assert.throws(() => {
				archiveManager.loadArchive(archivePath);
			}, /Failed to load archive/);
		});
	});

	suite('Extract Archivable Items', () => {
		test('should extract archivable and remaining items separately', () => {
			const items: PrdItem[] = [
				createMockItem('test-001', Status.Completed, true),  // archivable
				createMockItem('test-002', Status.InProgress, true), // not archivable
				createMockItem('test-003', Status.Completed, true),  // archivable
			];

			const result = archiveManager.extractArchivableItems(items);

			assert.strictEqual(result.archivable.length, 2);
			assert.strictEqual(result.remaining.length, 1);
			assert.strictEqual(result.archivable[0].id, 'test-001');
			assert.strictEqual(result.archivable[1].id, 'test-003');
			assert.strictEqual(result.remaining[0].id, 'test-002');
		});

		test('should return empty archivable array when nothing to archive', () => {
			const items: PrdItem[] = [
				createMockItem('test-001', Status.InProgress, true),
			];

			const result = archiveManager.extractArchivableItems(items);

			assert.strictEqual(result.archivable.length, 0);
			assert.strictEqual(result.remaining.length, 1);
		});

		test('should handle empty input array', () => {
			const result = archiveManager.extractArchivableItems([]);

			assert.strictEqual(result.archivable.length, 0);
			assert.strictEqual(result.remaining.length, 0);
		});
	});
});
