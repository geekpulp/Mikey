import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface PrdStep {
	text: string;
	completed?: boolean;
}

export interface PrdItem {
	id: string;
	category: string;
	description: string;
	steps: (string | PrdStep)[];
	status: 'not-started' | 'in-progress' | 'in-review' | 'completed';
	passes: boolean;
}

export class PrdTreeDataProvider implements vscode.TreeDataProvider<PrdItem> {
private _onDidChangeTreeData: vscode.EventEmitter<PrdItem | undefined | null | void> = new vscode.EventEmitter<PrdItem | undefined | null | void>();
readonly onDidChangeTreeData: vscode.Event<PrdItem | undefined | null | void> = this._onDidChangeTreeData.event;

private prdItems: PrdItem[] = [];
private prdFilePath: string | undefined;

constructor(private context: vscode.ExtensionContext) {
this.loadPrdFile();
this.watchPrdFile();
}

private loadPrdFile(): void {
const workspaceFolders = vscode.workspace.workspaceFolders;
if (!workspaceFolders) {
return;
}

const prdPath = path.join(workspaceFolders[0].uri.fsPath, 'plans', 'prd.json');

if (fs.existsSync(prdPath)) {
this.prdFilePath = prdPath;
try {
const content = fs.readFileSync(prdPath, 'utf-8');
this.prdItems = JSON.parse(content);
this._onDidChangeTreeData.fire();
} catch (error) {
vscode.window.showErrorMessage(`Failed to load PRD file: ${error}`);
}
}
}

private watchPrdFile(): void {
if (!this.prdFilePath) {
return;
}

const watcher = vscode.workspace.createFileSystemWatcher(this.prdFilePath);

watcher.onDidChange(() => {
this.loadPrdFile();
});

this.context.subscriptions.push(watcher);
}

refresh(): void {
this.loadPrdFile();
}

getTreeItem(element: PrdItem): vscode.TreeItem {
const treeItem = new vscode.TreeItem(
`[${element.id}] ${element.description}`,
vscode.TreeItemCollapsibleState.None
);

treeItem.tooltip = `Category: ${element.category}\nStatus: ${element.status}\nPasses: ${element.passes}`;
treeItem.description = element.status;

// Set icon based on status
const iconName = this.getStatusIcon(element.status);
treeItem.iconPath = new vscode.ThemeIcon(iconName);

return treeItem;
}

getChildren(element?: PrdItem): Thenable<PrdItem[]> {
if (!element) {
return Promise.resolve(this.prdItems);
}
return Promise.resolve([]);
}

private getStatusIcon(status: string): string {
switch (status) {
case 'completed':
return 'pass';
case 'in-progress':
return 'sync';
case 'in-review':
return 'eye';
default:
return 'circle-outline';
}
}
}
