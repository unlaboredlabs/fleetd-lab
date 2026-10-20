# fleetd-lab

A disposable sandbox for fleetd's lab tests. Only fleetd's merge train merges here. Each lab slot works in its own
branch namespace:

- `slot/<n>/main` is the slot's base. It requires the `ci` check and the `fleetd/train` status, squash merges only.
- `noci/<n>/main` is a base with no CI: it requires only `fleetd/train`, and `ci` never runs for PRs into it.

Task branches live in the namespace too (`slot/<n>/fleetd/...`). After a run the lab closes the namespace's PRs,
deletes its branches and resets its main to the `seed` tag.

CI fails iff a file named `FAIL` exists at the repo root.

## FAQ

**What are the `lab/<timestamp>/` folders?** Per-run output that fleetd's merge train writes to `main`. Main is reset to the `seed` tag after a run, so these folders are removed then.

**What does the `fleetd/train` status mean?** It is the commit status fleetd's merge train sets on a PR. `slot/<n>/main` and `noci/<n>/main` require it, and the train is the only thing that merges into them.

**What is `.fleetd/policy.yaml`?** fleetd's per-slot config for agents: the areas they may change (`all: ["**"]` in this slot), the default model and effort, and the branch prefix for task branches (`slot/<n>/fleetd/`). It is not committed to this repo.

**How do `packages/alpha` and `packages/beta` relate?** They are two sibling packages. Each holds only a README that says "A lab package."; there is no code in either.

**What does the `Source:` line in a PR body mean?** It names what the PR serves: a done-when check such as `done:0`, an issue, or a defect.

**Why does CI skip `noci/**` bases?** The `ci` workflow sets `branches-ignore: ["noci/**"]` on `pull_request`, so PRs into `noci/**` bases never run it. Its push trigger covers only `main` and `slot/*/main`.

**How do I make CI pass?** CI fails iff a file named `FAIL` exists at the repo root. Remove it.
