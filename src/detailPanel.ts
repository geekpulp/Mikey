import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { PrdItem, PrdStep } from './prdTreeDataProvider';
import { Status, MessageCommand, STATUS_MARKERS, THEME_COLORS, GIT, FILE_PATHS } from './constants';

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
					case MessageCommand.ToggleStep:
						this.toggleStepCompletion(message.stepIndex);
						break;
					case MessageCommand.ChangeStatus:
					this.changeItemStatus(message.status).catch(err => {
						vscode.window.showErrorMessage(`Failed to change status: ${err}`);
					});
						break;
					case MessageCommand.TogglePasses:
						this.togglePasses();
						break;
					case MessageCommand.AddStep:
						this.addStep();
						break;
					case MessageCommand.EditStep:
						this.editStep(message.stepIndex);
						break;
					case MessageCommand.DeleteStep:
						this.deleteStep(message.stepIndex);
						break;
					case 'startWorkOnStep':
						this.startWorkOnStep(message.stepIndex);
						break;
					case 'openFileDiff':
						this.openFileDiff(message.filePath);
						break;
					case MessageCommand.SubmitForReview:
						this.submitForReview();
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

	public async update(item: PrdItem) {
		this._currentItem = item;
		this._panel.title = `[${item.id}] ${item.description}`;
		this._panel.webview.html = await this._getHtmlForWebview(item);
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

	private async _getHtmlForWebview(item: PrdItem): Promise<string> {
		const statusBadgeColor = this._getStatusColor(item.status);
		
		const stepsHtml = this._renderSteps(item.steps);
		
		// Get changed files if applicable
		const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
		const changedFiles = workspaceRoot ? await this.getChangedFiles(workspaceRoot) : [];
		const changedFilesHtml = this._renderChangedFiles(changedFiles);

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
		.changed-files-list {
			list-style: none;
			padding: 0;
			margin: 0;
		}
		.file-item {
			display: flex;
			align-items: center;
			gap: 10px;
			padding: 8px 12px;
			margin-bottom: 4px;
			background-color: var(--vscode-editor-background);
			border-radius: 4px;
			border: 1px solid var(--vscode-panel-border);
			cursor: pointer;
			transition: background-color 0.15s;
		}
		.file-item:hover {
			background-color: var(--vscode-list-hoverBackground);
		}
		.file-icon {
			color: var(--vscode-gitDecoration-modifiedResourceForeground);
			font-size: 14px;
			flex-shrink: 0;
		}
		.file-path {
			flex: 1;
			font-family: var(--vscode-editor-font-family);
			font-size: 13px;
			color: var(--vscode-foreground);
		}
		.no-changes {
			color: var(--vscode-descriptionForeground);
			font-style: italic;
			padding: 10px;
		}
		.submit-review-btn {
			padding: 8px 16px;
			background-color: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
			border: none;
			border-radius: 4px;
			cursor: pointer;
			font-size: 13px;
			font-weight: 600;
			margin-top: 10px;
		}
		.submit-review-btn:hover {
			background-color: var(--vscode-button-hoverBackground);
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
		
		function startWorkOnStep(stepIndex) {
			vscode.postMessage({
				command: 'startWorkOnStep',
				stepIndex: stepIndex
			});
		}
		
		function openFileDiff(filePath) {
			vscode.postMessage({
				command: 'openFileDiff',
				filePath: filePath
			});
		}
		
		function submitForReview() {
			vscode.postMessage({
				command: 'submitForReview'
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
					<option value="${Status.NotStarted}" ${item.status === Status.NotStarted ? 'selected' : ''}>Not Started</option>
					<option value="${Status.InProgress}" ${item.status === Status.InProgress ? 'selected' : ''}>In Progress</option>
					<option value="${Status.InReview}" ${item.status === Status.InReview ? 'selected' : ''}>In Review</option>
					<option value="${Status.Completed}" ${item.status === Status.Completed ? 'selected' : ''}>Completed</option>
				</select>
			</div>
			<div class="metadata-item">
				<div class="passes-toggle passes-${item.passes}" onclick="togglePasses()">
					<span class="passes-icon">${item.passes ? '✓' : '✗'}</span>
					<span>${item.passes ? 'Passes' : 'Does not pass'}</span>
				</div>
			</div>
		</div>
		${item.status === Status.InProgress ? '<button class="submit-review-btn" onclick="submitForReview()">📋 Submit for Review</button>' : ''}
	</div>

	<div class="section">
		<div class="section-title">
			Steps
			<button class="add-step-btn" onclick="addStep()">+ Add Step</button>
		</div>
		${stepsHtml}
	</div>

	${changedFilesHtml}
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
						<button class="step-btn" onclick="startWorkOnStep(${index})">💬 Start Work</button>
						<button class="step-btn" onclick="editStep(${index})">Edit</button>
						<button class="step-btn delete" onclick="deleteStep(${index})">Delete</button>
					</div>
				</li>
			`;
		}).join('');

		return `<ul class="steps-list">${stepItems}</ul>`;
	}

	private _renderChangedFiles(files: string[]): string {
		if (!files || files.length === 0) {
			return '';
		}

		const fileItems = files.map(file => {
			return `
				<li class="file-item" onclick="openFileDiff('${this._escapeHtml(file)}')">
					<span class="file-icon">📝</span>
					<span class="file-path">${this._escapeHtml(file)}</span>
				</li>
			`;
		}).join('');

		return `
			<div class="section">
				<div class="section-title">Changed Files (${files.length})</div>
				<ul class="changed-files-list">${fileItems}</ul>
			</div>
		`;
	}

	private _getStatusColor(status: Status): string {
		switch (status) {
			case Status.Completed:
				return `var(--vscode-${THEME_COLORS.iconPassed})`;
			case Status.InProgress:
				return 'var(--vscode-charts-yellow)';
			case Status.InReview:
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
			prdItems[itemIndex].status = newStatus as Status;

			// Write updated PRD file
			fs.writeFileSync(prdPath, JSON.stringify(prdItems, null, '\t'), 'utf-8');
			
			// Update current item reference and refresh view
			this._currentItem = prdItems[itemIndex];
			this.update(prdItems[itemIndex]);
			
			vscode.window.showInformationMessage(`Status updated to: ${newStatus}`);
			
			// If status is completed, trigger auto-merge workflow
			if (newStatus === Status.Completed) {
				await this.handleCompletionMerge(workspaceFolders[0].uri.fsPath);
			}
			
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

	private async startWorkOnStep(stepIndex: number): Promise<void> {
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

		// Build context for the chat session with focus on this specific step
		const context = this.buildChatContext(this._currentItem, stepIndex);

		try {
			// Clear any existing chat session and start fresh
			await vscode.commands.executeCommand('workbench.action.chat.clear');
			
			// Wait a moment for the clear to complete
			await new Promise(resolve => setTimeout(resolve, 300));
			
			// Open Copilot Chat panel
			await vscode.commands.executeCommand('workbench.panel.chat.view.copilot.focus');
			
			// Wait a moment for the panel to open
			await new Promise(resolve => setTimeout(resolve, 300));
			
			// Send the context as a new message in the fresh chat session
			await vscode.commands.executeCommand('workbench.action.chat.open', {
				query: context
			});
			
			vscode.window.showInformationMessage(`Started work on step ${stepIndex + 1} of ${this._currentItem.id} in new chat session`);
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to start chat session: ${error}`);
		}
	}

	private buildChatContext(item: PrdItem, stepIndex?: number): string {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders) {
			return '';
		}

		const workspaceRoot = workspaceFolders[0].uri.fsPath;
		const progressFile = path.join(workspaceRoot, 'progress.txt');
		
		let progressContent = '';
		if (fs.existsSync(progressFile)) {
			progressContent = fs.readFileSync(progressFile, 'utf-8');
		}

		// Load prompt template
		let promptTemplate = '';
		const config = vscode.workspace.getConfiguration('mikey');
		const templatePath = config.get<string>('promptTemplate', 'prompts/default.txt');
		const fullTemplatePath = path.join(workspaceRoot, templatePath);
		
		if (fs.existsSync(fullTemplatePath)) {
			promptTemplate = fs.readFileSync(fullTemplatePath, 'utf-8');
		}

		// Load relevant skill references
		const skillContext = this.loadSkillReferences(workspaceRoot, item);

		const prdContext = `# PRD Item Context

## Item: ${item.id}
**Category:** ${item.category}
**Description:** ${item.description}
**Status:** ${item.status}
**Passes:** ${item.passes}

## Steps
${item.steps.map((step, idx) => {
	const stepText = typeof step === 'string' ? step : step.text;
	const completed = typeof step === 'string' ? false : step.completed || false;
	const marker = completed ? STATUS_MARKERS.completed : STATUS_MARKERS.incomplete;
	const highlight = stepIndex !== undefined && idx === stepIndex ? ' **<-- CURRENT STEP**' : '';
	return `${idx + 1}. [${marker}] ${stepText}${highlight}`;
}).join('\n')}

## Progress History
${progressContent || '(No progress yet)'}

## Available Commands
You can mark steps as complete by using the VS Code command:
\`\`\`
await vscode.commands.executeCommand('ralph.markStepComplete', '${item.id}', stepIndex, true);
\`\`\`
Where stepIndex is 0-based (0 for first step, 1 for second, etc.)

## Task
${stepIndex !== undefined 
	? `Work on step ${stepIndex + 1} of ${item.id}. Complete this specific step and mark it as done when finished.`
	: `Work on ${item.id}. Follow the steps listed above. Update progress.txt when you make changes.`}

${skillContext}

${promptTemplate ? `\n---\n\n# Agent Instructions\n\n${promptTemplate}` : ''}
`;

		return prdContext;
	}

	private loadSkillReferences(workspaceRoot: string, item: PrdItem): string {
		const skillsDir = path.join(workspaceRoot, 'skills');
		if (!fs.existsSync(skillsDir)) {
			const testSkillsDir = path.join(workspaceRoot, 'test', 'skills');
			if (fs.existsSync(testSkillsDir)) {
				return this.loadSkillsFromDirectory(testSkillsDir, item);
			}
			return '';
		}
		return this.loadSkillsFromDirectory(skillsDir, item);
	}

	private loadSkillsFromDirectory(skillsDir: string, item: PrdItem): string {
		try {
			const skillFolders = fs.readdirSync(skillsDir).filter(name => {
				const fullPath = path.join(skillsDir, name);
				return fs.statSync(fullPath).isDirectory();
			});

			// Search for relevant skills based on item description or category
			const searchText = `${item.category} ${item.description}`.toLowerCase();
			const relevantSkills: string[] = [];

			for (const skillFolder of skillFolders) {
				const skillMdPath = path.join(skillsDir, skillFolder, 'SKILL.md');
				if (!fs.existsSync(skillMdPath)) {
					continue;
				}

				// Check if skill is relevant
				if (searchText.includes('wordpress') || searchText.includes('wp') || searchText.includes('plugin')) {
					if (skillFolder.includes('wp-plugin') || skillFolder.includes('wordpress')) {
						relevantSkills.push(skillFolder);
					}
				}

				// Add more relevance checks as needed
				// For now, we'll just match WordPress-related items
			}

			if (relevantSkills.length === 0) {
				return '';
			}

			// Build context from relevant skills
			let skillContext = '\n---\n\n# Available Skills\n\n';
			
			for (const skillFolder of relevantSkills) {
				const skillMdPath = path.join(skillsDir, skillFolder, 'SKILL.md');
				const skillContent = fs.readFileSync(skillMdPath, 'utf-8');
				
				skillContext += `## Skill: ${skillFolder}\n\n${skillContent}\n\n`;

				// Load reference documents
				const referencesDir = path.join(skillsDir, skillFolder, 'references');
				if (fs.existsSync(referencesDir)) {
					const referenceFiles = fs.readdirSync(referencesDir).filter(f => f.endsWith('.md'));
					
					if (referenceFiles.length > 0) {
						skillContext += `### References for ${skillFolder}\n\n`;
						
						for (const refFile of referenceFiles) {
							const refPath = path.join(referencesDir, refFile);
							const refContent = fs.readFileSync(refPath, 'utf-8');
							skillContext += `#### ${refFile}\n\n${refContent}\n\n`;
						}
					}
				}
			}

			return skillContext;
		} catch (error) {
			console.error('Error loading skill references:', error);
			return '';
		}
	}

