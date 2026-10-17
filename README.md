# fleetd-testbed

A disposable repo for fleetd's merge train tests. Only the train merges here: `main` requires the `ci` check and
the `fleetd/train` commit status, squash merges only.

CI fails iff a file named `FAIL` exists at the repo root.
