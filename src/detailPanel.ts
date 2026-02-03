import * as vscode from 'vscode';
import { PrdItem, PrdStep } from './prdTreeDataProvider';

export class DetailPanel {
	public static currentPanel: DetailPanel | undefined;
	private readonly _panel: vscode.WebviewPanel;
	private _disposables: vscode.Disposable[] = [];

	private constructor(panel: vscode.WebviewPanel, private extensionUri: vscode.Uri) {
		this._panel = panel;
		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
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
				enableScripts: false,
				retainContextWhenHidden: true,
			}
		);

		DetailPanel.currentPanel = new DetailPanel(panel, extensionUri);
		DetailPanel.currentPanel.update(item);
	}

	public update(item: PrdItem) {
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
		const passesBadge = item.passes
			? '<span class="badge badge-success">✓ Passes</span>'
			: '<span class="badge badge-failed">✗ Does not pass</span>';

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
	</style>
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
				<span class="badge badge-status">${this._escapeHtml(item.status)}</span>
			</div>
			<div class="metadata-item">
				${passesBadge}
			</div>
		</div>
	</div>

	<div class="section">
		<div class="section-title">Steps</div>
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
						<span class="${checkboxClass}"></span>
					</span>
					<span class="${textClass}">${this._escapeHtml(stepText)}</span>
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
}
