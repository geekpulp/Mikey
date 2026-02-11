import * as vscode from 'vscode';
import { PrdTreeDataProvider, PrdItem } from './prdTreeDataProvider';
import { DetailPanel } from './detailPanel';
import { CATEGORIES } from './constants';
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
  logger.info('Ralph extension activated');

  const prdProvider = new PrdTreeDataProvider(context);
  
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('ralph.prdExplorer', prdProvider)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('ralph.refresh', () => {
      logger.debug('Refreshing PRD tree view');
      prdProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('ralph.addItem', async () => {
      logger.debug('Add item command invoked');
      const category = await vscode.window.showQuickPick(CATEGORIES, {
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
}
