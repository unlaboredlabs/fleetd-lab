# FAQ

## What are lab/<run-id>/ and lab/chat-<id>/?
They hold files that lab runs add through merge-train PRs, such as `lab/chat-20261023124306/hello.md`. The `seed` tag has no `lab/` folder, so they disappear when the lab resets a slot's main to `seed`.

## What is the fleetd/train status?
It is a status check that `slot/<n>/main` and `noci/<n>/main` both require before a PR can merge. Only fleetd's merge train merges here, so never post it yourself.

## Why did my PR's CI fail?
The `ci` job runs `test ! -e FAIL`, so it fails if a file named `FAIL` exists at the repo root. Delete that file and push again.

## Why didn't CI run?
The `pull_request` trigger has `branches-ignore: ["noci/**"]`, which filters on the PR's base branch, so PRs into `noci/<n>/main` never get `ci`. Pushes only trigger it on `main` and `slot/*/main`.

## What are packages/alpha and packages/beta?
They are placeholder lab packages. Each holds only a `README.md` that says "A lab package."

## What is the seed tag?
It is the tag that marks the lab's starting state, and after a run the lab resets the slot's main to it. Refer to it by name, not by commit hash.