private async handleCompletionMerge(workspaceRoot: string): Promise<void> {
	try {
		// Get current branch
		const currentBranch = await this.getCurrentBranch(workspaceRoot);
		
		// Check if we're on a feature branch
		if (!this.isFeatureBranch(currentBranch)) {
			// Not on a feature branch, nothing to merge
			return;
		}
		
		// Prompt user for confirmation
		const featureBranch = currentBranch;
		const message = `Merge feature branch '${featureBranch}' into main?\n\nThis will:\n• Switch to main branch\n• Pull latest changes\n• Merge ${featureBranch}\n• Push to remote\n• Delete ${featureBranch} locally`;
		
		const choice = await vscode.window.showInformationMessage(
			message,
			{ modal: true },
			'Merge & Complete',
			'Skip Merge'
		);
		
		if (choice !== 'Merge & Complete') {
			return;
		}
		
		// Show progress
		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: 'Merging feature branch',
			cancellable: false
		}, async (progress) => {
			progress.report({ message: 'Switching to main branch...' });
			await this.execGitCommand(workspaceRoot, ['checkout', 'main']);
			
			progress.report({ message: 'Pulling latest changes...' });
			await this.execGitCommand(workspaceRoot, ['pull']);
			
			progress.report({ message: `Merging ${featureBranch}...` });
			await this.execGitCommand(workspaceRoot, ['merge', featureBranch, '--no-ff', '-m', `Merge ${featureBranch}: ${this._currentItem?.description}`]);
			
			progress.report({ message: 'Pushing to remote...' });
			await this.execGitCommand(workspaceRoot, ['push', 'origin', 'main']);
			
			progress.report({ message: 'Cleaning up feature branch...' });
			await this.execGitCommand(workspaceRoot, ['branch', '-d', featureBranch]);
			
			return;
		});
		
		vscode.window.showInformationMessage(`✓ Successfully merged ${featureBranch} into main and pushed to remote`);
		
	} catch (error) {
		vscode.window.showErrorMessage(`Failed to merge branch: ${error}`);
	}
}

