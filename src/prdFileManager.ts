import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { PrdItem } from './prdTreeDataProvider';
import { PrdFileError } from './errors';
import { Logger } from './logger';
import { validatePrdFile } from './validation';

/**
 * Service for managing PRD file operations
 * 
 * This class provides a centralized abstraction for all prd.json file operations,
 * including reading, writing, validation, and backup/recovery mechanisms.
 * 
 * Features:
 * - Atomic updates with automatic backup
 * - File validation on read and write
 * - Automatic recovery from failed writes
 * - Centralized error handling
 * - Transaction-like operations for data integrity
 */
export class PrdFileManager {
	private static instance: PrdFileManager;
	private logger = Logger.getInstance();
	private prdFilePath: string | undefined;
	private backupPath: string | undefined;

	private constructor() {
		this.logger.debug('Initializing PrdFileManager');
	}

	/**
	 * Gets the singleton instance of PrdFileManager
	 */
	public static getInstance(): PrdFileManager {
		if (!PrdFileManager.instance) {
			PrdFileManager.instance = new PrdFileManager();
		}
		return PrdFileManager.instance;
	}

	/**
	 * Initializes the file manager with workspace path
	 * 
	 * @param workspacePath - Root path of the workspace
	 * @returns The path to the prd.json file if found, undefined otherwise
	 */
	public initialize(workspacePath: string): string | undefined {
		const prdPath = path.join(workspacePath, 'plans', 'prd.json');
		
		if (!fs.existsSync(prdPath)) {
			this.logger.warn('PRD file not found', { path: prdPath });
			this.prdFilePath = undefined;
			this.backupPath = undefined;
			return undefined;
		}

		this.prdFilePath = prdPath;
		this.backupPath = `${prdPath}.backup`;
		this.logger.info('PrdFileManager initialized', { path: this.prdFilePath });
		
		return this.prdFilePath;
	}

	/**
	 * Gets the current PRD file path
	 * 
	 * @throws {PrdFileError} If file manager not initialized
	 */
	public getFilePath(): string {
		if (!this.prdFilePath) {
			throw PrdFileError.notFound('prd.json - file manager not initialized');
		}
		return this.prdFilePath;
	}

	/**
	 * Reads and validates the PRD file
	 * 
	 * @returns Array of validated PRD items
	 * @throws {PrdFileError} If file not found, cannot be read, parsed, or validated
	 */
	public read(): PrdItem[] {
		const filePath = this.getFilePath();

		try {
			this.logger.debug('Reading PRD file', { path: filePath });
			const content = fs.readFileSync(filePath, 'utf-8');
			
			// Parse JSON
			let parsedData: unknown;
			try {
				parsedData = JSON.parse(content);
			} catch (parseError) {
				throw PrdFileError.parseError(filePath, parseError as Error);
			}

			// Validate data
			const validationResult = validatePrdFile(parsedData);
			if (!validationResult.success) {
				const errorMsg = validationResult.error || 'Unknown validation error';
				this.logger.error('PRD file validation failed', { 
					errors: validationResult.errors 
				});
				throw PrdFileError.validationError(errorMsg);
			}

			this.logger.info('PRD file read successfully', { 
				itemCount: validationResult.data!.length 
			});
			return validationResult.data!;

		} catch (error) {
			if (error instanceof PrdFileError) {
				throw error;
			}
			throw PrdFileError.readError(filePath, error as Error);
		}
	}

	/**
	 * Writes PRD items to file with automatic backup
	 * 
	 * This method:
	 * - Validates the data before writing
	 * - Creates a backup of the current file
	 * - Writes the new data atomically
	 * - Automatically recovers from failed writes using backup
	 * 
	 * @param items - Array of PRD items to write
	 * @throws {PrdFileError} If validation fails or write fails
	 */
	public write(items: PrdItem[]): void {
		const filePath = this.getFilePath();

		// Validate data before writing
		const validationResult = validatePrdFile(items);
		if (!validationResult.success) {
			const errorMsg = validationResult.error || 'Unknown validation error';
			this.logger.error('Cannot write invalid PRD data', { 
				errors: validationResult.errors 
			});
			throw PrdFileError.validationError(errorMsg);
		}

		try {
			// Create backup before writing
			this.createBackup();

			// Write new data
			this.logger.debug('Writing PRD file', { 
				path: filePath, 
				itemCount: items.length 
			});
			const content = JSON.stringify(items, null, '\t');
			fs.writeFileSync(filePath, content, 'utf-8');
			
			this.logger.info('PRD file written successfully', { itemCount: items.length });

		} catch (error) {
			// Attempt recovery from backup
			this.logger.error('Write failed, attempting recovery', error);
			try {
				this.restoreFromBackup();
				this.logger.info('Successfully recovered from backup');
			} catch (recoveryError) {
				this.logger.error('Recovery from backup failed', recoveryError);
			}
			throw PrdFileError.writeError(filePath, error as Error);
		}
	}

