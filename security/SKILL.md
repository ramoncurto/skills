---
name: security
description: Audit the security of your own API endpoints / route handlers and close vulnerabilities — missing auth, broken access control (IDOR), injection, missing input validation, rate-limit/DoS gaps, secret and info leakage, SSRF, open redirect, CSRF on state-changing routes. Reports findings ranked by severity with evidence, then applies authorized fixes with regression tests. Use when the user says audit my endpoints, check my API for vulnerabilities, "asegura que no tengan vulnerabilidades", security review of routes, is this endpoint safe (formerly security-audit) (/security). Defensive, authorized-code-only.
---

# Security-audit — find and close endpoint vulnerabilities

## When to use
The user wants their own API endpoints / route handlers checked for security holes and
hardened — "audita mis endpoints", "check my API for vulns", "is this route safe", "add
authz/validation/rate limiting". Defensive review of code the user owns. NOT for attacking
third-party systems, writing exploits against targets you don't control, or evading
detection. For a plain diff review use the built-in `/security-review`; this skill audits
existing endpoints end-to-end.

## Steps
1. **Enumerate the attack surface.** List every endpoint in scope (route files, handlers,
   HTTP method, path, whether it mutates state). Note the auth model, the data store, and
   which routes touch user-supplied input. Don't audit blind — build the inventory first.
2. **Audit each endpoint against a fixed checklist.** For every route, check:
   - **AuthN/AuthZ** — is it protected? Does it verify the caller *owns* the resource
     (IDOR / broken object-level access), not just that they're logged in?
   - **Input validation** — every param/body/query validated (schema, type, bounds);
     injection-safe (parameterized queries, no string-built SQL/shell/paths).
   - **Output** — no over-fetching sensitive fields; errors don't leak stack traces,
     secrets, or internal IDs; no mass-assignment / over-posting.
   - **Abuse** — rate limiting / cost caps on expensive or auth routes; SSRF on
     server-side fetches; open redirect; CSRF on cookie-auth state changes.
   - **Secrets & transport** — no secrets in code/logs/URLs; auth over HTTPS only.
3. **Report findings ranked by severity** (Critical/High/Medium/Low). For each: the file
   and line, a concrete exploit scenario (input → impact), and the fix. Do NOT claim
   "no vulnerabilities" without having walked every endpoint against the checklist.
4. **Apply fixes for authorized findings, smallest first.** Add a failing test that
   demonstrates the hole (e.g. unauthenticated request succeeds), then fix so it fails
   closed. Prefer existing middleware/validators over bespoke checks. Fixes change
   behavior deliberately — call out each behavior change.
5. **Verify.** Run the test suite and the project gate (e.g. `npm run check`). Re-check
   that each fixed endpoint now denies the exploit and still serves legitimate requests.
6. **Report residual risk.** What was fixed, what needs human decision (e.g. a redesign,
   a secret rotation, infra-level WAF/rate-limit), and endpoints out of scope.

## Done when
Every in-scope endpoint has been walked against the checklist, findings are documented
with severity + exploit scenario + fix, authorized fixes are applied with regression tests
proving the hole is closed, the suite/gate is green, and residual risks are listed for the user.