private async getCurrentBranch(workspaceRoot: string): Promise<string> {
	const result = await this.execGitCommand(workspaceRoot, ['rev-parse', '--abbrev-ref', 'HEAD']);
	return result.trim();
}

private isFeatureBranch(branchName: string): boolean {
	// Consider it a feature branch if it's not main, master, develop, or similar
	const mainBranches = ['main', 'master', 'develop', 'dev'];
	return !mainBranches.includes(branchName);
}

private async execGitCommand(cwd: string, args: string[]): Promise<string> {
	const { promisify } = require('util');
	const { exec } = require('child_process');
	const execAsync = promisify(exec);
	
	const command = `git ${args.join(' ')}`;
	const { stdout, stderr } = await execAsync(command, { cwd });
	
	if (stderr && !stderr.includes('Switched to branch') && !stderr.includes('Already up to date')) {
		throw new Error(stderr);
	}
	
	return stdout;
}

private async getChangedFiles(workspaceRoot: string): Promise<string[]> {
	try {
		const currentBranch = await this.getCurrentBranch(workspaceRoot);
		
		// Only show changed files if we're on a feature branch
		if (!this.isFeatureBranch(currentBranch)) {
			return [];
		}
		
		// Get files changed between current branch and main
		const diffOutput = await this.execGitCommand(workspaceRoot, ['diff', '--name-only', 'main...HEAD']);
		
		// Also get uncommitted changes
		const statusOutput = await this.execGitCommand(workspaceRoot, ['status', '--porcelain']);
		
		const changedFiles = new Set<string>();
		
		// Add files from diff with main
		diffOutput.split('\n').forEach(file => {
			if (file.trim()) {
				changedFiles.add(file.trim());
			}
		});
		
		// Add uncommitted files
		statusOutput.split('\n').forEach(line => {
			const match = line.match(/^\s*[MADRCU?]+\s+(.+)$/);
			if (match) {
				changedFiles.add(match[1].trim());
			}
		});
		
		return Array.from(changedFiles).sort();
	} catch (error) {
		// If there's an error (e.g., main branch doesn't exist), return empty array
		return [];
	}
}

