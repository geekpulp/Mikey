import * as vscode from 'vscode';
import { PrdTreeDataProvider, PrdItem } from './prdTreeDataProvider';
import { DetailPanel } from './detailPanel';

export function activate(context: vscode.ExtensionContext) {
  console.log('Ralph extension is now active');

  const prdProvider = new PrdTreeDataProvider(context);
  
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('ralph.prdExplorer', prdProvider)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('ralph.refresh', () => {
      prdProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('ralph.addItem', async () => {
      const categories = ['setup', 'ui', 'functional', 'git', 'agent', 'polish'];
      
      const category = await vscode.window.showQuickPick(categories, {
        placeHolder: 'Select category for the new item'
      });
      
      if (!category) {
        return;
      }
      
      const description = await vscode.window.showInputBox({
        prompt: 'Enter description for the new item',
        placeHolder: 'e.g., Implement export functionality'
      });
      
      if (!description) {
        return;
      }
      
      await prdProvider.addItem(category, description);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('ralph.editItem', async (item: PrdItem) => {
      await prdProvider.editItem(item);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('ralph.openItem', (item: PrdItem) => {
      DetailPanel.createOrShow(context.extensionUri, item);
    })
  );
}

export function deactivate() {}
