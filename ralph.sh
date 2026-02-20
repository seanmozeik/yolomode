#!/bin/sh
# ralph - autonomous PRD-driven development loop
# Reads prd.json, picks highest-priority incomplete story, implements, tests, commits.
# Repeats until all stories are complete or max iterations reached.
#
# Usage: ralph <claude|codex> [max_iterations] [-- <agent args...>]
#   max_iterations defaults to $RALPH_MAX_ITERATIONS or 10
set -e

AGENT="$1"
if [ -z "$AGENT" ] || { [ "$AGENT" != "claude" ] && [ "$AGENT" != "codex" ]; }; then
    echo "usage: ralph <claude|codex> [max_iterations] [-- <agent args...>]" >&2
    exit 1
fi
shift

MAX_ITER="${RALPH_MAX_ITERATIONS:-10}"
if [ "${1:-}" = "--max-iterations" ]; then
    shift
    if [ -z "${1:-}" ]; then
        echo "error: --max-iterations requires a value" >&2
        exit 1
    fi
    MAX_ITER="$1"
    shift
elif [ -n "${1:-}" ] && [ "$1" != "--" ]; then
    MAX_ITER="$1"
    shift
fi

if ! echo "$MAX_ITER" | grep -Eq '^[1-9][0-9]*$'; then
    echo "error: max iterations must be a positive integer" >&2
    exit 1
fi

if [ "${1:-}" = "--" ]; then
    shift
fi

ITER=0
PROMPT='Read prd.json in the current directory. Find the highest-priority story with status "pending". Set its status to "in_progress" and save prd.json. Then implement the story fully: write the code, run any available tests, typecheck, and linting. Commit your changes with a message referencing the story ID. Finally, update prd.json to set the story status to "complete" and commit that change too. If ALL stories already have status "complete", output exactly <promise>COMPLETE</promise> and do nothing else.'

echo "ralph: starting with $AGENT (max $MAX_ITER iterations)"
echo ""

while [ "$ITER" -lt "$MAX_ITER" ]; do
    ITER=$((ITER + 1))
    echo "========================================="
    echo "ralph: iteration $ITER/$MAX_ITER"
    echo "========================================="
    echo ""

    if [ "$AGENT" = "claude" ]; then
        OUTPUT=$(claude --dangerously-skip-permissions --print "$@" "$PROMPT" 2>&1) || true
    else
        OUTPUT=$(codex exec --dangerously-bypass-approvals-and-sandbox "$@" "$PROMPT" 2>&1) || true
    fi

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
