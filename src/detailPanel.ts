import * as vscode from 'vscode';
import * as path from 'path';
import { PrdItem, PrdStep } from './prdTreeDataProvider';
import { Status, MessageCommand } from './constants';
import { Logger } from './logger';
import { validateStep, sanitizeInput } from './validation';
import {
  PrdFileError,
  GitOperationError,
  EnvironmentError,
  getUserFriendlyMessage,
  isMikeyError,
} from "./errors";
import { getHtmlForWebview } from './htmlRenderer';
import { getChangedFiles, openFileDiff, handleCompletionMerge } from './gitOperations';
import { buildChatContext, startWorkOnStep } from './stepManager';
import { PrdFileManager } from './prdFileManager';

/**
 * Manages the webview panel for displaying PRD item details
 * 
 * This class provides a detailed view of a single PRD item in a VS Code webview panel.
 * It handles:
 * - Rendering item details (description, status, steps, changed files)
 * - Step completion toggling via checkboxes
 * - Status changes via dropdown
 * - Step CRUD operations (add, edit, delete)
 * - Git workflow integration (start work on steps, view diffs, submit for review)
 * - Real-time updates when the PRD file changes
 * - Security through CSP, input validation, and message sanitization
 * 
 * @remarks
 * This is a singleton - only one detail panel can be open at a time.
 * When opening a new item, the existing panel is reused and updated.
 * The panel persists across tab changes but is disposed when explicitly closed.
 */
export class DetailPanel {
	/** Singleton instance of the current detail panel */
	public static currentPanel: DetailPanel | undefined;
	private readonly _panel: vscode.WebviewPanel;
	private _disposables: vscode.Disposable[] = [];
	private _currentItem: PrdItem | undefined;
	private logger = Logger.getInstance();
	private fileManager = PrdFileManager.getInstance();

	/**
	 * Private constructor - use createOrShow() to instantiate
	 * 
	 * @param panel - The VS Code webview panel to manage
	 * @param extensionUri - The extension's URI for loading resources
	 */
	private constructor(panel: vscode.WebviewPanel, private extensionUri: vscode.Uri) {
		this._panel = panel;
		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
		
		/**
		 * SECURITY: Message handler with validation
		 * All messages from webview are validated before processing to prevent malicious payloads
		 */
		this._panel.webview.onDidReceiveMessage(
			message => {
				// SECURITY: Validate message structure before processing
				if (!this._isValidMessage(message)) {
					this.logger.warn('Invalid message received from webview', { message });
					return;
				}

				switch (message.command) {
					case MessageCommand.ToggleStep:
						if (typeof message.stepIndex === 'number') {
							this.toggleStepCompletion(message.stepIndex);
						}
						break;
					case MessageCommand.ChangeStatus:
						if (typeof message.status === 'string') {
							this.changeItemStatus(message.status).catch(err => {
								vscode.window.showErrorMessage(`Failed to change status: ${err}`);
							});
						}
						break;
					case MessageCommand.TogglePasses:
						this.togglePasses();
						break;
					case MessageCommand.AddStep:
						this.addStep();
						break;
					case MessageCommand.EditStep:
						if (typeof message.stepIndex === 'number') {
							this.editStep(message.stepIndex);
						}
						break;
					case MessageCommand.DeleteStep:
						if (typeof message.stepIndex === 'number') {
							this.deleteStep(message.stepIndex);
						}
						break;
					case 'startWorkOnStep':
						if (typeof message.stepIndex === 'number' && this._currentItem) {
							const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
							if (workspaceRoot) {
								startWorkOnStep(this._currentItem, message.stepIndex, workspaceRoot).catch(err => {
									vscode.window.showErrorMessage(`Failed to start work on step: ${err}`);
								});
							}
						}
						break;
					case 'openFileDiff':
						if (typeof message.filePath === 'string') {
							openFileDiff(message.filePath).catch(err => {
								vscode.window.showErrorMessage(`Failed to open diff: ${err}`);
							});
						}
						break;
					case MessageCommand.SubmitForReview:
						this.submitForReview();
						break;
					default:
						this.logger.warn('Unknown message command', { command: message.command });
				}
			},
			null,
			this._disposables
		);
	}

