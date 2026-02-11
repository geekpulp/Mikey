import * as fs from 'fs';
import * as path from 'path';
import { PrdItem } from './prdTreeDataProvider';
import { Logger } from './logger';

/**
 * Manages archiving of completed PRD items
 * 
 * This module provides functionality to archive completed items from prd.json
 * to dated archive files, keeping the active PRD file lean and focused.
 * 
 * Archive format: prd-archive-YYYY-MM-DD.json
 * Items are archived when: status === "completed" AND passes === true
 */
export class ArchiveManager {
	private static instance: ArchiveManager;
	private logger = Logger.getInstance();
	private workspacePath: string | undefined;

	private constructor() {
		this.logger.debug('Initializing ArchiveManager');
	}

	/**
	 * Gets the singleton instance of ArchiveManager
	 */
	public static getInstance(): ArchiveManager {
		if (!ArchiveManager.instance) {
			ArchiveManager.instance = new ArchiveManager();
		}
		return ArchiveManager.instance;
	}

	/**
	 * Initializes the archive manager with workspace path
	 */
	public initialize(workspacePath: string): void {
		this.workspacePath = workspacePath;
		this.logger.info('ArchiveManager initialized', { path: workspacePath });
	}

	/**
	 * Gets the workspace path
	 */
	private getWorkspacePath(): string {
		if (!this.workspacePath) {
			throw new Error('ArchiveManager not initialized');
		}
		return this.workspacePath;
	}

	/**
	 * Gets the archive directory path (same directory as prd.json)
	 */
	private getArchiveDirectory(): string {
		return path.join(this.getWorkspacePath(), 'plans');
	}

	/**
	 * Generates archive filename for given date
	 */
	private getArchiveFileName(date: Date = new Date()): string {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		return `prd-archive-${year}-${month}-${day}.json`;
	}

	/**
	 * Gets the full path to archive file for given date
	 */
	private getArchiveFilePath(date: Date = new Date()): string {
		const archiveDir = this.getArchiveDirectory();
		const archiveFileName = this.getArchiveFileName(date);
		return path.join(archiveDir, archiveFileName);
	}

	/**
	 * Checks if an item is archivable (completed AND passes)
	 */
	public isArchivable(item: PrdItem): boolean {
		return item.status === 'completed' && item.passes === true;
	}

	/**
	 * Identifies all archivable items from the given list
	 */
	public getArchivableItems(items: PrdItem[]): PrdItem[] {
		return items.filter(item => this.isArchivable(item));
	}

	/**
	 * Extracts archivable items from the given list and returns remaining items
	 * 
	 * @returns Object containing archivable items and remaining items
	 */
	public extractArchivableItems(items: PrdItem[]): {
		archivable: PrdItem[];
		remaining: PrdItem[];
	} {
		const archivable: PrdItem[] = [];
		const remaining: PrdItem[] = [];

		items.forEach(item => {
			if (this.isArchivable(item)) {
				archivable.push(item);
			} else {
				remaining.push(item);
			}
		});

		this.logger.debug('Extracted archivable items', {
			total: items.length,
			archivable: archivable.length,
			remaining: remaining.length
		});

		return { archivable, remaining };
	}

	/**
	 * Saves items to archive file
	 * 
	 * If archive file already exists, appends items to it.
	 * Items are merged and deduplicated by ID.
	 */
	public saveToArchive(items: PrdItem[], date: Date = new Date()): string {
		if (items.length === 0) {
			this.logger.info('No items to archive');
			return '';
		}

		const archivePath = this.getArchiveFilePath(date);
		
		try {
			let existingItems: PrdItem[] = [];

			// Load existing archive if it exists
			if (fs.existsSync(archivePath)) {
				const content = fs.readFileSync(archivePath, 'utf-8');
				existingItems = JSON.parse(content);
				this.logger.debug('Loaded existing archive', { 
					path: archivePath, 
					count: existingItems.length 
				});
			}

			// Merge items, avoiding duplicates by ID
			const itemMap = new Map<string, PrdItem>();
			
			// Add existing items first
			existingItems.forEach(item => itemMap.set(item.id, item));
			
			// Add or update with new items
			items.forEach(item => itemMap.set(item.id, item));

			const mergedItems = Array.from(itemMap.values());

			// Write archive file
			const content = JSON.stringify(mergedItems, null, '\t');
			fs.writeFileSync(archivePath, content, 'utf-8');

			this.logger.info('Items archived successfully', {
				path: archivePath,
				newItems: items.length,
				totalItems: mergedItems.length
			});

			return archivePath;

		} catch (error) {
			this.logger.error('Failed to save archive', error);
			throw new Error(`Failed to save archive: ${error}`);
		}
	}

