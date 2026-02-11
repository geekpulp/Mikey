import * as vscode from 'vscode';
import { PrdTreeDataProvider, PrdItem } from './prdTreeDataProvider';
import { DetailPanel } from './detailPanel';
import { ConfigManager } from './config';
import { Logger } from './logger';
import { RunLoopManager } from './runLoopManager';
import { ArchiveManager } from './archiveManager';
import { PrdFileManager } from './prdFileManager';
import { AddItemPanel } from "./addItemPanel";

/**
 * Activates the Mikey extension
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
 * // - onView:mikey.prdExplorer
 * // - workspaceContains:plans/prd.json
 * ```
 */
export function activate(context: vscode.ExtensionContext) {
  const logger = Logger.getInstance();
  logger.info("Extension activation starting...");
  const config = ConfigManager.getInstance();
  logger.info("Mikey extension activated");
  logger.debug("Logger initialized, creating PrdTreeDataProvider...");

  let prdProvider: PrdTreeDataProvider | null = null;
  let treeView: vscode.TreeView<any> | null = null;

  try {
    prdProvider = new PrdTreeDataProvider(context);
    logger.debug("PrdTreeDataProvider created successfully");
  } catch (error) {
    logger.error("Failed to create PrdTreeDataProvider", error);
    vscode.window.showErrorMessage(
      `Failed to initialize PRD viewer: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (prdProvider) {
    try {
      logger.debug("Creating tree view...");
      treeView = vscode.window.createTreeView("mikey.prdExplorer", {
        treeDataProvider: prdProvider,
        dragAndDropController: prdProvider,
      });
      logger.debug("Tree view created successfully");

      // Update tree view description with progress summary
      prdProvider.onProgressUpdate((progress) => {
        treeView!.description = progress;
      });

      context.subscriptions.push(treeView);
    } catch (error) {
      logger.error("Failed to create tree view", error);
      vscode.window.showErrorMessage(
        `Failed to create tree view: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // Register all commands - these are always available even if provider fails
  try {
    context.subscriptions.push(
      vscode.commands.registerCommand("mikey.refresh", () => {
        logger.debug("Refreshing PRD tree view");
        if (prdProvider) {
          prdProvider.refresh();
        } else {
          vscode.window.showErrorMessage(
            "PRD viewer not initialized. Please check the logs for details.",
          );
        }
      }),
    );

    context.subscriptions.push(
      vscode.commands.registerCommand("mikey.filterByStatus", async () => {
        if (!prdProvider) {
          vscode.window.showErrorMessage("PRD viewer not initialized");
          return;
        }
        logger.debug("Filter by status command invoked");

        const currentFilter = prdProvider.getStatusFilter();
        const filterOptions = [
          {
            label: "All Items",
            value: "all",
            description: currentFilter === "all" ? "(current)" : "",
          },
          {
            label: "Not Started",
            value: "not-started",
            description: currentFilter === "not-started" ? "(current)" : "",
          },
          {
            label: "In Progress",
            value: "in-progress",
            description: currentFilter === "in-progress" ? "(current)" : "",
          },
          {
            label: "In Review",
            value: "in-review",
            description: currentFilter === "in-review" ? "(current)" : "",
          },
          {
            label: "Completed",
            value: "completed",
            description: currentFilter === "completed" ? "(current)" : "",
          },
        ];

        const selected = await vscode.window.showQuickPick(filterOptions, {
          placeHolder: "Filter PRD items by status",
        });

        if (selected) {
          logger.info("Setting status filter", { filter: selected.value });
          prdProvider.setStatusFilter(selected.value as any);
          vscode.window.showInformationMessage(
            selected.value === "all"
              ? "Showing all PRD items"
              : `Showing only ${selected.label.toLowerCase()} items`,
          );
        }
      }),
    );

    context.subscriptions.push(
      vscode.commands.registerCommand("mikey.filterByCategory", async () => {
        if (!prdProvider) {
          vscode.window.showErrorMessage("PRD viewer not initialized");
          return;
        }
        logger.debug("Filter by category command invoked");

        const currentFilter = prdProvider.getCategoryFilter();
        const categories = config.getCategories();

        const filterOptions = [
          {
            label: "All Categories",
            value: "all",
            description: currentFilter === "all" ? "(current)" : "",
          },
          ...categories.map((cat) => ({
            label: cat.charAt(0).toUpperCase() + cat.slice(1),
            value: cat,
            description: currentFilter === cat ? "(current)" : "",
          })),
        ];

        const selected = await vscode.window.showQuickPick(filterOptions, {
          placeHolder: "Filter PRD items by category",
        });

        if (selected) {
          logger.info("Setting category filter", { filter: selected.value });
          prdProvider.setCategoryFilter(selected.value);
          vscode.window.showInformationMessage(
            selected.value === "all"
              ? "Showing all categories"
              : `Showing only ${selected.label} items`,
          );
        }
      }),
    );

    context.subscriptions.push(
      vscode.commands.registerCommand("mikey.addItem", async () => {
        if (!prdProvider) {
          vscode.window.showErrorMessage("PRD viewer not initialized");
          return;
        }
        logger.debug("Add item command invoked - opening webview panel");

        // Show the webview panel for adding items
        AddItemPanel.show((category: string, description: string) => {
          logger.info("Adding new PRD item from webview", {
            category,
            description,
          });
          prdProvider.addItem(category, description);
        });
      }),
    );

    context.subscriptions.push(
      vscode.commands.registerCommand(
        "mikey.editItem",
        async (item: PrdItem) => {
          if (!prdProvider) {
            vscode.window.showErrorMessage("PRD viewer not initialized");
            return;
          }
          logger.info("Editing PRD item", { id: item.id });
          await prdProvider.editItem(item);
        },
      ),
    );

    context.subscriptions.push(
      vscode.commands.registerCommand(
        "mikey.deleteItem",
        async (item: PrdItem) => {
          if (!prdProvider) {
            vscode.window.showErrorMessage("PRD viewer not initialized");
            return;
          }
          logger.info("Deleting PRD item", { id: item.id });
          await prdProvider.deleteItem(item);
        },
      ),
    );

    context.subscriptions.push(
      vscode.commands.registerCommand(
        "mikey.runItem",
        async (item?: PrdItem) => {
          if (!prdProvider) {
            vscode.window.showErrorMessage("PRD viewer not initialized");
            return;
          }
          logger.info("Running PRD item", { id: item?.id });
          await prdProvider.runItem(item);
        },
      ),
    );

    context.subscriptions.push(
      vscode.commands.registerCommand(
        "mikey.runItemDirect",
        async (item: PrdItem) => {
          if (!prdProvider) {
            vscode.window.showErrorMessage("PRD viewer not initialized");
            return;
          }
          logger.info("Running PRD item directly with defaults", {
            id: item.id,
          });
          await prdProvider.runItemDirect(item);
        },
      ),
    );

    context.subscriptions.push(
      vscode.commands.registerCommand(
        "mikey.startWork",
        async (item?: PrdItem) => {
          if (!prdProvider) {
            vscode.window.showErrorMessage("PRD viewer not initialized");
            return;
          }
          if (!item) {
            logger.warn("Start work command invoked without item");
            vscode.window.showErrorMessage("No item selected");
            return;
          }
          logger.info("Starting work on PRD item", { id: item.id });
          await prdProvider.startWork(item);
        },
      ),
    );

    context.subscriptions.push(
      vscode.commands.registerCommand("mikey.openItem", (item: PrdItem) => {
        logger.debug("Opening detail panel for item", { id: item.id });
        DetailPanel.createOrShow(context.extensionUri, item);
      }),
    );

    context.subscriptions.push(
      vscode.commands.registerCommand(
        "mikey.markStepComplete",
        async (
          itemId: string,
          stepIndex: number,
          completed: boolean = true,
        ) => {
          if (!prdProvider) {
            vscode.window.showErrorMessage("PRD viewer not initialized");
            return;
          }
          logger.debug("Marking step complete", {
            itemId,
            stepIndex,
            completed,
          });
          await prdProvider.markStepComplete(itemId, stepIndex, completed);
        },
      ),
    );

    context.subscriptions.push(
      vscode.commands.registerCommand("mikey.runQueue", async () => {
        logger.debug("Run queue command invoked");

        // Prompt user for queue options
        const statusOptions = [
          { label: "Not Started", value: "not-started" },
          { label: "In Progress", value: "in-progress" },
          { label: "All Items", value: "all" },
        ];

        const selectedStatus = await vscode.window.showQuickPick(
          statusOptions,
          {
            placeHolder: "Select which items to process",
          },
        );

        if (!selectedStatus) {
          logger.debug("Run queue cancelled: no status selected");
          return;
        }

        const categoryOptions = [
          { label: "All Categories", value: "all" },
          { label: "Setup", value: "setup" },
          { label: "UI", value: "ui" },
          { label: "Functional", value: "functional" },
          { label: "Git", value: "git" },
          { label: "Agent", value: "agent" },
          { label: "Test", value: "test" },
        ];

        const selectedCategory = await vscode.window.showQuickPick(
          categoryOptions,
          {
            placeHolder: "Select category to process",
          },
        );

        if (!selectedCategory) {
          logger.debug("Run queue cancelled: no category selected");
          return;
        }

        const stopOnFailureOptions = [
          { label: "Continue on failure", value: false },
          { label: "Stop on first failure", value: true },
        ];

        const selectedStopOption = await vscode.window.showQuickPick(
          stopOnFailureOptions,
          {
            placeHolder: "How should failures be handled?",
          },
        );

        if (!selectedStopOption) {
          logger.debug("Run queue cancelled: no failure option selected");
          return;
        }

        // Prompt for iterations per item
        const iterationInput = await vscode.window.showInputBox({
          prompt: "Number of iterations per item",
          value: "1",
          validateInput: (value) => {
            const num = parseInt(value, 10);
            if (isNaN(num) || num < 1) {
              return "Please enter a number greater than or equal to 1";
            }
            return null;
          },
        });

        if (!iterationInput) {
          logger.debug("Run queue cancelled: no iterations specified");
          return;
        }

        const iterationsPerItem = parseInt(iterationInput, 10);

        logger.info("Starting run queue", {
          status: selectedStatus.value,
          category: selectedCategory.value,
          stopOnFailure: selectedStopOption.value,
          iterationsPerItem,
        });

        const runLoopManager = new RunLoopManager();

        // Get workspace path
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
          vscode.window.showErrorMessage("No workspace folder open");
          return;
        }
        const workspacePath = workspaceFolders[0].uri.fsPath;

        // Initialize with workspace context
        runLoopManager.initialize(workspacePath);

        try {
          await runLoopManager.startLoop({
            statusFilter: selectedStatus.value as any,
            categoryFilter: selectedCategory.value,
            stopOnFailure: selectedStopOption.value,
            iterationsPerItem,
            onItemStart: (item, iteration) => {
              logger.info("Starting item", { id: item.id, iteration });
              if (prdProvider) {
                prdProvider.refresh();
              }
            },
            onItemComplete: (item, success, iteration) => {
              logger.info("Item completed", {
                id: item.id,
                success,
                iteration,
              });
              if (prdProvider) {
                prdProvider.refresh();
              }
            },
            onLoopComplete: (processed, succeeded, failed) => {
              logger.info("Loop completed", { processed, succeeded, failed });
              if (prdProvider) {
                prdProvider.refresh();
              }
            },
          });
        } catch (error) {
          logger.error("Run queue failed", error);
          vscode.window.showErrorMessage(
            `Failed to run queue: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }),
    );

    context.subscriptions.push(
      vscode.commands.registerCommand("mikey.archiveCompleted", async () => {
        if (!prdProvider) {
          vscode.window.showErrorMessage("PRD viewer not initialized");
          return;
        }

        logger.debug("Archive completed command invoked");

        try {
          // Get workspace path
          const workspaceFolders = vscode.workspace.workspaceFolders;
          if (!workspaceFolders) {
            vscode.window.showWarningMessage("No workspace folder open");
            return;
          }

          const workspacePath = workspaceFolders[0].uri.fsPath;

          // Initialize archive manager
          const archiveManager = ArchiveManager.getInstance();
          archiveManager.initialize(workspacePath);

          // Get current items
          const fileManager = PrdFileManager.getInstance();
          const currentItems = fileManager.read();

          // Archive completed items
          const result = archiveManager.archiveCompleted(currentItems);

          if (result.archivedCount === 0) {
            vscode.window.showInformationMessage(
              "No completed items to archive",
            );
            logger.info("No items to archive");
            return;
          }

          // Save remaining items back to PRD file
          fileManager.write(result.remainingItems);

          // Cleanup old archives based on retention policy
          const config = vscode.workspace.getConfiguration("mikey");
          const retentionDays = config.get<number>(
            "archiving.retentionDays",
            90,
          );
          if (retentionDays > 0) {
            const deletedCount =
              archiveManager.cleanupOldArchives(retentionDays);
            if (deletedCount > 0) {
              logger.info("Cleaned up old archives", { deletedCount });
            }
          }

          // Show success message
          const archiveFileName =
            result.archiveFile.split("/").pop() || result.archiveFile;
          vscode.window.showInformationMessage(
            `Archived ${result.archivedCount} completed item${result.archivedCount > 1 ? "s" : ""} to ${archiveFileName}`,
          );

          logger.info("Archive completed successfully", {
            archivedCount: result.archivedCount,
            archiveFile: result.archiveFile,
            remainingCount: result.remainingItems.length,
          });

          // Refresh tree view
          prdProvider.refresh();
        } catch (error) {
          logger.error("Archive failed", error);
          vscode.window.showErrorMessage(
            `Failed to archive items: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }),
    );

    logger.info("All Mikey extension commands registered");
  } catch (error) {
    const logger = Logger.getInstance();
    logger.error("Error registering commands", error);
  }

  logger.info("Extension activation completed");
}

/**
 * Deactivates the Mikey extension
 * 
 * This function is called when the extension is deactivated. It:
 * - Logs the deactivation event
 * - Auto-archives completed items if enabled in configuration
 * - Cleans up old archive files based on retention policy
 * - Disposes of the logger and its resources
 * 
 * @remarks
 * VS Code automatically disposes of all subscriptions registered via context.subscriptions,
 * so we only need to handle custom cleanup here.
 */
export function deactivate() {
  const logger = Logger.getInstance();
  logger.info("Mikey extension deactivated");

  try {
    const config = vscode.workspace.getConfiguration("mikey");
    const autoArchiveOnExit = config.get<boolean>('archiving.autoArchiveOnExit', false);
    const retentionDays = config.get<number>('archiving.retentionDays', 90);

    if (autoArchiveOnExit) {
      logger.info('Auto-archiving on exit enabled');

      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (workspaceFolders) {
        const workspacePath = workspaceFolders[0].uri.fsPath;
        const archiveManager = ArchiveManager.getInstance();
        archiveManager.initialize(workspacePath);

        // Archive completed items
        const fileManager = PrdFileManager.getInstance();
        const currentItems = fileManager.read();
        const result = archiveManager.archiveCompleted(currentItems);

        if (result.archivedCount > 0) {
          fileManager.write(result.remainingItems);
          logger.info('Auto-archived on exit', {
            archivedCount: result.archivedCount,
            archiveFile: result.archiveFile
          });
        }

        // Cleanup old archives
        if (retentionDays > 0) {
          const deletedCount = archiveManager.cleanupOldArchives(retentionDays);
          if (deletedCount > 0) {
            logger.info('Cleaned up old archives on exit', { deletedCount });
          }
        }
      }
    }
  } catch (error) {
    logger.error('Error during auto-archive on exit', error);
  }

  logger.dispose();
  ConfigManager.resetInstance();
}
