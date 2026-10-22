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

**What are the files under `lab/`?** Notes written by lab runs under `lab/<run-id>/`, merged into the slot base during a run and removed when the namespace is reset to the seed tag.

**What is `.fleetd/policy.yaml`?** fleetd's local, git-ignored per-checkout config (writer areas, default model and effort, task branch prefix); it is not part of the repo.

**What is the `seed` tag?** The tag on the lab seed commit; a reset puts `main` back on it.
