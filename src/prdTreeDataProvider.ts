import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Status, CATEGORIES, STATUS_MARKERS, THEME_COLORS } from './constants';
import { Logger } from './logger';
import { validateUserInput } from './validation';
import { PrdFileError, GitOperationError, EnvironmentError, getUserFriendlyMessage, isRalphError } from './errors';
import { PrdFileManager } from './prdFileManager';

/**
 * Represents a step within a PRD item
 * 
 * @property text - The description of the step
 * @property completed - Optional flag indicating whether the step is complete
 */
export interface PrdStep {
	text: string;
	completed?: boolean;
}

/**
 * Represents a Product Requirements Document (PRD) item
 * 
 * @property id - Unique identifier in format 'category-XXX' (e.g., 'ui-001')
 * @property category - The category this item belongs to (setup, ui, functional, git, agent, etc.)
 * @property description - Human-readable description of the requirement
 * @property steps - Array of steps (can be strings or PrdStep objects with completion status)
 * @property status - Current status of the item (not-started, in-progress, in-review, completed)
 * @property passes - Boolean flag indicating if acceptance criteria pass
 */
export interface PrdItem {
	id: string;
	category: string;
	description: string;
	steps: (string | PrdStep)[];
	status: Status;
	passes: boolean;
}

/**
 * Represents a category grouping node in the tree view
 * Contains a category name and all PRD items belonging to that category
 */
export class CategoryNode {
	constructor(
		public readonly category: string,
		public readonly items: PrdItem[]
	) {}
}

/**
 * Union type representing either a category node or a PRD item node in the tree
 */
export type TreeNode = CategoryNode | PrdItem;

/**
 * Tree data provider for displaying PRD items in VS Code sidebar
 * 
 * This class manages the hierarchical tree view of PRD items, grouped by category.
 * It handles:
 * - Loading and watching the prd.json file
 * - CRUD operations on PRD items
 * - Git workflow integration (branches, commits, merges)
 * - GitHub Copilot Chat integration for AI-assisted development
 * - File change tracking for in-progress items
 * 
 * @implements vscode.TreeDataProvider<TreeNode>
 */
export class PrdTreeDataProvider implements vscode.TreeDataProvider<TreeNode> {
  private _onDidChangeTreeData: vscode.EventEmitter<
    TreeNode | undefined | null | void
  > = new vscode.EventEmitter<TreeNode | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<
    TreeNode | undefined | null | void
  > = this._onDidChangeTreeData.event;

  private prdItems: PrdItem[] = [];
  private prdFilePath: string | undefined;
  private logger = Logger.getInstance();
  private fileManager = PrdFileManager.getInstance();

  /**
   * Creates a new PRD tree data provider
   * 
   * @param context - The extension context for managing subscriptions and state
   */
  constructor(private context: vscode.ExtensionContext) {
    this.logger.debug('Initializing PrdTreeDataProvider');
    this.loadPrdFile();
    this.watchPrdFile();
  }

