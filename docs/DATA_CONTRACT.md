# AutoResearch console: data contract

What the console shows, where every number comes from, and how the agent service fills it in.

## 1. Who talks to whom

```
 teammate's browser ──session cookie──▶ ┌──────────────────────┐
 teammate's CLI ─────user token───────▶ │  Console (Vercel)    │ ◀──agent token── agent service (host B)
                                        │  /api  +  Postgres   │      pushes:  POST /api/agent/ingest
                                        └──────────────────────┘      pulls:   GET  /api/agent/commands
```

- The console never calls into the cluster. The agent service makes outbound HTTPS calls only, so host B needs no inbound port.
- **Agent → console** is one idempotent batch endpoint (`ingest`). **Console → agent** is a command queue the agent polls.
- The browser polls `GET /api/state?v=<version>` every 2 s. Every write bumps `lab.version`; an unchanged version costs one row read.

## 2. What each screen needs

| Screen | Data | Source |
| --- | --- | --- |
| Campaigns: KPI row | running count, hypotheses settled, deliveries, month spend | derived from campaigns, hypotheses, usage |
| Campaigns: measurement slots | `lab.slots`, `campaign.slot` | slot is allocated by the console at create; the agent may override |
| Campaign card / header | name, repo, sha, goal, metric, owner, node, job, gpus, cap, clock, phase, activity, paused | `state` records |
| Score and sparkline | `best`, `series[]` | derived from kept hypotheses (or `state.best` if the agent reports it) |
| Lifecycle strip | `phase`, `phaseProgress` | `state` |
| Live topology | phase + stages of in-flight hypotheses | `state`, `hypothesis` |
| Live feed | events (`src`, `kind`, `text`, `hyp`, `t`) | `event` records, plus events the console writes for teammate actions |
| Questions | id, text, options, answer | `question` records; the answer is written by the console |
| Hypothesis board, lineage, drawer | id, parent, title, why, plan, files, stage, progress, marks, screen, promoted, workers, fate, rejection | `hypothesis` records |
| Hypothesis run log | lines per hypothesis | `log` records |
| Spend by role, cost per hypothesis, quota used | usd per role / hypothesis / owner | `usage` records (one per model-proxy call) |
| Proxy ledger, refused calls | call id, role, tokens, usd, status (200 / 402 / 403) | `usage` records |
| Results | `verified`, `screenTotal`, `best`, `patch`, `report`, `stopWhy` | `state` at delivery |
| Access: members, approvals | users, roles, quotas | Google sign-in + operator actions (console only) |
| Access: tokens, audit log | tokens, audit rows | console only |
| Rail: "Agent service connected" | `lab.agent_seen_at` | touched by every ingest and command poll |

## 3. Ingest: `POST /api/agent/ingest`

Auth: `Authorization: Bearer <agent token>`. Body: one JSON batch for one campaign. Every section is optional; send only what changed.

```jsonc
{
  "campaign": "pandas-7f3a",            // id; first batch must also carry state.name to register it
  "state": {
    "name": "pandas nullable reductions", "owner": "mira@lab.org",   // email or handle of an enrolled user
    "repo": "github.com/pandas-dev/pandas", "sha": "9c1e4b2", "goal": "…",
    "metric": { "label": "groupby-sum speedup", "unit": "×", "baseline": 1, "dir": "up", "digits": 2 },
    "node": "gpu-a100-07", "job": "4812207", "gpus": 1, "cap": 400, "clockH": 10, "slot": 0, "par": 3,
    "phase": "research",                // create | provision | setup | research | finalize | verify | delivered
    "phaseProgress": 0.4,               // 0..1 within the phase
    "status": "running",                // running | failed | cancelled
    "paused": false, "activity": "Screening H-006 · …", "elapsed": 4140,   // seconds of campaign clock
    "evalSha": "a41f…c09e", "stopWhy": null,
    "best": 0.69,                       // optional: omit and the console compounds the kept hypotheses
    "verified": 0.62,                   // set by the verifier at delivery
    "patch": "--- a/…", "report": "# REPORT …"   // at delivery
  },
  "hypotheses": [{
    "id": "H-006", "parent": "H-001", "title": "…", "why": "…", "plan": ["…"], "files": [["path", 46, 3]],
    "stage": "screen",                  // idea | plan | implement | screen | promote | kept | discarded
    "progress": 0.5, "screen": 0.12, "promoted": 0.11, "commit": "51b07de",
    "workers": { "plan": "planner-1", "implement": "implementer-2", "screen": "reviewer-1", "promote": "agent2" },
    "fate": "NO_GAIN",                  // when discarded: NO_GAIN REGRESSION CORRECTNESS CONSTRAINT TIMEOUT BUILD EVALUATOR BUDGET NOT_REPRODUCED CUT
    "rejection": { "at": "screen", "summary": "…", "evidence": [["Screening", "+0.4%"]], "lesson": "…" }
  }],
  "events":    [{ "id": "e812", "src": "engine", "kind": "promoted", "text": "H-006 promoted at +11%", "hyp": "H-006", "t": 4140 }],
  "logs":      [{ "hyp": "H-006", "seq": 4, "stage": "screen", "text": "stage=check › build ok", "level": null }],
  "usage":     [{ "id": "call-81f3", "role": "implementer", "hyp": "H-006", "tokens": 5200, "usd": 0.61, "status": 200 }],
  "questions": [{ "id": "q5", "text": "Raise repeats from 5 to 9?", "options": ["Raise to 9", "Keep 5"] }]
}
```

Gains (`screen`, `promoted`, `best`, `verified`) are fractions relative to the baseline: `0.31` is 31 % better in the metric's own direction (`dir: "down"` means lower is better).

### Semantics

