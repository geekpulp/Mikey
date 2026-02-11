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
  private _onDidChangeTreeData: vscode.EventEmitter<
    TreeNode | undefined | null | void
  > = new vscode.EventEmitter<TreeNode | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<
    TreeNode | undefined | null | void
  > = this._onDidChangeTreeData.event;

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

    const prdPath = path.join(
      workspaceFolders[0].uri.fsPath,
      "plans",
      "prd.json",
    );

    if (fs.existsSync(prdPath)) {
      this.prdFilePath = prdPath;
      try {
        const content = fs.readFileSync(prdPath, "utf-8");
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
      vscode.window.showErrorMessage("No PRD file found");
      return;
    }

    const newId = this.generateUniqueId(category);
    const newItem: PrdItem = {
      id: newId,
      category,
      description,
      steps: [],
      status: "not-started",
      passes: false,
    };

    this.prdItems.push(newItem);

    try {
      fs.writeFileSync(
        this.prdFilePath,
        JSON.stringify(this.prdItems, null, "\t"),
        "utf-8",
      );
      this._onDidChangeTreeData.fire();
      vscode.window.showInformationMessage(`Added item: ${newId}`);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to add item: ${error}`);
    }
  }

  async editItem(item: PrdItem): Promise<void> {
    if (!this.prdFilePath) {
      vscode.window.showErrorMessage("No PRD file found");
      return;
    }

    // Show category picker pre-selected with current category
    const categories = ["setup", "ui", "functional", "git", "agent", "polish"];
    const category = await vscode.window.showQuickPick(categories, {
      placeHolder: "Select category",
      title: `Edit Item: ${item.id}`,
    });

    if (!category) {
      return; // User cancelled
    }

    // Show description input pre-filled with current description
    const description = await vscode.window.showInputBox({
      prompt: "Enter description",
      value: item.description,
      placeHolder: "e.g., Implement export functionality",
    });

    if (!description) {
      return; // User cancelled
    }

    // Find and update the item
    const itemIndex = this.prdItems.findIndex((i) => i.id === item.id);
    if (itemIndex === -1) {
      vscode.window.showErrorMessage(`Item ${item.id} not found`);
      return;
    }

    this.prdItems[itemIndex].category = category;
    this.prdItems[itemIndex].description = description;

    try {
      fs.writeFileSync(
        this.prdFilePath,
        JSON.stringify(this.prdItems, null, "\t"),
        "utf-8",
      );
      this._onDidChangeTreeData.fire();
      vscode.window.showInformationMessage(`Updated item: ${item.id}`);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to update item: ${error}`);
    }
  }

  async deleteItem(item: PrdItem): Promise<void> {
    if (!this.prdFilePath) {
      vscode.window.showErrorMessage("No PRD file found");
      return;
    }

    // Show confirmation dialog
    const confirmed = await vscode.window.showWarningMessage(
      `Delete item "${item.id}: ${item.description}"?`,
      { modal: true },
      "Delete",
    );

    if (confirmed !== "Delete") {
      return; // User cancelled
    }

    // Find and remove the item
    const itemIndex = this.prdItems.findIndex((i) => i.id === item.id);
    if (itemIndex === -1) {
      vscode.window.showErrorMessage(`Item ${item.id} not found`);
      return;
    }

    this.prdItems.splice(itemIndex, 1);

    try {
      fs.writeFileSync(
        this.prdFilePath,
        JSON.stringify(this.prdItems, null, "\t"),
        "utf-8",
      );
      this._onDidChangeTreeData.fire();
      vscode.window.showInformationMessage(`Deleted item: ${item.id}`);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to delete item: ${error}`);
    }
  }

  async startWork(item: PrdItem): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      vscode.window.showErrorMessage("No workspace folder found");
      return;
    }

    const workspaceRoot = workspaceFolders[0].uri.fsPath;

    try {
      // Create and switch to feature branch
      const branchName = `feature/${item.id}`;
      
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Starting work on ${item.id}`,
        cancellable: false
      }, async (progress) => {
        progress.report({ message: 'Creating feature branch...' });
        
        try {
          await this.execGitCommand(workspaceRoot, ['checkout', '-b', branchName]);
          vscode.window.showInformationMessage(`✓ Created and switched to branch: ${branchName}`);
        } catch (error) {
          // Branch might already exist, try to switch to it
          try {
            await this.execGitCommand(workspaceRoot, ['checkout', branchName]);
            vscode.window.showInformationMessage(`✓ Switched to existing branch: ${branchName}`);
          } catch (switchError) {
            throw new Error(`Failed to create or switch to branch: ${error}`);
          }
        }

        progress.report({ message: 'Updating item status...' });
        
        // Update item status to 'in-progress'
        const itemIndex = this.prdItems.findIndex(i => i.id === item.id);
        if (itemIndex !== -1 && this.prdFilePath) {
          this.prdItems[itemIndex].status = 'in-progress';
          
          fs.writeFileSync(
            this.prdFilePath,
            JSON.stringify(this.prdItems, null, "\t"),
            "utf-8",
          );
          this._onDidChangeTreeData.fire();
        }
      });

      // Build context for the chat session
      const context = this.buildChatContext(item);

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
      
      vscode.window.showInformationMessage(`✓ Started work on ${item.id} in new chat session`);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to start work: ${error}`);
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
  const marker = completed ? '✓' : '○';
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

${promptTemplate ? `\n---\n\n# Agent Instructions\n\n${promptTemplate}` : ''}
`;

    return prdContext;
  }

  async runItem(item?: PrdItem): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      vscode.window.showErrorMessage("No workspace folder found");
      return;
    }

    // If no item is passed, show quick pick to select one
    let selectedItem = item;
    if (!selectedItem) {
      const items = this.prdItems.map((i) => ({
        label: `[${i.id}] ${i.description}`,
        description: `${i.category} - ${i.status}`,
        item: i,
      }));

      const choice = await vscode.window.showQuickPick(items, {
        placeHolder: "Select a PRD item to run",
      });

      if (!choice) {
        return;
      }
      selectedItem = choice.item;
    }

    // Ask which script to use
    const scriptChoice = await vscode.window.showQuickPick(
      [
        {
          label: "ralph-once.sh",
          description: "Run one iteration",
          value: "ralph-once.sh",
        },
        {
          label: "ralph.sh",
          description: "Run multiple iterations",
          value: "ralph.sh",
        },
      ],
      {
        placeHolder: "Select script to run",
      },
    );

    if (!scriptChoice) {
      return;
    }

    // Ask for iterations count if using ralph.sh
    let iterations = "";
    if (scriptChoice.value === "ralph.sh") {
      const iterInput = await vscode.window.showInputBox({
        prompt: "Number of iterations",
        value: "5",
        validateInput: (value) => {
          const num = parseInt(value);
          if (isNaN(num) || num < 1) {
            return "Please enter a valid positive number";
          }
          return null;
        },
      });

      if (!iterInput) {
        return;
      }
      iterations = iterInput;
    }

    // Ask for prompt file
    const promptChoice = await vscode.window.showQuickPick(
      [
        { label: "default.txt", value: "prompts/default.txt" },
        { label: "safe-write-only.txt", value: "prompts/safe-write-only.txt" },
        {
          label: "wordpress-plugin-agent.txt",
          value: "prompts/wordpress-plugin-agent.txt",
        },
        { label: "pest-coverage.txt", value: "prompts/pest-coverage.txt" },
      ],
      {
        placeHolder: "Select prompt file",
      },
    );

    if (!promptChoice) {
      return;
    }

    // Ask for allow profile
    const profileChoice = await vscode.window.showQuickPick(
      [
        { label: "safe", description: "Safe operations only" },
        { label: "dev", description: "Development operations" },
        { label: "locked", description: "Locked down" },
      ],
      {
        placeHolder: "Select permission profile",
      },
    );

    if (!profileChoice) {
      return;
    }

    // Build command
    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const scriptPath = path.join(workspaceRoot, scriptChoice.value);
    const prdPath = path.join(workspaceRoot, "plans", "prd.json");

    let command = `./${scriptChoice.value} --prompt ${promptChoice.value} --prd ${prdPath} --allow-profile ${profileChoice.label}`;

    if (iterations) {
      command += ` ${iterations}`;
    }

    // Create terminal and run command
    const terminal = vscode.window.createTerminal({
      name: `Ralph: ${selectedItem.id}`,
      cwd: workspaceRoot,
    });

    terminal.show();
    terminal.sendText(command);

    vscode.window.showInformationMessage(
      `Running ${selectedItem.id} with ${scriptChoice.label}`,
    );
  }

  private generateUniqueId(category: string): string {
    const categoryItems = this.prdItems.filter(
      (item) => item.category === category,
    );
    const numbers = categoryItems.map((item) => {
      const match = item.id.match(new RegExp(`^${category}-(\\d+)$`));
      return match ? parseInt(match[1], 10) : 0;
    });
    const maxNumber = numbers.length > 0 ? Math.max(...numbers) : 0;
    const nextNumber = maxNumber + 1;
    return `${category}-${String(nextNumber).padStart(3, "0")}`;
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    if (element instanceof CategoryNode) {
      const treeItem = new vscode.TreeItem(
        element.category.toUpperCase(),
        vscode.TreeItemCollapsibleState.Expanded,
      );
      treeItem.iconPath = new vscode.ThemeIcon("folder");
      treeItem.contextValue = "category";
      return treeItem;
    }

    const item = element as PrdItem;
    const treeItem = new vscode.TreeItem(
      `[${item.id}] ${item.description}`,
      vscode.TreeItemCollapsibleState.None,
    );

    treeItem.tooltip = `Category: ${item.category}\nStatus: ${item.status}\nPasses: ${item.passes}`;
    treeItem.description = item.status;

    // Set icon based on status with color
    const { icon, color } = this.getStatusIcon(item.status);
    treeItem.iconPath = new vscode.ThemeIcon(icon, color);
    treeItem.contextValue = "prdItem";

    // Make item clickable - opens detail panel
    treeItem.command = {
      command: "ralph.openItem",
      title: "Open Item Details",
      arguments: [item],
    };

    return treeItem;
  }

  getChildren(element?: TreeNode): Thenable<TreeNode[]> {
    if (!element) {
      // Root level: return category nodes
      const categories = new Map<string, PrdItem[]>();
      this.prdItems.forEach((item) => {
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

  private getStatusIcon(status: string): {
    icon: string;
    color?: vscode.ThemeColor;
  } {
    switch (status) {
      case "completed":
        return {
          icon: "pass",
          color: new vscode.ThemeColor("testing.iconPassed"),
        };
      case "in-progress":
        return {
          icon: "sync~spin",
          color: new vscode.ThemeColor("charts.yellow"),
        };
      case "in-review":
        return { icon: "eye", color: new vscode.ThemeColor("charts.blue") };
      default:
        return {
          icon: "circle-outline",
          color: new vscode.ThemeColor("charts.gray"),
        };
    }
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

  async markStepComplete(itemId: string, stepIndex: number, completed: boolean = true): Promise<void> {
    if (!this.prdFilePath) {
      vscode.window.showErrorMessage('No PRD file found');
      return;
    }

    try {
      const itemIndex = this.prdItems.findIndex(i => i.id === itemId);
      if (itemIndex === -1) {
        vscode.window.showErrorMessage(`Item ${itemId} not found`);
        return;
      }

      const item = this.prdItems[itemIndex];
      if (stepIndex < 0 || stepIndex >= item.steps.length) {
        vscode.window.showErrorMessage(`Step index ${stepIndex} is out of range for item ${itemId}`);
        return;
      }

      // Convert step to object format if it's a string
      const currentStep = item.steps[stepIndex];
      if (typeof currentStep === 'string') {
        item.steps[stepIndex] = { text: currentStep, completed };
      } else {
        item.steps[stepIndex] = { ...currentStep, completed };
      }

      // Save to file
      fs.writeFileSync(
        this.prdFilePath,
        JSON.stringify(this.prdItems, null, '\t'),
        'utf-8'
      );

      this._onDidChangeTreeData.fire();
      
      const status = completed ? 'completed' : 'incomplete';
      vscode.window.showInformationMessage(`✓ Marked step ${stepIndex + 1} of ${itemId} as ${status}`);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to mark step complete: ${error}`);
    }
  }
}
