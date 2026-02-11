/**
 * Tests for ConfigManager
 */

import * as assert from 'assert';
import { ConfigManager } from '../../config';

describe('ConfigManager', () => {
	afterEach(() => {
		// Reset singleton between tests
		ConfigManager.resetInstance();
	});

	it('should return singleton instance', () => {
		const instance1 = ConfigManager.getInstance();
		const instance2 = ConfigManager.getInstance();
		assert.strictEqual(instance1, instance2);
	});

	it('should provide default PRD file path', () => {
		const config = ConfigManager.getInstance();
		const prdPath = config.getPrdFilePath();
		assert.strictEqual(prdPath, 'plans/prd.json');
	});

	it('should provide default skills directory', () => {
		const config = ConfigManager.getInstance();
		const skillsDir = config.getSkillsDirectory();
		assert.strictEqual(skillsDir, 'skills');
	});

	it('should provide default test skills directory', () => {
		const config = ConfigManager.getInstance();
		const testSkillsDir = config.getTestSkillsDirectory();
		assert.strictEqual(testSkillsDir, 'test/skills');
	});

	it('should provide default prompts directory', () => {
		const config = ConfigManager.getInstance();
		const promptsDir = config.getPromptsDirectory();
		assert.strictEqual(promptsDir, 'prompts');
	});

	it('should provide default prompt template', () => {
		const config = ConfigManager.getInstance();
		const template = config.getPromptTemplate();
		assert.strictEqual(template, 'prompts/default.txt');
	});

	it('should provide default feature branch prefix', () => {
		const config = ConfigManager.getInstance();
		const prefix = config.getFeatureBranchPrefix();
		assert.strictEqual(prefix, 'feature/');
	});

	it('should provide default main branch', () => {
		const config = ConfigManager.getInstance();
		const mainBranch = config.getMainBranch();
		assert.strictEqual(mainBranch, 'main');
	});

	it('should provide default categories', () => {
		const config = ConfigManager.getInstance();
		const categories = config.getCategories();
		assert.ok(Array.isArray(categories));
		assert.ok(categories.length > 0);
		assert.ok(categories.includes('setup'));
		assert.ok(categories.includes('ui'));
		assert.ok(categories.includes('functional'));
	});

	it('should provide debug mode setting', () => {
		const config = ConfigManager.getInstance();
		const debugMode = config.isDebugMode();
		assert.strictEqual(typeof debugMode, 'boolean');
	});

	it('should return copy of configuration object', () => {
		const config = ConfigManager.getInstance();
		const config1 = config.getConfig();
		const config2 = config.getConfig();
		
		// Should be equal but not the same reference
		assert.notStrictEqual(config1, config2);
		assert.deepStrictEqual(config1, config2);
	});

	it('should return copy of categories array', () => {
		const config = ConfigManager.getInstance();
		const categories1 = config.getCategories();
		const categories2 = config.getCategories();
		
		// Should be equal but not the same reference
		assert.notStrictEqual(categories1, categories2);
		assert.deepStrictEqual(categories1, categories2);
	});

	it('should dispose properly', () => {
		const config = ConfigManager.getInstance();
		assert.doesNotThrow(() => {
			config.dispose();
		});
	});

	it('should reset instance properly', () => {
		const instance1 = ConfigManager.getInstance();
		ConfigManager.resetInstance();
		const instance2 = ConfigManager.getInstance();
		assert.notStrictEqual(instance1, instance2);
	});
});
