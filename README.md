# fleetd-lab

A disposable sandbox for fleetd's lab tests. Only fleetd's merge train merges here. Each lab slot works in its own
branch namespace:

- `slot/<n>/main` is the slot's base. It requires the `ci` check and the `fleetd/train` status, squash merges only.
- `noci/<n>/main` is a base with no CI: it requires only `fleetd/train`, and `ci` never runs for PRs into it.

Task branches live in the namespace too (`slot/<n>/fleetd/...`). After a run the lab closes the namespace's PRs,
deletes its branches and resets its main to the `seed` tag.

CI fails iff a file named `FAIL` exists at the repo root.
