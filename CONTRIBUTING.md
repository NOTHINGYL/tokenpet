# Contributing to TokenPet

Thanks for helping make local AI usage feel more alive.

## Before opening an issue

- Search existing issues first.
- Remove prompts, source code, API keys, usernames, private file paths, and raw usage logs from screenshots or logs.
- Use GitHub's private vulnerability reporting flow for security issues.

## Development setup

TokenPet currently targets macOS and requires Node.js 18.20 or newer.

```bash
git clone https://github.com/NOTHINGYL/tokenpet.git
cd tokenpet
npm ci
npm run launch
```

The public checkout contains the production pet bundle. Private high-resolution authoring inputs are not required to build, run, or test any of the eight Quick Play actions.

## Checks

Run these before opening a pull request:

```bash
npm run typecheck
TOKENPET_USE_PREBUILT_ASSETS=1 npm run build
TOKENPET_USE_PREBUILT_ASSETS=1 npm run test:pet-story
npm run verify:readme
```

Visible action or layout changes should also include sanitized screenshots and the relevant focused QA. Maintainers run the complete `npm run qa:pet-story` suite before a release.

## Pull requests

- Keep changes focused and explain the user-visible outcome.
- Preserve the local-first privacy boundary.
- Do not commit files ignored by `.gitignore`, especially design history, QA screenshots, raw authoring sources, or local notes.
- Do not replace or compress production action assets without visual parity checks for all affected phases and directions.
- Update tests when behavior changes.

By contributing, you agree that your contributions are licensed under the repository's MIT License.
