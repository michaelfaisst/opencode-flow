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
