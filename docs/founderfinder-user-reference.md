# FounderFinder User Reference Guide

## 1) Value Proposition

FounderFinder gives venture teams a single operating system for:

- discovering exceptional technical founders quickly
- evaluating founder quality with evidence-first scoring (EEA)
- moving candidates into concept matching, engagement, and investment workflows
- running the Build OS loop from idea to shipped product

## 2) End-to-End Walkthrough

1. Open **Settings** and verify Exa + Parallel + Harmonic integrations.
2. Run **Founder Finder** to source and enrich candidates.
3. Review EEA tiers and false-positive flags.
4. Import high-priority candidates into **Talent Pool**.
5. Connect candidates to active ideas in **Concepts** and **Matching**.
6. Track outreach in **Engagements**.
7. Progress qualified candidates through **Residencies** and **Investment**.
8. Use **Build OS** to execute selected ideas through exploration, PRD, TDD, build loop, and manual polish.

## 3) Feature Reference

- **Overview**: workspace status snapshot.
- **Founder Finder**: Exa + Parallel sourcing and enrichment pipeline.
- **EEA Signals**: tier definitions and false-positive controls.
- **Talent Pool**: canonical candidate records.
- **Concepts**: venture concept management.
- **Matching**: founder-concept fit workflows.
- **Intelligence**: provider-backed research runs.
- **Engagements**: outreach tracking.
- **Residencies**: relationship progression.
- **Investment**: structured evaluation workflow.
- **Build OS**: fixed Eli process from idea to shipped/parked.
- **Events / DL.AI Strategy**: event-led and channel strategy operating tabs.

## 4) Best Practices

- Run a weekly sourcing cadence.
- Use EEA tier as the first-pass decision filter.
- Capture metadata and source channel for every imported person.
- Treat Build OS stage gates as strict quality controls.
- Always close projects as `shipped` or `parked`.

## 5) Use-Case Examples

- **Weekly Partner Sourcing**: run founder search, import Tier 1, schedule outreach.
- **Studio Operator Matching**: map top candidates to active concepts.
- **EIR Conversion**: track movement from discovery to residency to investment review.
- **Internal Product Execution**: use Build OS to run idea-to-deploy cycles.
- **Event-Driven Pipeline**: use events as top-of-funnel, then score and route attendees.

## 6) Lever-Specific Automation Guidelines

### Intake Workflow

- Prefer recurring Lever exports in `candidates_by_origin` schema.
- Preserve source metadata: posting, department, stage, and import timestamp.
- Normalize LinkedIn/GitHub URLs before import to improve dedupe quality.

### Auto-Identification Rules for Strong Applicants

- Auto-prioritize candidates with 2+ strong technical signals.
- Auto-prioritize candidates with founder + technical builder evidence.
- Auto-hold profiles with weak verifiable signals or missing public proof.
- Apply false-positive penalty rules before final routing.

### Previous Applicant Resurfacing Rules

- Re-evaluate candidates after 6-12 months if new signals are present.
- Re-open candidates who show role progression (e.g., Staff/Principal growth).
- Re-open candidates with new launches, stronger OSS metrics, or fresh publications.
- Do not resurface candidates with prior hard disqualifier reasons.

### Suggested Routing Formula

```text
lever_signal_score = technical_signals + founder_signals + recency_bonus - false_positive_penalty

score >= 80   -> Priority Outreach
score 60-79   -> Operator Review
score 40-59   -> Nurture / Recheck
score < 40    -> Archive
```

### Weekly Lever Operating Loop

1. Import latest Lever export.
2. Run duplicate merge pass by email + normalized profile links.
3. Review all Priority Outreach records.
4. Trigger outreach and update engagement status.
5. Re-scan prior applicants for new high-signal changes.

## 7) Shareable Product Description

### Short

FounderFinder helps venture teams find and evaluate exceptional technical founders faster by combining AI sourcing, evidence-based scoring, and integrated execution workflows.