private async openFileDiff(filePath: string) {
	try {
		const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
		if (!workspaceRoot) {
			vscode.window.showErrorMessage('No workspace folder found');
			return;
		}
		
		const fileUri = vscode.Uri.file(path.join(workspaceRoot, filePath));
		const currentBranch = await this.getCurrentBranch(workspaceRoot);
		
		// Create a URI for the file on the main branch for comparison
		const mainUri = fileUri.with({
			scheme: GIT.scheme,
			path: fileUri.path,
			query: JSON.stringify({ ref: GIT.mainBranch, path: filePath })
		});
		
		// Open diff view
		await vscode.commands.executeCommand('vscode.diff', mainUri, fileUri, `${filePath} (main ↔ ${currentBranch})`);
		
	} catch (error) {
		vscode.window.showErrorMessage(`Failed to open diff: ${error}`);
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
	const changedFiles = await this.getChangedFiles(workspaceRoot);
	
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

		// Update status
		prdItems[itemIndex].status = Status.InReview;

		// Write updated PRD file
		fs.writeFileSync(prdPath, JSON.stringify(prdItems, null, '\t'), 'utf-8');
		
		// Update current item reference and refresh view
		this._currentItem = prdItems[itemIndex];
		await this.update(prdItems[itemIndex]);
		
		vscode.window.showInformationMessage(`✓ Item "${this._currentItem.id}" submitted for review`);
		
	} catch (error) {
		vscode.window.showErrorMessage(`Failed to submit for review: ${error}`);
	}
}
}
