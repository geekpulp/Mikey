# 🍕 Mikey - PRD-Driven Development Extension

> Let AI implement your features while you sleep.

Mikey is a VS Code extension that helps you manage product requirements (PRD) and execute development tasks using GitHub Copilot Chat. It provides a visual interface for tracking features, managing steps, and integrating with your Git workflow.

<img width="1792" height="1052" alt="Screenshot 2026-02-09 at 2 15 02 PM" src="https://github.com/user-attachments/assets/d936941b-e7b1-44c2-bc04-c7c00f40784d" />

## What Does Mikey Do?

Mikey transforms your product requirements document (PRD) into an interactive workflow:

- **Visual PRD Management**: View all your PRD items organized by category in the VS Code sidebar
- **Step-by-Step Tracking**: Break down features into actionable steps with completion checkboxes
- **AI-Powered Development**: Start fresh Copilot Chat sessions with full context for any PRD item or step
- **Status Tracking**: Monitor progress with visual indicators (not-started, in-progress, in-review, completed)
- **Git Integration**: Auto-merge completed features when status changes to completed
- **CRUD Operations**: Add, edit, and delete PRD items and steps directly from the UI

## Requirements

To use Mikey, you need:

1. **VS Code** version 1.75.0 or higher
2. **GitHub Copilot** extension (for the chat integration features)
3. **Git** installed and configured for your project (for Git workflow features)
4. A **prd.json file** in a `plans/` folder at the root of your workspace

## Installation

### From VSIX Package

