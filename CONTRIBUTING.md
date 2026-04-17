# Contributing

This is a personal project but PRs are welcome for bug fixes and small improvements.

## Setup

```bash
pnpm install
cp .env.example .env
# fill in .env values
pnpm dev
```

## Conventions

- Conventional commits (`feat:`, `fix:`, `chore:`, etc.), lowercase after the colon
- TypeScript strict mode everywhere
- No `any` unless there's a good reason and it's commented
- Tests go next to the code they test (`foo.test.ts` beside `foo.ts`)

## Before opening a PR

- `pnpm lint` passes
- `pnpm test` passes
- `pnpm build` succeeds
- If you're changing the LLM prompts, update the fixture tests too

## Questions

Open an issue, I'll reply when I can.
