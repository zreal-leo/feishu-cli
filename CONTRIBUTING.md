# Contributing

Thanks for helping improve `lark-cli`. This repository runs a single-package Node.js Lark bot that routes text messages to built-in commands or Cursor fallback replies.

## Prerequisites

- Node.js 24 or newer.
- pnpm 11.5.0, as declared in `package.json`.
- Local environment variables only when running the bot against real Lark, Cursor, or manager services. Unit tests use mocks and do not require real credentials.

## Branch Workflow

Do not develop directly on `main`. Start from the latest `main` and create a focused branch:

```bash
git fetch origin
git checkout main
git pull origin main
git checkout -b feat/short-description
```

Use a prefix that matches the change, such as `feat/`, `fix/`, `refactor/`, or `docs/`.

## Setup

Install dependencies with:

```bash
pnpm install
```

For local runtime testing, copy `.env.example` to `.env` and fill only the credentials required by the feature you are testing. Never commit `.env`, tokens, cookies, or logs containing message content.

## Development Guidelines

- Follow the architecture described in `docs/ARCHITECTURE.md`.
- Add new bot capabilities as `CommandHandler` implementations and register them in `src/bootstrap/composition-root.ts`.
- Keep domain logic in `src/core`, port interfaces in `src/ports`, and external integrations in `src/adapters`.
- Update `usage.md` when a user-visible bot command, format, or reply changes.
- Do not document internal operations commands in `usage.md`.

## Validation

Before opening a pull request, run:

```bash
pnpm test
pnpm typecheck
pnpm format
```

For documentation-only changes, at minimum run:

```bash
pnpm format:check
```

## Pull Requests

Keep pull requests small and focused. Include:

- What changed and why.
- How you validated the change.
- Whether user-facing documentation changed.
- Any security or credential-handling considerations.
