# 07 — Backups and restore

Velora's database runs on MongoDB Atlas M0, which has **no built-in backups**. The nightly backup described here is the only copy of user data outside the database itself (NFR-REL-4: data safety is non-negotiable).

**Not covered:** document *files* live in Cloudflare R2, not in the database. A restored database can point at a file deleted after the backup was taken; the app then reports that file as unavailable. R2 has no free versioning; revisit if that matters.

---

## 1. What runs every night

`.github/workflows/backup.yml`, at 02:47 UTC (and on demand: Actions → Backup → Run workflow):

1. **Dump** the database with `mongodump --archive --gzip`. It includes the Auth.js collections, which share the database.
2. **Encrypt** it with AES-256 (`openssl enc -aes-256-cbc -pbkdf2 -iter 200000`) using `BACKUP_PASSPHRASE`. The unencrypted dump is deleted. Encryption is mandatory: artifacts of a *public* repository can be downloaded by any signed-in GitHub user.
3. **Verify** by decrypting the file and restoring it into a scratch MongoDB inside the job. The run fails unless every dumped document is restored with zero failures. A backup that can't be restored is caught the same night, and GitHub emails the failure.
4. **Keep** the encrypted file as a workflow artifact named `velora-YYYY-MM-DD.archive.gz.enc`, for 14 days.

The run summary states how many documents were backed up and restored.

## 2. One-time setup (at deployment)

1. **Read-only database user.** In Atlas → Database Access, add a user with the built-in role **read** on the app's database, say `velora-backup`. A backup credential then can't change data even if it leaks.
2. **Passphrase.** Generate one with `openssl rand -base64 32` and store it in your password manager **first**. If it's lost, every backup is unreadable.
3. **GitHub settings.** Under Settings → Secrets and variables → Actions:
   - secret `BACKUP_MONGODB_URI`: the read-only user's connection string;
   - secret `BACKUP_PASSPHRASE`: the passphrase;
   - variable `BACKUP_MONGODB_DB`: only if the database isn't named `velora`;
   - variable `BACKUP_ENABLED` = `true`.
4. **First run.** Run the workflow once by hand and check its summary.

Until `BACKUP_ENABLED` is `true`, the job is skipped and costs nothing.

## 3. Restoring

You need [MongoDB Database Tools](https://www.mongodb.com/try/download/database-tools) (`mongorestore`), `openssl`, and the passphrase.

```sh
# 1. Download the backup you want (newest first: gh run list --workflow Backup)
gh run download <run-id> -R JMinallah/velora -n velora-YYYY-MM-DD.archive.gz.enc

# 2. Restore into a NEW database first, never over the live one
read -s BACKUP_PASSPHRASE && export BACKUP_PASSPHRASE
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE \
    -in velora-YYYY-MM-DD.archive.gz.enc \
  | mongorestore --uri "<admin connection string>" --archive --gzip \
      --nsFrom 'velora.*' --nsTo 'velora_restored.*'
#    → "N document(s) restored successfully. 0 document(s) failed to restore."

# 3. Check it: per-collection counts, a SHA-256 of every document, indexes
npx tsx scripts/db-fingerprint.ts "<admin connection string>" velora_restored
```

4. **Switch over.** The low-risk way is to point the app at the restored database: set `MONGODB_DB=velora_restored` on the host and redeploy. Indexes are re-ensured at start-up. Alternatively, during a maintenance window, restore over the live database with `--drop` (no `--nsFrom/--nsTo`).
5. **Afterwards.** Everyone's sessions are as they were at backup time, so users may need to sign in again. Reminders whose time passed while the data was gone are sent on the next dispatcher run.

`openssl` answering **`bad decrypt`** means the passphrase is wrong. Nothing is written when that happens.

## 4. Rehearsal (2026-10-14)

Exit-gate item "Restore rehearsal completed" (Phase 7). This was done locally, on MongoDB 4.4 (replica set) with Database Tools 100.10.0, using the same commands as the workflow (`podman exec` in place of `docker run`).

| Step | Result | Time |
|---|---|---|
| Seed realistic data (`npm run seed:demo`): 3 users, 6 missions, 32 tasks with automatic reminders, custom reminders, chats, documents, settings, audit events | 153 documents in 17 collections | 22.8 s |
| Fingerprint the database (`scripts/db-fingerprint.ts`) | per-collection count, SHA-256 of every document, index keys | — |
| `mongodump --archive --gzip` + encrypt | 10,256-byte encrypted file | 5.3 s |
| **Disaster:** `dropDatabase()` | database gone (empty fingerprint) | — |
| Decrypt with a **wrong** passphrase | `bad decrypt`, nothing written | — |
| Decrypt + `mongorestore` | `153 document(s) restored successfully. 0 document(s) failed to restore.` | 21.7 s |
| Fingerprint again and compare | **identical**: every count, every document hash, every index | — |
| App check: the domain layer on the restored data lists a user's missions, summarises tasks, saves an edit; the task's reminder follows the edit | all as expected | — |

**Findings:**
- Most of the restore time is index builds. At beta scale a restore takes well under a minute; the slow part of recovering is the switch-over (step 4), not the data.
- The two old helper scripts were stale. `scripts/send_reminders.ts` marked reminders sent without delivering them; it now runs the real dispatcher. `scripts/seed_missions.mjs` created missions with no owner; it was replaced by `scripts/seed-demo.ts`.
- **Still to do at deployment:** the first scheduled run against Atlas (§2, step 4). The workflow's commands match the rehearsal's, but the dump-from-Atlas step has only run locally so far.
