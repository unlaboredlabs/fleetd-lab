# FAQ

See the root [README.md](../../README.md) for detail.

**What is this repo for?**
A disposable sandbox for fleetd's lab tests.

**What happens after a run?**
The lab closes the slot namespace's PRs, deletes its branches and resets its main to the `seed` tag.

**Which base branches exist, and what do they require?**
`slot/<n>/main` requires the `ci` check and the `fleetd/train` status. `noci/<n>/main` has no CI and requires only `fleetd/train`.

**How do PRs get merged?**
Only fleetd's merge train merges here; `slot/<n>/main` allows squash merges only.

**When does CI fail?**
Iff a file named `FAIL` exists at the repo root. CI never runs for PRs into `noci/**`.
