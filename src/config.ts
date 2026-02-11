/**
 * Configuration management for the Ralph extension
 * 
 * This module provides a centralized way to access and manage VS Code workspace
 * and user configuration settings for the Ralph extension.
 * 
 * @remarks
 * - Configuration values are loaded from VS Code settings
 * - Provides type-safe access to configuration values
 * - Supports default values for all settings
 * - Singleton pattern ensures consistent configuration across extension
 */

import * as vscode from 'vscode';
import { Category } from './constants';

/**
 * Configuration interface for Ralph extension
 */
export interface RalphConfiguration {
	/** Path to the PRD JSON file (relative to workspace root) */
	prdFilePath: string;
	
	/** Directory containing skill reference files */
	skillsDirectory: string;
	
	/** Directory containing test skill files */
	testSkillsDirectory: string;
	
	/** Directory containing prompt templates */
	promptsDirectory: string;
	
	/** Path to the prompt template file */
	promptTemplate: string;
	
	/** Prefix for feature branches */
	featureBranchPrefix: string;
	
	/** Name of the main/default branch */
	mainBranch: string;
	
	/** Available categories for PRD items */
	categories: string[];
	
	/** Enable debug logging */
	debugMode: boolean;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: RalphConfiguration = {
	prdFilePath: 'plans/prd.json',
	skillsDirectory: 'skills',
	testSkillsDirectory: 'test/skills',
	promptsDirectory: 'prompts',
	promptTemplate: 'prompts/default.txt',
	featureBranchPrefix: 'feature/',
	mainBranch: 'main',
	categories: [
		Category.Setup,
		Category.UI,
		Category.Functional,
		Category.Git,
		Category.Agent,
		Category.Polish,
		Category.Test,
		Category.Refactor,
		Category.Quality,
		Category.Security,
		Category.Bug,
		Category.Action,
		Category.Docs,
		Category.Audit
	],
	debugMode: false
};

/**
 * ConfigManager - Centralized configuration management service
 * 
 * This singleton class provides type-safe access to all Ralph extension configuration.
 * It reads from VS Code workspace settings and provides defaults for unset values.
 * 
 * @example
 * ```typescript
 * const config = ConfigManager.getInstance();
 * const prdPath = config.getPrdFilePath();
 * const categories = config.getCategories();
 * ```
 */
export class ConfigManager {
	private static instance: ConfigManager | null = null;
	private config: RalphConfiguration;
	private disposables: vscode.Disposable[] = [];

	private constructor() {
		this.config = this.loadConfiguration();
		
		// Watch for configuration changes
		this.disposables.push(
			vscode.workspace.onDidChangeConfiguration((e) => {
				if (e.affectsConfiguration('ralph') || e.affectsConfiguration('mikey')) {
					this.config = this.loadConfiguration();
				}
			})
		);
	}

	/**
	 * Get the singleton instance of ConfigManager
	 * 
	 * @returns The ConfigManager instance
	 */
	public static getInstance(): ConfigManager {
		if (!ConfigManager.instance) {
			ConfigManager.instance = new ConfigManager();
		}
		return ConfigManager.instance;
	}

	/**
	 * Reset the singleton instance (primarily for testing)
	 */
	public static resetInstance(): void {
		if (ConfigManager.instance) {
			ConfigManager.instance.dispose();
			ConfigManager.instance = null;
		}
	}

	/**
	 * Load configuration from VS Code settings
	 * 
	 * @returns Complete configuration with defaults applied
	 */
	private loadConfiguration(): RalphConfiguration {
		const vsConfig = vscode.workspace.getConfiguration('ralph');
		const mikeyConfig = vscode.workspace.getConfiguration('mikey');
		
		return {
			prdFilePath: vsConfig.get<string>('prdFilePath', DEFAULT_CONFIG.prdFilePath),
			skillsDirectory: vsConfig.get<string>('skillsDirectory', DEFAULT_CONFIG.skillsDirectory),
			testSkillsDirectory: vsConfig.get<string>('testSkillsDirectory', DEFAULT_CONFIG.testSkillsDirectory),
			promptsDirectory: vsConfig.get<string>('promptsDirectory', DEFAULT_CONFIG.promptsDirectory),
			promptTemplate: mikeyConfig.get<string>('promptTemplate', DEFAULT_CONFIG.promptTemplate),
			featureBranchPrefix: vsConfig.get<string>('featureBranchPrefix', DEFAULT_CONFIG.featureBranchPrefix),
			mainBranch: vsConfig.get<string>('mainBranch', DEFAULT_CONFIG.mainBranch),
			categories: vsConfig.get<string[]>('categories', DEFAULT_CONFIG.categories),
			debugMode: vsConfig.get<boolean>('debugMode', DEFAULT_CONFIG.debugMode)
		};
	}

	/**
	 * Get the full configuration object
	 * 
	 * @returns The complete configuration
	 */
	public getConfig(): Readonly<RalphConfiguration> {
		return { ...this.config };
	}

	/**
	 * Get the PRD file path (relative to workspace root)
	 * 
	 * @returns The PRD file path
	 */
	public getPrdFilePath(): string {
		return this.config.prdFilePath;
	}

	/**
	 * Get the skills directory path
	 * 
	 * @returns The skills directory path
	 */
	public getSkillsDirectory(): string {
		return this.config.skillsDirectory;
	}

	/**
	 * Get the test skills directory path
	 * 
	 * @returns The test skills directory path
	 */
	public getTestSkillsDirectory(): string {
		return this.config.testSkillsDirectory;
	}

	/**
	 * Get the prompts directory path
	 * 
	 * @returns The prompts directory path
	 */
	public getPromptsDirectory(): string {
		return this.config.promptsDirectory;
	}

	/**
	 * Get the prompt template file path
	 * 
	 * @returns The prompt template path
	 */
	public getPromptTemplate(): string {
		return this.config.promptTemplate;
	}

	/**
	 * Get the feature branch prefix
	 * 
	 * @returns The feature branch prefix
	 */
	public getFeatureBranchPrefix(): string {
		return this.config.featureBranchPrefix;
	}

	/**
	 * Get the main branch name
	 * 
	 * @returns The main branch name
	 */
	public getMainBranch(): string {
		return this.config.mainBranch;
	}

	/**
	 * Get the list of available categories
	 * 
	 * @returns Array of category names
	 */
	public getCategories(): string[] {
		return [...this.config.categories];
	}

	/**
	 * Check if debug mode is enabled
	 * 
	 * @returns True if debug mode is enabled
	 */
	public isDebugMode(): boolean {
		return this.config.debugMode;
	}

	/**
	 * Dispose of configuration manager resources
	 */
	public dispose(): void {
		this.disposables.forEach(d => d.dispose());
		this.disposables = [];
	}
}
