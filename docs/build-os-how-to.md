# Build OS How-To Guide

## 1. Start a Build OS Project
1. Open `FounderFinder`.
2. Click `Build OS`.
3. In `New Project`, fill:
   - `Idea or product name`
   - `Problem statement`
   - `Target user`
   - Optional linked concept
4. Click `Create Build Project`.

## 2. Work the 5-Stage Eli Workflow

### Stage 1: Explore
- Update `Experiment Log`.
- Required to advance:
  - Experiment log not empty
  - Problem statement not empty
- Click `Advance Stage`.

### Stage 2: PRD + Research
- Update:
  - `PRD`
  - `Market Signals`
- Required to advance:
  - Both docs non-empty
  - Checklist item `Research pass captured competitive context and market signals` checked
- Click `Advance Stage`.

### Stage 3: TDD Review
- Update:
  - `TDD`
  - `Engineering Questions`
- Required to advance:
  - `TDD` non-empty
  - Checklist item `Open engineering questions are resolved or explicitly parked` checked
- Click `Advance Stage`.

### Stage 4: Build Loop
- Update:
  - `Implementation Notes`
  - `QA Notes`
- Fill project `Deploy URL`.
- Required to advance:
  - Both docs non-empty
  - Deploy URL present
  - Checklist item `Closed-loop QA passed against the current spec` checked
- Click `Advance Stage`.

### Stage 5: Manual Polish
- Update:
  - `Manual Test Notes`
  - `Polish Backlog`
- Set project `Status` to `Shipped` or `Parked`.
- Required to finish:
  - Manual test notes non-empty
  - Status is `Shipped` or `Parked`
  - Checklist item `Manual testing identified the remaining polish or sign-off items` checked
- Click `Finish Project`.

## 3. Use Prompt Packets
1. Select the stage.
2. Review the generated `Prompt Packet`.
3. Click `Copy`.
4. Run the packet in Claude Code.

## 4. Run Smoke Tests
```bash
SMOKE_SUPABASE_REFRESH_TOKEN=your_refresh_token npm run smoke:build-os
```
```bash
SMOKE_SUPABASE_REFRESH_TOKEN=your_refresh_token npm run smoke:build-os:full
```

## 5. Deploy + Validate
```bash
npx vercel deploy --prod --yes
```
```bash
gh workflow run "Deploy And Smoke" --ref main
```
```bash
gh run list --workflow "Deploy And Smoke" --limit 5
```

## 6. Troubleshooting
- `Stage gate failed`
  - Check required artifacts and checklist item for that stage.
- `Finish Project` blocked
  - Set status to `Shipped` or `Parked`.
- `Smoke login failed`
  - Refresh `SMOKE_SUPABASE_REFRESH_TOKEN` from the browser session.