  private loadPrdFile(): void {
    try {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders) {
        const error = EnvironmentError.noWorkspace();
        this.logger.warn(error.getLogMessage());
        return;
      }

      const workspacePath = workspaceFolders[0].uri.fsPath;
      this.prdFilePath = this.fileManager.initialize(workspacePath);

      if (!this.prdFilePath) {
        const error = PrdFileError.notFound(path.join(workspacePath, 'plans', 'prd.json'));
        this.logger.warn(error.getLogMessage());
        return;
      }

      try {
        this.prdItems = this.fileManager.read();
        this.logger.info('PRD file loaded successfully via PrdFileManager', { 
          itemCount: this.prdItems.length 
        });
        this._onDidChangeTreeData.fire();
      } catch (error) {
        if (isRalphError(error)) {
          this.logger.error(error.getLogMessage());
          vscode.window.showErrorMessage(error.getUserMessage());
        } else if (error instanceof Error) {
          const prdError = PrdFileError.readError(this.prdFilePath, error);
          this.logger.error(prdError.getLogMessage());
          vscode.window.showErrorMessage(prdError.getUserMessage());
        } else {
          this.logger.error('Unexpected error loading PRD file', error);
          vscode.window.showErrorMessage(`Failed to load PRD file: ${String(error)}`);
        }
      }
    } catch (error) {
      this.logger.error('Unexpected error in loadPrdFile', error);
      vscode.window.showErrorMessage(getUserFriendlyMessage(error));
    }
  }

  private watchPrdFile(): void {
    if (!this.prdFilePath) {
      this.logger.debug('PRD file path not set, skipping file watcher setup');
      return;
    }

    this.logger.debug('Setting up file watcher for PRD file');
    const watcher = vscode.workspace.createFileSystemWatcher(this.prdFilePath);

    watcher.onDidChange(() => {
      this.logger.debug('PRD file changed, reloading');
      this.loadPrdFile();
    });

    this.context.subscriptions.push(watcher);
  }

  /**
   * Refreshes the tree view by reloading the PRD file
   * 
   * This method is typically called when:
   * - User triggers manual refresh via command
   * - External changes to prd.json are detected
   * - After CRUD operations to ensure UI is in sync
   */
  refresh(): void {
    this.loadPrdFile();
  }

  /**
   * Adds a new PRD item to the prd.json file
   * 
   * This method:
   * - Validates the user input (category and description)
   * - Generates a unique ID in format 'category-XXX'
   * - Creates a new PRD item with default values (not-started status, no steps)
   * - Saves to prd.json file
   * - Refreshes the tree view
   * 
   * @param category - The category for the new item (must be from CATEGORIES constant)
   * @param description - Human-readable description of the requirement (min 10 chars)
   * @throws {PrdFileError} If prd.json file not found or cannot be written
   * @throws {Error} If validation fails or JSON serialization fails
   * 
   * @example
   * ```typescript
   * await prdProvider.addItem('ui', 'Add dark mode theme selector');
   * // Creates item with ID 'ui-005' and status 'not-started'
   * ```
   */
  async addItem(category: string, description: string): Promise<void> {
    try {
      if (!this.prdFilePath) {
        throw PrdFileError.notFound('prd.json');
      }

      // Validate user input
      const validation = validateUserInput({ category, description });
      if (!validation.success) {
        this.logger.warn('Invalid input for new PRD item', { error: validation.error });
        vscode.window.showErrorMessage(`Invalid input: ${validation.error}`);
        return;
      }

      const newId = this.generateUniqueId(category);
      const newItem: PrdItem = {
        id: newId,
        category: validation.data!.category,
        description: validation.data!.description,
        steps: [],
        status: Status.NotStarted,
        passes: false,
      };

      try {
        this.logger.info('Adding new PRD item via PrdFileManager', { 
          id: newId, 
          category, 
          description 
        });
        this.fileManager.addItem(newItem);
        this.prdItems.push(newItem);
        this._onDidChangeTreeData.fire();
        vscode.window.showInformationMessage(`Added item: ${newId}`);
      } catch (error) {
        throw error;
      }
    } catch (error) {
      if (isRalphError(error)) {
        this.logger.error(error.getLogMessage());
        vscode.window.showErrorMessage(error.getUserMessage());
      } else {
        this.logger.error('Failed to add PRD item', error);
        vscode.window.showErrorMessage(getUserFriendlyMessage(error));
      }
    }
  }

  /**
   * Edits an existing PRD item
   * 
   * This method:
   * - Prompts user to edit category and description
   * - Validates the new input
   * - Updates the item in memory
   * - Saves changes to prd.json file
   * - Refreshes the tree view
   * 
   * @param item - The PRD item to edit
   * @throws {PrdFileError} If prd.json file not found or cannot be written
   * @throws {Error} If validation fails or item not found
   * 
   * @remarks
   * The item ID is NOT changed during edit - only category and description can be modified.
   * If the user cancels any input dialog, no changes are made.
   * Changes are rolled back if file write fails.
   * 
   * @example
   * ```typescript
   * const item = prdItems.find(i => i.id === 'ui-003');
   * await prdProvider.editItem(item);
   * ```
   */
  async editItem(item: PrdItem): Promise<void> {
    try {
      if (!this.prdFilePath) {
        throw PrdFileError.notFound('prd.json');
      }

      // Show category picker pre-selected with current category
      const category = await vscode.window.showQuickPick(CATEGORIES, {
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

      // Validate user input
      const validation = validateUserInput({ category, description });
      if (!validation.success) {
        this.logger.warn('Invalid input for editing PRD item', { error: validation.error });
        vscode.window.showErrorMessage(`Invalid input: ${validation.error}`);
        return;
      }

      // Find and update the item
      const itemIndex = this.prdItems.findIndex((i) => i.id === item.id);
      if (itemIndex === -1) {
        this.logger.error('Item not found during edit', { id: item.id });
        vscode.window.showErrorMessage(`Item ${item.id} not found`);
        return;
      }

      try {
        this.logger.info('Updating PRD item via PrdFileManager', { 
          id: item.id, 
          category, 
          description 
        });
        this.fileManager.updateItem(item.id, (existingItem) => ({
          ...existingItem,
          category: validation.data!.category,
          description: validation.data!.description
        }));
        
        // Update in-memory copy
        this.prdItems[itemIndex].category = validation.data!.category;
        this.prdItems[itemIndex].description = validation.data!.description;
        
        this._onDidChangeTreeData.fire();
        vscode.window.showInformationMessage(`Updated item: ${item.id}`);
      } catch (error) {
        throw error;
      }
    } catch (error) {
      if (isRalphError(error)) {
        this.logger.error(error.getLogMessage());
        vscode.window.showErrorMessage(error.getUserMessage());
      } else {
        this.logger.error('Failed to edit PRD item', error);
        vscode.window.showErrorMessage(getUserFriendlyMessage(error));
      }
    }
  }

  /**
   * Deletes a PRD item from the prd.json file
   * 
   * This method:
   * - Shows a confirmation dialog to prevent accidental deletion
   * - Removes the item from the in-memory array
   * - Saves changes to prd.json file
   * - Refreshes the tree view
   * 
   * @param item - The PRD item to delete
   * @throws {PrdFileError} If prd.json file not found or cannot be written
   * 
   * @remarks
   * If the user cancels the confirmation dialog, no changes are made.
   * Changes are rolled back if file write fails.
   * This operation cannot be undone (except via git if committed).
   * 
   * @example
   * ```typescript
   * const item = prdItems.find(i => i.id === 'ui-003');
   * await prdProvider.deleteItem(item); // Shows confirmation dialog
   * ```
   */
  async deleteItem(item: PrdItem): Promise<void> {
    try {
      if (!this.prdFilePath) {
        throw PrdFileError.notFound('prd.json');
      }

      // Show confirmation dialog
      const confirmed = await vscode.window.showWarningMessage(
        `Delete item "${item.id}: ${item.description}"?`,
        { modal: true },
        "Delete",
      );

      if (confirmed !== "Delete") {
        this.logger.debug('Delete cancelled by user', { id: item.id });
        return; // User cancelled
      }

      // Find and remove the item
      const itemIndex = this.prdItems.findIndex((i) => i.id === item.id);
      if (itemIndex === -1) {
        this.logger.error('Item not found during delete', { id: item.id });
        vscode.window.showErrorMessage(`Item ${item.id} not found`);
        return;
      }

      try {
        this.logger.info('Deleting PRD item via PrdFileManager', { id: item.id });
        this.fileManager.removeItem(item.id);
        
        // Update in-memory copy
        this.prdItems.splice(itemIndex, 1);
        
        this._onDidChangeTreeData.fire();
        vscode.window.showInformationMessage(`Deleted item: ${item.id}`);
      } catch (error) {
        throw error;
      }
    } catch (error) {
      if (isRalphError(error)) {
        this.logger.error(error.getLogMessage());
        vscode.window.showErrorMessage(error.getUserMessage());
      } else {
        this.logger.error('Failed to delete PRD item', error);
        vscode.window.showErrorMessage(getUserFriendlyMessage(error));
      }
    }
  }

  /**
   * Starts work on a PRD item
   * 
   * This method orchestrates the workflow for beginning work on a PRD item:
   * 1. Creates a new git feature branch (format: feature/item-id)
   * 2. Updates item status to 'in-progress'
   * 3. Opens GitHub Copilot Chat with contextual information
   * 4. Provides the AI with item details, steps, and skill references
   * 
   * @param item - The PRD item to start working on
   * @throws {EnvironmentError} If no workspace folder is open
   * @throws {GitOperationError} If git operations fail (branch creation, status update)
   * @throws {PrdFileError} If prd.json cannot be updated
   * 
   * @remarks
   * - If the feature branch already exists, it will switch to it instead of creating
   * - The status update is saved to prd.json before opening Copilot Chat
   * - Copilot Chat receives full context including steps, skill references, and prompts
   * - A fresh chat session is created for each item to avoid context pollution
   * 
   * @example
   * ```typescript
   * const item = prdItems.find(i => i.id === 'ui-003');
   * await prdProvider.startWork(item);
   * // Creates branch 'feature/ui-003', updates status, opens Copilot Chat
   * ```
   */
  async startWork(item: PrdItem): Promise<void> {
    try {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders) {
        throw EnvironmentError.noWorkspace();
      }

      const workspaceRoot = workspaceFolders[0].uri.fsPath;

      this.logger.info('Starting work on PRD item', { id: item.id });
      // Create and switch to feature branch
      const branchName = `feature/${item.id}`;
      
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Starting work on ${item.id}`,
        cancellable: false
      }, async (progress) => {
        progress.report({ message: 'Creating feature branch...' });
        
        try {
          this.logger.debug('Creating git branch', { branchName });
          await this.execGitCommand(workspaceRoot, ['checkout', '-b', branchName]);
          this.logger.info('Git branch created successfully', { branchName });
          vscode.window.showInformationMessage(`✓ Created and switched to branch: ${branchName}`);
        } catch (error) {
          // Branch might already exist, try to switch to it
          try {
            this.logger.debug('Branch exists, switching to it', { branchName });
            await this.execGitCommand(workspaceRoot, ['checkout', branchName]);
            this.logger.info('Switched to existing branch', { branchName });
            vscode.window.showInformationMessage(`✓ Switched to existing branch: ${branchName}`);
          } catch (switchError) {
            this.logger.error('Failed to create or switch to branch', { error, switchError });
            throw GitOperationError.branchCreationFailed(branchName, error as Error);
          }
        }

        progress.report({ message: 'Updating item status...' });
        
        // Update item status to in-progress
        const itemIndex = this.prdItems.findIndex(i => i.id === item.id);
        if (itemIndex !== -1 && this.prdFilePath) {
          this.logger.debug('Updating item status to in-progress', { id: item.id });
          
          try {
            this.fileManager.updateItem(item.id, (existingItem) => ({
              ...existingItem,
              status: Status.InProgress
            }));
            
            // Update in-memory copy
            this.prdItems[itemIndex].status = Status.InProgress;
            this._onDidChangeTreeData.fire();
          } catch (error) {
            throw error;
          }
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
      if (isRalphError(error)) {
        this.logger.error(error.getLogMessage());
        vscode.window.showErrorMessage(error.getUserMessage());
      } else {
        this.logger.error('Failed to start work', error);
        vscode.window.showErrorMessage(getUserFriendlyMessage(error));
      }
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
      this.logger.error('Error loading skill references', error);
      return '';
    }
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

  /**
   * Gets the tree item representation for a node
   * 
   * Required by VS Code TreeDataProvider interface. Converts either a CategoryNode
   * or PrdItem into a TreeItem for display in the sidebar.
   * 
   * @param element - The node to convert (CategoryNode or PrdItem)
   * @returns A VS Code TreeItem configured with icon, label, tooltip, and command
   * 
   * @remarks
   * - Category nodes are collapsible folders shown in uppercase
   * - PRD items show status icon with color (green=completed, blue=in-progress, etc.)
   * - Clicking a PRD item opens the detail panel
   */
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

  /**
   * Gets the children of a tree node
   * 
   * Required by VS Code TreeDataProvider interface. Returns the hierarchical structure
   * of the tree view.
   * 
   * @param element - The parent node (undefined for root, CategoryNode for category items)
   * @returns Promise resolving to array of child nodes
   * 
   * @remarks
   * - Root level returns CategoryNode objects (one per category)
   * - Category level returns PrdItem objects in that category
   * - Items are grouped by category and categories are sorted alphabetically
   */
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
      case Status.Completed:
        return {
          icon: "pass",
          color: new vscode.ThemeColor(THEME_COLORS.iconPassed),
        };
      case Status.InProgress:
        return {
          icon: "sync~spin",
          color: new vscode.ThemeColor("charts.yellow"),
        };
      case Status.InReview:
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

  /**
   * Marks a step as complete or incomplete
   * 
   * This method:
   * - Finds the item and step by index
   * - Converts string steps to object format if needed
   * - Updates the completion status
   * - Saves changes to prd.json
   * - Refreshes the tree view
   * 
   * @param itemId - The ID of the PRD item containing the step
   * @param stepIndex - The zero-based index of the step to update
   * @param completed - Whether the step should be marked as complete (default: true)
   * @throws {Error} If item not found or step index out of range
   * 
   * @remarks
   * Steps can be either strings or objects with {text, completed} format.
   * This method automatically converts string steps to object format.
   * 
   * @example
   * ```typescript
   * // Mark the first step of ui-003 as complete
   * await prdProvider.markStepComplete('ui-003', 0, true);
   * 
   * // Unmark the second step
   * await prdProvider.markStepComplete('ui-003', 1, false);
   * ```
   */
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
      const updatedStep = typeof currentStep === 'string'
        ? { text: currentStep, completed }
        : { ...currentStep, completed };

      // Save to file using PrdFileManager
      this.fileManager.updateItem(itemId, (existingItem) => {
        const newSteps = [...existingItem.steps];
        newSteps[stepIndex] = updatedStep;
        return {
          ...existingItem,
          steps: newSteps
        };
      });

      // Update in-memory copy
      item.steps[stepIndex] = updatedStep;
      this._onDidChangeTreeData.fire();
      
      const status = completed ? 'completed' : 'incomplete';
      vscode.window.showInformationMessage(`✓ Marked step ${stepIndex + 1} of ${itemId} as ${status}`);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to mark step complete: ${error}`);
    }
  }
}
