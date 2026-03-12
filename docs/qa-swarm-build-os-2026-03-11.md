# Build OS QA Swarm Report (2026-03-11)

## Scope
- Target: FounderFinder Build OS v1 in production
- URL: https://founder-finder-mu.vercel.app
- Branch baseline: `origin/main`

## Commands Run
```bash
npm run lint
```
```bash
npm run build
```
```bash
npm run test
```
```bash
SMOKE_SUPABASE_REFRESH_TOKEN=*** npm run smoke:build-os
```
```bash
SMOKE_SUPABASE_REFRESH_TOKEN=*** npm run smoke:build-os:full
```
```bash
gh run list --workflow "Deploy And Smoke" --limit 3 --json databaseId,conclusion,status,headBranch,event,url
```

## Results
- `npm run lint`: **FAILED**
- `npm run build`: **PASSED**
- `npm run test`: **FAILED** (2 failing tests)
- `npm run smoke:build-os`: **PASSED**
- `npm run smoke:build-os:full`: **PASSED**
- Latest deploy pipeline: **PASSED** (`run 22980409332`)

## Findings

### P1 - Lint failures block clean CI quality gate
- `src/components/ai-fund/EEASignalsTab.tsx`
  - `_workspace` unused
- `src/components/ai-fund/EventsTab.tsx`
  - `_workspace` unused
- `src/components/ai-fund/FindFoundersTab.tsx`
  - `RefreshCw` unused
  - `Plus` unused
  - `react-hooks/preserve-manual-memoization` error in `runPipeline` callback
- `src/components/ai-fund/FounderFinderTab.tsx`
  - `taskGroupId` assigned but unused
- `src/components/ai-fund/StrategyTab.tsx`
  - `CheckCircle2` unused
  - `BarChart3` unused
  - `MessageSquare` unused
  - `_workspace` unused
- `supabase/functions/founder-source/index.ts`
  - `SearchCriteria` unused

### P1 - Unit test regressions in EEA scoring
- `src/lib/__tests__/eea-scorer.test.ts`
  - `detects Ex-FAANG Senior+` failing
  - `Ex-FAANG Senior+ requires combination (alone doesn't count)` failing

## End-to-End Build OS Validation
- Auth session bootstrap: pass
- Build OS tab load: pass
- New project creation: pass
- Stage progression: pass
  - `explore -> prd_research -> tdd_review -> build_loop -> manual_polish`
- Stage gates verified: pass
  - research checklist required
  - open engineering questions required
  - spec passes QA required
  - shipped/parked status required to finish
- Final completion state: pass (`manual_polish` completed with project status `shipped`)

## CI/CD Verification
- Workflow: `Deploy And Smoke`
- Passing run: https://github.com/mrNLK/FounderFinder/actions/runs/22980409332
- Status: success

## Recommendation
- Fix current lint/test failures before treating QA as fully green.
- Keep full smoke test as a required post-deploy verification step.
