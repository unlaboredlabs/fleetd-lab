# fleetd-lab

A disposable sandbox for fleetd's lab tests. Only fleetd's merge train merges here. Each lab slot works in its own
branch namespace:

- `slot/<n>/main` is the slot's base. It requires the `ci` check and the `fleetd/train` status, squash merges only.
- `noci/<n>/main` is a base with no CI: it requires only `fleetd/train`, and `ci` never runs for PRs into it.

Task branches live in the namespace too (`slot/<n>/fleetd/...`). After a run the lab closes the namespace's PRs,
deletes its branches and resets its main to the `seed` tag.

CI fails iff a file named `FAIL` exists at the repo root.

## FAQ

**What is the `fleetd/train` status?** A required commit status that fleetd's merge train sets on PRs into a `slot/<n>/main` or `noci/<n>/main` base; no workflow in `.github/` posts it, and the merge train is the only thing that merges here.

**What are `packages/alpha` and `packages/beta`?** Two placeholder packages, each holding only a one-line `README.md` ("A lab package."), so the lab has something to work on.

**What are the files under `lab/`?** Notes written by lab runs (e.g. `lab/<run-id>/digest.md`). They live on task branches and in past history, not on the current slot base, and are removed when the namespace is reset.

**What is `.fleetd/policy.yaml`?** It is meant to be fleetd's per-repo config, but this repo has no such file on any branch or in its history, so nothing is configured here yet.

**What is the `seed` tag?** An annotated-free tag on commit `dccd989`, the lab seed commit; after each run, `main` is reset to it. `main` is currently one commit past it (`f064646`).
