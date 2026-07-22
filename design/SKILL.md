---
name: design
description: Design before coding — first pin the domain language (one precise name per concept, relationships, invariants), then shape the module (boundaries, public interface, data flow, dependencies). Use when starting a non-trivial new module or subsystem, when concepts are fuzzy or the same thing has several names, or before typing into a blank file (formerly codebase-design + domain-modeling) (/design).
---

# Design — domain language first, then module shape

## When to use
You're about to build something non-trivial: a new module, service, or subsystem — or the
problem space is fuzzy (one concept wears three names, discussions circle over terminology).
Use this before the first line of implementation, while change is still cheap. Skip Part A
when the domain vocabulary is already established and consistent.

## Steps — Part A: pin the domain language
1. **Harvest the nouns and verbs.** From the request, docs, and existing code, list the
   real-world concepts (entities) and the actions on them (operations). Note where one idea
   wears several names.
2. **Name each concept once, precisely.** One term per concept, defined in a sentence, plus
   what it is NOT. Prefer the language domain experts already use. Record the glossary in
   `CONTEXT.md` (or the project's equivalent) — the shared vocabulary for code, tests, and
   conversation.
3. **Model relationships and invariants.** For each pair of concepts state the link and its
   cardinality ("an Order has many LineItems") and the invariants ("Order total equals the sum
   of its LineItems"). Walk a few real scenarios through the model; if a real case can't be
   expressed, the model is wrong — revise it and the glossary.

## Steps — Part B: shape the module
4. **State the one job.** One sentence: what this module is responsible for and, crucially,
   what it is NOT. A module that resists this sentence is doing too much. Tightly-related
   concept clusters from Part A become the module boundaries.
5. **Draw the boundary / public interface.** Define the small surface callers touch — the
   functions/types they see, named in the glossary's terms. Everything else is internal and
   free to change. Design the interface from the caller's point of view.
6. **Map the data flow.** Trace input → transformations → output. Identify where data is
   owned, borrowed, and persisted. Make illegal states unrepresentable in the types where
   you can.
7. **Pin the dependencies.** List what this module depends on and which direction the arrows
   point. Depend on abstractions you control; keep arrows pointing inward toward stable core
   logic. Avoid cycles.
8. **Place it and sketch it.** Match the repo's conventions for layout, naming, and layering
   (see CLAUDE.md); reuse existing utilities before adding new ones. Write the interface
   signatures and a couple of usage call-sites first; if they read awkwardly, fix the design
   now, not after implementation.

## Done when
Core concepts each have one agreed name with a written definition, relationships and
invariants are explicit and survive the tested scenarios, and the module's responsibility,
public interface, data flow, and dependency directions are explicit — with planned call-sites
reading cleanly against the proposed interface.
