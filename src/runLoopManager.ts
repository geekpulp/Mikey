import * as vscode from 'vscode';
import { PrdItem } from './prdTreeDataProvider';
import { PrdFileManager } from './prdFileManager';
import { Logger } from './logger';
import { Status } from './constants';
import { CompletionDetector } from './completionDetector';

/**
 * Options for configuring the run loop
 */
export interface RunLoopOptions {
	/** Filter items by status (e.g., 'not-started', 'in-progress') */
	statusFilter?: Status | 'all';
	
	/** Filter items by category (e.g., 'setup', 'ui', 'functional') */
	categoryFilter?: string | 'all';
	
	/** Stop on first failure */
	stopOnFailure?: boolean;
	
	/** Maximum number of items to process (0 = unlimited) */
	maxItems?: number;
	
	/** Number of iterations to run per item (default: 1) */
	iterationsPerItem?: number;
	
	/** Callback when item processing starts */
	onItemStart?: (item: PrdItem, iteration?: number) => void;
	
	/** Callback when item processing completes */
	onItemComplete?: (item: PrdItem, success: boolean, iteration?: number) => void;
	
	/** Callback when loop completes */
	onLoopComplete?: (processedCount: number, successCount: number, failureCount: number) => void;
}

/**
 * Result of processing a single PRD item
 */
export interface ProcessingResult {
	item: PrdItem;
	success: boolean;
	error?: Error;
	skipped: boolean;
}

/**
 * Manages sequential processing of PRD items in a run loop
 * 
 * This class provides a queue-based system for automatically working through PRD items.
 * It can filter items by status and category, update their status as work progresses,
 * and persist changes back to the prd.json file.
 * 
 * Features:
 * - Sequential item processing with configurable filters
 * - Automatic status management (not-started -> in-progress -> completed)
 * - Stop-on-failure option for critical workflows
 * - Progress callbacks for UI integration
 * - Comprehensive error handling and logging
 */
export class RunLoopManager {
	private logger = Logger.getInstance();
	private fileManager = PrdFileManager.getInstance();
	private completionDetector = new CompletionDetector();
	private isRunning = false;
	private cancellationToken?: vscode.CancellationTokenSource;

	/**
	 * Builds a queue of items to process based on filter criteria
	 * 
	 * @param options - Filter options for selecting items
	 * @returns Array of items matching the filter criteria
	 */
	public buildQueue(options: RunLoopOptions = {}): PrdItem[] {
		this.logger.debug('Building run queue', { options });
		
		let items = this.fileManager.read();
		
		// Apply status filter
		if (options.statusFilter && options.statusFilter !== 'all') {
			items = items.filter(item => item.status === options.statusFilter);
		}
		
		// Apply category filter
		if (options.categoryFilter && options.categoryFilter !== 'all') {
			items = items.filter(item => item.category === options.categoryFilter);
		}
		
		// Apply max items limit
		if (options.maxItems && options.maxItems > 0) {
			items = items.slice(0, options.maxItems);
		}
		
		this.logger.info('Queue built', { 
			totalItems: items.length,
			statusFilter: options.statusFilter || 'all',
			categoryFilter: options.categoryFilter || 'all'
		});
		
		return items;
	}

	/**
	 * Initializes the run loop manager with workspace context
	 * 
	 * @param workspaceRoot - Root path of the workspace
	 */
	public initialize(workspaceRoot: string): void {
		this.completionDetector.initialize(workspaceRoot);
		this.logger.info('RunLoopManager initialized', { workspaceRoot });
	}

	/**
	 * Starts processing the queue of PRD items
	 * 
	 * This method processes items sequentially, updating their status and calling
	 * appropriate callbacks. It can be cancelled via the returned cancellation token.
	 * 
	 * @param options - Configuration options for the run loop
	 * @returns Promise that resolves when all items are processed or loop is cancelled
	 * @throws Error if loop is already running
	 */
	public async startLoop(options: RunLoopOptions = {}): Promise<void> {
		if (this.isRunning) {
			throw new Error('Run loop is already running');
		}

		this.isRunning = true;
		this.cancellationToken = new vscode.CancellationTokenSource();
		
		try {
			const queue = this.buildQueue(options);
			
			if (queue.length === 0) {
				this.logger.info('No items to process');
				vscode.window.showInformationMessage('No PRD items match the specified criteria');
				return;
			}

			this.logger.info('Starting run loop', { itemCount: queue.length });
			
			let processedCount = 0;
			let successCount = 0;
			let failureCount = 0;

			// Show progress indicator
			await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: 'Processing PRD Items',
				cancellable: true
			}, async (progress, token) => {
				token.onCancellationRequested(() => {
					this.logger.info('Run loop cancelled by user');
					this.cancellationToken?.cancel();
				});

				const iterations = options.iterationsPerItem || 1;
				
				for (let i = 0; i < queue.length; i++) {
					if (this.cancellationToken?.token.isCancellationRequested) {
						this.logger.info('Run loop cancelled', { 
							processedCount, 
							successCount, 
							failureCount 
						});
						break;
					}

					const item = queue[i];
					
					// Process item for specified number of iterations
					for (let iteration = 1; iteration <= iterations; iteration++) {
						if (this.cancellationToken?.token.isCancellationRequested) {
							break;
						}
						
						const iterationMsg = iterations > 1 ? ` (iteration ${iteration}/${iterations})` : '';
						
						progress.report({
							increment: 100 / (queue.length * iterations),
							message: `${i + 1}/${queue.length}: ${item.description}${iterationMsg}`
						});

						this.logger.info('Processing item', { 
							id: item.id, 
							index: i + 1, 
							total: queue.length,
							iteration,
							totalIterations: iterations
						});

						const result = await this.processItem(item, options, iteration);
						processedCount++;

						if (result.success) {
							successCount++;
						} else {
							failureCount++;
							
							if (options.stopOnFailure) {
								this.logger.warn('Stopping on failure', { 
									itemId: item.id,
									iteration,
									error: result.error?.message 
								});
								break;
							}
						}
					}
					
					// Break outer loop if cancelled or stopped on failure
					if (this.cancellationToken?.token.isCancellationRequested) {
						break;
					}
					if (options.stopOnFailure && failureCount > 0) {
						break;
					}
				}

				return;
			});

