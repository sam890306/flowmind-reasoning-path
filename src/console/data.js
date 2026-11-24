// Fixed vocabulary of the AutoResearch console: lifecycle steps, hypothesis stages,
// discard reasons and the permission matrix. Live data comes from the API (see store.js).

export const LIFE = [
  { k: 'Enroll', where: 'A→B', d: 'Google sign-in, operator approval, quota' },
  { k: 'Create', where: 'A→B', d: 'repo snapshot, goal, Slurm job, cap and clock' },
  { k: 'Provision', where: 'B', d: 'framework clone, venvs, sandbox, CPU slot' },
  { k: 'Set up', where: 'B+C', d: 'manifest, frozen evaluator, baseline' },
  { k: 'Research loop', where: 'B+C', d: 'ideas → implement → screen → promote' },
  { k: 'Finalize', where: 'B', d: 'final review of promoted changes' },
  { k: 'Verify', where: 'B+C', d: 'clean checkout, held-out data' },
  { k: 'Deliver', where: 'B→A', d: 'patch + REPORT.md' },
]

export const HSTAGES = [
  { k: 'idea', label: 'Ideas', hint: 'proposed by Agent 2' },
  { k: 'plan', label: 'Planning', hint: 'planner + reviewer' },
  { k: 'implement', label: 'Implementing', hint: 'sandboxed worker' },
  { k: 'screen', label: 'Screening', hint: "engine's first measurement" },
  { k: 'promote', label: 'Re-measuring', hint: 'isolated, pinned slot' },
  { k: 'kept', label: 'Promoted', hint: 'in the candidate patch' },
  { k: 'discarded', label: 'Discarded', hint: 'with the reason why' },
]

export const REASONS = {
  NO_GAIN: { label: 'No measurable gain', at: 'screen' },
  REGRESSION: { label: 'Regression', at: 'screen' },
  CORRECTNESS: { label: 'Correctness check failed', at: 'screen' },
  CONSTRAINT: { label: 'Constraint violated', at: 'screen' },
  TIMEOUT: { label: 'Stage timed out', at: 'screen' },
  BUILD: { label: 'Build failed on node', at: 'implement' },
  EVALUATOR: { label: 'Touched the frozen evaluator', at: 'implement' },
  BUDGET: { label: 'Cost cap reached · HTTP 402', at: 'implement' },
  NOT_REPRODUCED: { label: 'Did not reproduce in isolation', at: 'promote' },
  CUT: { label: 'Stopped at finalize', at: 'any' },
}

export const PERMS = [
  ['See campaigns, feeds and results', 1, 1, 1],
  ['Create a campaign (within quota)', 0, 1, 1],
  ['Pause, steer, answer, finalize own campaigns', 0, 1, 1],
  ['Control any campaign in the lab', 0, 0, 1],
  ['Download patch and REPORT.md', 0, 1, 1],
  ['Approve enrollments, set roles and quotas', 0, 0, 1],
  ['See lab-wide usage and chargeback', 0, 0, 1],
  ['Revoke tokens, read the audit log', 0, 0, 1],
]

export const HARD_LINES = [
  ['No held-out data for agents or the run', 'Stays on host-local disk; only the verifier copies it to the node.'],
  ['No secrets in sandboxes', 'The real key lives in the proxy. Sandboxes get scoped, capped, revocable tokens.'],
  ['Cost cap and clock', 'The proxy reserves per role before each call: over the cap → 402, past the deadline → 403.'],
  ['Trustworthy score', 'The evaluator is frozen. Patches that touch it are rejected; only the verifier reports.'],
]
