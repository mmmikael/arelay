# Security policy

## Supported versions

Security fixes are provided for the latest release on the default branch.

## Reporting a vulnerability

If you discover a security issue, please report it privately instead of opening a public
issue.

1. Open a [private security advisory](https://github.com/mmmikael/arelay/security/advisories/new)
   on GitHub with a description of the issue, steps to reproduce, and impact if known.
2. Allow a reasonable time for a fix before public disclosure.
3. Do not include live credentials, production data, or customer content in your report.

We will acknowledge receipt and work with you on remediation and coordinated disclosure when
appropriate.

## Scope notes

Agent Relay is designed so encrypted delivery content is decrypted in the user's browser.
Self-hosted operators remain responsible for securing their deployment: database access,
object storage credentials, SMTP, `SESSION_SECRET`, TLS, and backups.
