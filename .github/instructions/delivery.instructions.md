---
name: Delivery
description: "Use when creating or preparing a Git branch, commit, pull request, release handoff, or GitHub issue update for Chat Studio. Defines repository-specific delivery and validation conventions."
---
# Delivery Conventions

## Repository Identity
- Project: `Chat Studio`
- Project short name: `CS`
- Default pull request base: `develop`
- Push remote: `origin`
- Required delivery validation: `make check`

When copying this file to another repository, update every value in this section first. The remaining rules use these values unless they explicitly state otherwise.

## Branches
- Use the default pull request base from Repository Identity unless the issue explicitly targets another branch.
- Prefer creating the issue branch after Fast confirms the work and before Engineer edits code.
- Use `<type>/<issue-number>-<short-kebab-summary>` when an issue number exists, for example `fix/123-chat-http-400`.
- Use `<type>/<short-kebab-summary>` when no issue exists.
- Allowed types are `fix`, `feature`, `refactor`, `docs`, `test`, and `chore`.
- Never switch branches with unrelated uncommitted changes. Report the conflict and ask the user how to separate the work.

## Commits
- Keep commits scoped to one issue and exclude unrelated working-tree changes.
- Use a concise imperative subject in sentence case, matching the existing history, for example `Fix stale conversation model selection`.
- Do not add generated attribution or co-author trailers unless the user requests them.
- Do not amend, rebase, force-push, or rewrite shared history without explicit user approval.

## Validation
- Run the narrowest relevant test while implementing.
- Before delivery, run the required delivery validation from Repository Identity unless a documented environment limitation prevents it.
- If the required delivery validation cannot run, record the exact blocker and every narrower check that passed. Do not describe the change as fully validated.

## Pull Requests
- Push the issue branch to the configured push remote and open the pull request against the configured default base.
- Before creating a pull request, search open and closed pull requests by ticket identifier, linked issue, and head branch.
- Use one pull request per ticket or issue. Reuse and update an existing PR; do not create another unless the user explicitly requests a separate PR after reviewing the existing PR.
- If the existing PR is closed or merged but additional work is required, stop and ask the user whether to reopen, follow up, or create a separate PR.
- Format every PR title as `<project-short-name>-<ticket-number> - <imperative user-visible result>`.
- Use the project short name from Repository Identity.
- Preserve the ticket's imperative issue title when it accurately describes the delivered result; otherwise write a concise imperative phrase that does.
- Before creating the PR, look for a repository PR template and use it if one is added later. Otherwise use these sections:

```markdown
## Summary
- <what changed and why>

## Resolution
- <root cause and implementation>

## Validation
- `<command>` - <result>

## Issue
Closes #<issue-number>
```

- Use `Closes #<issue-number>` only when merging the PR should close that issue. Otherwise use `Relates to #<issue-number>`.
- Create a draft PR when validation is incomplete or a known implementation decision remains unresolved.
- Never merge or approve the PR as part of delivery unless the user explicitly requests it.

## Issue Updates
- After opening the PR, add one concise issue comment with the PR link, root cause, key implementation points, and validation results.
- Describe an open PR as `implemented in <PR link>`, not `resolved` or `completed`.
- Do not close the issue or change project status unless repository automation does so or the user explicitly requests it.
- Do not duplicate the PR description verbatim; keep the issue comment focused on resolution evidence.

## Safety
- Inspect `git status`, the staged diff, and the commit diff before every commit or push.
- Never include secrets, local environment files, credentials, uploads, logs, or unrelated generated files.
- Stop delivery and return to Engineer if tests fail because of the implementation.