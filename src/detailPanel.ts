import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { PrdItem, PrdStep } from './prdTreeDataProvider';

export class DetailPanel {
	public static currentPanel: DetailPanel | undefined;
	private readonly _panel: vscode.WebviewPanel;
	private _disposables: vscode.Disposable[] = [];
	private _currentItem: PrdItem | undefined;

	private constructor(panel: vscode.WebviewPanel, private extensionUri: vscode.Uri) {
		this._panel = panel;
		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
		
		// Handle messages from the webview
		this._panel.webview.onDidReceiveMessage(
			message => {
				switch (message.command) {
					case 'toggleStep':
						this.toggleStepCompletion(message.stepIndex);
						break;
					case 'changeStatus':
						this.changeItemStatus(message.status);
						break;
					case 'togglePasses':
						this.togglePasses();
						break;
					case 'addStep':
						this.addStep();
						break;
					case 'editStep':
						this.editStep(message.stepIndex);
						break;
					case 'deleteStep':
						this.deleteStep(message.stepIndex);
						break;
				}
			},
			null,
			this._disposables
		);
	}

	public static createOrShow(extensionUri: vscode.Uri, item: PrdItem) {
		const column = vscode.window.activeTextEditor
			? vscode.window.activeTextEditor.viewColumn
			: undefined;

		if (DetailPanel.currentPanel) {
			DetailPanel.currentPanel._panel.reveal(column);
			DetailPanel.currentPanel.update(item);
			return;
		}

		const panel = vscode.window.createWebviewPanel(
			'ralphDetailPanel',
			'PRD Item Details',
			column || vscode.ViewColumn.One,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
			}
		);

