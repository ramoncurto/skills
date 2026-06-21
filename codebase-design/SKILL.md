---
name: codebase-design
description: Design a new module's shape — boundaries, interfaces, data flow, and dependencies — before writing it. Use when starting a non-trivial new piece of code rather than typing into a blank file.
---

# Codebase Design

## When to use
You're about to build something non-trivial: a new module, service, or subsystem. Use this before the first line of implementation, while change is still cheap.

## Steps
1. **State the one job.** Write a sentence: what this module is responsible for and, crucially, what it is NOT. A module that resists this sentence is doing too much.
2. **Draw the boundary / public interface.** Define the small surface callers touch — the functions/types they see. Everything else is internal and free to change. Design the interface from the caller's point of view, not the implementation's.
3. **Map the data flow.** Trace input → transformations → output. Identify where data is owned, where it's borrowed, and where it's persisted. Make illegal states unrepresentable in the types where you can.
4. **Pin the dependencies.** List what this module depends on and which direction the arrows point. Depend on abstractions you control; keep dependencies pointing inward toward stable core logic. Avoid cycles.
5. **Place it in the existing structure.** Match the repo's conventions for layout, naming, and layering (see CLAUDE.md). Reuse existing utilities before adding new ones.
6. **Sketch before building.** Write the interface signatures and a couple of usage call-sites first; if they read awkwardly, fix the design now, not after implementation.

## Done when
The module's responsibility, public interface, data flow, and dependency directions are explicit and reviewed, and the planned call-sites read cleanly against the proposed interface.
