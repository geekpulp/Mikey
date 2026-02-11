/**
 * Webview panel for adding new PRD items
 * 
 * Provides a custom HTML form interface for creating PRD items,
 * replacing the command palette-based QuickPick UI.
 */

import * as vscode from 'vscode';
import { ConfigManager } from './config';
import { Logger } from './logger';

/**
 * Interface for messages sent from the webview to the extension
 */
interface WebviewMessage {
	command: 'submit' | 'cancel';
	data?: {
		category: string;
		description: string;
	};
}

/**
 * Manages the webview panel for adding PRD items
 */
export class AddItemPanel {
	private static currentPanel: AddItemPanel | undefined;
	private readonly panel: vscode.WebviewPanel;
	private readonly logger: Logger;
	private readonly config: ConfigManager;
	private disposables: vscode.Disposable[] = [];

	private constructor(
		panel: vscode.WebviewPanel,
		private readonly onSubmit: (category: string, description: string) => void
	) {
		this.panel = panel;
		this.logger = Logger.getInstance();
		this.config = ConfigManager.getInstance();

		// Set initial HTML content
		this.panel.webview.html = this.getHtmlContent();

		// Handle messages from the webview
		this.panel.webview.onDidReceiveMessage(
			(message: WebviewMessage) => this.handleMessage(message),
			null,
			this.disposables
		);

		// Clean up when panel is closed
		this.panel.onDidDispose(
			() => this.dispose(),
			null,
			this.disposables
		);
	}

	/**
	 * Create or show the add item panel
	 */
	public static show(onSubmit: (category: string, description: string) => void): void {
		const columnToShowIn = vscode.window.activeTextEditor
			? vscode.window.activeTextEditor.viewColumn
			: undefined;

		// If panel already exists, just reveal it
		if (AddItemPanel.currentPanel) {
			AddItemPanel.currentPanel.panel.reveal(columnToShowIn);
			return;
		}

		// Create new panel
		const panel = vscode.window.createWebviewPanel(
			'mikeyAddItem',
			'Add New PRD Item',
			columnToShowIn || vscode.ViewColumn.One,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
			}
		);

