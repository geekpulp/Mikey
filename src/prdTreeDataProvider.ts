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

async addItem(category: string, description: string): Promise<void> {
if (!this.prdFilePath) {
	vscode.window.showErrorMessage('No PRD file found');
	return;
}

const newId = this.generateUniqueId(category);
const newItem: PrdItem = {
	id: newId,
	category,
	description,
	steps: [],
	status: 'not-started',
	passes: false
};

this.prdItems.push(newItem);

try {
	fs.writeFileSync(this.prdFilePath, JSON.stringify(this.prdItems, null, '\t'), 'utf-8');
	this._onDidChangeTreeData.fire();
	vscode.window.showInformationMessage(`Added item: ${newId}`);
} catch (error) {
	vscode.window.showErrorMessage(`Failed to add item: ${error}`);
}
}

async editItem(item: PrdItem): Promise<void> {
if (!this.prdFilePath) {
	vscode.window.showErrorMessage('No PRD file found');
	return;
}

// Show category picker pre-selected with current category
const categories = ['setup', 'ui', 'functional', 'git', 'agent', 'polish'];
const category = await vscode.window.showQuickPick(categories, {
	placeHolder: 'Select category',
	title: `Edit Item: ${item.id}`
});

if (!category) {
	return; // User cancelled
}

// Show description input pre-filled with current description
const description = await vscode.window.showInputBox({
	prompt: 'Enter description',
	value: item.description,
	placeHolder: 'e.g., Implement export functionality'
});

if (!description) {
	return; // User cancelled
}

// Find and update the item
const itemIndex = this.prdItems.findIndex(i => i.id === item.id);
if (itemIndex === -1) {
	vscode.window.showErrorMessage(`Item ${item.id} not found`);
	return;
}

this.prdItems[itemIndex].category = category;
this.prdItems[itemIndex].description = description;

try {
	fs.writeFileSync(this.prdFilePath, JSON.stringify(this.prdItems, null, '\t'), 'utf-8');
	this._onDidChangeTreeData.fire();
	vscode.window.showInformationMessage(`Updated item: ${item.id}`);
} catch (error) {
	vscode.window.showErrorMessage(`Failed to update item: ${error}`);
}
}

async deleteItem(item: PrdItem): Promise<void> {
if (!this.prdFilePath) {
	vscode.window.showErrorMessage('No PRD file found');
	return;
}

// Show confirmation dialog
const confirmed = await vscode.window.showWarningMessage(
	`Delete item "${item.id}: ${item.description}"?`,
	{ modal: true },
	'Delete'
);

if (confirmed !== 'Delete') {
	return; // User cancelled
}

// Find and remove the item
const itemIndex = this.prdItems.findIndex(i => i.id === item.id);
if (itemIndex === -1) {
	vscode.window.showErrorMessage(`Item ${item.id} not found`);
	return;
}

this.prdItems.splice(itemIndex, 1);

try {
	fs.writeFileSync(this.prdFilePath, JSON.stringify(this.prdItems, null, '\t'), 'utf-8');
	this._onDidChangeTreeData.fire();
	vscode.window.showInformationMessage(`Deleted item: ${item.id}`);
} catch (error) {
	vscode.window.showErrorMessage(`Failed to delete item: ${error}`);
}
}

private generateUniqueId(category: string): string {
const categoryItems = this.prdItems.filter(item => item.category === category);
const numbers = categoryItems.map(item => {
	const match = item.id.match(new RegExp(`^${category}-(\\d+)$`));
	return match ? parseInt(match[1], 10) : 0;
});
const maxNumber = numbers.length > 0 ? Math.max(...numbers) : 0;
const nextNumber = maxNumber + 1;
return `${category}-${String(nextNumber).padStart(3, '0')}`;
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

// Set icon based on status with color
const { icon, color } = this.getStatusIcon(item.status);
treeItem.iconPath = new vscode.ThemeIcon(icon, color);
treeItem.contextValue = 'prdItem';

// Make item clickable - opens detail panel
treeItem.command = {
command: 'ralph.openItem',
title: 'Open Item Details',
arguments: [item]
};

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

private getStatusIcon(status: string): { icon: string; color?: vscode.ThemeColor } {
switch (status) {
case 'completed':
return { icon: 'pass', color: new vscode.ThemeColor('testing.iconPassed') };
case 'in-progress':
return { icon: 'sync~spin', color: new vscode.ThemeColor('charts.yellow') };
case 'in-review':
return { icon: 'eye', color: new vscode.ThemeColor('charts.blue') };
default:
return { icon: 'circle-outline', color: new vscode.ThemeColor('charts.gray') };
}
}
}
