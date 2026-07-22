---
name: parallel
description: Turn a task into self-directed parallel agent work — write your own /goal, then fan out independent, non-overlapping subgoals to concurrent agents and synthesize the results yourself. Use when a request is big or multi-part enough to divide and conquer with subagents (build, implement, fan out, orchestrate, parallel agents, coordinate subagents) (formerly parallel-goals-for-a-task) (/parallel).
source: anthropic
---

# Parallel Goals For A Task

The shift this skill captures: **you stop waiting for a goal to be handed to you and
write one for yourself — and one for every agent you spawn.** A goal is just the
contract for a piece of work, and you can author it faster and with more context
than anyone supervising you. So author it. Then apply the same move one level down:
each agent you dispatch gets its own dedicated `/goal`, scoped to exactly its slice.

That's the whole idea, distilled into one reusable instruction you can drop on any
task:

> **Write yourself a fresh `/goal` for this task — don't wait for one.** Then fan
> out: spin up as many parallel agents as the work genuinely needs to finish it
> better and faster. Split the task into independent, non-overlapping pieces, give
> each agent its own dedicated `/goal`, dispatch them concurrently, and fold each
> result into the whole as it returns. You own the goal, the split, and the
> synthesis.

Everything below is how to run that well.

## Two ideas that make it work

**You are the controller, not a relay.** The goal, the way the work is split, the
acceptance bar, verification, and the final synthesis belong to you and never get
delegated. Agents are bandwidth — extra hands on pieces you've already scoped. The
moment you spawn an agent to figure out *what the task even is*, you've inverted the
relationship and you'll spend more effort untangling confused output than you saved.

**Synthesis is not summary.** When results come back, you are not stapling them
together. You're producing *your* integrated answer, using their work as evidence —
accepting what holds up, rejecting what doesn't, resolving conflicts yourself. A
final response that reads "Agent A said… Agent B said…" means the controller fell
asleep.

## Step 1 — Write your own `/goal`

Before any agents, turn the raw request into a concrete goal with no brackets left
in it. Inferring "build a Postgres-backed REST API for book reviews with auth and
pagination" from a vague "build me a reviews thing" is the point — a goal full of
placeholders just pushes the thinking onto agents who have less context than you.

A good top-level `/goal` states:

- **The filled brief** — what to build/solve, where it runs, the stack and
  constraints, the concrete deliverables, and how it should behave.
- **Done criteria** — what "finished" objectively means, written *now*, before the
  work. Criteria written afterward just rationalize whatever happened.
- **The final artifact** — the single thing you'll hand back.
- **Verification** — the checks you'll run before reporting done.

If a `/goal` tool or workflow exists, create the top-level goal in it. If one
already exists and you can't create another, work under it and record the new
objective in your plan. Infer conservatively and proceed; ask the user only when a
missing detail makes the work impossible or risky to guess — a destructive action,
an irreversible choice, or an ambiguity where the two readings yield genuinely
different deliverables.

## Step 2 — Orient before you split

Read enough of the source, docs, and current state to see where the **seams** are.
Clean seams — pieces that don't touch the same files or decisions — are the single
biggest factor in whether parallel work merges smoothly or turns into a conflict to
referee. Splitting before you understand the seams is how three agents end up
editing one file three different ways. Don't use agents to compensate for skipping
this; orientation is your job.

## Step 3 — Fan out: a dedicated `/goal` per agent

Spawn **as many agents as the work genuinely needs — no fixed number.** Two clean
pieces means two agents; a six-part build with separable modules might mean six. Let
the structure of the task set the count, and prefer agents for sidecar work that
improves the result while you stay on the critical path (you build the load-bearing
core; agents handle the valuable-but-separable parts concurrently).

Pieces that parallelize cleanly: a self-contained module or file (one owner each),
test writing and edge-case hunting, architecture or data-model planning, UI/
interaction design, copy and documentation, and an independent critique of your
plan or result.

The cardinal rule: **no agent owns the whole task, and no two agents own the same
piece.** Each gets a narrow, non-overlapping slice — and its own `/goal`:

