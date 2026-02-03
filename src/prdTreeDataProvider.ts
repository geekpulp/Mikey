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

export class CategoryNode {
	constructor(
		public readonly category: string,
		public readonly items: PrdItem[]
	) {}
}

export type TreeNode = CategoryNode | PrdItem;

export class PrdTreeDataProvider implements vscode.TreeDataProvider<TreeNode> {
private _onDidChangeTreeData: vscode.EventEmitter<TreeNode | undefined | null | void> = new vscode.EventEmitter<TreeNode | undefined | null | void>();
readonly onDidChangeTreeData: vscode.Event<TreeNode | undefined | null | void> = this._onDidChangeTreeData.event;

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

getTreeItem(element: TreeNode): vscode.TreeItem {
if (element instanceof CategoryNode) {
const treeItem = new vscode.TreeItem(
element.category.toUpperCase(),
vscode.TreeItemCollapsibleState.Expanded
);
treeItem.iconPath = new vscode.ThemeIcon('folder');
treeItem.contextValue = 'category';
return treeItem;
}

const item = element as PrdItem;
const treeItem = new vscode.TreeItem(
`[${item.id}] ${item.description}`,
vscode.TreeItemCollapsibleState.None
);

treeItem.tooltip = `Category: ${item.category}\nStatus: ${item.status}\nPasses: ${item.passes}`;
treeItem.description = item.status;

// Set icon based on status
const iconName = this.getStatusIcon(item.status);
treeItem.iconPath = new vscode.ThemeIcon(iconName);
treeItem.contextValue = 'prdItem';

return treeItem;
}

getChildren(element?: TreeNode): Thenable<TreeNode[]> {
if (!element) {
// Root level: return category nodes
const categories = new Map<string, PrdItem[]>();
this.prdItems.forEach(item => {
if (!categories.has(item.category)) {
categories.set(item.category, []);
}
categories.get(item.category)!.push(item);
});

const categoryNodes: CategoryNode[] = [];
categories.forEach((items, category) => {
categoryNodes.push(new CategoryNode(category, items));
});

// Sort categories by name
categoryNodes.sort((a, b) => a.category.localeCompare(b.category));
return Promise.resolve(categoryNodes);
}

if (element instanceof CategoryNode) {
// Return items in this category
return Promise.resolve(element.items);
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
