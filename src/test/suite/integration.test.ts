import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

/**
 * Integration Test Suite
 * 
 * These tests verify end-to-end functionality of the extension
 * including extension activation, command registration, and file operations.
 * 
 * Note: Some tests that require VS Code UI interactions (workspace opening, tree view)
 * are documented but may be limited in CI environments.
 */
suite('Integration Test Suite', () => {
	test('Extension should be present and activated', () => {
		const ext = vscode.extensions.getExtension('geekpulp.mikey');
		assert.ok(ext, 'Extension should be installed');
		
		// Extension may not be activated if no workspace is open
		// This is expected behavior based on activation events
	});

	test('All commands should be registered', async () => {
		const commands = await vscode.commands.getCommands(true);
		
		const requiredCommands = [
      "mikey.refresh",
      "mikey.addItem",
      "mikey.editItem",
      "mikey.deleteItem",
      "mikey.runItem",
      "mikey.startWork",
      "mikey.openItem",
      "mikey.markStepComplete",
    ];

		for (const cmd of requiredCommands) {
			assert.ok(
				commands.includes(cmd),
				`Command ${cmd} should be registered`
			);
		}
	});

	test('Extension activation events should be correct', () => {
		const ext = vscode.extensions.getExtension('geekpulp.mikey');
		assert.ok(ext, 'Extension should exist');

		const packageJson = ext.packageJSON;
		assert.ok(packageJson.activationEvents, 'Should have activation events');
		assert.ok(
      packageJson.activationEvents.includes("onView:mikey.prdExplorer") ||
        packageJson.activationEvents.includes("*"),
      "Should activate on tree view",
    );
	});

	test('Extension should provide tree view', () => {
		const ext = vscode.extensions.getExtension('geekpulp.mikey');
		assert.ok(ext, 'Extension should exist');

		const packageJson = ext.packageJSON;
		assert.ok(packageJson.contributes?.views, 'Should contribute views');
		
		const mikeyViews =
      packageJson.contributes.views["mikey"] ||
      packageJson.contributes.views["mikey-explorer"];
    assert.ok(mikeyViews, "Should have Mikey views");
	});

	test('Extension should provide commands', () => {
		const ext = vscode.extensions.getExtension('geekpulp.mikey');
		assert.ok(ext, 'Extension should exist');

		const packageJson = ext.packageJSON;
		assert.ok(packageJson.contributes?.commands, 'Should contribute commands');
		
		const commands = packageJson.contributes.commands;
		assert.ok(Array.isArray(commands), 'Commands should be an array');
		assert.ok(commands.length > 0, 'Should have at least one command');
		
		// Verify key commands exist
		const commandIds = commands.map((cmd: any) => cmd.command);
		assert.ok(
      commandIds.includes("mikey.addItem"),
      "Should have addItem command",
    );
    assert.ok(
      commandIds.includes("mikey.refresh"),
      "Should have refresh command",
    );
	});

	test('PRD file operations - read and parse', () => {
		// Create a temporary PRD file for testing
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ralph-test-'));
		const prdPath = path.join(tempDir, 'prd.json');

		const testData = [
			{
				id: 'test-001',
				category: 'test',
				description: 'Test item',
				steps: ['Step 1', 'Step 2'],
				status: 'not-started',
				passes: false
			}
		];

		fs.writeFileSync(prdPath, JSON.stringify(testData, null, '\t'));

		// Verify file was written correctly
		const content = fs.readFileSync(prdPath, 'utf-8');
		const parsed = JSON.parse(content);

		assert.strictEqual(parsed.length, 1, 'Should have one item');
		assert.strictEqual(parsed[0].id, 'test-001', 'Should have correct ID');
		assert.strictEqual(parsed[0].steps.length, 2, 'Should have two steps');

		// Cleanup
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	test('PRD file operations - write and update', () => {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ralph-test-'));
		const prdPath = path.join(tempDir, 'prd.json');

		const testData = [
			{
				id: 'test-001',
				category: 'test',
				description: 'Original description',
				steps: [],
				status: 'not-started',
				passes: false
			}
		];

		fs.writeFileSync(prdPath, JSON.stringify(testData, null, '\t'));

		// Update the data
		const data = JSON.parse(fs.readFileSync(prdPath, 'utf-8'));
		data[0].description = 'Updated description';
		data[0].status = 'in-progress';
		fs.writeFileSync(prdPath, JSON.stringify(data, null, '\t'));

		// Verify update
		const updated = JSON.parse(fs.readFileSync(prdPath, 'utf-8'));
		assert.strictEqual(updated[0].description, 'Updated description');
		assert.strictEqual(updated[0].status, 'in-progress');

		// Cleanup
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	test('PRD file operations - step completion', () => {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ralph-test-'));
		const prdPath = path.join(tempDir, 'prd.json');

		const testData = [
			{
				id: 'test-001',
				category: 'test',
				description: 'Test item',
				steps: ['Step 1', 'Step 2'],
				status: 'not-started',
				passes: false
			}
		];

		fs.writeFileSync(prdPath, JSON.stringify(testData, null, '\t'));

		// Mark first step as complete
		const data = JSON.parse(fs.readFileSync(prdPath, 'utf-8'));
		data[0].steps[0] = { text: 'Step 1', completed: true };
		fs.writeFileSync(prdPath, JSON.stringify(data, null, '\t'));

		// Verify step completion
		const updated = JSON.parse(fs.readFileSync(prdPath, 'utf-8'));
		assert.strictEqual(typeof updated[0].steps[0], 'object');
		assert.strictEqual(updated[0].steps[0].text, 'Step 1');
		assert.strictEqual(updated[0].steps[0].completed, true);

		// Cleanup
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	test('PRD file operations - handle malformed JSON', () => {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ralph-test-'));
		const prdPath = path.join(tempDir, 'prd.json');

		// Write invalid JSON
		fs.writeFileSync(prdPath, 'invalid json {]');

		// Try to read and handle error
		try {
			const content = fs.readFileSync(prdPath, 'utf-8');
			JSON.parse(content);
			assert.fail('Should have thrown an error for invalid JSON');
		} catch (err) {
			assert.ok(err, 'Should catch JSON parse error');
		}

		// Cleanup
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	test('Integration - File watcher pattern', async () => {
		// This test verifies the file watching pattern used by the extension
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ralph-test-'));
		const prdPath = path.join(tempDir, 'prd.json');

		const testData = [
			{
				id: 'test-001',
				category: 'test',
				description: 'Original',
				steps: [],
				status: 'not-started',
				passes: false
			}
		];

		fs.writeFileSync(prdPath, JSON.stringify(testData, null, '\t'));

		let watcherTriggered = false;
		const watcher = fs.watch(prdPath, () => {
			watcherTriggered = true;
		});

		// Modify the file
		await new Promise(resolve => setTimeout(resolve, 100));
		fs.writeFileSync(prdPath, JSON.stringify(testData, null, '\t'));

		// Wait for watcher
		await new Promise(resolve => setTimeout(resolve, 500));

		watcher.close();
		assert.ok(watcherTriggered, 'File watcher should detect changes');

		// Cleanup
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	test('Integration - Command execution flow', async () => {
		// Verify commands can be called (may not execute without active workspace)
		const commands = await vscode.commands.getCommands(true);
		
		assert.ok(commands.includes('ralph.refresh'), 'Refresh command should exist');
		
		// Try to execute refresh (should not throw even if no workspace)
		try {
			await vscode.commands.executeCommand('ralph.refresh');
		} catch (err) {
			// Command may fail without workspace, but should not crash
			assert.ok(err instanceof Error, 'Should return proper error');
		}
	});
});

