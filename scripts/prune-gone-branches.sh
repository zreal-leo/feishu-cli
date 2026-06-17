#!/usr/bin/env sh
set -eu

remote="${1:-origin}"

printf 'Fetching %s and pruning stale remote-tracking refs...\n' "$remote"
git fetch "$remote" --prune

current=$(git branch --show-current)
deleted=0
skipped=0

gone_branches=$(git branch -vv | grep ': gone]' | awk '{print $1}' | sed 's/^\* //' || true)

if [ -z "$gone_branches" ]; then
    printf 'No stale local branches found.\n'
    exit 0
fi

for branch in $gone_branches; do
    case "$branch" in
        main | master | "$current")
            printf 'Skip protected branch: %s\n' "$branch"
            skipped=$((skipped + 1))
            ;;
        *)
            printf 'Delete local branch: %s\n' "$branch"
            if git branch -d "$branch"; then
                deleted=$((deleted + 1))
            else
                printf '  skip (not fully merged); force with: git branch -D %s\n' "$branch"
                skipped=$((skipped + 1))
            fi
            ;;
    esac
done

printf 'Done. Deleted: %d, skipped: %d\n' "$deleted" "$skipped"
