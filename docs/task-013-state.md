# Task 013R — ShowPlan import without its history (supersedes 013)

Task 013 imported ShowPlan **with** its commit history. That was rejected: the history and the
imported docs contained real rates (a worked genset example and a real tour's value), and rate data
in a public repository's history cannot be removed later.

**013R rebuilt the import without any ShowPlan history.** The tree is 013's, re-committed as a single
commit on top of `main` with `Co-authored-by` credit; every rupee figure was redacted to symbols or
words; the fuel tests deleted with 013's pricing tests were restored; and ShowPlan's history was left
in the private `cav-tech-work/showplan` repository.

- **Branch:** `task/013r-showplan-import`
- **Commit:** one commit on `main`, message *"Import ShowPlan as the domain and editor lineage;
  pricing stripped; BOQ route"*.
- **Verified:** no `₹`/`Rs`/`INR` figure in the tree; `packages/boq` reports the restored fuel tests;
  `make verify` green.

013's branch `task/013-showplan-import` was deleted. This file replaces the 013 hand-off note.