	/**
	 * Creates a new detail panel or reveals the existing one
	 * 
	 * This is the main entry point for displaying PRD item details.
	 * Implements the singleton pattern - only one panel exists at a time.
	 * 
	 * @param extensionUri - The extension's URI for loading resources
	 * @param item - The PRD item to display
	 * 
	 * @remarks
	 * - If a panel already exists, it will be revealed and updated with the new item
	 * - If no panel exists, a new one is created
	 * - The panel opens in the active editor column or Column One by default
	 * - Content is retained when panel is hidden (retainContextWhenHidden)
	 * 
	 * @example
	 * ```typescript
	 * DetailPanel.createOrShow(context.extensionUri, prdItem);
	 * ```
	 */
	public static createOrShow(extensionUri: vscode.Uri, item: PrdItem) {
		const logger = Logger.getInstance();
		logger.debug('Creating or showing detail panel', { id: item.id });
		const column = vscode.window.activeTextEditor
			? vscode.window.activeTextEditor.viewColumn
			: undefined;

		if (DetailPanel.currentPanel) {
			logger.debug('Reusing existing detail panel');
			DetailPanel.currentPanel._panel.reveal(column);
			DetailPanel.currentPanel.update(item);
			return;
		}

		logger.debug('Creating new detail panel');
		const panel = vscode.window.createWebviewPanel(
      "mikeyDetailPanel",
      "PRD Item Details",
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );

		DetailPanel.currentPanel = new DetailPanel(panel, extensionUri);
		DetailPanel.currentPanel.update(item);
	}

	public async update(item: PrdItem) {
		this.logger.debug('Updating detail panel', { id: item.id });
		this._currentItem = item;
		this._panel.title = `[${item.id}] ${item.description}`;
		
		// Get changed files if applicable
		const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
		const changedFiles = workspaceRoot ? await getChangedFiles(workspaceRoot) : [];
		
		this._panel.webview.html = getHtmlForWebview(item, changedFiles, this._panel.webview.cspSource);
	}

	public dispose() {
		DetailPanel.currentPanel = undefined;

		this._panel.dispose();

		while (this._disposables.length) {
			const disposable = this._disposables.pop();
			if (disposable) {
				disposable.dispose();
			}
		}
	}

	/**
	 * SECURITY: Validate message structure from webview
	 * Prevents malicious or malformed messages from being processed
	 */
	private _isValidMessage(message: any): boolean {
		if (!message || typeof message !== 'object') {
			return false;
		}

		// All messages must have a command field
		if (typeof message.command !== 'string') {
			return false;
		}

		// Validate specific message types
		switch (message.command) {
			case MessageCommand.ToggleStep:
			case MessageCommand.EditStep:
			case MessageCommand.DeleteStep:
			case 'startWorkOnStep':
				return typeof message.stepIndex === 'number' && 
					   message.stepIndex >= 0 && 
					   Number.isInteger(message.stepIndex);
			
			case MessageCommand.ChangeStatus:
				return typeof message.status === 'string' && 
					   [Status.NotStarted, Status.InProgress, Status.InReview, Status.Completed].includes(message.status as Status);
			
			case 'openFileDiff':
				return typeof message.filePath === 'string' && 
					   message.filePath.length > 0;
			
			case MessageCommand.TogglePasses:
			case MessageCommand.AddStep:
			case MessageCommand.SubmitForReview:
				return true;
			
			default:
				return false;
		}
	}

