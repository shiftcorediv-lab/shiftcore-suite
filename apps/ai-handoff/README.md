# AI handoff documents

Internal AI audit, decision, and implementation records are managed outside this public repository.

Do not add security findings, production details, employee information, credentials, or private handoff records here.

## Development audit workflow

As of 2026-08-22, Another Portal development does not depend on Claude for implementation, review, handoff, or independent audit.

- Implementation and remediation are performed in the primary Codex task.
- Independent audit is performed in a separate Codex task with no inherited implementation conclusion.
- The audit scope is fixed by the base SHA, head SHA, target files, and explicit review questions.
- The audit task is read-only and must not modify files, commit, push, change a pull request, merge, deploy, or operate production data or settings.
- The implementation task must not treat its own review as independent approval.
- Ready, merge, deployment, publication, and material production or permission changes require Eichi's explicit decision.
- High-risk legal, labor, accounting, authentication, permission, and production-cutover decisions may additionally require a human or organizationally independent reviewer.

Existing records that identify Claude as a past auditor remain historical facts and are not rewritten. References to independent audits performed after this policy takes effect mean an audit by a separate Codex task unless the record explicitly names another reviewer.
