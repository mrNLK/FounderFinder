# FounderFinder Admin Runbook

## 1) Deploy and Verify

```bash
cd /Users/mike/SourceProof/FounderFinder
git fetch origin
git checkout main
git pull --ff-only origin main
npm run build
```

```bash
supabase functions deploy founder-source --project-ref iirwwadiedcbcrxpehog --no-verify-jwt --workdir /Users/mike/SourceProof/FounderFinder
supabase functions deploy founder-enrich --project-ref iirwwadiedcbcrxpehog --no-verify-jwt --workdir /Users/mike/SourceProof/FounderFinder
supabase functions list --project-ref iirwwadiedcbcrxpehog --workdir /Users/mike/SourceProof/FounderFinder
```

## 2) End-to-End Smoke Test

```bash
cd /Users/mike/SourceProof/FounderFinder
npm run test
npm run build
gh workflow run "QA Swarm" --ref main
gh run list --workflow "QA Swarm" --limit 1
gh run watch 23031335682
gh run view 23031335682 --log-failed
```

## 3) FounderFinder Password Reset (Correct App)

1. Open FounderFinder login screen (`founder-finder-mu.vercel.app`).
2. Trigger password reset for the FounderFinder Supabase project user.
3. Complete reset link and set new password.
4. Sign in and verify app membership allows dashboard access.

## 4) Troubleshooting

### Error: `Failed to send a request to the Edge Function`

1. Confirm Exa integration configured in Settings.
2. Confirm `founder-source` and `founder-enrich` are active in Supabase functions list.
3. Hard refresh browser and retry `Find Founders`.

### PR merge blocked

1. Resolve all conversation threads.
2. Confirm required status check `build` is green.
3. Merge through PR only.

## 5) Lever Automation Rules

- Ingest weekly Lever `candidates_by_origin` export.
- Normalize LinkedIn/GitHub URLs before dedupe.
- Route by score:
  - `>=80`: Priority Outreach
  - `60-79`: Operator Review
  - `40-59`: Nurture/Recheck
  - `<40`: Archive

## 6) Weekly Ops Checklist

1. Run Founder Finder pipeline.
2. Import Tier 1 and high-confidence Tier 2.
3. Run Lever sync and resurfacing pass.
4. Update engagement statuses.
5. Run QA Swarm.
