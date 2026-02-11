import * as vscode from 'vscode';

import { Status } from '../../constants';

/**
 * Mock WorkspaceConfiguration for testing
 */
export class MockWorkspaceConfiguration implements vscode.WorkspaceConfiguration {
	private config: Map<string, any> = new Map();

	get<T>(section: string): T | undefined;
	get<T>(section: string, defaultValue: T): T;
	get(section: any, defaultValue?: any) {
		return this.config.has(section) ? this.config.get(section) : defaultValue;
	}

	has(section: string): boolean {
		return this.config.has(section);
	}

	inspect<T>(section: string): { key: string } | undefined {
		return undefined;
	}

	update(section: string, value: any, configurationTarget?: vscode.ConfigurationTarget | boolean): Thenable<void> {
		this.config.set(section, value);
		return Promise.resolve();
	}

	set(section: string, value: any): void {
		this.config.set(section, value);
	}

	[key: string]: any;
}

/**
 * Mock file system for testing
 */
export class MockFileSystem {
	private files: Map<string, string> = new Map();

	writeFile(path: string, content: string): void {
		this.files.set(path, content);
	}

	readFile(path: string): string | undefined {
		return this.files.get(path);
	}

	exists(path: string): boolean {
		return this.files.has(path);
	}

	clear(): void {
		this.files.clear();
	}
}

/**
 * Create a mock PRD item for testing
 */
export function createMockPrdItem(overrides?: Partial<any>): any {
	return {
		id: 'test-001',
		category: 'test',
		description: 'Test item',
		steps: [],
		status: Status.NotStarted,
		passes: false,
		...overrides
	};
}