- **Partial updates.** `state` fields and hypothesis fields merge into what is stored. `{ "id": "H-006", "stage": "promote", "screen": 0.12 }` is a complete hypothesis update.
- **Stage timestamps.** When a hypothesis changes stage the console stamps `marks[stage]` with the campaign's `elapsed`, and `marks.end` on `kept` / `discarded`. Send `marks` only to back-fill.
- **Derived score.** When a hypothesis becomes `kept` the console recomputes `screenTotal` and, unless the agent has ever sent `state.best`, `best` (compounded gains) and appends a point to `series`.
- **Derived spend.** Each new `usage` row with status 200 adds to the campaign's spend for that role, the hypothesis cost and the owner's month-to-date total. Rows with 402 / 403 are listed but not charged.
- **Idempotency.** Safe to retry a whole batch: `events` are de-duplicated on `id` (optional but recommended), `usage` on `id` (required), `logs` on `(hyp, seq)`, `questions` on `id`. State and hypotheses are last-write-wins.
- **Terminal states.** `phase: "delivered"` or a `status` other than `running` releases the slot.
- **Limits.** 4.5 MB per request; per batch 200 hypotheses, 500 events, 1000 logs, 1000 usage rows. The console keeps all events and shows the latest 500 per campaign.
- Event `src` values the UI names: `agent2 engine proxy broker verifier agentd service tools you`. Event `kind` values it filters on: `life idea screening promoted discard lesson verified question steer ambient you`.

## 4. Commands: console → agent

`GET /api/agent/commands[?campaign=<id>]` returns pending commands, oldest first. After acting, acknowledge with
`POST /api/agent/commands/<id>/ack` and `{ "status": "done" }` or `{ "status": "rejected", "note": "why" }`.

| type | payload | what the console already did |
| --- | --- | --- |
| `create` | name, repo, sha, goal, metric, node, job, gpus, cap, clockH, slot, owner | checked role, quota, max active and free slots; inserted the campaign in phase `create` |
| `pause` / `resume` | – | set `paused`, wrote a feed event |
| `finalize` | – | wrote a feed event (only offered during `research`) |
| `steer` | text | wrote the note to the feed |
| `answer` | question, option | stored the answer |
| `raise_cap` | by, cap | raised `cap` after checking the owner's quota |

A rejected `pause` / `resume` is rolled back, a rejected `create` marks the campaign failed, and the note appears in the feed. Commands stay pending until acknowledged, so a restarted agent sees them again.

## 5. People, roles and tokens

- Sign-in is Google OAuth. A new account is `pending` until an operator approves it as `viewer` or `member`. Emails in `OPERATOR_EMAILS` become operators at sign-in.
- **User tokens** act as the person who created them (same role checks as the browser). **Agent tokens** (operators only) can call `/api/agent/*` and read state, nothing else.
- Tokens are shown once and stored as SHA-256 hashes. They are revocable under Access → Tokens.

## 6. CLI

```bash
npm link            # or: node cli/autoresearch.js …
autoresearch login --url https://<console> --token art_…                    # user token
autoresearch login --url https://<console> --token art_… --profile agent    # agent token
```

People:

```bash
autoresearch list
autoresearch status pandas-7f3a
autoresearch create --name "tokenizer encode speed" --repo git.lab/nlp/fasttok --goal "…" --metric "encode speedup" --cap 250 --clock 6
autoresearch steer pandas-7f3a "focus on the min / max kernels"
autoresearch pause|resume|finalize pandas-7f3a
autoresearch answer hnsw-22c9 q5 "Raise to 9"
autoresearch download trainmem-3b10 --out ./results/trainmem-3b10
```

Agent service (add `--profile agent`):

```bash
# one batch from a file or stdin
autoresearch agent push batch.json

# a long-lived pipe: one NDJSON record per line, batched every second
agentd --emit-ndjson | autoresearch agent stream pandas-7f3a
#   {"type":"state","phase":"research","elapsed":4140,"activity":"Screening H-006"}
#   {"type":"hypothesis","id":"H-006","stage":"screen"}
#   {"type":"event","id":"e812","src":"engine","kind":"screening","text":"H-006 screening +12%","hyp":"H-006"}
#   {"type":"log","hyp":"H-006","stage":"screen","text":"stage=check › build ok"}
#   {"type":"usage","id":"call-81f3","role":"implementer","tokens":5200,"usd":0.61,"hyp":"H-006"}
#   {"type":"question","id":"q5","text":"Raise repeats?","options":["Raise to 9","Keep 5"]}

# commands
autoresearch agent commands --follow          # NDJSON, one command per line
autoresearch agent ack 42
autoresearch agent ack 43 --reject "job 4812207 has ended"

# no agent yet? play sample campaigns through the real API, obeying commands from the console
autoresearch agent simulate
```

`cli/simulate.js` is a complete reference agent: it shows which records to send at each lifecycle step and how to handle each command.

## 7. Storage

Postgres, one schema (`server/schema.js`), applied automatically on first request.

| Table | Holds |
| --- | --- |
| `lab` | one row: name, slot layout, change counter, last agent contact |
| `users`, `tokens`, `audit` | people, hashed API tokens, operator-visible audit trail |
| `campaigns` | one row per campaign: config, phase, score, spend by role, series, patch, report |
| `hypotheses` | one JSON document per hypothesis, keyed `(campaign, id)` |
| `events`, `hyp_logs`, `questions`, `usage` | append-only streams from the agent |
| `commands` | console → agent queue |

## 8. Not built yet

- Server-sent events instead of 2 s polling.
- Retention: events, logs and usage rows are kept forever; `GET /api/state` returns every campaign.
- Large patches (> ~3 MB) should move to object storage.
- A device-code flow for `autoresearch login` so tokens are not copy-pasted.
