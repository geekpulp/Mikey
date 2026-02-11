import * as vscode from 'vscode';
import { PrdTreeDataProvider, PrdItem } from './prdTreeDataProvider';
import { DetailPanel } from './detailPanel';
import { ConfigManager } from './config';
import { Logger } from './logger';

/**
 * Activates the Ralph extension
 * 
 * This is the main entry point for the extension. It:
 * - Initializes the logger
 * - Creates and registers the PRD tree data provider
 * - Registers all extension commands
 * - Sets up file watchers and event handlers
 * 
 * @param context - The extension context provided by VS Code, used for managing subscriptions and extension state
 * 
 * @example
 * ```typescript
 * // Called automatically by VS Code when extension activates
 * // Activation events defined in package.json:
 * // - onView:ralph.prdExplorer
 * // - workspaceContains:plans/prd.json
 * ```
 */
export function activate(context: vscode.ExtensionContext) {
  const logger = Logger.getInstance();
  const config = ConfigManager.getInstance();
  logger.info('Ralph extension activated');

  const prdProvider = new PrdTreeDataProvider(context);
  
  const treeView = vscode.window.createTreeView('ralph.prdExplorer', {
    treeDataProvider: prdProvider
  });
  
  // Update tree view description with progress summary
  prdProvider.onProgressUpdate((progress) => {
    treeView.description = progress;
  });
  
  context.subscriptions.push(treeView);

  context.subscriptions.push(
    vscode.commands.registerCommand('ralph.refresh', () => {
      logger.debug('Refreshing PRD tree view');
      prdProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('ralph.filterByStatus', async () => {
      logger.debug('Filter by status command invoked');
      
      const currentFilter = prdProvider.getStatusFilter();
      const filterOptions = [
        { label: 'All Items', value: 'all', description: currentFilter === 'all' ? '(current)' : '' },
        { label: 'Not Started', value: 'not-started', description: currentFilter === 'not-started' ? '(current)' : '' },
        { label: 'In Progress', value: 'in-progress', description: currentFilter === 'in-progress' ? '(current)' : '' },
        { label: 'In Review', value: 'in-review', description: currentFilter === 'in-review' ? '(current)' : '' },
        { label: 'Completed', value: 'completed', description: currentFilter === 'completed' ? '(current)' : '' }
      ];
      
      const selected = await vscode.window.showQuickPick(filterOptions, {
        placeHolder: 'Filter PRD items by status'
      });
      
      if (selected) {
        logger.info('Setting status filter', { filter: selected.value });
        prdProvider.setStatusFilter(selected.value as any);
        vscode.window.showInformationMessage(
          selected.value === 'all' 
            ? 'Showing all PRD items' 
            : `Showing only ${selected.label.toLowerCase()} items`
        );
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('ralph.filterByCategory', async () => {
      logger.debug('Filter by category command invoked');
      
      const currentFilter = prdProvider.getCategoryFilter();
      const categories = config.getCategories();
      
      const filterOptions = [
        { label: 'All Categories', value: 'all', description: currentFilter === 'all' ? '(current)' : '' },
        ...categories.map(cat => ({
          label: cat.charAt(0).toUpperCase() + cat.slice(1),
          value: cat,
          description: currentFilter === cat ? '(current)' : ''
        }))
      ];
      
      const selected = await vscode.window.showQuickPick(filterOptions, {
        placeHolder: 'Filter PRD items by category'
      });
      
      if (selected) {
        logger.info('Setting category filter', { filter: selected.value });
        prdProvider.setCategoryFilter(selected.value);
        vscode.window.showInformationMessage(
          selected.value === 'all' 
            ? 'Showing all categories' 
            : `Showing only ${selected.label} items`
        );
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('ralph.addItem', async () => {
      logger.debug('Add item command invoked');
      const category = await vscode.window.showQuickPick(config.getCategories(), {
        placeHolder: 'Select category for the new item'
      });
      
      if (!category) {
        logger.debug('Add item cancelled: no category selected');
        return;
      }
      
      const description = await vscode.window.showInputBox({
        prompt: 'Enter description for the new item',
        placeHolder: 'e.g., Implement export functionality'
      });
      
      if (!description) {
        logger.debug('Add item cancelled: no description provided');
        return;
      }
      
      logger.info('Adding new PRD item', { category, description });
      await prdProvider.addItem(category, description);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('ralph.editItem', async (item: PrdItem) => {
      logger.info('Editing PRD item', { id: item.id });
      await prdProvider.editItem(item);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('ralph.deleteItem', async (item: PrdItem) => {
      logger.info('Deleting PRD item', { id: item.id });
      await prdProvider.deleteItem(item);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("ralph.runItem", async (item?: PrdItem) => {
      logger.info('Running PRD item', { id: item?.id });
      await prdProvider.runItem(item);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('ralph.startWork', async (item?: PrdItem) => {
      if (!item) {
        logger.warn('Start work command invoked without item');
        vscode.window.showErrorMessage('No item selected');
        return;
      }
      logger.info('Starting work on PRD item', { id: item.id });
      await prdProvider.startWork(item);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('ralph.openItem', (item: PrdItem) => {
      logger.debug('Opening detail panel for item', { id: item.id });
      DetailPanel.createOrShow(context.extensionUri, item);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('ralph.markStepComplete', async (itemId: string, stepIndex: number, completed: boolean = true) => {
      logger.debug('Marking step complete', { itemId, stepIndex, completed });
      await prdProvider.markStepComplete(itemId, stepIndex, completed);
    })
  );
}

/**
 * Deactivates the Ralph extension
 * 
 * This function is called when the extension is deactivated. It:
 * - Logs the deactivation event
 * - Disposes of the logger and its resources
 * 
 * @remarks
 * VS Code automatically disposes of all subscriptions registered via context.subscriptions,
 * so we only need to handle custom cleanup here.
 */
export function deactivate() {
  const logger = Logger.getInstance();
  logger.info('Ralph extension deactivated');
  logger.dispose();
  ConfigManager.resetInstance();
}
