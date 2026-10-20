# fleetd-lab

A disposable sandbox for fleetd's lab tests. Only fleetd's merge train merges here. Each lab slot works in its own
branch namespace:

- `slot/<n>/main` is the slot's base. It requires the `ci` check and the `fleetd/train` status, squash merges only.
- `noci/<n>/main` is a base with no CI: it requires only `fleetd/train`, and `ci` never runs for PRs into it.

Task branches live in the namespace too (`slot/<n>/fleetd/...`). After a run the lab closes the namespace's PRs,
deletes its branches and resets its main to the `seed` tag.

CI fails iff a file named `FAIL` exists at the repo root.

## FAQ

**What are the `lab/<timestamp>/` folders?** Per-run or per-chat lab output. The namespace's main resets to the `seed` tag after a run, so these folders don't persist.

**What is fleetd, and what is `fleetd/train`?** fleetd runs the lab's agents. Its merge train is the only thing that merges here, and it posts the `fleetd/train` status that every base requires.

**What does `.fleetd/policy.yaml` configure?** The areas agents may change (`all: ["**"]` here), the default model and effort for agents, and the `slot/9/fleetd/` branch prefix for task branches.

**What are `packages/alpha` and `packages/beta`?** Fixture packages with no real code. They are targets for lab tasks.
