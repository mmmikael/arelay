# Contributing to Agent Relay

Thanks for taking an interest in Agent Relay. Contributions of all sizes are welcome:
bug reports, feature ideas, documentation improvements, design feedback, tests, and code.

The project is intentionally open and lightweight. You can:

- [Open an issue](https://github.com/mmmikael/arelay/issues/new) to report a bug, suggest
  an improvement, or start a discussion.
- [Open a pull request](https://github.com/mmmikael/arelay/compare) directly when you
  already have a useful change.

You do not need permission or an existing issue before opening a pull request. For larger
features, architecture changes, or changes to the encryption and authentication models,
opening an issue first is helpful so we can agree on the direction and avoid duplicated
work.

## Before you start

- Search existing issues and pull requests to see whether someone is already working on
  the same topic.
- Never include credentials, agent tokens, private keys, production data, or customer
  content.
- Report security vulnerabilities privately as described in
  [SECURITY.md](./SECURITY.md), not in a public issue.

## Development setup

Agent Relay uses Node.js 22 or newer, PostgreSQL, and S3-compatible object storage.

```bash
git clone https://github.com/mmmikael/arelay.git
cd arelay
npm install
cp .env.example .env
npm run db:setup
npm run dev
```

See the [README](./README.md#environment-variables) for environment configuration and
self-hosting details. Without an email provider configured in local development,
verification codes are printed to the server console.

## Making changes

- Keep changes focused and consistent with the existing SvelteKit and TypeScript code.
- Preserve account isolation and the end-to-end encryption boundary.
- Add or update tests when behavior changes.
- Update documentation when configuration, APIs, or user workflows change.
- Avoid unrelated refactors in the same pull request.

Before opening a pull request, run:

```bash
npm run check
npm test
npm run build
```

## Pull requests

A good pull request includes:

- A clear explanation of the problem and the chosen solution.
- Screenshots or a short recording for visible UI changes.
- Testing notes, including any paths that could not be tested.
- Links to related issues when applicable.

Draft pull requests are welcome. Small pull requests are easier to review, but larger
changes are welcome when the scope genuinely belongs together.

Maintainers may suggest changes before merging. Reviews are intended to improve security,
reliability, accessibility, usability, and maintainability rather than enforce unnecessary
process.

## Issues

When reporting a bug, include as much of the following as you can:

- What you expected to happen.
- What happened instead.
- Steps to reproduce it.
- Browser, operating system, and deployment environment.
- Relevant logs or screenshots with sensitive information removed.

Feature requests can be informal. Explain the problem you want to solve and why it would
be useful; a complete technical design is not required.

## License

By contributing, you agree that your contribution will be licensed under the
[MIT License](./LICENSE).
