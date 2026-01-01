# opencode-flow (ocf) - Implementation Plan

> A TypeScript CLI tool that orchestrates sequential OpenCode agent pipelines for automated feature implementation, triggered by Linear story IDs.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Configuration Schema](#configuration-schema)
4. [Template Variables](#template-variables)
5. [CLI Commands](#cli-commands)
6. [Implementation Phases](#implementation-phases)
   - [Phase 1: Project Foundation](#phase-1-project-foundation)
   - [Phase 2: Core Libraries](#phase-2-core-libraries)
   - [Phase 3: Commands](#phase-3-commands)
   - [Phase 4: Documentation & Polish](#phase-4-documentation--polish)
7. [Example Agent Prompts](#example-agent-prompts)
8. [Future Enhancements](#future-enhancements)

---

## Overview

### Problem

When using OpenCode to implement features, the typical workflow involves:
1. Planning with a planning agent (researching, creating Linear stories)
2. Switching to a build agent for implementation
3. Manually reviewing and testing
4. Creating pull requests

This process has idle time between steps and requires manual orchestration.

### Solution

**opencode-flow** automates the implementation pipeline by:
1. Taking a Linear story ID as input
2. Creating an isolated git worktree for the feature
3. Running a configurable sequence of agents (build → test → review)
4. Producing a GitHub PR with proper documentation and review comments

This enables parallel feature development - start multiple pipelines and review completed PRs when ready.

### Key Design Decisions

- **Sequential agent execution**: Agents run one after another, each building on the previous agent's work
- **Git worktree isolation**: Each feature gets its own worktree, enabling parallel work without branch conflicts
- **Bare repo assumption**: The tool assumes the repository is cloned as a bare repo for clean worktree management
- **OpenCode as execution engine**: Each agent runs via `opencode run` with configurable model/agent settings
- **Local state only**: Run state is stored locally and gitignored, not committed to the repository

---

## Architecture

### Project Structure

```
opencode-flow/
├── src/
│   ├── index.ts                 # CLI entry point (commander setup)
│   ├── commands/
│   │   ├── init.ts              # Initialize .opencode-flow in repo
│   │   ├── run.ts               # Run pipeline for a story
│   │   ├── status.ts            # Show pipeline runs
│   │   └── cleanup.ts           # Remove worktree
│   ├── lib/
│   │   ├── config.ts            # Load/validate pipeline.yaml
│   │   ├── worktree.ts          # Git worktree operations
│   │   ├── runner.ts            # Execute agents sequentially
│   │   ├── template.ts          # Variable substitution
│   │   └── state.ts             # Run state persistence
│   └── types.ts                 # TypeScript interfaces
├── package.json
├── tsconfig.json
├── README.md
├── plan.md                      # This file
└── .gitignore
```

### Execution Flow

```
ocf run DEV-18
       │
       ▼
┌──────────────────────────────────┐
│ 1. Load & validate pipeline.yaml │
└──────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────┐
│ 2. Check for bare repo           │
│    (warn if not bare)            │
└──────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────┐
│ 3. Create worktree               │
│    git worktree add DEV-18       │
│    -b flow/DEV-18                │
└──────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────┐
│ 4. Initialize run state          │
│    .opencode-flow/runs/DEV-18.json│
└──────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────┐
│ 5. For each agent in pipeline:   │
│    a. Read prompt markdown       │
│    b. Substitute template vars   │
│    c. cd into worktree           │
│    d. Run: opencode run "prompt" │
│       --model X --agent Y        │
│    e. Stream stdout/stderr       │
│    f. Update state on completion │
│    g. Stop if exit code ≠ 0      │
└──────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────┐
│ 6. Mark run as completed/failed  │
└──────────────────────────────────┘
```

### Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| commander | ^12.1.0 | CLI framework |
| yaml | ^2.6.0 | Parse pipeline.yaml |
| chalk | ^5.3.0 | Colored terminal output |
| typescript | ^5.7.0 | TypeScript compiler (dev) |
| @types/node | ^22.0.0 | Node.js type definitions (dev) |
| tsup | ^8.3.0 | Build/bundle tool (dev) |

---

## Configuration Schema

### `.opencode-flow/pipeline.yaml`

```yaml
# Global settings applied to all agents unless overridden
settings:
  # Default model for all agents (optional)
  # Format: provider/model
  defaultModel: anthropic/claude-sonnet-4-20250514
  
  # Default OpenCode agent for all agents (optional)
  defaultAgent: code

# Agents to run in sequence
agents:
  # Each agent has a name and prompt file
  - name: build
    # Path to prompt markdown file (relative to .opencode-flow/)
    prompt: ./agents/build.md
    # Override model for this agent (optional)
    model: anthropic/claude-sonnet-4-20250514
    # Override OpenCode agent for this agent (optional)
    agent: code

  - name: test
    prompt: ./agents/test.md
    # Uses defaultModel and defaultAgent from settings

  - name: review
    prompt: ./agents/review.md
    model: anthropic/claude-sonnet-4-20250514
```

### Configuration Validation Rules

- `agents` array must have at least one agent
- Each agent must have `name` and `prompt` properties
- `prompt` file must exist and be readable
- `name` must be unique across all agents
- `model` format must be `provider/model` if specified

---

## Template Variables

Variables can be used in agent prompt markdown files using `{{variableName}}` syntax.

| Variable | Description | Example Value |
|----------|-------------|---------------|
| `{{storyId}}` | Linear story ID passed to the CLI | `DEV-18` |
| `{{branch}}` | Git branch name created for this run | `flow/DEV-18` |
| `{{worktreePath}}` | Absolute path to the worktree directory | `/path/to/repo/DEV-18` |
| `{{agentName}}` | Name of the current agent being executed | `build` |

### Example Usage in Prompt

```markdown
# Build Agent

You are implementing Linear story **{{storyId}}**.

## Context
- Branch: `{{branch}}`
- Working directory: `{{worktreePath}}`
- Agent: `{{agentName}}`

## Instructions
1. Fetch story details using Linear MCP: `{{storyId}}`
2. Implement the feature
3. Create a PR
```

---

## CLI Commands

### `ocf init`

Initialize opencode-flow configuration in the current repository.

**What it does:**
1. Creates `.opencode-flow/` directory
2. Creates `.opencode-flow/pipeline.yaml` with example configuration
3. Creates `.opencode-flow/agents/` directory
4. Creates example agent prompts (build.md, test.md, review.md)
5. Adds `runs/` to `.opencode-flow/.gitignore`

**Usage:**
```bash
ocf init
```

**Output:**
```
✓ Created .opencode-flow/pipeline.yaml
✓ Created .opencode-flow/agents/build.md
✓ Created .opencode-flow/agents/test.md
✓ Created .opencode-flow/agents/review.md
✓ Created .opencode-flow/.gitignore

opencode-flow initialized! Edit .opencode-flow/pipeline.yaml to configure your pipeline.
```

---

### `ocf run <storyId>`

Run the full pipeline for a Linear story.

**What it does:**
1. Validates configuration
2. Checks if repo is bare (warns if not)
3. Creates worktree at `<storyId>/` on branch `flow/<storyId>`
4. Executes each agent sequentially
5. Streams OpenCode output to terminal
6. Updates state after each agent
7. Stops and reports on failure

**Usage:**
```bash
# Run full pipeline
ocf run DEV-18

# Start from a specific agent (for recovery)
ocf run DEV-18 --from test
```

**Flags:**
| Flag | Description |
|------|-------------|
| `--from <agent>` | Start pipeline from a specific agent (skips previous agents) |

**Output:**
```
◐ Creating worktree for DEV-18...
✓ Worktree created at /path/to/repo/DEV-18

◐ Running agent: build
  Model: anthropic/claude-sonnet-4-20250514
  Agent: code
─────────────────────────────────────
[OpenCode output streams here]
─────────────────────────────────────
✓ Agent build completed

◐ Running agent: test
...

✓ Pipeline completed for DEV-18
```

**Error Output:**
```
✗ Agent test failed with exit code 1
  Run state saved to .opencode-flow/runs/DEV-18.json
  
  To retry from the failed agent:
    ocf run DEV-18 --from test
```

---

### `ocf status`

Show all pipeline runs and their status.

**What it does:**
1. Reads all JSON files from `.opencode-flow/runs/`
2. Displays a table with run information

**Usage:**
```bash
ocf status
```

**Output:**
```
Story ID    Branch          Status       Current Agent   Started              
──────────────────────────────────────────────────────────────────────────────
DEV-18      flow/DEV-18     completed    -               2025-01-15 10:30:00  
DEV-19      flow/DEV-19     in_progress  test            2025-01-15 11:45:00  
DEV-20      flow/DEV-20     failed       build           2025-01-15 12:00:00  

3 pipeline runs found
```

---

### `ocf cleanup <storyId>`

Remove a worktree after the PR is merged/closed.

**What it does:**
1. Runs `git worktree remove <storyId>`
2. Optionally deletes the local branch
3. Deletes the run state file (unless `--keep-state`)

**Usage:**
```bash
# Full cleanup
ocf cleanup DEV-18

# Keep the run state for history
ocf cleanup DEV-18 --keep-state
```

**Flags:**
| Flag | Description |
|------|-------------|
| `--keep-state` | Don't delete the run state JSON file |

**Output:**
```
◐ Removing worktree DEV-18...
✓ Worktree removed
✓ Run state deleted

Cleanup complete for DEV-18
```

---

## Implementation Phases

### Phase 1: Project Foundation

**Goal:** Set up the project structure, build system, and TypeScript configuration.

**Tasks:**

- [ ] **1.1 Initialize package.json**
  - Package name: `opencode-flow`
  - Binary name: `ocf`
  - Set up scripts: `build`, `dev`, `start`
  - Add dependencies: commander, yaml, chalk
  - Add devDependencies: typescript, @types/node, tsup

- [ ] **1.2 Configure TypeScript (tsconfig.json)**
  - Target: ES2022
  - Module: NodeNext
  - Strict mode enabled
  - Output to `dist/`
  - Include `src/`

- [ ] **1.3 Configure build tool (tsup.config.ts)**
  - Entry: `src/index.ts`
  - Output: `dist/`
  - Format: ESM
  - Add shebang for CLI execution

- [ ] **1.4 Create .gitignore**
  - Ignore `node_modules/`
  - Ignore `dist/`

- [ ] **1.5 Create project folder structure**
  - Create `src/` directory
  - Create `src/commands/` directory
  - Create `src/lib/` directory

- [ ] **1.6 Define TypeScript types (src/types.ts)**
  - `PipelineConfig` interface
  - `AgentConfig` interface
  - `Settings` interface
  - `RunState` interface
  - `RunStatus` type

**Deliverables:**
- Project builds successfully with `npm run build`
- Empty CLI runs without errors

**Review Checklist:**
- [ ] `npm install` works
- [ ] `npm run build` produces `dist/index.js`
- [ ] Types are correctly defined and exported

---

### Phase 2: Core Libraries

**Goal:** Implement the core utility libraries that commands will use.

**Tasks:**

- [ ] **2.1 Implement config loader (src/lib/config.ts)**
  - `findConfigDir()` - Find `.opencode-flow/` directory (walk up from cwd)
  - `loadConfig()` - Parse and validate `pipeline.yaml`
  - `validateConfig()` - Ensure required fields exist
  - Throw descriptive errors for invalid config

- [ ] **2.2 Implement template engine (src/lib/template.ts)**
  - `substituteVariables(template, variables)` - Replace `{{var}}` placeholders
  - Handle missing variables gracefully (warn but don't fail)
  - `TemplateVariables` interface for type safety

- [ ] **2.3 Implement state manager (src/lib/state.ts)**
  - `getRunsDir()` - Get path to `.opencode-flow/runs/`
  - `loadRunState(storyId)` - Load existing run state or return null
  - `saveRunState(state)` - Write run state to JSON file
  - `listRuns()` - List all run state files
  - `deleteRunState(storyId)` - Remove a run state file

- [ ] **2.4 Implement worktree manager (src/lib/worktree.ts)**
  - `isBareRepo()` - Check if current directory is a bare repo
  - `worktreeExists(storyId)` - Check if worktree already exists
  - `createWorktree(storyId)` - Run `git worktree add`
  - `removeWorktree(storyId)` - Run `git worktree remove`
  - `getWorktreePath(storyId)` - Get absolute path to worktree

- [ ] **2.5 Implement agent runner (src/lib/runner.ts)**
  - `runAgent(agent, variables, config)` - Execute single agent
    - Read prompt file
    - Substitute variables
    - Spawn `opencode run` with correct flags
    - Stream stdout/stderr to console
    - Return exit code
  - `runPipeline(storyId, config, options)` - Execute full pipeline
    - Create worktree
    - Initialize state
    - Loop through agents
    - Update state after each agent
    - Handle failures

**Deliverables:**
- All library functions implemented and exported
- Error handling with descriptive messages

**Review Checklist:**
- [ ] Config loader correctly parses valid YAML
- [ ] Config loader throws on invalid config
- [ ] Template substitution works with all variables
- [ ] State manager reads/writes JSON correctly
- [ ] Worktree manager interacts with git correctly
- [ ] Runner spawns OpenCode and streams output

---

### Phase 3: Commands

**Goal:** Implement all CLI commands using the core libraries.

**Tasks:**

- [ ] **3.1 Implement init command (src/commands/init.ts)**
  - Check if `.opencode-flow/` already exists
  - Create directory structure
  - Write `pipeline.yaml` with example config
  - Write example agent prompts
  - Write `.gitignore` for `runs/`
  - Print success message with next steps

- [ ] **3.2 Implement run command (src/commands/run.ts)**
  - Parse `storyId` argument
  - Parse `--from` flag
  - Load and validate config
  - Check for bare repo (warn if not)
  - Check if run already exists (prompt to continue or fail)
  - Create worktree (if not using `--from`)
  - Execute pipeline via runner
  - Handle Ctrl+C gracefully (save state)

- [ ] **3.3 Implement status command (src/commands/status.ts)**
  - Load all run states
  - Format as table
  - Handle empty state (no runs yet)
  - Sort by most recent first

- [ ] **3.4 Implement cleanup command (src/commands/cleanup.ts)**
  - Parse `storyId` argument
  - Parse `--keep-state` flag
  - Check if worktree exists
  - Remove worktree
  - Delete run state (unless `--keep-state`)
  - Print success message

- [ ] **3.5 Wire up CLI entry point (src/index.ts)**
  - Set up commander program
  - Add version from package.json
  - Add description
  - Register all commands
  - Add global error handling

**Deliverables:**
- All commands functional end-to-end
- Helpful error messages for common issues

**Review Checklist:**
- [ ] `ocf init` creates correct file structure
- [ ] `ocf run DEV-18` creates worktree and runs agents
- [ ] `ocf run DEV-18 --from test` skips build agent
- [ ] `ocf status` shows runs in table format
- [ ] `ocf cleanup DEV-18` removes worktree and state
- [ ] `ocf cleanup DEV-18 --keep-state` preserves state file
- [ ] All commands show help with `--help`

---

### Phase 4: Documentation & Polish

**Goal:** Complete documentation and final polish.

**Tasks:**

- [ ] **4.1 Write README.md**
  - Project description and motivation
  - Installation instructions
  - Quick start guide
  - Configuration reference
  - Template variables reference
  - Command reference with examples
  - Bare repo setup guide
  - Troubleshooting section

- [ ] **4.2 Improve example agent prompts**
  - Refine build.md with detailed instructions
  - Refine test.md with testing best practices
  - Refine review.md with review checklist

- [ ] **4.3 Add input validation**
  - Validate storyId format (non-empty, valid git branch name)
  - Validate agent names when using `--from`
  - Check OpenCode is installed before running

- [ ] **4.4 Improve error messages**
  - Add suggestions for common errors
  - Include links to documentation
  - Make errors actionable

- [ ] **4.5 Add colors and formatting**
  - Consistent use of chalk for colors
  - Spinners for long operations
  - Clear visual hierarchy

- [ ] **4.6 Final testing**
  - Test full workflow end-to-end
  - Test error scenarios
  - Test with actual OpenCode and Linear MCP

**Deliverables:**
- Complete, polished CLI ready for use
- Comprehensive documentation

**Review Checklist:**
- [ ] README covers all features
- [ ] Example prompts are production-ready
- [ ] Error messages are helpful
- [ ] Output looks professional
- [ ] Works end-to-end with real OpenCode

---

## Example Agent Prompts

### `.opencode-flow/agents/build.md`

```markdown
# Build Agent

You are implementing Linear story **{{storyId}}**.

## Instructions

1. **Fetch Story Details**
   - Use the Linear MCP server to fetch the full story details for `{{storyId}}`
   - Read the title, description, and any acceptance criteria

2. **Implement the Feature**
   - Implement the feature/fix as described in the story
   - Follow existing code patterns and conventions
   - Write clean, maintainable code

3. **Commit Your Changes**
   - Make atomic commits with meaningful messages
   - Reference the story ID in commit messages (e.g., "feat({{storyId}}): add user dashboard")

4. **Create a Pull Request**
   - Use the GitHub CLI: `gh pr create`
   - Title: Include the story ID and a brief description
   - Description should include:
     - Summary of what was implemented
     - Link to the Linear story
     - Any architectural decisions made
     - Testing instructions if applicable

## Context

- Branch: `{{branch}}`
- Working directory: `{{worktreePath}}`
- Story ID: `{{storyId}}`
```

### `.opencode-flow/agents/test.md`

```markdown
# Test Agent

You are writing tests for Linear story **{{storyId}}**.

## Instructions

1. **Review the Implementation**
   - Look at the code changes made on this branch
   - Understand what functionality was added or changed

2. **Write Unit Tests**
   - Add unit tests for new functions/methods
   - Aim for good coverage of the new code
   - Test edge cases and error conditions

3. **Write Integration/E2E Tests** (if applicable)
   - Add integration tests if the feature involves multiple components
   - Add E2E tests for user-facing features

4. **Run All Tests**
   - Ensure all existing tests still pass
   - Ensure new tests pass
   - Fix any regressions

5. **Commit Your Tests**
   - Commit test files with a clear message (e.g., "test({{storyId}}): add tests for user dashboard")

## Context

- Branch: `{{branch}}`
- Working directory: `{{worktreePath}}`
- Story ID: `{{storyId}}`
```

### `.opencode-flow/agents/review.md`

```markdown
# Review Agent

You are reviewing the implementation of Linear story **{{storyId}}**.

## Instructions

1. **Review All Code Changes**
   - Look at all commits on this branch
   - Review both the implementation and tests

2. **Check for Issues**
   - Code maintainability and readability
   - Unnecessary complexity that could be simplified
   - Edge cases not handled
   - Potential security vulnerabilities
   - Performance concerns
   - Missing error handling

3. **Fix Minor Issues**
   - Directly fix small issues (typos, formatting, simple improvements)
   - Commit fixes with clear messages

4. **Document Larger Concerns**
   - For issues that need human review, add comments to the GitHub PR
   - Use `gh pr comment` to add your review
   - Clearly categorize issues:
     - **Fixed**: Things you fixed directly
     - **Needs Review**: Things the human should check
     - **High Risk**: Security or critical issues

5. **Summary Comment**
   - Add a final summary comment with:
     - Overall assessment
     - List of fixes made
     - List of items needing human attention

## Context

- Branch: `{{branch}}`
- Working directory: `{{worktreePath}}`
- Story ID: `{{storyId}}`
```

---

## Future Enhancements

Items deferred from MVP for future versions:

- [ ] **Pipeline retry** - Retry failed pipelines from the last agent
- [ ] **Parallel pipelines** - Run multiple story pipelines simultaneously
- [ ] **Worktree auto-cleanup** - Automatically remove worktrees after PR merge
- [ ] **Custom branch naming** - Configure branch pattern (e.g., `feature/{{storyId}}`)
- [ ] **Global configuration** - `~/.config/opencode-flow/config.yaml` for defaults
- [ ] **Plugins/hooks** - Run custom scripts before/after agents
- [ ] **Linear status updates** - Automatically update story status in Linear
- [ ] **Slack notifications** - Notify when pipeline completes or fails
- [ ] **Web dashboard** - View and manage runs via web UI
- [ ] **Multi-repo support** - Coordinate pipelines across multiple repos

---

## Run State Schema

### `.opencode-flow/runs/<storyId>.json`

```json
{
  "storyId": "DEV-18",
  "branch": "flow/DEV-18",
  "worktreePath": "/absolute/path/to/DEV-18",
  "status": "in_progress",
  "currentAgent": "test",
  "completedAgents": ["build"],
  "startedAt": "2025-01-15T10:30:00.000Z",
  "updatedAt": "2025-01-15T11:45:00.000Z",
  "error": null
}
```

### Status Values

| Status | Description |
|--------|-------------|
| `pending` | Run created but not started |
| `in_progress` | Pipeline is currently running |
| `completed` | All agents finished successfully |
| `failed` | An agent failed, pipeline stopped |

---

## Notes

### Bare Repo Setup

For users unfamiliar with bare repos, include this in README:

```bash
# Clone a repo as bare
git clone --bare git@github.com:org/repo.git repo.git

# cd into it
cd repo.git

# Now you can use ocf to create worktrees
ocf init
ocf run DEV-18
```

### OpenCode Requirements

- OpenCode must be installed and in PATH
- Required MCP servers (Linear, GitHub CLI) must be configured in OpenCode
- Appropriate API keys/auth must be set up

### Error Recovery

If a pipeline fails:
1. Check the error output
2. Fix the issue manually if needed
3. Run `ocf run <storyId> --from <failed-agent>` to resume
