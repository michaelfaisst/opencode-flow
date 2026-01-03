import { Command } from "commander";

import { initCommand } from "./commands/init.js";
import { runCommand } from "./commands/run.js";
import { statusCommand } from "./commands/status.js";
import { cleanupCommand } from "./commands/cleanup.js";

const program = new Command();

program
	.name("ocf")
	.description(
		"A CLI tool that orchestrates sequential OpenCode agent pipelines for automated feature implementation",
	)
	.version("0.1.0");

// Register commands
program.addCommand(initCommand);
program.addCommand(runCommand);
program.addCommand(statusCommand);
program.addCommand(cleanupCommand);

// Global error handling
program.exitOverride((err) => {
	if (err.code === "commander.helpDisplayed" || err.code === "commander.version") {
		process.exit(0);
	}
	process.exit(1);
});

program.parse();
