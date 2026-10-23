---
name: db-migration
description: Check an alembic migration for one head and a correct parent.
kinds: [migration]
model: sonnet
---

1. Run `alembic heads`. It must print one head.
2. Check that `down_revision` is the head on `origin/main`. A migration merged to main after your branch point makes two heads.
3. Run upgrade and downgrade on a test database.
4. Run the DB tests. Two heads make every DB test fail at setup.

Done when there is one head and the DB tests pass.
