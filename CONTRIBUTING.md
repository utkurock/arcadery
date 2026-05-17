# Contributing to Arcadery

Thanks for your interest in Arcadery! This guide covers the basics.

## Ground rules

- Be respectful. We follow a "don't be a jerk" rule.
- Keep PRs focused. One concern per PR makes review fast and reverts safe.
- Match the existing code style. The repo is Prettier-formatted; CI runs `pnpm format:check`.

## Local setup

See [README.md → Quickstart](README.md#quickstart) for the full bootstrap. The short version:

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local   # fill in keys
pnpm dev
```

You'll need a Supabase project with the migrations applied. The free tier is enough for development.

## Branching & commits

- Branch off `main`. Use a short, kebab-case branch name (e.g. `fix/asset-upload-auth`, `feat/keyboard-shortcuts`).
- Keep commits atomic — one logical change per commit. Imperative mood for the subject (`Add foo`, not `Added foo`).
- Reference issues by number in the commit body when relevant.

## Before opening a PR

Run these locally — CI will run them on the PR:

```bash
pnpm type-check
pnpm lint
pnpm test
pnpm format:check
```

If you touched the editor or engine, do a manual smoke test:

1. `pnpm dev`, open http://localhost:3000
2. Connect a wallet, create a new project
3. Generate a scene with the AI chat panel
4. Drag, resize, and AI-modify an element
5. Save (auto-save should fire) — refresh the page and confirm the scene persists

## What kinds of contributions are welcome

- **Bug fixes** — always welcome. Include a reproduction in the issue/PR.
- **New game elements** — see `packages/shared/src/schemas/elements/` and `packages/editor/src/components/elements/`. Add the schema, the renderer, and the registry entry.
- **New asset templates / seed data** — extend `scripts/seed-templates.ts`.
- **Performance & DX improvements** — measure first, ship the diff with the numbers.

## What to discuss before building

- New dependencies (especially anything that touches auth, payments, or chain interaction).
- New API routes or schema/migration changes.
- UI design changes that affect the editor's core loop.

Open an issue first so we can align — saves you time if the answer is "we tried that, here's why we didn't ship it."

## Reporting security issues

Don't file security issues in public GitHub issues. Email the maintainers (see GitHub repo metadata) or open a private security advisory on the repo.

## License

By contributing, you agree your contributions are licensed under the [MIT License](LICENSE).
