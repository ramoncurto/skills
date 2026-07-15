# skills

Reusable Claude Code agent **skills** for the [dockialabs](https://github.com/ramoncurto/dockialabs)
build pipeline — grilling, TDD, debugging, domain modeling, handoff and more.

## Install (any project, any machine)

```bash
npx skills@latest add ramoncurto/skills --all -g     # all skills, global (~/.claude/skills)
npx skills@latest add ramoncurto/skills --all -p     # project-level (./.claude/skills)
```

## Skills

- `atomic-features`
- `autoreview`
- `audit-remediate-to-10`
- `codebase-design`
- `diagnosing-bugs`
- `domain-modeling`
- `grill-me`
- `grill-with-docs`
- `handoff`
- `improve-codebase-architecture`
- `orchestrate`
- `orchestrate-fable`
- `parallel-goals-for-a-task`
- `tdd`
- `to-prd`
- `writing-great-skills`

---

Most skills are mirrored from `harness-kit/skills/` in dockialabs (`@b544fda`) —
**don't edit those here**; edit upstream and re-run
`harness-kit/scripts/publish-skills.mjs`. They derive from
[mattpocock/skills](https://github.com/mattpocock/skills) (MIT).

`autoreview` is vendored unchanged from
[openclaw/agent-skills](https://github.com/openclaw/agent-skills/tree/599be8dcd33369ce06324cdb63da2e421830fac2/skills/autoreview)
(MIT). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
