# Magic Box

[English](README.md) | [简体中文](README.zh-CN.md)

Magic Box is a cross-platform Electron desktop application for AI-assisted work.
It brings multi-provider chat, agent sessions, terminal and file workflows,
knowledge bases, translation, painting, MCP tools, and desktop integrations into
one local workspace.

This repository is under active v2 development. Some package names, provider
routes, URLs, and compatibility paths may still retain upstream names when
renaming them would affect runtime behavior or migration compatibility.

## Features

- Multi-provider AI chat and assistant workflows.
- Agent sessions with tool execution, terminal integration, and local context.
- File management, preview, knowledge-base retrieval, translation, and painting.
- MCP, API gateway, binary/tool management, and provider registry integrations.
- Electron main/renderer/shared architecture with lifecycle-managed services.
- Shared UI package based on Shadcn UI and Tailwind CSS.

## Requirements

- Node.js `>=24.11.1 <24.16.0`
- pnpm `11.8.0` through Corepack
- Git with symlink support enabled on Windows

## Quick Start

```bash
corepack enable
nvm install
pnpm install
cp .env.example .env
pnpm dev
```

For detailed setup notes, see [Development Setup](docs/guides/development.md).

## Common Commands

```bash
pnpm dev              # Start the Electron development app
pnpm debug            # Start with inspector/debug flags
pnpm lint             # Lint, typecheck, i18n check, and format
pnpm test             # Run Vitest tests
pnpm format           # Run Biome format/lint in write mode
pnpm build:check      # Full pre-commit verification gate
pnpm build:mac        # Build macOS packages
pnpm build:win        # Build Windows packages
pnpm build:linux      # Build Linux packages
```

Read `package.json` before using less common scripts; many build and test
commands are intentionally scoped for CI or package publishing.

## Project Layout

| Path | Purpose |
| ---- | ------- |
| `src/main/` | Electron main process, lifecycle services, IPC, data, AI, and system integration |
| `src/renderer/` | React renderer application, pages, components, hooks, services, and state |
| `src/shared/` | Cross-process schemas, types, constants, and utilities |
| `packages/` | Workspace packages such as UI, AI core, provider registry, and extensions |
| `docs/` | Development guides and architecture references |
| `resources/` | Bundled runtime resources and built-in skills |
| `scripts/` | Build, validation, migration, and maintenance scripts |
| `v2-refactor-temp/` | Temporary v2 refactor workspace and generated-data tooling |

## Documentation

- [Documentation Index](docs/README.md)
- [Contributing Guide](docs/guides/contributing.md)
- [Branching Strategy](docs/guides/branching-strategy.md)
- [Architecture Overview](docs/references/architecture-overview.md)
- [Renderer Architecture](docs/references/renderer-architecture.md)
- [Main Process Architecture](docs/references/main-process-architecture.md)
- [Shared Layer Architecture](docs/references/shared-layer-architecture.md)
- [Data System](docs/references/data/README.md)
- [IPC Guide](docs/references/ipc/README.md)
- [Lifecycle System](docs/references/lifecycle/README.md)
- [Window Manager](docs/references/window-manager/README.md)

## Development Notes

- Use the existing architecture boundaries before adding new modules.
- Route user-visible text through i18n.
- Use `loggerService` instead of direct console logging.
- Use `application.getPath()` for main-process filesystem paths.
- Keep changes surgical and run verification before committing.
- Commits must be conventional, GPG-signed, and DCO-signed off.

## License

Magic Box Community Edition is licensed under the
[GNU Affero General Public License v3.0](LICENSE).
