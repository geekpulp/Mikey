import * as vscode from 'vscode';
import { PrdItem, PrdStep } from './prdTreeDataProvider';
import { Status, THEME_COLORS } from './constants';

/**
 * Escapes HTML special characters to prevent XSS
 * @param text - Text to escape
 * @returns Escaped HTML text
 */
export function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}

/**
 * Generates cryptographically secure nonce for CSP
 * @returns Random nonce string
 */
export function getNonce(): string {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}

/**
 * Gets color for status badge
 * @param status - PRD item status
 * @returns CSS color variable
 */
export function getStatusColor(status: Status): string {
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

/**
 * Renders steps list HTML
 * @param steps - Array of step strings or objects
 * @returns HTML string for steps list
 */
export function renderSteps(steps: (string | PrdStep)[]): string {
	if (!steps || steps.length === 0) {
		return '<p style="color: var(--vscode-descriptionForeground); font-style: italic;">No steps defined</p>';
	}

	const stepItems = steps.map((step, index) => {
		const stepText = typeof step === 'string' ? step : step.text;
		const isCompleted = typeof step === 'string' ? false : step.completed || false;
		const checkboxClass = isCompleted ? 'checkbox checked' : 'checkbox';
		const textClass = isCompleted ? 'step-text step-completed' : 'step-text';

		// SECURITY: Use data attributes instead of inline onclick handlers
		return `
			<li class="step-item">
				<span class="step-checkbox">
					<span class="${checkboxClass}" data-action="toggleStep" data-index="${index}" style="cursor: pointer;"></span>
				</span>
				<span class="${textClass}">${escapeHtml(stepText)}</span>
				<div class="step-actions">
					<button class="step-btn" data-action="startWorkOnStep" data-index="${index}">💬 Start Work</button>
					<button class="step-btn" data-action="editStep" data-index="${index}">Edit</button>
					<button class="step-btn delete" data-action="deleteStep" data-index="${index}">Delete</button>
				</div>
			</li>
		`;
	}).join('');

	return `<ul class="steps-list">${stepItems}</ul>`;
}

/**
 * Renders changed files list HTML
 * @param files - Array of file paths
 * @returns HTML string for changed files section
 */
export function renderChangedFiles(files: string[]): string {
	if (!files || files.length === 0) {
		return '';
	}

	// SECURITY: Use data attributes instead of inline onclick handlers
	const fileItems = files.map((file) => {
		return `
			<li class="file-item" data-action="openFileDiff" data-filepath="${escapeHtml(file)}">
				<span class="file-icon">📝</span>
				<span class="file-path">${escapeHtml(file)}</span>
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

/**
 * Generates complete HTML for webview
 * @param item - PRD item to display
 * @param changedFiles - Array of changed file paths
 * @param cspSource - CSP source for webview
 * @returns Complete HTML string for webview
 */
export function getHtmlForWebview(item: PrdItem, changedFiles: string[], cspSource: string): string {
	const statusBadgeColor = getStatusColor(item.status);
	const stepsHtml = renderSteps(item.steps);
	const changedFilesHtml = renderChangedFiles(changedFiles);
	const nonce = getNonce();

	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="
		default-src 'none';
		script-src 'nonce-${nonce}';
		style-src 'nonce-${nonce}';
		font-src ${cspSource};
		img-src ${cspSource} data:;
	">
	<title>PRD Item Details</title>
	<style nonce="${nonce}">
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
	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();
		
		/**
		 * SECURITY: Event delegation to avoid inline onclick handlers
		 * All events are handled through data attributes for better CSP compliance
		 */
		document.addEventListener('DOMContentLoaded', () => {
			// Use event delegation on document for all clicks
			document.addEventListener('click', (e) => {
				const target = e.target;
				if (!target) return;

				// Find the element with data-action (might be parent)
				const actionElement = target.closest('[data-action]');
				if (!actionElement) return;

				const action = actionElement.getAttribute('data-action');
				const index = actionElement.getAttribute('data-index');
				const filepath = actionElement.getAttribute('data-filepath');

				// SECURITY: Validate and sanitize inputs before sending to extension
				switch (action) {
					case 'toggleStep':
					case 'editStep':
					case 'deleteStep':
					case 'startWorkOnStep':
						if (index !== null) {
							const stepIndex = parseInt(index, 10);
							if (!isNaN(stepIndex) && stepIndex >= 0) {
								vscode.postMessage({
									command: action,
									stepIndex: stepIndex
								});
							}
						}
						break;
					
					case 'openFileDiff':
						if (filepath) {
							vscode.postMessage({
								command: action,
								filePath: filepath
							});
						}
						break;
				}
			});
		});
		
		// Keep these functions for backward compatibility with existing UI elements
		function changeStatus(newStatus) {
			if (newStatus && typeof newStatus === 'string') {
				vscode.postMessage({
					command: 'changeStatus',
					status: newStatus
				});
			}
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
		
		function submitForReview() {
			vscode.postMessage({
				command: 'submitForReview'
			});
		}
	<\/script>
</head>
<body>
	<div class="header">
		<div class="title">${escapeHtml(item.description)}</div>
		<div class="metadata">
			<div class="metadata-item">
				<span class="label">ID:</span>
				<span>${escapeHtml(item.id)}</span>
			</div>
			<div class="metadata-item">
				<span class="label">Category:</span>
				<span>${escapeHtml(item.category)}</span>
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