	/**
	 * Archives completed items from prd.json
	 * 
	 * This is the main public API for archiving.
	 * It extracts archivable items, saves them to archive, and returns remaining items.
	 * 
	 * @param items - Current PRD items
	 * @returns Object containing archive info and remaining items
	 */
	public archiveCompleted(items: PrdItem[]): {
		archivedCount: number;
		archiveFile: string;
		remainingItems: PrdItem[];
	} {
		const { archivable, remaining } = this.extractArchivableItems(items);
		
		if (archivable.length === 0) {
			this.logger.info('No items to archive');
			return {
				archivedCount: 0,
				archiveFile: '',
				remainingItems: items
			};
		}

		const archiveFile = this.saveToArchive(archivable);

		return {
			archivedCount: archivable.length,
			archiveFile,
			remainingItems: remaining
		};
	}

	/**
	 * Lists all archive files in the archive directory
	 */
	public listArchiveFiles(): string[] {
		const archiveDir = this.getArchiveDirectory();
		
		if (!fs.existsSync(archiveDir)) {
			return [];
		}

		try {
			const files = fs.readdirSync(archiveDir);
			const archiveFiles = files
				.filter(file => file.startsWith('prd-archive-') && file.endsWith('.json'))
				.sort()
				.reverse(); // Most recent first

			return archiveFiles.map(file => path.join(archiveDir, file));
		} catch (error) {
			this.logger.error('Failed to list archive files', error);
			return [];
		}
	}

	/**
	 * Loads items from a specific archive file
	 */
	public loadArchive(archiveFile: string): PrdItem[] {
		try {
			const content = fs.readFileSync(archiveFile, 'utf-8');
			const items = JSON.parse(content);
			this.logger.info('Loaded archive file', { 
				path: archiveFile, 
				count: items.length 
			});
			return items;
		} catch (error) {
			this.logger.error('Failed to load archive file', error);
			throw new Error(`Failed to load archive: ${error}`);
		}
	}

	/**
	 * Cleans up archive files older than the specified retention period
	 * 
	 * @param retentionDays - Number of days to retain archive files (0 = keep forever)
	 * @returns Number of files deleted
	 */
	public cleanupOldArchives(retentionDays: number): number {
		if (retentionDays <= 0) {
			this.logger.debug('Archive cleanup skipped (retention disabled)');
			return 0;
		}

		const archiveFiles = this.listArchiveFiles();
		if (archiveFiles.length === 0) {
			return 0;
		}

		const cutoffDate = new Date();
		cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
		const cutoffTime = cutoffDate.getTime();

		let deletedCount = 0;

		for (const archiveFile of archiveFiles) {
			try {
				const stats = fs.statSync(archiveFile);
				const fileDate = stats.mtime.getTime();

				if (fileDate < cutoffTime) {
					fs.unlinkSync(archiveFile);
					deletedCount++;
					this.logger.info('Deleted old archive file', {
						path: archiveFile,
						age: Math.floor((Date.now() - fileDate) / (1000 * 60 * 60 * 24)) + ' days'
					});
				}
			} catch (error) {
				this.logger.error('Failed to delete archive file', { path: archiveFile, error });
			}
		}

		if (deletedCount > 0) {
			this.logger.info('Archive cleanup completed', {
				deletedCount,
				retentionDays
			});
		}

		return deletedCount;
	}
}
