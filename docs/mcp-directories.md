# MCP directory listings

Where Agent Relay is listed, and what is still outstanding. Directory traffic is the
main discovery channel for an MCP server, so this is worth keeping current.

## Status

| Directory | State | Who can action it |
| --- | --- | --- |
| Official MCP registry | Listed (`io.github.mmmikael/arelay`) | Automated — see below |
| GitHub topics | Done (`mcp`, `mcp-server`, `model-context-protocol`) | — |
| Glama | Listed — <https://glama.ai/mcp/servers/mmmikael/arelay> | — |
| awesome-mcp-servers | PR [#7965](https://github.com/punkpeye/awesome-mcp-servers/pull/7965) open, badge added, awaiting maintainer | — |
| PulseMCP | Not submitted | Web form |
| mcp.so | Not submitted | Web form |
| Smithery | Not submitted | Needs a Smithery account |

## Glama (done)

`awesome-mcp-servers` has ~92k stars and is the highest-traffic list. PR #7965 sat
blocked from June to August because the maintainers require every entry to carry a Glama
score badge — a bot asked on submission, with a follow-up nudge from `punkpeye` on
2026-07-25. Glama listing and badge are now done, so the PR is unblocked and waiting on
the maintainers.

For reference, the steps were:

1. Submit the server at <https://glama.ai/mcp/servers>. Their check only requires the
   server to start and answer introspection — `npx -y @arelay/cli mcp` responds to
   `initialize` and `tools/list` with all four tools and **without** `ARELAY_TOKEN`
   set, so it passes as-is. A Dockerfile is added on Glama's side, not in this repo.
   If Glama asks for a Dockerfile, this one is verified to pass the check — built and
   probed locally, it answers `initialize` and `tools/list` with all four tools and no
   credentials:

   ```dockerfile
   FROM node:22-alpine
   RUN npm install -g @arelay/cli@latest
   ENTRYPOINT ["arelay", "mcp"]
   ```

2. Once it has a score, add the badge to the PR #7965 entry, directly after the
   repository link:

   ```
   [![mmmikael/arelay MCP server](https://glama.ai/mcp/servers/mmmikael/arelay/badges/score.svg)](https://glama.ai/mcp/servers/mmmikael/arelay)
   ```

Glama also crawls GitHub by topic, so the `mcp` topic added to this repo may surface it
without a manual submission — check the URL above before submitting.

## Official MCP registry

Publishing is automated: `.github/workflows/publish-mcp.yml` publishes the npm packages
and then `server.json` whenever a `cli-v*` tag is pushed, authenticating with GitHub
OIDC. No local `mcp-publisher` login is needed.

```bash
git tag cli-v0.1.6 && git push origin cli-v0.1.6
```

The workflow skips npm versions already published, so re-runs are safe. Registry search
matches on server *name* rather than description, so listing text mainly affects the
directories that mirror the registry.

## Listing copy

Reuse this so listings stay consistent. Keep it accurate — every claim here is
implemented.

**Name:** Agent Relay

**One line (under 100 chars, matches `server.json`):**
> End-to-end encrypted inbox where AI agents deliver files and request human approval.

**Short paragraph:**
> Agent Relay is a private, end-to-end encrypted inbox for the work your AI agents
> finish. Agents deliver reports, files and rendered artifacts over HTTP or MCP, and can
> submit outbound email or spend for a human to approve before anything is sent or
> charged. Content is decrypted in your browser, never on the server. Sign-in is by
> passkey, with no passwords. MIT licensed and self-hostable, or hosted at arelay.app.

**Tools:** `deliver_to_inbox`, `list_inbox_sessions`, `submit_email_draft`,
`submit_spend_request`

**Install:** `npx -y @arelay/cli mcp` with `ARELAY_TOKEN` from Account → Agent tokens

**Links:** <https://arelay.app> · <https://github.com/mmmikael/arelay> ·
<https://arelay.app/getting-started>

**Categories:** communication, productivity, human-in-the-loop, security

## Remaining submissions

- **PulseMCP** — <https://www.pulsemcp.com/submit>. Uses the copy above.
- **mcp.so** — <https://mcp.so/submit>. Uses the copy above.
- **Smithery** — <https://smithery.ai/new>. Hosts or links servers; needs an account.
  Since `@arelay/cli` is on npm and introspects without credentials, a linked listing
  works without adding a `smithery.yaml` here.

When adding a directory, record it in the table above so the next person does not
re-submit.