			this.logger.info('Run loop completed', { 
				processedCount, 
				successCount, 
				failureCount 
			});

			// Call completion callback
			if (options.onLoopComplete) {
				options.onLoopComplete(processedCount, successCount, failureCount);
			}

			// Show summary
			const message = failureCount > 0
				? `Processed ${processedCount} items: ${successCount} succeeded, ${failureCount} failed`
				: `Successfully processed ${successCount} items`;
			
			vscode.window.showInformationMessage(message);

		} finally {
			this.isRunning = false;
			this.cancellationToken?.dispose();
			this.cancellationToken = undefined;
		}
	}

	/**
	 * Processes a single PRD item
	 * 
	 * This method:
	 * 1. Updates item status to 'in-progress'
	 * 2. Calls the onItemStart callback
	 * 3. Triggers GitHub Copilot Chat to work on the item
	 * 4. Waits for completion detection
	 * 5. Updates status based on result
	 * 6. Calls the onItemComplete callback
	 * 
	 * @param item - The PRD item to process
	 * @param options - Options containing callbacks
	 * @param iteration - Current iteration number (1-based)
	 * @returns Processing result
	 */
	private async processItem(item: PrdItem, options: RunLoopOptions, iteration: number = 1): Promise<ProcessingResult> {
		try {
			// Skip if already completed
			if (item.status === 'completed' && item.passes) {
				this.logger.debug('Skipping already completed item', { id: item.id });
				return { item, success: true, skipped: true };
			}

			// Call start callback
			if (options.onItemStart) {
				options.onItemStart(item, iteration);
			}

			// Update status to in-progress (only on first iteration)
			if (iteration === 1) {
				this.fileManager.updateItem(item.id, (currentItem) => ({
					...currentItem,
					status: 'in-progress' as Status
				}));

				this.logger.info('Item status updated to in-progress', { id: item.id });
			}

			// Execute the "Start Work" command which opens Copilot Chat
			await vscode.commands.executeCommand('ralph.startWork', item);

			// Wait for completion detection
			const detectionResult = await this.waitForCompletion(item);
			
			const success = detectionResult.isComplete;
			
			// If detected as complete, mark it and record
			if (success) {
				await this.completionDetector.markItemComplete(item.id, true);
				await this.completionDetector.recordCompletion(item, detectionResult);
			}
			
			// Call completion callback
			if (options.onItemComplete) {
				options.onItemComplete(item, success, iteration);
			}

			return { item, success, skipped: false };

		} catch (error) {
			this.logger.error('Error processing item', { id: item.id, error });
			
			// Call completion callback with failure
			if (options.onItemComplete) {
				options.onItemComplete(item, false, iteration);
			}

			return { 
				item, 
				success: false, 
				skipped: false,
				error: error as Error
			};
		}
	}

	/**
	 * Waits for item completion detection
	 * Polls periodically to check if the item is complete
	 * 
	 * @param item - The item being worked on
	 * @returns Detection result
	 */
	private async waitForCompletion(item: PrdItem): Promise<any> {
		const maxWaitTime = 5 * 60 * 1000; // 5 minutes max
		const pollInterval = 5000; // Check every 5 seconds
		const startTime = Date.now();

		this.logger.info('Waiting for completion detection', { itemId: item.id });

		while (Date.now() - startTime < maxWaitTime) {
			// Check if cancelled
			if (this.cancellationToken?.token.isCancellationRequested) {
				return { isComplete: false, reason: 'Cancelled by user', method: 'none' };
			}

			// Check for completion
			const result = this.completionDetector.detectCompletion(item);
			
			if (result.isComplete) {
				this.logger.info('Completion detected', { 
					itemId: item.id, 
					method: result.method,
					reason: result.reason 
				});
				return result;
			}

			// Wait before next check
			await new Promise(resolve => setTimeout(resolve, pollInterval));
		}

		// Timeout - assume not complete
		this.logger.warn('Completion detection timed out', { itemId: item.id });
		return { 
			isComplete: false, 
			reason: 'Timeout waiting for completion', 
			method: 'none' 
		};
	}

	/**
	 * Stops the currently running loop
	 */
	public stopLoop(): void {
		if (this.isRunning && this.cancellationToken) {
			this.logger.info('Stopping run loop');
			this.cancellationToken.cancel();
		}
	}

	/**
	 * Checks if the run loop is currently running
	 */
	public isLoopRunning(): boolean {
		return this.isRunning;
	}
}
