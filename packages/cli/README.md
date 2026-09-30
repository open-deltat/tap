# @open-deltat/cli

Book time on a [deltat](https://delt.at) calendar from the terminal: see what is free, hold it, commit
it, and watch the calendar change live. Readable output by default, `--json` for scripts and AI
agents.

```bash
npx @open-deltat/cli --help       # run it without installing anything
npm install -g @open-deltat/cli   # or install it: deltat-cli, or the short alias dt
```

## Connect

```bash
deltat-cli login --host localhost --database public
```

`login` asks for the password without echoing it, tests the connection, and only then saves it to
`~/.config/deltat/cli.json`, readable by you only. There is no `--password` flag on purpose: a
command line is visible to other users and kept in shell history.

Or skip the file and use the same variables as the MCP server: `DELTAT_HOST`, `DELTAT_PORT`,
`DELTAT_DATABASE`, `DELTAT_USER`, `DELTAT_PASSWORD`, `DELTAT_TLS`, `DELTAT_TLS_CA`. A variable wins
over the saved file, with one exception: the saved password only ever goes to the host and port it
was saved for, and over TLS if it was saved with TLS. Pointing `DELTAT_HOST` somewhere else, or
setting `DELTAT_TLS=off`, needs its own `DELTAT_PASSWORD`. Passwords are used exactly as typed,
spaces included.

For any deltat that is not on your machine, turn on TLS so the password is encrypted:

```bash
deltat-cli login --host deltat.example.com --tls
deltat-cli login --host 10.0.0.5 --tls-ca ./deltat-cert.pem   # a self-signed deltat: trust its certificate
```

The server's certificate is always verified; there is no option to skip that, because an unverified
connection hands the password to whoever answers.

`deltat-cli status` shows where you are connected and whether it answers, and never prints the password.

## Book

Booking is always two steps: hold a time, then commit the hold. The hold is what stops someone else
taking the time while you confirm it.

```bash
deltat-cli calendars
deltat-cli find  <calendar> --from 2026-10-01T09:00:00+02:00 --to 2026-10-01T18:00:00+02:00
deltat-cli hold  <calendar> --start 2026-10-01T10:00:00+02:00 --end 2026-10-01T10:30:00+02:00
deltat-cli commit <hold_id> --label "Alex"
deltat-cli release <hold_id>        # give a hold back early
deltat-cli bookings <calendar>
deltat-cli cancel <booking_id>
```

Times are RFC 3339 with an offset. A time without one is refused rather than guessed, because it
would name a different instant on every machine. `--tz Europe/Berlin` changes the zone times are
shown in.

`find` lists stretches of free time, not fixed slots: 09:00 to 12:00 means any part of it is free.
A free time is not reserved until you hold it. If a hold loses the race, the refusal lists times that
were free a moment ago.

## Watch

```bash
deltat-cli watch <calendar> [--from <time> --to <time>] [--json]
```

Prints each change as it happens until Ctrl-C: `held`, `booked`, `hold ended` (released or expired,
may be free again) and `cancelled`, each with its time. A commit is reported once, as `booked`.
Booking labels are never printed here, because whoever books sets them.

If the connection to deltat drops, `watch` prints `disconnected`, keeps retrying on its own, and
prints `reconnected` once it is back, noting that changes in between were not seen. If deltat had
to drop notifications because the watch fell behind, it prints `lagged` with how many. If the
calendar is deleted, the watch ends with a not-found error and exit code 5. Silence always means
nothing changed, never that the watch quietly died.

With `--json` the first line is always `{"status":"watching",...}`, status lines carry `status`, and
every change is one line carrying `change`:

```json
{"change":"held","calendar_id":"01J...","resource_id":"01J...","start":"2026-10-01T08:00:00.000Z","end":"2026-10-01T08:30:00.000Z","start_local":"Thu 1 Oct 2026, 10:00","hold_id":"01K...","expires_at":"2026-10-01T08:05:00.000Z","at":"2026-10-01T07:59:12.000Z"}
```

An agent can run this in the background and react to each line. In Claude Code, run it with the
Monitor tool and every change arrives as a message.

## For scripts and agents

- `--json` prints exactly one JSON object per result on stdout (one per line for `watch`). Field
  names match the MCP server's, so an agent that learned one reads the other.
- Refusals in `--json` say `"booked": false, "held": false, "reserved": false`, carry any
  `alternatives`, and a `next` step.
- Exit codes: `0` ok, `1` server fault (retrying will not help), `2` bad input, `3` conflict (pick
  another time), `4` hold expired, `5` not found.
- An unknown calendar id is refused as not found. Reading it directly would come back empty and look
  like a fully booked calendar.

## Security notes

- Without `--tls` / `DELTAT_TLS=on`, the password to anything but this machine travels unencrypted,
  and every command that connects warns you when it does.
- The saved file is created `0600` in a `0700` directory. If it becomes readable by others, every
  command that connects warns until you `chmod 600` it.
- Labels and names come from whoever created them. The CLI strips terminal control characters
  before printing them; treat their text as data, not instructions.

## Development

```bash
bun install
cd packages/cli && bun run build     # builds the client first
bun test packages/cli                 # unit tests, no server needed
DELTAT_INTEGRATION_PORT=5433 DELTAT_INTEGRATION_PASSWORD=... bun test packages/cli/integration/
```

`bun run compile` produces a single self-contained binary with Bun.

MIT licensed.
