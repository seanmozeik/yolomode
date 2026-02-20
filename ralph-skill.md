# Ralph: PRD-Driven Autonomous Development

Ralph is an autonomous implementation loop. It reads a `prd.json` file, picks the highest-priority incomplete story, implements it, runs quality checks, commits, and marks it done. This repeats until all stories are complete.

## prd.json Format

The PRD lives at `prd.json` in the project root:

```json
{
  "name": "Project Name",
  "branchName": "ralph/feature-name",
  "description": "Brief project description",
  "stories": [
    {
      "id": "story-1",
      "title": "Story Title",
      "description": "Detailed description of what to implement",
      "priority": 1,
      "status": "pending",
      "acceptanceCriteria": [
        "Criterion 1",
        "Criterion 2"
      ]
    }
  ]
}
```

## Story Rules

1. **IDs** use format `story-N` where N is sequential
2. **Priority** is numeric, 1 = highest
3. **Status** must be: `pending`, `in_progress`, or `complete`
4. Always work on the highest-priority `pending` story
5. Set status to `in_progress` when starting, `complete` when done
6. Each story must be independently implementable in a single iteration
7. If you cannot describe the change in 2-3 sentences, it is too big — split it

## Dependency Ordering

When creating stories from a PRD:
- Database/schema changes first
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
1. Archive any existing `prd.json` first
2. Extract each feature/requirement as a story
3. Assign priorities based on dependency order
4. Write specific, verifiable acceptance criteria
5. Confirm each story fits a single iteration
6. Set all statuses to `pending`

## Completion Signal

When ALL stories have status `complete`, output exactly:
```
<promise>COMPLETE</promise>
```
