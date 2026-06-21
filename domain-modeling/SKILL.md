---
name: domain-modeling
description: Establish precise shared domain language and model the core concepts and their relationships before coding. Use when concepts are fuzzy, naming is inconsistent, or the same thing has several names.
---

# Domain Modeling

## When to use
The problem space is fuzzy: the same concept is called three different things, you're unsure what an entity "is," or discussions go in circles over terminology. Do this before designing code.

## Steps
1. **Harvest the nouns and verbs.** From the request, docs, and existing code, list the real-world concepts (entities) and the actions on them (operations). Note where one idea wears several names.
2. **Name each concept once, precisely.** Pick one term per concept and define it in a sentence. Prefer the language domain experts already use over invented jargon.
3. **Keep a `CONTEXT.md` of domain terms.** Record each term, its definition, and what it is NOT. This is the shared glossary the code, tests, and conversation all draw from — update it as understanding sharpens.
4. **Model relationships.** For each pair of concepts state the link and its cardinality ("an Order has many LineItems; a LineItem belongs to exactly one Order"). Capture invariants ("an Order total equals the sum of its LineItems").
5. **Find the boundaries.** Group tightly-related concepts; note where one cluster ends and another begins. These seams become module boundaries later.
6. **Validate against reality.** Walk a few concrete scenarios through the model; if a real case can't be expressed, the model is wrong — revise it and the glossary.

## Done when
Every core concept has one agreed name and a written definition in `CONTEXT.md`, relationships and invariants are explicit, and the model expresses the real scenarios you tested it against.
