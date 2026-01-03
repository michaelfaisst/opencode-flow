# opencode-flow (ocf)

A TypeScript CLI tool that orchestrates sequential OpenCode agent pipelines for automated feature implementation, triggered by Linear story IDs.

## Why opencode-flow?

When using OpenCode to implement features, the typical workflow involves:

1. Planning with a planning agent
2. Switching to a build agent for implementation
3. Manually reviewing and testing
4. Creating pull requests

This process has idle time between steps and requires manual orchestration.

**opencode-flow** automates this by:

1. Taking one or more Linear story IDs as input
2. Creating an isolated git worktree for each feature
3. Running a configurable sequence of agents (build, test, review)
4. Producing GitHub PRs with proper documentation

Start multiple pipelines and review completed PRs when ready.

## Installation

```bash
# Install globally
bun add -g opencode-flow

# Or use npx
npx opencode-flow <command>
```

### Requirements

- **OpenCode** must be installed and in PATH
- **Git** repository (bare repo recommended for worktree management)
- **Linear MCP server** configured in OpenCode (for fetching story details)
- **GitHub CLI** (`gh`) for PR creation

## Quick Start

```bash
# 1. Clone your repo as a bare repo (recommended)
git clone --bare git@github.com:org/repo.git repo.git
cd repo.git

# 2. Initialize opencode-flow
ocf init

# 3. Edit the pipeline configuration
# .opencode-flow/pipeline.yaml

# 4. Run a pipeline for a Linear story
ocf run DEV-18

# 5. Check status of all runs
ocf status

# 6. Clean up after PR is merged
ocf cleanup DEV-18
```

## Commands

### `ocf init`

Initialize opencode-flow in the current repository.

```bash
ocf init
```

Creates:

- `.opencode-flow/pipeline.yaml` - Pipeline configuration
- `.opencode-flow/agents/build.md` - Build agent prompt
- `.opencode-flow/agents/test.md` - Test agent prompt
- `.opencode-flow/agents/review.md` - Review agent prompt
- `.opencode-flow/.gitignore` - Ignores `runs/` directory

### `ocf run <storyId...>`

Run the pipeline for one or more Linear stories.

```bash
# Single story
ocf run DEV-18

# Multiple stories (processed sequentially)
ocf run DEV-18 DEV-19 DEV-20
```

For each story, the command:

1. Creates a worktree at `<storyId>/` on branch `flow/<storyId>`
2. Executes each agent in sequence
3. Streams OpenCode output to terminal
4. Records state after each agent

Stories with existing run state or worktrees are skipped.

### `ocf status`

Show all pipeline runs and their status.

```bash
ocf status
```

Output:

```
Story ID      Branch              Status          Current Agent     Started
-------------------------------------------------------------------------------------
DEV-18        flow/DEV-18         completed       -                 01/15/2025, 10:30:00
DEV-19        flow/DEV-19         in_progress     test              01/15/2025, 11:45:00
DEV-20        flow/DEV-20         failed          build             01/15/2025, 12:00:00

3 pipeline runs found
```

### `ocf cleanup <storyId>`

Remove a worktree and run state after the PR is merged.

```bash
# Full cleanup
ocf cleanup DEV-18

# Keep the run state for history
ocf cleanup DEV-18 --keep-state
```

## Configuration

### `.opencode-flow/pipeline.yaml`

```yaml
# Global settings applied to all agents unless overridden
settings:
    # Default model for all agents (optional)
    defaultModel: anthropic/claude-sonnet-4-20250514

    # Default OpenCode agent for all agents (optional)
    defaultAgent: build

# Agents to run in sequence
agents:
    - name: build
      promptPath: ./agents/build.md
      # Override model for this agent (optional)
      # model: anthropic/claude-sonnet-4-20250514
      # Override OpenCode agent (optional)
      # agent: plan

    - name: test
      promptPath: ./agents/test.md

    - name: review
      promptPath: ./agents/review.md
```

### Configuration Options

