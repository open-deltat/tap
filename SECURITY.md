# Security Policy

## Reporting a vulnerability

Please report security vulnerabilities **privately**, not as a public issue.

Use GitHub's private vulnerability reporting: open the repository's **Security** tab and choose
**Report a vulnerability**. This opens a private advisory visible only to the maintainers.

Please include:
- a description of the issue and its impact,
- the affected package version or commit,
- steps to reproduce (a minimal code snippet is ideal), and
- any suggested fix.

We aim to acknowledge a report within a few days and to keep you updated as we work on a fix.
Please give us a reasonable window to address the issue before any public disclosure.

## Scope

tap is the client layer for deltat. The SDK (`@open-tap/client`) builds SQL sent over the wire, so
issues we particularly care about:
- any SDK path that string-splices caller-supplied ids or values into SQL instead of using
  positional (`$N`) params,
- credential exposure in logs, errors, or example output,
- a client that mishandles or hides an incorrect availability or double-booking result returned by
  the server.

Vulnerabilities in the deltat kernel itself (availability correctness, denial of service, tenant
isolation) belong in the [deltat](https://github.com/open-deltat/deltat) repository's security process.

## Supported versions

tap is pre-1.0; fixes land on `main` and ship in the next `@open-tap/client` release. Pin an exact
version for reproducible builds until the API is frozen for 1.0.
