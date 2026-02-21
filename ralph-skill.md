# Ralph: PRD-Driven Autonomous Development

Ralph is an autonomous implementation loop. It reads `ralph/prd.json`, picks the highest-priority incomplete story, implements it, runs quality checks, commits, and marks it done. This repeats until all stories are complete.

## prd.json Format

The PRD lives at `ralph/prd.json`:

```json
{
  "project": "Project Name",
  "branchName": "ralph/feature-name",
  "description": "Brief project description",
  "userStories": [
    {
      "id": "US-001",
      "title": "Story Title",
      "description": "Detailed description of what to implement",
      "priority": 1,
      "acceptanceCriteria": [
        "Criterion 1",
        "Criterion 2"
      ],
      "passes": false,
      "notes": ""
    }
  ]
}
```

## Story Rules

1. **IDs** use format `US-NNN` where NNN is zero-padded sequential (US-001, US-002, …)
2. **Priority** is numeric, 1 = highest
3. Always work on the highest-priority story where `passes` is `false`
4. Set `passes` to `true` and add a brief implementation note in `notes` when done
5. Each story must be independently implementable in a single iteration
6. If you cannot describe the change in 2-3 sentences, it is too big — split it

## Dependency Ordering

When creating stories from a PRD:
- Schema/infrastructure changes first
- Backend/API changes second
- UI/frontend changes third
- Integration/aggregation views last

## Acceptance Criteria Rules

- Every story MUST include "Typecheck passes" as a criterion
- UI stories MUST include browser/visual verification criteria
- All criteria must be concretely verifiable (no vague "works correctly")
- Write criteria as if for a junior developer

## Converting Markdown PRD to prd.json

When asked to convert a markdown PRD document:
1. Archive any existing `ralph/prd.json` first
2. Extract each feature/requirement as a story
3. Assign priorities based on dependency order
4. Write specific, verifiable acceptance criteria
5. Confirm each story fits a single iteration
6. Set all `passes` to `false`, all `notes` to `""`

## Completion Signal

When ALL userStories have `passes: true`, output exactly:
```
<promise>COMPLETE</promise>
```