| Option                  | Description                                                  |
| ----------------------- | ------------------------------------------------------------ |
| `settings.defaultModel` | Default model for all agents (format: `provider/model`)      |
| `settings.defaultAgent` | Default OpenCode agent type for all agents                   |
| `agents[].name`         | Unique name for the agent                                    |
| `agents[].promptPath`   | Path to prompt markdown file (relative to `.opencode-flow/`) |
| `agents[].model`        | Override model for this agent                                |
| `agents[].agent`        | Override OpenCode agent type                                 |

## Template Variables

Use these variables in agent prompt files with `{{variableName}}` syntax:

| Variable           | Description               | Example                |
| ------------------ | ------------------------- | ---------------------- |
| `{{storyId}}`      | Linear story ID           | `DEV-18`               |
| `{{branch}}`       | Git branch name           | `flow/DEV-18`          |
| `{{worktreePath}}` | Absolute path to worktree | `/path/to/repo/DEV-18` |
| `{{agentName}}`    | Current agent name        | `build`                |

### Example Prompt

```markdown
# Build Agent

You are implementing Linear story **{{storyId}}**.

## Context

- Branch: `{{branch}}`
- Working directory: `{{worktreePath}}`

## Instructions

1. Fetch story details using Linear MCP for `{{storyId}}`
2. Implement the feature
3. Create a PR with `gh pr create`
```

## Bare Repo Setup

For clean worktree management, use a bare repo:

```bash
# Clone as bare repo
git clone --bare git@github.com:org/repo.git repo.git
cd repo.git

# Initialize opencode-flow
ocf init

# Run pipelines - each creates a worktree directory
ocf run DEV-18
# Creates: DEV-18/ directory with full checkout

# List worktrees
git worktree list
```

### Why Bare Repos?

- **Clean separation**: Each feature gets its own directory
- **No conflicts**: Work on multiple features simultaneously
- **Easy cleanup**: Remove worktree when done

If you're not using a bare repo, opencode-flow will warn you but still work. Worktrees will be created as sibling directories.

## Run State

Run state is stored in `.opencode-flow/runs/<storyId>.json`:

```json
{
	"storyId": "DEV-18",
	"branch": "flow/DEV-18",
	"worktreePath": "/path/to/DEV-18",
	"status": "in_progress",
	"currentAgent": "test",
	"completedAgents": ["build"],
	"startedAt": "2025-01-15T10:30:00.000Z",
	"updatedAt": "2025-01-15T11:45:00.000Z"
}
```

### Status Values

| Status        | Description                       |
| ------------- | --------------------------------- |
| `pending`     | Run created but not started       |
| `in_progress` | Pipeline is currently running     |
| `completed`   | All agents finished successfully  |
| `failed`      | An agent failed, pipeline stopped |

## Exit Codes

| Code | Meaning                                        |
| ---- | ---------------------------------------------- |
| `0`  | All stories completed or skipped (no failures) |
| `1`  | One or more stories failed                     |

Skipped stories (due to existing state/worktree) don't cause failure.

## Troubleshooting

### "Not in a git repository"

Make sure you're running commands from within a git repository (or bare repo).

### "opencode-flow not initialized"

Run `ocf init` to create the `.opencode-flow/` directory.

### "Run already exists for <storyId>"

A previous run exists. Either:

- Clean it up: `ocf cleanup <storyId>`
- Check status: `ocf status`

### "Worktree already exists"

A worktree directory exists for this story. Either:

- Remove it manually: `git worktree remove <storyId>`
- Use cleanup: `ocf cleanup <storyId>`

### Agent fails with non-zero exit

1. Check the OpenCode output for errors
2. Review the run state: `.opencode-flow/runs/<storyId>.json`
3. Fix the issue in the worktree
4. Clean up and re-run: `ocf cleanup <storyId> && ocf run <storyId>`

### OpenCode not found

Ensure OpenCode is installed and in your PATH:

```bash
which opencode
```

## License

MIT
