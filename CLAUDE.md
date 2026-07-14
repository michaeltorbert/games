@AGENTS.md

# Claude-specific instructions

Shared repository facts, architecture, testing requirements, and identity
constants are imported from `AGENTS.md`. This file contains only the direct
Claude delta.

## GitHub writes

Before the first write in a session, verify both the target repository and the
configured app identity:

```bash
origin="$(git remote get-url origin)"
case "$origin" in
  git@github.com:michaeltorbert/games.git|https://github.com/michaeltorbert/games.git) ;;
  *) echo "Unexpected origin: $origin" >&2; exit 1 ;;
esac
test "$(github-app-token claude --app | jq -r '.slug')" = "claude-bot-mt"
```

Then use `github-app-curl --profile claude`. After every issue comment, PR
comment, review, label, merge, or other write, verify the live object reports
`claude-bot-mt[bot]`. Binary presence alone is not identity verification.

If `github-app-token`, the `claude` profile, or live actor verification is
unavailable, stop. Do not fall back to `gh`, a connector, or the user's identity.

When Claude implements a PR, put `<!-- ai-author: claude -->` in the PR body,
even if Codex opens it or the repository's shared commit identity is used.

## Review independence

Claude-authored changes require Codex review. Do not run the Claude PR-review
helper against an implementation marked `ai-author: claude`, and do not
describe a second Claude pass as independent consensus.