	private toggleStepCompletion(stepIndex: number): void {
		if (!this._currentItem) {
			return;
		}
		
		try {
			// Update using PrdFileManager
			const updatedItem = this.fileManager.updateItem(this._currentItem.id, (item) => {
				// Ensure step exists
				if (stepIndex < 0 || stepIndex >= item.steps.length) {
					throw new Error('Invalid step index');
				}

				// Convert step to object format if it's a string
				const step = item.steps[stepIndex];
				const updatedSteps = [...item.steps];
				
				if (typeof step === 'string') {
					updatedSteps[stepIndex] = { text: step, completed: true };
				} else {
					// Toggle completion state
					updatedSteps[stepIndex] = { ...step, completed: !step.completed };
				}

				return {
					...item,
					steps: updatedSteps
				};
			});
			
			// Update current item reference and refresh view
			this._currentItem = updatedItem;
			this.update(updatedItem);
			
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to update step: ${error}`);
		}
	}

	private async changeItemStatus(newStatus: string): Promise<void> {
		if (!this._currentItem) {
			return;
		}

		// Validate status value
		const validStatuses = [Status.NotStarted, Status.InProgress, Status.InReview, Status.Completed];
		if (!validStatuses.includes(newStatus as Status)) {
			vscode.window.showErrorMessage(`Invalid status: ${newStatus}`);
			return;
		}

		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders) {
			vscode.window.showErrorMessage('No workspace folder found');
			return;
		}
		
		try {
			// Update using PrdFileManager
			const updatedItem = this.fileManager.updateItem(this._currentItem.id, (item) => ({
				...item,
				status: newStatus as Status
			}));
			
			// Update current item reference and refresh view
			this._currentItem = updatedItem;
			this.update(updatedItem);
			
			vscode.window.showInformationMessage(`Status updated to: ${newStatus}`);
			
			// If status is completed, trigger auto-merge workflow
			if (newStatus === Status.Completed) {
				await handleCompletionMerge(workspaceFolders[0].uri.fsPath, this._currentItem.description);
			}
			
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to update status: ${error}`);
		}
	}

	private togglePasses(): void {
		if (!this._currentItem) {
			return;
		}
		
		try {
			// Update using PrdFileManager
			const updatedItem = this.fileManager.updateItem(this._currentItem.id, (item) => ({
				...item,
				passes: !item.passes
			}));
			
			// Update current item reference and refresh view
			this._currentItem = updatedItem;
			this.update(updatedItem);
			
			const passesValue = updatedItem.passes ? 'true (passes)' : 'false (does not pass)';
			vscode.window.showInformationMessage(`Passes field updated to: ${passesValue}`);
			
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to toggle passes: ${error}`);
		}
	}

	private async addStep(): Promise<void> {
		if (!this._currentItem) {
			return;
		}

		// Prompt user for step text
		const stepText = await vscode.window.showInputBox({
			prompt: 'Enter the step description',
			placeHolder: 'e.g., Implement user authentication',
			validateInput: (value) => {
				if (!value || value.trim().length === 0) {
					return 'Step text cannot be empty';
				}
				// Validate using Zod schema
				const validation = validateStep(value.trim());
				if (!validation.success) {
					return validation.error;
				}
				return null;
			}
		});

		if (!stepText) {
			return; // User cancelled
		}
		
		try {
			// Validate and sanitize step text
			const sanitized = stepText.trim();
			const validation = validateStep(sanitized);
			if (!validation.success) {
				vscode.window.showErrorMessage(`Invalid step: ${validation.error}`);
				return;
			}

			// Update using PrdFileManager
			const updatedItem = this.fileManager.updateItem(this._currentItem.id, (item) => ({
				...item,
				steps: [...item.steps, sanitized]
			}));
			
			// Update current item reference and refresh view
			this._currentItem = updatedItem;
			this.update(updatedItem);
			
			vscode.window.showInformationMessage('Step added successfully');
			
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to add step: ${error}`);
		}
	}

	private async editStep(stepIndex: number): Promise<void> {
		if (!this._currentItem) {
			return;
		}

		// Ensure step exists
		if (stepIndex < 0 || stepIndex >= this._currentItem.steps.length) {
			vscode.window.showErrorMessage('Invalid step index');
			return;
		}

		const step = this._currentItem.steps[stepIndex];
		const currentText = typeof step === 'string' ? step : step.text;

		// Prompt user for new step text
		const stepText = await vscode.window.showInputBox({
			prompt: 'Edit the step description',
			value: currentText,
			validateInput: (value) => {
				if (!value || value.trim().length === 0) {
					return 'Step text cannot be empty';
				}
				// Validate using Zod schema
				const validation = validateStep(value.trim());
				if (!validation.success) {
					return validation.error;
				}
				return null;
			}
		});

		if (!stepText) {
			return; // User cancelled
		}
		
		try {
			// Validate and sanitize step text
			const sanitized = stepText.trim();
			const validation = validateStep(sanitized);
			if (!validation.success) {
				vscode.window.showErrorMessage(`Invalid step: ${validation.error}`);
				return;
			}

			// Update using PrdFileManager
			const updatedItem = this.fileManager.updateItem(this._currentItem.id, (item) => {
				const updatedSteps = [...item.steps];
				const existingStep = updatedSteps[stepIndex];
				
				// Update step text, preserving completed status if it's an object
				if (typeof existingStep === 'string') {
					updatedSteps[stepIndex] = sanitized;
				} else {
					updatedSteps[stepIndex] = { ...existingStep, text: sanitized };
				}
				
				return {
					...item,
					steps: updatedSteps
				};
			});
			
			// Update current item reference and refresh view
			this._currentItem = updatedItem;
			this.update(updatedItem);
			
			vscode.window.showInformationMessage('Step updated successfully');
			
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to edit step: ${error}`);
		}
	}

	private async deleteStep(stepIndex: number): Promise<void> {
		if (!this._currentItem) {
			return;
		}

		// Ensure step exists
		if (stepIndex < 0 || stepIndex >= this._currentItem.steps.length) {
			vscode.window.showErrorMessage('Invalid step index');
			return;
		}

		const step = this._currentItem.steps[stepIndex];
		const stepText = typeof step === 'string' ? step : step.text;

		// Confirm deletion
		const confirmation = await vscode.window.showWarningMessage(
			`Delete step: "${stepText}"?`,
			{ modal: true },
			'Delete'
		);

		if (confirmation !== 'Delete') {
			return; // User cancelled
		}
		
		try {
			// Update using PrdFileManager
			const updatedItem = this.fileManager.updateItem(this._currentItem.id, (item) => {
				const updatedSteps = [...item.steps];
				updatedSteps.splice(stepIndex, 1);
				
				return {
					...item,
					steps: updatedSteps
				};
			});
			
			// Update current item reference and refresh view
			this._currentItem = updatedItem;
			this.update(updatedItem);
			
			vscode.window.showInformationMessage('Step deleted successfully');
			
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to delete step: ${error}`);
		}
	}

	private async submitForReview(): Promise<void> {
		if (!this._currentItem) {
			return;
		}

		// Verify item is in in-progress status
		if (this._currentItem.status !== Status.InProgress) {
			vscode.window.showWarningMessage('Only items in "in-progress" status can be submitted for review.');
			return;
		}

		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders) {
			vscode.window.showErrorMessage('No workspace folder found');
			return;
		}

		// Get changed files to show in confirmation
		const workspaceRoot = workspaceFolders[0].uri.fsPath;
		const changedFiles = await getChangedFiles(workspaceRoot);
		
		// Build confirmation message
		const filesMsg = changedFiles.length > 0 
			? `\n\nChanged files (${changedFiles.length}):\n${changedFiles.slice(0, 5).map(f => `  • ${f}`).join('\n')}${changedFiles.length > 5 ? `\n  ... and ${changedFiles.length - 5} more` : ''}`
			: '\n\nNo changed files detected.';
		
		const confirmation = await vscode.window.showInformationMessage(
			`Submit "${this._currentItem.id}: ${this._currentItem.description}" for review?${filesMsg}`,
			{ modal: true },
			'Submit for Review'
		);

		if (confirmation !== 'Submit for Review') {
			return;
		}

		// Change status to in-review
		try {
			// Update using PrdFileManager
			const updatedItem = this.fileManager.updateItem(this._currentItem.id, (item) => ({
				...item,
				status: Status.InReview
			}));
			
			// Update current item reference and refresh view
			this._currentItem = updatedItem;
			await this.update(updatedItem);
			
			vscode.window.showInformationMessage(`✓ Item "${this._currentItem.id}" submitted for review`);
			
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to submit for review: ${error}`);
		}
	}
}

