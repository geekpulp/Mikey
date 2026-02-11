import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { PrdItem, PrdStep } from './prdTreeDataProvider';
import { PrdFileManager } from './prdFileManager';
import { Logger } from './logger';
import { Status } from './constants';

/**
 * Token to detect completion in progress.txt or other output
 */
export const COMPLETION_TOKEN = '<promise>COMPLETE</promise>';

/**
 * Options for completion detection
 */
export interface CompletionDetectionOptions {
	/** Check for completion token in progress.txt */
	checkProgressFile?: boolean;
	
	/** Check if all steps are completed */
	checkStepsComplete?: boolean;
	
	/** Check if status is already completed */
	checkStatus?: boolean;
	
	/** Path to progress.txt file */
	progressFilePath?: string;
}

/**
 * Result of completion detection
 */
export interface CompletionDetectionResult {
	/** Whether the item is detected as complete */
	isComplete: boolean;
	
	/** Reason for detection (or why not complete) */
	reason: string;
	
	/** Detection method used */
	method: 'token' | 'steps' | 'status' | 'none';
}

/**
 * Detects completion of PRD items and manages auto-advancement
 * 
 * This class provides multiple methods for detecting when a PRD item is complete:
 * - Token detection: Looks for COMPLETION_TOKEN in progress.txt
 * - Steps complete: Checks if all steps in the item are marked as completed
 * - Status check: Verifies if item already has completed status
 * 
 * Features:
 * - Multiple detection strategies
 * - Automatic status updates on completion
 * - Progress file integration
 * - Tree view refresh on changes
 */
export class CompletionDetector {
	private logger = Logger.getInstance();
	private fileManager = PrdFileManager.getInstance();
	private workspaceRoot: string | undefined;

	/**
	 * Initializes the completion detector
	 * 
	 * @param workspaceRoot - Root path of the workspace
	 */
	public initialize(workspaceRoot: string): void {
		this.workspaceRoot = workspaceRoot;
		this.logger.info('CompletionDetector initialized', { workspaceRoot });
	}

	/**
	 * Detects if a PRD item is complete using configured detection methods
	 * 
	 * @param item - The PRD item to check
	 * @param options - Detection options
	 * @returns Detection result with completion status and reason
	 */
	public detectCompletion(
		item: PrdItem,
		options: CompletionDetectionOptions = {}
	): CompletionDetectionResult {
		const opts = {
			checkProgressFile: true,
			checkStepsComplete: true,
			checkStatus: true,
			...options
		};

		this.logger.debug('Detecting completion for item', { 
			id: item.id, 
			options: opts 
		});

		// Check if already completed
		if (opts.checkStatus && item.status === Status.Completed && item.passes) {
			return {
				isComplete: true,
				reason: 'Item already marked as completed with passes=true',
				method: 'status'
			};
		}

		// Check for completion token in progress.txt
		if (opts.checkProgressFile) {
			const tokenResult = this.checkCompletionToken(item.id, opts.progressFilePath);
			if (tokenResult.isComplete) {
				return tokenResult;
			}
		}

		// Check if all steps are completed
		if (opts.checkStepsComplete) {
			const stepsResult = this.checkStepsComplete(item);
			if (stepsResult.isComplete) {
				return stepsResult;
			}
		}

		// Not complete
		return {
			isComplete: false,
			reason: 'No completion criteria met',
			method: 'none'
		};
	}

	/**
	 * Checks for completion token in progress.txt
	 * 
	 * @param itemId - The ID of the item being checked
	 * @param progressFilePath - Optional custom path to progress.txt
	 * @returns Detection result
	 */
	private checkCompletionToken(
		itemId: string,
		progressFilePath?: string
	): CompletionDetectionResult {
		try {
			const filePath = progressFilePath || this.getProgressFilePath();
			
			if (!filePath || !fs.existsSync(filePath)) {
				this.logger.debug('Progress file not found', { path: filePath });
				return {
					isComplete: false,
					reason: 'Progress file not found',
					method: 'token'
				};
			}

			const content = fs.readFileSync(filePath, 'utf-8');
			
			// Look for completion token
			if (content.includes(COMPLETION_TOKEN)) {
				this.logger.info('Completion token found', { itemId });
				return {
					isComplete: true,
					reason: `Found completion token ${COMPLETION_TOKEN} in progress.txt`,
					method: 'token'
				};
			}

			return {
				isComplete: false,
				reason: 'Completion token not found in progress.txt',
				method: 'token'
			};

		} catch (error) {
			this.logger.error('Error checking completion token', { itemId, error });
			return {
				isComplete: false,
				reason: `Error reading progress file: ${error}`,
				method: 'token'
			};
		}
	}

