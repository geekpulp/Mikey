import * as path from 'path';
import { runTests, resolveCliArgsFromVSCodeExecutablePath, downloadAndUnzipVSCode } from '@vscode/test-electron';

async function main() {
	try {
		// The folder containing the Extension Manifest package.json
		const extensionDevelopmentPath = path.resolve(__dirname, '../../');

		// The path to the extension test script
		const extensionTestsPath = path.resolve(__dirname, './suite/index');

		// Download VS Code, unzip it
		const vscodeExecutablePath = await downloadAndUnzipVSCode();
		
		// Use resolveCliArgsFromVSCodeExecutablePath to handle macOS .app bundles correctly
		// This fixes the "bad option" error on macOS by using the CLI wrapper
		const [cli, ...args] = resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath);
		
		await runTests({ 
			vscodeExecutablePath: cli,
			extensionDevelopmentPath, 
			extensionTestsPath,
			launchArgs: [
				...args,
				'--disable-extensions' // Disable other extensions during testing
			]
		});
	} catch (err) {
		console.error('Failed to run tests:', err);
		process.exit(1);
	}
}

main();
