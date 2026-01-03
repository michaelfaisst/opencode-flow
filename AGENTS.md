# AGENTS.md

## General Guidelines

- Don't do things that no one asked for.
- Always ask for clarification if the request is ambiguous.
- Provide concise and relevant responses.
- Avoid unnecessary information or tangents.
- Never create any commits or push code without explicit user instruction.
- Always follow the user's coding style and conventions.
- Always check similar existing code for style and patterns.
- When in doubt, ask the user for their preferences.
- Use conventional commit messages unless instructed otherwise.
- Never skip any precommit checks or tests.
- In general never skip anything or assume anything, always ask the user for confirmation.

## Development Philosophy

- Write clean, maintainable, and scalable code
- Follow SOLID principles
- Prefer functional and declarative programming patterns over imperative
- Emphasize type safety and static analysis
- Practice component-driven development

# Code Implementation Guidelines

### Planning Phase

- Begin with step-by-step planning
- Write detailed pseudocode before implementation
- Document component architecture and data flow
- Consider edge cases and error scenarios
- Code Style Standards
- Eliminate unused variables
- Add space after keywords
- Always use strict equality (===) instead of loose equality (==)
- Space infix operators
- Add space after commas
- Keep else statements on the same line as closing curly braces
- Use curly braces for multi-line if statements
- Always handle error parameters in callbacks

## Code Style

- **Imports**: Use `type` imports separately (`import type { X } from`)
- **Unused vars**: Prefix with `_` (e.g., `_unused`)
- **Types**: Strict TypeScript, no non-null assertions
- **Formatting**: Prettier
