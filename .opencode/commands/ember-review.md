---
description: Review a pull request using Ember Dev Pack evidence from GitHub, Linear, docs, and browser tools.
agent: plan
subagent: true
---

You are running the Ember Dev Pack review workflow for `$ARGUMENTS`.

1. Determine the PR number and repository from `$ARGUMENTS`. If only a number is given, use the current `origin` repository.
2. Gather evidence:
   - PR title, description, diff, changed files, and checks via the GitHub integration.
   - Linked issues in the PR body or commit messages, via GitHub/Linear.
   - Relevant project documentation and repository files touched by the PR.
   - Browser or UI evidence when the PR changes user-facing behavior.
3. Produce a concise, high-signal review:
   - Start with an overall recommendation: approve, approve with comments, or request changes.
   - List blocking issues first, with file:line references and exact suggested changes.
   - Then non-blocking suggestions, organized by correctness, maintainability, tests, and performance.
   - Call out missing tests or documentation.
   - Mention any security, permission, migration, or data-loss risks.
4. If useful, convert only clearly actionable findings into Linear follow-up issue proposals; never create issues without the user asking.
5. Keep the review factual and evidence-backed. Do not claim something is tested unless a check, test, or command result supports it.
6. End with a compact checklist: `risk`, `tests`, `docs`, `follow-ups`.

Argument examples: `/ember-review 42`, `/ember-review owner/repo#42`, `/ember-review https://github.com/owner/repo/pull/42`.