	/**
	 * Updates a single PRD item in the file
	 * 
	 * This is an atomic operation - if the update fails, the file is unchanged.
	 * 
	 * @param itemId - ID of the item to update
	 * @param updateFn - Function that receives the item and returns updated version
	 * @returns The updated item
	 * @throws {PrdFileError} If item not found or update fails
	 */
	public updateItem(itemId: string, updateFn: (item: PrdItem) => PrdItem): PrdItem {
		const items = this.read();
		const itemIndex = items.findIndex(item => item.id === itemId);

		if (itemIndex === -1) {
			throw new Error(`Item not found: ${itemId}`);
		}

		// Apply update
		const originalItem = { ...items[itemIndex] };
		items[itemIndex] = updateFn(items[itemIndex]);

		try {
			this.write(items);
			this.logger.info('Item updated successfully', { id: itemId });
			return items[itemIndex];
		} catch (error) {
			// Update failed, item remains unchanged
			this.logger.error('Item update failed', { id: itemId, error });
			throw error;
		}
	}

	/**
	 * Adds a new item to the PRD file
	 * 
	 * @param item - The new PRD item to add
	 * @throws {PrdFileError} If write fails
	 */
	public addItem(item: PrdItem): void {
		const items = this.read();
		items.push(item);
		this.write(items);
		this.logger.info('Item added successfully', { id: item.id });
	}

	/**
	 * Removes an item from the PRD file
	 * 
	 * @param itemId - ID of the item to remove
	 * @throws {PrdFileError} If item not found or write fails
	 */
	public removeItem(itemId: string): void {
		const items = this.read();
		const itemIndex = items.findIndex(item => item.id === itemId);

		if (itemIndex === -1) {
			throw new Error(`Item not found: ${itemId}`);
		}

		items.splice(itemIndex, 1);
		this.write(items);
		this.logger.info('Item removed successfully', { id: itemId });
	}

	/**
	 * Executes multiple operations as a transaction
	 * 
	 * If any operation fails, all changes are rolled back via backup restoration.
	 * 
	 * @param operations - Function that performs multiple operations on items
	 * @returns Result of the transaction function
	 * @throws {PrdFileError} If any operation fails
	 */
	public transaction<T>(operations: (items: PrdItem[]) => T): T {
		const items = this.read();
		
		try {
			// Create backup before transaction
			this.createBackup();
			
			// Execute operations
			const result = operations(items);
			
			// Commit changes
			this.write(items);
			
			this.logger.info('Transaction completed successfully');
			return result;
			
		} catch (error) {
			// Rollback on error
			this.logger.error('Transaction failed, rolling back', error);
			try {
				this.restoreFromBackup();
				this.logger.info('Transaction rolled back successfully');
			} catch (recoveryError) {
				this.logger.error('Rollback failed', recoveryError);
			}
			throw error;
		}
	}

	/**
	 * Creates a backup of the current PRD file
	 * 
	 * @throws {Error} If backup creation fails
	 */
	private createBackup(): void {
		if (!this.prdFilePath || !this.backupPath) {
			return;
		}

		if (!fs.existsSync(this.prdFilePath)) {
			return;
		}

		try {
			fs.copyFileSync(this.prdFilePath, this.backupPath);
			this.logger.debug('Backup created', { path: this.backupPath });
		} catch (error) {
			this.logger.warn('Failed to create backup', error);
			// Don't throw - backup failure shouldn't prevent operations
		}
	}

	/**
	 * Restores the PRD file from backup
	 * 
	 * @throws {Error} If restore fails
	 */
	private restoreFromBackup(): void {
		if (!this.prdFilePath || !this.backupPath) {
			throw new Error('Cannot restore: backup path not set');
		}

		if (!fs.existsSync(this.backupPath)) {
			throw new Error('Cannot restore: backup file does not exist');
		}

		fs.copyFileSync(this.backupPath, this.prdFilePath);
		this.logger.info('Restored from backup', { path: this.backupPath });
	}

	/**
	 * Manually creates a backup with custom name
	 * 
	 * Useful for creating named backups before major operations.
	 * 
	 * @param suffix - Suffix to add to backup filename
	 * @returns Path to the created backup file
	 */
	public createNamedBackup(suffix: string): string {
		const filePath = this.getFilePath();
		const backupPath = `${filePath}.${suffix}.backup`;
		
		try {
			fs.copyFileSync(filePath, backupPath);
			this.logger.info('Named backup created', { path: backupPath });
			return backupPath;
		} catch (error) {
			throw new Error(`Failed to create backup: ${error}`);
		}
	}

	/**
	 * Checks if the PRD file exists
	 */
	public exists(): boolean {
		return this.prdFilePath !== undefined && fs.existsSync(this.prdFilePath);
	}

	/**
	 * Gets file statistics
	 */
	public getStats(): { size: number; modified: Date } | null {
		if (!this.prdFilePath || !fs.existsSync(this.prdFilePath)) {
			return null;
		}

		const stats = fs.statSync(this.prdFilePath);
		return {
			size: stats.size,
			modified: stats.mtime
		};
	}
}
