# skills

Reusable Claude Code agent **skills** for the [dockialabs](https://github.com/ramoncurto/dockialabs)
build pipeline — grilling, TDD, debugging, domain modeling, handoff and more.

## Install (any project, any machine)

```bash
npx skills@latest add ramoncurto/skills --all -g     # all skills, global (~/.claude/skills)
npx skills@latest add ramoncurto/skills --all -p     # project-level (./.claude/skills)
```

## Skills

- `audit` — Score the whole project area by area, then keep fixing and re-testing until everything earns a 10.
- `autoreview` — Have a second AI model review your changes before you ship, and act only on findings that hold up.
- `debug` — Hunt a bug down properly — reproduce it, find the real cause, fix that, and lock it in with a test.
- `design` — Agree on clear names and a clean shape for a module before writing the code.
- `features` — Turn a rough product idea into a page-by-page feature list that's ready to build.
- `grill` — Get asked the hard questions up front, so the plan has no surprises later.
- `handoff` — Leave clean notes so the next person or session can pick up right where you left off.
- `orchestrate` — Split coding work between AI models — one directs, the others execute, and you stay in control.
- `parallel` — Split a big task across several agents working at once, then stitch the results together.
- `prd` — Write down what you're building, for whom, and when it's done — before building it.
- `refactor` — Tidy up code so it's easier to read and grow, without changing what it does.
- `search-growth-remediation` — Diagnose and fix GSC issues, AdSense content readiness and AgentReady failures, with verified releases and provider evidence.
- `security` — Check your API endpoints for security holes and lock them down.
- `seo` — Say seo and it takes organic search from wherever it is to the top — audits what Google really sees, plans it, fixes the technical layer, and keeps measuring.
- `skills` — How to write a good skill — clear triggers, concrete steps, a real finish line.
- `tdd` — Write the failing test first, make it pass, then clean up.

---

Mirrored from `harness-kit/skills/` in dockialabs (`@1b29756`) — **don't edit here**; edit upstream
and re-run `harness-kit/scripts/publish-skills.mjs`. Skills derive from
[mattpocock/skills](https://github.com/mattpocock/skills) (MIT).

`search-growth-remediation` was authored by Dockia Labs and synchronized from
[`dockialabs@af2cc42`](https://github.com/ramoncurto/dockialabs/commit/af2cc42aa3dcde8ac6f261f26b0d2805483aa6aa).
This scoped publication preserves all existing skill files; their prior mirror provenance remains unchanged.
