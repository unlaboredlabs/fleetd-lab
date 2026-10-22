# fleetd-lab FAQ

### What is this repo?
A disposable sandbox for fleetd's lab tests. Only fleetd's merge train merges here.

### What are the `lab/<timestamp>/` folders?
Output from one lab run, with one Markdown file per task. The README says that after a run the lab resets the slot's main to the `seed` tag, so the folders are cleared then.

### What is the `Source:` line in a PR body?
A line of the form `Source: <what the change serves>`, for example `Source: done:0`. The README and CI do not check for it; past PRs titled "lab: no Source line" (#227, #233) were closed.

### What is the `fleetd/train` status?
A status check that `slot/<n>/main` and `noci/<n>/main` require before a PR can merge into them.

### What is `.fleetd/policy.yaml`?
It sets the lab areas (`all: ["**"]`, so every path is in scope), the default model `claude-haiku-5-5` at effort `low`, and the branch prefix `slot/9/fleetd/`.

### What are `packages/alpha` and `packages/beta`?
Placeholder packages. Each holds only a README that reads "A lab package." and no code.

### How do I make CI pass?
CI fails if a file named `FAIL` exists at the repo root. PRs into `noci/**` bases do not run CI.