	/**
	 * Checks if all steps in the item are completed
	 * 
	 * @param item - The PRD item to check
	 * @returns Detection result
	 */
	private checkStepsComplete(item: PrdItem): CompletionDetectionResult {
		if (!item.steps || item.steps.length === 0) {
			return {
				isComplete: false,
				reason: 'Item has no steps',
				method: 'steps'
			};
		}

		const totalSteps = item.steps.length;
		let completedSteps = 0;

		for (const step of item.steps) {
			if (typeof step === 'object' && (step as PrdStep).completed) {
				completedSteps++;
			}
		}

		const allComplete = completedSteps === totalSteps && totalSteps > 0;

		if (allComplete) {
			this.logger.info('All steps completed', { 
				itemId: item.id, 
				completedSteps, 
				totalSteps 
			});
			return {
				isComplete: true,
				reason: `All ${totalSteps} steps are completed`,
				method: 'steps'
			};
		}

		return {
			isComplete: false,
			reason: `Only ${completedSteps}/${totalSteps} steps completed`,
			method: 'steps'
		};
	}

	/**
	 * Marks an item as completed and updates the PRD file
	 * 
	 * @param itemId - ID of the item to mark as complete
	 * @param passes - Whether the item passes acceptance criteria (default: true)
	 * @returns The updated item
	 */
	public async markItemComplete(
		itemId: string,
		passes: boolean = true
	): Promise<PrdItem> {
		this.logger.info('Marking item as complete', { itemId, passes });

		const updatedItem = this.fileManager.updateItem(itemId, (item) => ({
			...item,
			status: Status.Completed,
			passes
		}));

		this.logger.info('Item marked as complete', { itemId, status: updatedItem.status });
		return updatedItem;
	}

	/**
	 * Records completion in progress.txt
	 * 
	 * @param item - The completed item
	 * @param detectionResult - The detection result
	 */
	public async recordCompletion(
		item: PrdItem,
		detectionResult: CompletionDetectionResult
	): Promise<void> {
		try {
			const progressPath = this.getProgressFilePath();
			if (!progressPath) {
				this.logger.warn('Cannot record completion: progress.txt path not found');
				return;
			}

			const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
			const entry = `\n## Completed ${item.id}: ${item.description}\n\n` +
				`**Date:** ${timestamp}\n\n` +
				`**Detection method:** ${detectionResult.method}\n` +
				`**Reason:** ${detectionResult.reason}\n\n` +
				`**Item status:** completed, passes: ${item.passes}\n\n`;

			fs.appendFileSync(progressPath, entry, 'utf-8');
			this.logger.info('Completion recorded in progress.txt', { itemId: item.id });

		} catch (error) {
			this.logger.error('Error recording completion', { itemId: item.id, error });
		}
	}

	/**
	 * Gets the next item to work on after the current one
	 * 
	 * @param currentItemId - ID of the current item
	 * @returns The next item, or undefined if no more items
	 */
	public getNextItem(currentItemId: string): PrdItem | undefined {
		const allItems = this.fileManager.read();
		const currentIndex = allItems.findIndex(item => item.id === currentItemId);
		
		if (currentIndex === -1) {
			this.logger.warn('Current item not found', { currentItemId });
			return undefined;
		}

		// Find next not-started or in-progress item
		for (let i = currentIndex + 1; i < allItems.length; i++) {
			const item = allItems[i];
			if (item.status === Status.NotStarted || item.status === Status.InProgress) {
				this.logger.info('Found next item', { 
					currentItemId, 
					nextItemId: item.id 
				});
				return item;
			}
		}

		this.logger.info('No next item found (all items completed?)', { currentItemId });
		return undefined;
	}

	/**
	 * Gets the path to progress.txt
	 */
	private getProgressFilePath(): string | undefined {
		if (!this.workspaceRoot) {
			return undefined;
		}
		return path.join(this.workspaceRoot, 'progress.txt');
	}

	/**
	 * Checks all in-progress items for completion and auto-advances
	 * 
	 * This method can be called periodically or on file changes to detect
	 * when items are complete and automatically advance to the next item.
	 * 
	 * @param onComplete - Callback when an item is detected as complete
	 * @returns Array of items that were detected as complete
	 */
	public async checkAndAdvance(
		onComplete?: (item: PrdItem, nextItem?: PrdItem) => void
	): Promise<PrdItem[]> {
		const allItems = this.fileManager.read();
		const inProgressItems = allItems.filter(
			item => item.status === Status.InProgress
		);

		const completedItems: PrdItem[] = [];

		for (const item of inProgressItems) {
			const result = this.detectCompletion(item);
			
			if (result.isComplete) {
				this.logger.info('Item auto-detected as complete', { 
					itemId: item.id, 
					method: result.method 
				});

				// Mark as complete
				const updatedItem = await this.markItemComplete(item.id, true);
				
				// Record in progress.txt
				await this.recordCompletion(updatedItem, result);
				
				// Get next item
				const nextItem = this.getNextItem(item.id);
				
				completedItems.push(updatedItem);
				
				// Call callback
				if (onComplete) {
					onComplete(updatedItem, nextItem);
				}

				// Show notification
				if (nextItem) {
					const message = `✓ Completed ${item.id}. Next: ${nextItem.id}`;
					vscode.window.showInformationMessage(message);
				} else {
					const message = `✓ Completed ${item.id}. All items complete!`;
					vscode.window.showInformationMessage(message);
				}
			}
		}

		return completedItems;
	}
}
