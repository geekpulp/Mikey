import * as vscode from 'vscode';
import { PrdTreeDataProvider } from './prdTreeDataProvider';

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
    vscode.commands.registerCommand('ralph.addItem', () => {
      vscode.window.showInformationMessage('Add item functionality coming soon');
    })
  );
}

export function deactivate() {}
