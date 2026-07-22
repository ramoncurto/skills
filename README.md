# skills

Reusable Claude Code agent **skills** for the [dockialabs](https://github.com/ramoncurto/dockialabs)
build pipeline — grilling, TDD, debugging, domain modeling, handoff and more.

## Install (any project, any machine)

```bash
npx skills@latest add ramoncurto/skills --all -g     # all skills, global (~/.claude/skills)
npx skills@latest add ramoncurto/skills --all -p     # project-level (./.claude/skills)
```

## Skills

- `audit`
- `debug`
- `design`
- `features`
- `grill`
- `handoff`
- `orchestrate`
- `parallel`
- `prd`
- `refactor`
- `security`
- `skills`
- `tdd`

---

Mirrored from `harness-kit/skills/` in dockialabs (`@0b87afd`) — **don't edit here**; edit upstream
and re-run `harness-kit/scripts/publish-skills.mjs`. Skills derive from
[mattpocock/skills](https://github.com/mattpocock/skills) (MIT).
