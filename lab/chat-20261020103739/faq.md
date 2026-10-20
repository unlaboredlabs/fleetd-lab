# FAQ

**What are `packages/alpha` and `packages/beta`?**
Two placeholder packages. Each has only a README reading "A lab package." They contain no code.

**What is the `fleetd/train` status check, and how does a PR make it pass?**
The README says the `slot/<n>/main` bases require it. Nothing in this repo posts it, and the repo does not say how it is produced. It is posted by fleetd's merge train, not by CI here. Do not post it yourself.

**What is the `seed` tag and how is it used?**
`seed` marks commit `dccd989`, the lab seed. After a run, the lab closes the namespace's PRs, deletes its branches, and resets its main to the `seed` tag (per the README).

**What does `.fleetd/policy.yaml` control?**
It sets `areas` (`all: ["**"]`, so every path is in scope), `defaults.model` (`claude-haiku-5-5`), `defaults.effort` (`low`), and `branchPrefix` (`slot/9/fleetd/`). The file is git-excluded and is not in this repo's history, so it is not in this worktree. The repo does not document any other keys.

**Why are `lab/` files absent from the current tree but present in history?**
The seed commit `dccd989` deletes the earlier `lab/` files from the tree. They remain in the commits before it.

**Why do some files appear only in history and not at HEAD?**
Each lab run resets main to the `seed` tag (per the README), so files merged in earlier runs are dropped from the tree. The repo does not record the reset mechanics beyond the README. Files merged after the seed, such as `lab/chat-20261020103739/hello.md` (PR #223), exist only on `origin/slot/9/main` until a branch is updated to it.

**Can I push directly to main or a slot branch?**
No. Only fleetd's merge train merges into these branches, so PRs land only through the merge train.