		DetailPanel.currentPanel = new DetailPanel(panel, extensionUri);
		DetailPanel.currentPanel.update(item);
	}

	public update(item: PrdItem) {
		this._currentItem = item;
		this._panel.title = `[${item.id}] ${item.description}`;
		this._panel.webview.html = this._getHtmlForWebview(item);
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

	private _getHtmlForWebview(item: PrdItem): string {
		const statusBadgeColor = this._getStatusColor(item.status);
		
		const stepsHtml = this._renderSteps(item.steps);

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>PRD Item Details</title>
	<style>
		body {
			font-family: var(--vscode-font-family);
			color: var(--vscode-foreground);
			padding: 20px;
			line-height: 1.6;
		}
		.header {
			margin-bottom: 30px;
			padding-bottom: 20px;
			border-bottom: 1px solid var(--vscode-panel-border);
		}
		.title {
			font-size: 24px;
			font-weight: 600;
			margin-bottom: 10px;
		}
		.metadata {
			display: flex;
			gap: 15px;
			flex-wrap: wrap;
			margin-top: 15px;
		}
		.metadata-item {
			display: flex;
			align-items: center;
			gap: 5px;
		}
		.label {
			font-weight: 600;
			color: var(--vscode-descriptionForeground);
		}
		.badge {
			padding: 4px 10px;
			border-radius: 4px;
			font-size: 12px;
			font-weight: 600;
			text-transform: uppercase;
		}
		.badge-status {
			background-color: ${statusBadgeColor};
			color: var(--vscode-button-foreground);
		}
		.badge-success {
			background-color: var(--vscode-testing-iconPassed);
			color: var(--vscode-button-foreground);
		}
		.badge-failed {
			background-color: var(--vscode-testing-iconFailed);
			color: var(--vscode-button-foreground);
		}
		.section {
			margin-top: 30px;
		}
		.section-title {
			font-size: 18px;
			font-weight: 600;
			margin-bottom: 15px;
			color: var(--vscode-foreground);
		}
		.description {
			padding: 15px;
			background-color: var(--vscode-editor-background);
			border-radius: 4px;
			border: 1px solid var(--vscode-panel-border);
		}
		.steps-list {
			list-style: none;
			padding: 0;
			margin: 0;
		}
		.step-item {
			display: flex;
			align-items: flex-start;
			gap: 10px;
			padding: 10px;
			margin-bottom: 8px;
			background-color: var(--vscode-editor-background);
			border-radius: 4px;
			border: 1px solid var(--vscode-panel-border);
		}
		.step-checkbox {
			margin-top: 2px;
			flex-shrink: 0;
		}
		.step-text {
			flex: 1;
		}
		.step-completed {
			opacity: 0.7;
			text-decoration: line-through;
		}
		.checkbox {
			width: 16px;
			height: 16px;
			border: 2px solid var(--vscode-foreground);
			border-radius: 3px;
			display: inline-block;
			position: relative;
		}
		.checkbox.checked {
			background-color: var(--vscode-testing-iconPassed);
			border-color: var(--vscode-testing-iconPassed);
		}
		.checkbox.checked::after {
			content: '✓';
			position: absolute;
			top: -2px;
			left: 2px;
			color: white;
			font-size: 12px;
			font-weight: bold;
		}
		.status-selector {
			padding: 6px 12px;
			background-color: var(--vscode-input-background);
			color: var(--vscode-input-foreground);
			border: 1px solid var(--vscode-input-border);
			border-radius: 4px;
			font-size: 12px;
			font-weight: 600;
			text-transform: uppercase;
			cursor: pointer;
			outline: none;
		}
		.status-selector:hover {
			background-color: var(--vscode-inputOption-hoverBackground);
		}
		.status-selector:focus {
			border-color: var(--vscode-focusBorder);
		}
		.passes-toggle {
			display: inline-flex;
			align-items: center;
			gap: 8px;
			padding: 6px 12px;
			background-color: var(--vscode-input-background);
			border: 1px solid var(--vscode-input-border);
			border-radius: 4px;
			cursor: pointer;
			font-size: 12px;
			font-weight: 600;
			text-transform: uppercase;
			user-select: none;
		}
		.passes-toggle:hover {
			background-color: var(--vscode-inputOption-hoverBackground);
		}
		.passes-toggle.passes-true {
			background-color: var(--vscode-testing-iconPassed);
			border-color: var(--vscode-testing-iconPassed);
			color: var(--vscode-button-foreground);
		}
		.passes-toggle.passes-false {
			background-color: var(--vscode-testing-iconFailed);
			border-color: var(--vscode-testing-iconFailed);
			color: var(--vscode-button-foreground);
		}
		.passes-icon {
			font-size: 14px;
			font-weight: bold;
		}
		.add-step-btn {
			margin-left: 15px;
			padding: 4px 12px;
			background-color: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
			border: none;
			border-radius: 4px;
			cursor: pointer;
			font-size: 12px;
			font-weight: 600;
		}
		.add-step-btn:hover {
			background-color: var(--vscode-button-hoverBackground);
		}
		.step-actions {
			display: flex;
			gap: 8px;
			flex-shrink: 0;
		}
		.step-btn {
			padding: 2px 8px;
			background-color: var(--vscode-button-secondaryBackground);
			color: var(--vscode-button-secondaryForeground);
			border: none;
			border-radius: 3px;
			cursor: pointer;
			font-size: 11px;
			font-weight: 500;
		}
		.step-btn:hover {
			background-color: var(--vscode-button-secondaryHoverBackground);
		}
		.step-btn.delete {
			background-color: var(--vscode-testing-iconFailed);
			color: var(--vscode-button-foreground);
		}
		.step-btn.delete:hover {
			opacity: 0.8;
		}
	</style>
	<script>
		const vscode = acquireVsCodeApi();
		
		function toggleStep(stepIndex) {
			vscode.postMessage({
				command: 'toggleStep',
				stepIndex: stepIndex
			});
		}
		
		function changeStatus(newStatus) {
			vscode.postMessage({
				command: 'changeStatus',
				status: newStatus
			});
		}
		
		function togglePasses() {
			vscode.postMessage({
				command: 'togglePasses'
			});
		}
		
		function addStep() {
			vscode.postMessage({
				command: 'addStep'
			});
		}
		
		function editStep(stepIndex) {
			vscode.postMessage({
				command: 'editStep',
				stepIndex: stepIndex
			});
		}
		
		function deleteStep(stepIndex) {
			vscode.postMessage({
				command: 'deleteStep',
				stepIndex: stepIndex
			});
		}
	<\/script>
</head>
<body>
	<div class="header">
		<div class="title">${this._escapeHtml(item.description)}</div>
		<div class="metadata">
			<div class="metadata-item">
				<span class="label">ID:</span>
				<span>${this._escapeHtml(item.id)}</span>
			</div>
			<div class="metadata-item">
				<span class="label">Category:</span>
				<span>${this._escapeHtml(item.category)}</span>
			</div>
			<div class="metadata-item">
				<span class="label">Status:</span>
				<select class="status-selector" onchange="changeStatus(this.value)">
					<option value="not-started" ${item.status === 'not-started' ? 'selected' : ''}>Not Started</option>
					<option value="in-progress" ${item.status === 'in-progress' ? 'selected' : ''}>In Progress</option>
					<option value="in-review" ${item.status === 'in-review' ? 'selected' : ''}>In Review</option>
					<option value="completed" ${item.status === 'completed' ? 'selected' : ''}>Completed</option>
				</select>
			</div>
			<div class="metadata-item">
				<div class="passes-toggle passes-${item.passes}" onclick="togglePasses()">
					<span class="passes-icon">${item.passes ? '✓' : '✗'}</span>
					<span>${item.passes ? 'Passes' : 'Does not pass'}</span>
				</div>
			</div>
		</div>
	</div>

	<div class="section">
		<div class="section-title">
			Steps
			<button class="add-step-btn" onclick="addStep()">+ Add Step</button>
		</div>
		${stepsHtml}
	</div>
</body>
</html>`;
	}

	private _renderSteps(steps: (string | PrdStep)[]): string {
		if (!steps || steps.length === 0) {
			return '<p style="color: var(--vscode-descriptionForeground); font-style: italic;">No steps defined</p>';
		}

		const stepItems = steps.map((step, index) => {
			const stepText = typeof step === 'string' ? step : step.text;
			const isCompleted = typeof step === 'string' ? false : step.completed || false;
			const checkboxClass = isCompleted ? 'checkbox checked' : 'checkbox';
			const textClass = isCompleted ? 'step-text step-completed' : 'step-text';

			return `
				<li class="step-item">
					<span class="step-checkbox">
						<span class="${checkboxClass}" onclick="toggleStep(${index})" style="cursor: pointer;"></span>
					</span>
					<span class="${textClass}">${this._escapeHtml(stepText)}</span>
					<div class="step-actions">
						<button class="step-btn" onclick="editStep(${index})">Edit</button>
						<button class="step-btn delete" onclick="deleteStep(${index})">Delete</button>
					</div>
				</li>
			`;
		}).join('');

		return `<ul class="steps-list">${stepItems}</ul>`;
	}

	private _getStatusColor(status: string): string {
		switch (status) {
			case 'completed':
				return 'var(--vscode-testing-iconPassed)';
			case 'in-progress':
				return 'var(--vscode-charts-yellow)';
			case 'in-review':
				return 'var(--vscode-charts-blue)';
			default:
				return 'var(--vscode-charts-gray)';
		}
	}

	private _escapeHtml(text: string): string {
		return text
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#039;');
	}

	private toggleStepCompletion(stepIndex: number): void {
		if (!this._currentItem) {
			return;
		}

		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders) {
			vscode.window.showErrorMessage('No workspace folder found');
			return;
		}

		const prdPath = path.join(workspaceFolders[0].uri.fsPath, 'plans', 'prd.json');
		
		try {
			// Read current PRD file
			const content = fs.readFileSync(prdPath, 'utf-8');
			const prdItems: PrdItem[] = JSON.parse(content);
			
			// Find the current item in the array
			const itemIndex = prdItems.findIndex(item => item.id === this._currentItem!.id);
			if (itemIndex === -1) {
				vscode.window.showErrorMessage('Item not found in PRD file');
				return;
			}

			const item = prdItems[itemIndex];
			
			// Ensure step exists
			if (stepIndex < 0 || stepIndex >= item.steps.length) {
				vscode.window.showErrorMessage('Invalid step index');
				return;
			}

			// Convert step to object format if it's a string
			const step = item.steps[stepIndex];
			if (typeof step === 'string') {
				item.steps[stepIndex] = { text: step, completed: true };
			} else {
				// Toggle completion state
				step.completed = !step.completed;
			}

			// Write updated PRD file
			fs.writeFileSync(prdPath, JSON.stringify(prdItems, null, '\t'), 'utf-8');
			
			// Update current item reference and refresh view
			this._currentItem = item;
			this.update(item);
			
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to update step: ${error}`);
		}
	}

	private changeItemStatus(newStatus: string): void {
		if (!this._currentItem) {
			return;
		}

		// Validate status value
		const validStatuses = ['not-started', 'in-progress', 'in-review', 'completed'];
		if (!validStatuses.includes(newStatus)) {
			vscode.window.showErrorMessage(`Invalid status: ${newStatus}`);
			return;
		}

		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders) {
			vscode.window.showErrorMessage('No workspace folder found');
			return;
		}

		const prdPath = path.join(workspaceFolders[0].uri.fsPath, 'plans', 'prd.json');
		
		try {
			// Read current PRD file
			const content = fs.readFileSync(prdPath, 'utf-8');
			const prdItems: PrdItem[] = JSON.parse(content);
			
			// Find the current item in the array
			const itemIndex = prdItems.findIndex(item => item.id === this._currentItem!.id);
			if (itemIndex === -1) {
				vscode.window.showErrorMessage('Item not found in PRD file');
				return;
			}

			// Update status (type-safe after validation)
			prdItems[itemIndex].status = newStatus as 'not-started' | 'in-progress' | 'in-review' | 'completed';

			// Write updated PRD file
			fs.writeFileSync(prdPath, JSON.stringify(prdItems, null, '\t'), 'utf-8');
			
			// Update current item reference and refresh view
			this._currentItem = prdItems[itemIndex];
			this.update(prdItems[itemIndex]);
			
			vscode.window.showInformationMessage(`Status updated to: ${newStatus}`);
			
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to update status: ${error}`);
		}
	}

	private togglePasses(): void {
		if (!this._currentItem) {
			return;
		}

		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders) {
			vscode.window.showErrorMessage('No workspace folder found');
			return;
		}

		const prdPath = path.join(workspaceFolders[0].uri.fsPath, 'plans', 'prd.json');
		
		try {
			// Read current PRD file
			const content = fs.readFileSync(prdPath, 'utf-8');
			const prdItems: PrdItem[] = JSON.parse(content);
			
			// Find the current item in the array
			const itemIndex = prdItems.findIndex(item => item.id === this._currentItem!.id);
			if (itemIndex === -1) {
				vscode.window.showErrorMessage('Item not found in PRD file');
				return;
			}

			// Toggle passes field
			prdItems[itemIndex].passes = !prdItems[itemIndex].passes;

			// Write updated PRD file
			fs.writeFileSync(prdPath, JSON.stringify(prdItems, null, '\t'), 'utf-8');
			
			// Update current item reference and refresh view
			this._currentItem = prdItems[itemIndex];
			this.update(prdItems[itemIndex]);
			
			const passesValue = prdItems[itemIndex].passes ? 'true (passes)' : 'false (does not pass)';
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
				return value.trim() ? null : 'Step text cannot be empty';
			}
		});

		if (!stepText) {
			return; // User cancelled
		}

		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders) {
			vscode.window.showErrorMessage('No workspace folder found');
			return;
		}

		const prdPath = path.join(workspaceFolders[0].uri.fsPath, 'plans', 'prd.json');
		
		try {
			// Read current PRD file
			const content = fs.readFileSync(prdPath, 'utf-8');
			const prdItems: PrdItem[] = JSON.parse(content);
			
			// Find the current item in the array
			const itemIndex = prdItems.findIndex(item => item.id === this._currentItem!.id);
			if (itemIndex === -1) {
				vscode.window.showErrorMessage('Item not found in PRD file');
				return;
			}

			// Add new step (as string initially)
			prdItems[itemIndex].steps.push(stepText.trim());

			// Write updated PRD file
			fs.writeFileSync(prdPath, JSON.stringify(prdItems, null, '\t'), 'utf-8');
			
			// Update current item reference and refresh view
			this._currentItem = prdItems[itemIndex];
			this.update(prdItems[itemIndex]);
			
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
				return value.trim() ? null : 'Step text cannot be empty';
			}
		});

		if (!stepText) {
			return; // User cancelled
		}

		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders) {
			vscode.window.showErrorMessage('No workspace folder found');
			return;
		}

		const prdPath = path.join(workspaceFolders[0].uri.fsPath, 'plans', 'prd.json');
		
		try {
			// Read current PRD file
			const content = fs.readFileSync(prdPath, 'utf-8');
			const prdItems: PrdItem[] = JSON.parse(content);
			
			// Find the current item in the array
			const itemIndex = prdItems.findIndex(item => item.id === this._currentItem!.id);
			if (itemIndex === -1) {
				vscode.window.showErrorMessage('Item not found in PRD file');
				return;
			}

			// Update step text, preserving completed status if it's an object
			const existingStep = prdItems[itemIndex].steps[stepIndex];
			if (typeof existingStep === 'string') {
				prdItems[itemIndex].steps[stepIndex] = stepText.trim();
			} else {
				existingStep.text = stepText.trim();
			}

			// Write updated PRD file
			fs.writeFileSync(prdPath, JSON.stringify(prdItems, null, '\t'), 'utf-8');
			
			// Update current item reference and refresh view
			this._currentItem = prdItems[itemIndex];
			this.update(prdItems[itemIndex]);
			
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

		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders) {
			vscode.window.showErrorMessage('No workspace folder found');
			return;
		}

		const prdPath = path.join(workspaceFolders[0].uri.fsPath, 'plans', 'prd.json');
		
		try {
			// Read current PRD file
			const content = fs.readFileSync(prdPath, 'utf-8');
			const prdItems: PrdItem[] = JSON.parse(content);
			
			// Find the current item in the array
			const itemIndex = prdItems.findIndex(item => item.id === this._currentItem!.id);
			if (itemIndex === -1) {
				vscode.window.showErrorMessage('Item not found in PRD file');
				return;
			}

			// Remove step from array
			prdItems[itemIndex].steps.splice(stepIndex, 1);

			// Write updated PRD file
			fs.writeFileSync(prdPath, JSON.stringify(prdItems, null, '\t'), 'utf-8');
			
			// Update current item reference and refresh view
			this._currentItem = prdItems[itemIndex];
			this.update(prdItems[itemIndex]);
			
			vscode.window.showInformationMessage('Step deleted successfully');
			
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to delete step: ${error}`);
		}
	}
}
