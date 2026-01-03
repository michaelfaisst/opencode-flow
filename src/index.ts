import { Command } from "commander";

const program = new Command();

program
	.name("ocf")
	.description(
		"A CLI tool that orchestrates sequential OpenCode agent pipelines for automated feature implementation",
	)
	.version("0.1.0");

// Commands will be registered here in Phase 3
// program.addCommand(initCommand);
// program.addCommand(runCommand);
// program.addCommand(statusCommand);
// program.addCommand(cleanupCommand);

program.parse();