1. Download the latest `.vsix` file from the [releases page](https://github.com/geekpulp/Mikey/releases)
2. In VS Code, open the Command Palette (`Cmd+Shift+P` on Mac, `Ctrl+Shift+P` on Windows/Linux)
3. Type "Install from VSIX" and select **Extensions: Install from VSIX...**
4. Browse to the downloaded `.vsix` file and select it
5. Reload VS Code when prompted

### From Source

```bash
# Clone the repository
git clone https://github.com/geekpulp/Mikey.git
cd Mikey

# Install dependencies
pnpm install

# Compile the extension
pnpm run compile

# Package the extension
pnpm run package

# Install the generated .vsix file
code --install-extension mikey-*.vsix
```

## Setup

### 1. Create a PRD File

Create a `plans/prd.json` file at the root of your workspace with the following structure:

```json
[
  {
    "id": "setup-001",
    "category": "setup",
    "description": "Initial project setup",
    "steps": [
      "Create project structure",
      "Install dependencies",
      "Configure build tools"
    ],
    "status": "not-started",
    "passes": false
  }
]
```

**Field Descriptions:**
- `id` (string): Unique identifier in format "category-###" (auto-generated when adding via UI)
- `category` (string): One of: setup, ui, functional, git, agent, polish, Bug, Audit, Docs, Action
- `description` (string): Brief description of the feature/task
- `steps` (array): List of steps (can be strings or objects with `text` and `completed` fields)
- `status` (string): One of: "not-started", "in-progress", "in-review", "completed"
- `passes` (boolean): Whether the item passes acceptance criteria

### 2. Open Your Workspace

Open the folder containing your `plans/prd.json` file in VS Code. The extension will automatically activate and detect the PRD file.

### 3. Access the Mikey Sidebar

Click the Mikey icon (🍕) in the Activity Bar on the left side of VS Code to open the PRD Items view.

## How to Use Mikey

### Managing PRD Items

#### Add a New Item
1. Click the **+ Add PRD Item** button in the sidebar toolbar
2. Select a category from the dropdown
3. Enter a description for the item
4. The item will be created with an auto-generated ID and appear in the sidebar

#### Edit an Item
1. Click on a PRD item in the sidebar
2. Click the **Edit** (pencil) icon on the item
3. Modify the category or description
4. Changes are saved automatically to `prd.json`

#### Delete an Item
1. Click on a PRD item in the sidebar
2. Click the **Delete** (trash) icon on the item
3. Confirm the deletion in the dialog
4. The item will be removed from the sidebar and `prd.json`

### Working with Steps

When you click on a PRD item, a detail panel opens showing all the item's information.

#### Add a Step
1. Open the detail panel for an item
2. Click the **+ Add Step** button
3. Enter the step text
4. The step will be added to the item

#### Edit a Step
1. In the detail panel, find the step you want to edit
2. Click the **Edit** button next to the step
3. Modify the step text
4. Changes are saved automatically

#### Delete a Step
1. In the detail panel, find the step you want to remove
2. Click the **Delete** button next to the step
3. Confirm the deletion
4. The step will be removed from the item

#### Mark Steps Complete
- Click the checkbox next to any step to toggle its completion status
- Completed steps appear with strikethrough text
- Completion status is automatically saved to `prd.json`

### Tracking Progress

#### Change Item Status
In the detail panel, use the status dropdown to change the item's status:
- **not-started**: Item hasn't been started yet (circle icon)
- **in-progress**: Currently working on the item (spinning sync icon)
- **in-review**: Ready for review (eye icon)
- **completed**: Item is complete (green checkmark)

The sidebar icon updates immediately to reflect the new status.

#### Toggle Passes Field
In the detail panel, click the **Passes** toggle button to indicate whether the item meets acceptance criteria. The button changes color (green for passes, red for does not pass).

### AI-Powered Development with Copilot Chat

Mikey integrates with GitHub Copilot Chat to provide context-aware development assistance.

#### Start Work on an Item
1. Click on a PRD item in the sidebar
2. Click the **Start Work (Chat)** button (💬 icon)
3. A fresh Copilot Chat session opens with full context:
   - Item ID, category, and description
   - All steps with completion status
   - Progress history from `progress.txt`
   - Specific task instructions

#### Start Work on a Specific Step
1. Open the detail panel for an item
2. Find the step you want to work on
3. Click the **Start Work** button (💬 icon) next to that step
4. A fresh chat session opens focused on that specific step
5. The current step is highlighted with **<-- CURRENT STEP** marker

**Note:** Each chat session is completely fresh, preventing context window bloat and ensuring focused, relevant assistance.

### Git Integration

When you change an item's status to "completed" while on a feature branch:
1. A confirmation dialog appears
2. If confirmed, Mikey automatically:
   - Switches to the main branch
   - Pulls the latest changes
   - Merges your feature branch
   - Pushes to remote
   - Deletes the local feature branch
   - Switches back to main

This streamlines the workflow for completing features.

## Keyboard Shortcuts

Currently, all actions are accessible through the UI. Keyboard shortcuts can be configured in VS Code's Keyboard Shortcuts settings.

## File Watching

Mikey automatically watches your `prd.json` file for changes. If you modify the file externally (e.g., in a text editor or via Git), the sidebar will automatically refresh to reflect the changes.

## Commands

All Mikey commands are accessible via the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`):

- **Mikey: Add PRD Item** - Create a new PRD item
- **Mikey: Edit PRD Item** - Edit the selected item
- **Mikey: Delete PRD Item** - Delete the selected item
- **Mikey: Start Work (Chat)** - Open Copilot Chat for the selected item
- **Mikey: Run PRD Item** - Execute automated workflow for the item
- **Mikey: Refresh** - Manually refresh the PRD items view

## Troubleshooting

### Extension Not Activating
- Ensure you have a `plans/prd.json` file in your workspace root
- Reload VS Code window (`Cmd+R` / `Ctrl+R`)
- Check the Output panel (View → Output → Mikey) for error messages

### PRD Items Not Showing
- Verify your `prd.json` file is valid JSON
- Check that the file is located at `<workspace-root>/plans/prd.json`
- Click the Refresh button in the sidebar toolbar

### Chat Sessions Not Opening
- Ensure GitHub Copilot extension is installed and activated
- Check your Copilot subscription status
- Try running **GitHub Copilot: Sign In** from Command Palette

### Git Merge Failing
- Ensure you're on a feature branch when marking items complete
- Check that your Git repository has a remote configured
- Verify you have permissions to push to the remote
- Resolve any merge conflicts manually if they occur

## Development

### Building from Source

```bash
# Install dependencies
pnpm install

# Type check
pnpm run typecheck

# Compile TypeScript
pnpm run compile

# Watch mode (auto-recompile on changes)
pnpm run watch

# Run tests (integration tests in VS Code environment)
pnpm test

# Package extension
pnpm run package
```

### Running Tests

Mikey uses Mocha for testing with VS Code's test runner for integration tests.

```bash
# Run all tests (integration tests in VS Code Extension Host)
pnpm test

# Type check before testing
pnpm run typecheck

# Compile and run tests
pnpm run pretest && pnpm test
```

**Test Structure:**
- `src/test/suite/` - Test files (*.test.ts)
- `src/test/mocks/` - Mock utilities for VS Code API
- `src/test/runTest.ts` - Test runner configuration
- `.mocharc.json` - Mocha configuration

**Writing Tests:**
1. Create test files in `src/test/suite/` with `.test.ts` extension
2. Use `suite()` and `test()` from Mocha's TDD interface
3. Import mocks from `src/test/mocks/testUtils.ts` for VS Code API mocking
4. Tests run in a real VS Code Extension Development Host environment

### Project Structure

```
mikey/
├── src/
│   ├── extension.ts               # Extension entry point
│   ├── prdTreeDataProvider.ts    # Sidebar tree view logic
│   ├── detailPanel.ts            # Detail panel webview
│   └── test/                     # Test files
│       ├── runTest.ts           # Test runner
│       ├── suite/               # Test suites
│       │   ├── index.ts        # Test suite loader
│       │   └── *.test.ts       # Test files
│       └── mocks/              # Mock utilities
│           └── testUtils.ts    # VS Code API mocks
├── resources/
│   └── ralph-icon.svg            # Extension icon
├── plans/
│   └── prd.json                 # Example PRD file
├── package.json                 # Extension manifest
├── tsconfig.json                # TypeScript config
└── .mocharc.json               # Mocha test config
```

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## Credits

Extended from the [work](https://github.com/soderlind/ralph) of [@soderlind](https://github.com/soderlind).

## License

MIT — see [LICENSE](LICENSE).