### Long

FounderFinder is a venture creation operating system. It sources high-potential technical founders from the web, scores them using an Evidence of Exceptional Ability framework, and keeps sourcing, matching, engagement, and build workflows in one workspace. Teams use it to run repeatable pipeline cycles and move ideas to shipped products with higher quality and speed.

## 8) QA Swarm Runbook

### GitHub (recommended)

1. Open **Actions** → **QA Swarm**.
2. Click **Run workflow** on `main`.
3. Wait for completion of:
   - lint
   - test
   - build
   - Build OS smoke (core)
   - Build OS smoke (full flow)
   - Lever preview sync smoke (if Lever secrets are set)

### Local (manual fallback)

```bash
npm run lint
npm run test
npm run build
npm run smoke:build-os
npm run smoke:build-os:full
LEVER_SYNC_MODE=preview npm run sync:lever
```

## 9) Detailed Tab Playbook

### Settings

- Confirm Exa key (`configured=true`) before running Founder Finder.
- Confirm Parallel key to enable enrichment and outreach hook generation.
- Confirm Harmonic key for deep company/person research from Intelligence flows.

### Founder Finder

- Run `Find Founders`.
- Wait for source + score + enrich completion.
- Use Tier filters and Bay Area/B2B filters before import.
- Import Tier 1 in batch, then manually review Tier 2.

### Talent Pool

- Use as the canonical profile record.
- Merge duplicates by normalized LinkedIn/GitHub and name+company.
- Keep source metadata (`founder-finder`, `lever`, `events`) for attribution.

### Concepts + Matching

- Keep concept problem statements updated before matching.
- Link imported people to active concepts within 24h of sourcing.
- Capture match rationale in notes for future review consistency.

### Engagements

- Track each outreach touchpoint and response status.
- Capture follow-up date in every open engagement.
- Archive stale threads with explicit reason.

### Residencies + Investment

- Promote only candidates with clear evidence + concept alignment.
- Keep decision notes structured: thesis, risks, open questions, next action.

### Build OS

- Treat stage exit gates as strict.
- Keep PRD/TDD as living artifacts.
- Mark projects `shipped` or `parked` to close loop.

## 10) Role-Based Operating Cadence

### Partner (30-45 min weekly)

1. Review Tier 1 imports.
2. Approve outreach priority list.
3. Confirm residency/investment promotions.

### Operator (3x per week)

1. Run Founder Finder.
2. Triage Tier 2 and import qualified profiles.
3. Update matching + engagement states.

### Recruiter / ATS Ops (weekly)

1. Sync Lever export.
2. Resolve dedupe and missing metadata.
3. Resurface previous applicants crossing thresholds.

### Builder / Product Lead (daily)

1. Progress Build OS artifacts.
2. Update checklist gates.
3. Record QA and polish outcomes.

## 11) Troubleshooting and Access

### Error: `Failed to send a request to the Edge Function`

1. Confirm user is logged into FounderFinder project (not SourceKit).
2. Confirm Exa integration is configured in Settings.
3. Confirm functions are deployed:
   - `founder-source`
   - `founder-enrich`
4. Retry `Find Founders` after hard refresh.

### No password for FounderFinder

1. Open FounderFinder login page.
2. Use password reset for `mike@aifund.ai` in the FounderFinder Supabase project.
3. Set new password.
4. Sign in and verify membership access.

### GitHub Actions usage errors

- Do not use angle brackets in commands.
- Correct format:

```bash
gh run watch 23031335682
gh run view 23031335682 --log-failed
```

## 12) New User Onboarding Checklist

1. Account login works and app membership is active.
2. Exa + Parallel integrations show as configured.
3. Run one Founder Finder search successfully.
4. Import at least one candidate into Talent Pool.
5. Link one candidate to a concept in Matching.
6. Create one engagement record and status update.
7. Open Build OS and create one project with seeded artifacts.