```
/goal [ONE CLEAR SUBGOAL — the agent's whole contract]
Context: [The filled brief plus only the constraints this agent needs.]
Deliverable: [The specific output you need back.]
Boundaries: [Files, modules, or decisions this agent owns. Name what to avoid.]
Verification: [Checks it should run, or the reasoning it should show.]
Return: [How to report back so you can evaluate it fast.]
```

If multi-agent tooling is available and authorized, **dispatch the independent
subgoals in a single turn** so they run concurrently and finish around the same
time — don't spawn one, wait, then spawn the next. If it isn't available,
parallelize your own inspection where you can and do the work directly; the loop
discipline still applies with a team of one.

## Step 4 — Synthesize as results return

Agents finish at different times. Fold each result in **as it lands** rather than
blocking until all are back — this is where the parallel speedup actually shows up.
Run every returned result through the same gate:

- Check its claims against the real source context — don't take them on faith.
- Check it against both its own subgoal and the top-level done criteria.
- Reject unsupported assertions and anything that doesn't fit the current goal.
- Resolve conflicts between agents explicitly; don't paper over them.
- Apply only changes that fit the task and the project's conventions, and keep those
  edits tight — no opportunistic refactors riding along.

While agents run, keep working your own slice. Idle waiting throws away the
parallelism you set up.

## Step 5 — Verify, then peer-review material code

First, **verify yourself** with the smallest checks that genuinely prove it works —
run the tests, exercise the path, build the thing, reproduce the bug and confirm
it's gone. "Looks right" is not verification.

Then, for **material code changes** (not every one-line tweak), consider an
independent review from a *different* model so you're not grading your own homework.
The OpenAI **Codex CLI** fits well: `codex exec` runs in a **read-only sandbox by
default**, so it can read the repo and the diff but can't touch your working tree —
exactly what a reviewer should be able to do.

```bash
# Read-only second opinion on this branch's changes.
git diff main...HEAD | codex exec "You are a read-only peer reviewer. Critique this \
diff for correctness, security, performance, and missed edge cases. List concrete \
issues by severity. Do not propose sweeping rewrites or restyle working code."
```

Handy variants: `git diff --staged | codex exec -` takes the piped text as the full
prompt; `codex exec --json "…"` gives structured output you can parse. Skip review
entirely when Codex isn't installed, the change is trivial, or no code changed — it's
a tool for material risk, not a ritual. Treat the review as **evidence, not a
verdict**: confirm each flagged issue against the actual code before acting, ignore
nitpicks that don't move the result, and fold only confirmed, material problems
forward.

## Step 6 — Decide: loop again, or stop

Spin up another round only for a named reason: verification failed, peer review
found a confirmed blocker, agent outputs conflict in a way that changes the answer,
the implementation is genuinely incomplete, or a newly surfaced risk affects the
result. When you do loop, **make it narrower** — converge on the remaining gap, don't
re-open settled ground. Otherwise stop. More available agents is never, by itself, a
reason to keep going; chasing polish past the done criteria is how a finished task
becomes an unfinished one.

## Step 7 — Report back

Close with a plain, user-facing summary: the completed result, what changed or was
produced, what verification (and peer review, if any) happened, and — only if you
used agents — how their outputs were evaluated and integrated. Keep it focused;
surface implementation detail only when asked.

---

## Anti-patterns

- **Waiting for a goal.** If you're stalled because no one wrote the `/goal`, write
  it yourself. That's the whole move.
- **Spawning before you're oriented.** Agents can't recover context you skipped;
  they fill the gap with guesses you then unwind.
- **Overlapping ownership.** Two agents on one file is a merge conflict you have to
  arbitrate. Carve clean seams up front and integration stays cheap.
- **One mega-agent.** Handing the whole task to a single agent is just
  single-threading with extra latency. Split it.
- **Summarizing instead of synthesizing.** Your job is the integrated answer, not a
  roundup of what each agent said.
- **Looping because agents are free.** Idle capacity is not a reason to spawn work.
  Stop when the contract is met.
