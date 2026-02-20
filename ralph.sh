#!/bin/sh
# ralph - autonomous Claude Code loop for PRD-driven development
# Reads prd.json, picks highest-priority incomplete story, implements, tests, commits.
# Repeats until all stories are complete or max iterations reached.
#
# Usage: ralph [max_iterations]
#   max_iterations  defaults to $RALPH_MAX_ITERATIONS or 10
set -e

MAX_ITER="${1:-${RALPH_MAX_ITERATIONS:-10}}"
ITER=0

PROMPT='Read prd.json in the current directory. Find the highest-priority story with status "pending". Set its status to "in_progress" and save prd.json. Then implement the story fully: write the code, run any available tests, typecheck, and linting. Commit your changes with a message referencing the story ID. Finally, update prd.json to set the story status to "complete" and commit that change too. If ALL stories already have status "complete", output exactly <promise>COMPLETE</promise> and do nothing else.'

echo "ralph: starting (max $MAX_ITER iterations)"
echo ""

while [ "$ITER" -lt "$MAX_ITER" ]; do
    ITER=$((ITER + 1))
    echo "========================================="
    echo "ralph: iteration $ITER/$MAX_ITER"
    echo "========================================="
    echo ""

    OUTPUT=$(claude --dangerously-skip-permissions --print "$PROMPT" 2>&1) || true

    echo "$OUTPUT"

    if echo "$OUTPUT" | grep -q '<promise>COMPLETE</promise>'; then
        echo ""
        echo "ralph: all stories complete!"
        exit 0
    fi

    echo ""
    sleep 2
done

echo "ralph: max iterations ($MAX_ITER) reached without completing all stories"
echo "ralph: check prd.json and progress.txt for status"
exit 1