		AddItemPanel.currentPanel = new AddItemPanel(panel, onSubmit);
	}

	/**
	 * Handle messages from the webview
	 */
	private handleMessage(message: WebviewMessage): void {
		switch (message.command) {
			case 'submit':
				if (message.data) {
					this.logger.info('PRD item submitted from webview', message.data);
					this.onSubmit(message.data.category, message.data.description);
					this.panel.dispose();
				}
				break;
			case 'cancel':
				this.logger.info('Add PRD item cancelled');
				this.panel.dispose();
				break;
		}
	}

	/**
	 * Generate the HTML content for the webview
	 */
	private getHtmlContent(): string {
		const categories = this.config.getCategories();
		const categoryOptions = categories
			.map(cat => `<option value="${cat}">${cat}</option>`)
			.join('\n');

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Add New PRD Item</title>
	<style>
		* {
			box-sizing: border-box;
		}
		
		body {
			padding: 20px;
			font-family: var(--vscode-font-family);
			color: var(--vscode-foreground);
			background-color: var(--vscode-editor-background);
		}
		
		.container {
			max-width: 600px;
			margin: 0 auto;
		}
		
		h1 {
			font-size: 24px;
			font-weight: 400;
			margin-bottom: 20px;
			color: var(--vscode-foreground);
		}
		
		.form-group {
			margin-bottom: 20px;
		}
		
		label {
			display: block;
			margin-bottom: 8px;
			font-weight: 600;
			color: var(--vscode-foreground);
		}
		
		select, textarea {
			width: 100%;
			padding: 8px 12px;
			font-family: var(--vscode-font-family);
			font-size: 13px;
			color: var(--vscode-input-foreground);
			background-color: var(--vscode-input-background);
			border: 1px solid var(--vscode-input-border);
			border-radius: 2px;
		}
		
		select:focus, textarea:focus {
			outline: 1px solid var(--vscode-focusBorder);
			outline-offset: -1px;
		}
		
		textarea {
			min-height: 120px;
			resize: vertical;
			line-height: 1.5;
		}
		
		.char-count {
			font-size: 11px;
			color: var(--vscode-descriptionForeground);
			margin-top: 4px;
			text-align: right;
		}
		
		.char-count.warning {
			color: var(--vscode-editorWarning-foreground);
		}
		
		.char-count.error {
			color: var(--vscode-errorForeground);
		}
		
		.button-group {
			display: flex;
			gap: 12px;
			margin-top: 30px;
		}
		
		button {
			padding: 8px 16px;
			font-family: var(--vscode-font-family);
			font-size: 13px;
			border: none;
			border-radius: 2px;
			cursor: pointer;
			transition: opacity 0.2s;
		}
		
		button:hover:not(:disabled) {
			opacity: 0.9;
		}
		
		button:disabled {
			opacity: 0.5;
			cursor: not-allowed;
		}
		
		.btn-primary {
			background-color: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
		}
		
		.btn-primary:hover:not(:disabled) {
			background-color: var(--vscode-button-hoverBackground);
		}
		
		.btn-secondary {
			background-color: var(--vscode-button-secondaryBackground);
			color: var(--vscode-button-secondaryForeground);
		}
		
		.btn-secondary:hover:not(:disabled) {
			background-color: var(--vscode-button-secondaryHoverBackground);
		}
		
		.help-text {
			font-size: 12px;
			color: var(--vscode-descriptionForeground);
			margin-top: 4px;
		}
		
		.error-message {
			color: var(--vscode-errorForeground);
			font-size: 12px;
			margin-top: 4px;
			display: none;
		}
		
		.error-message.visible {
			display: block;
		}
	</style>
</head>
<body>
	<div class="container">
		<h1>Add New PRD Item</h1>
		
		<form id="addItemForm">
			<div class="form-group">
				<label for="category">Category *</label>
				<select id="category" name="category" required>
					<option value="">-- Select a category --</option>
					${categoryOptions}
				</select>
				<div class="help-text">Choose the category that best fits this item</div>
			</div>
			
			<div class="form-group">
				<label for="description">Description *</label>
				<textarea 
					id="description" 
					name="description" 
					placeholder="Describe what needs to be done (minimum 10 characters)..."
					required
					minlength="10"
					maxlength="500"></textarea>
				<div class="char-count" id="charCount">0 / 500</div>
				<div class="error-message" id="descriptionError"></div>
			</div>
			
			<div class="button-group">
				<button type="submit" class="btn-primary" id="submitBtn" disabled>
					Add Item
				</button>
				<button type="button" class="btn-secondary" id="cancelBtn">
					Cancel
				</button>
			</div>
		</form>
	</div>
	
	<script>
		const vscode = acquireVsCodeApi();
		
		const form = document.getElementById('addItemForm');
		const categorySelect = document.getElementById('category');
		const descriptionTextarea = document.getElementById('description');
		const charCount = document.getElementById('charCount');
		const descriptionError = document.getElementById('descriptionError');
		const submitBtn = document.getElementById('submitBtn');
		const cancelBtn = document.getElementById('cancelBtn');
		
		// Update character count
		descriptionTextarea.addEventListener('input', () => {
			const length = descriptionTextarea.value.length;
			charCount.textContent = length + ' / 500';
			
			if (length > 500) {
				charCount.classList.add('error');
				charCount.classList.remove('warning');
			} else if (length > 450) {
				charCount.classList.add('warning');
				charCount.classList.remove('error');
			} else {
				charCount.classList.remove('warning', 'error');
			}
			
			validateForm();
		});
		
		// Validate form on category change
		categorySelect.addEventListener('change', validateForm);
		
		// Form validation
		function validateForm() {
			const category = categorySelect.value;
			const description = descriptionTextarea.value.trim();
			const length = description.length;
			
			let valid = true;
			descriptionError.textContent = '';
			descriptionError.classList.remove('visible');
			
			if (!category) {
				valid = false;
			}
			
			if (length < 10) {
				valid = false;
				if (length > 0) {
					descriptionError.textContent = 'Description must be at least 10 characters';
					descriptionError.classList.add('visible');
				}
			} else if (length > 500) {
				valid = false;
				descriptionError.textContent = 'Description must be at most 500 characters';
				descriptionError.classList.add('visible');
			}
			
			submitBtn.disabled = !valid;
		}
		
		// Handle form submission
		form.addEventListener('submit', (e) => {
			e.preventDefault();
			
			const category = categorySelect.value;
			const description = descriptionTextarea.value.trim();
			
			if (category && description.length >= 10 && description.length <= 500) {
				vscode.postMessage({
					command: 'submit',
					data: {
						category,
						description
					}
				});
			}
		});
		
		// Handle cancel
		cancelBtn.addEventListener('click', () => {
			vscode.postMessage({ command: 'cancel' });
		});
		
		// Focus on category dropdown when loaded
		categorySelect.focus();
	</script>
</body>
</html>`;
	}

	/**
	 * Clean up resources
	 */
	private dispose(): void {
		AddItemPanel.currentPanel = undefined;

		this.panel.dispose();

		while (this.disposables.length) {
			const disposable = this.disposables.pop();
			if (disposable) {
				disposable.dispose();
			}
		}
	}
}
