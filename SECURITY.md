# Security Policy

## Supported Code

Security fixes are handled on `main` and active development branches that are intended to merge into `main`.

Older experimental branches, local worktrees, and unmerged prototypes are not considered supported unless a maintainer explicitly marks them as active.

## Reporting a Vulnerability

Report suspected vulnerabilities through GitHub private vulnerability reporting for this repository when it is available from the Security tab. If private vulnerability reporting is unavailable, open a minimal public issue asking the maintainers to provide a private contact path; do not include exploit details, credentials, tokens, cookies, message logs, or user data in that issue.

Please include:

- A short description of the issue and affected area.
- Reproduction steps or relevant code paths.
- Impact and any known workarounds.
- Sanitized logs only, with secrets and private message content removed.

## Credential Handling

This project may use Lark app credentials, Cursor API keys, Cursor Dashboard cookies, and manager service credentials during local or production runs.

- Keep secrets in `.env` or the deployment secret store.
- Do not commit `.env`, copied cookies, API keys, generated logs, or NDJSON trace files.
- Rotate any credential that may have been exposed.
- Prefer mock credentials in tests and examples.

Maintainers will review reports privately, agree on a fix plan, and coordinate disclosure if disclosure is appropriate.
