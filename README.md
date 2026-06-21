# skills

Reusable Claude Code agent **skills** for the [dockialabs](https://github.com/ramoncurto/dockialabs)
build pipeline — grilling, TDD, debugging, domain modeling, handoff and more.

## Install (any project, any machine)

```bash
npx skills@latest add ramoncurto/skills --all -g     # all skills, global (~/.claude/skills)
npx skills@latest add ramoncurto/skills --all -p     # project-level (./.claude/skills)
```

## Skills

- `codebase-design`
- `diagnosing-bugs`
- `domain-modeling`
- `grill-me`
- `grill-with-docs`
- `handoff`
- `improve-codebase-architecture`
- `parallel-goals-for-a-task`
- `tdd`
- `to-prd`
- `writing-great-skills`

---

Mirrored from `harness-kit/skills/` in dockialabs (`@e1381d6`) — **don't edit here**; edit upstream
and re-run `harness-kit/scripts/publish-skills.mjs`. Skills derive from
[mattpocock/skills](https://github.com/mattpocock/skills) (MIT).
