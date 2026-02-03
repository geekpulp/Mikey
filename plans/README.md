# Plans

This folder contains the PRD (Product Requirements Document) that Ralph uses to guide the AI agent.

## Files

| File | Purpose |
|------|---------|
| `prd.json` | Default PRD — your work items |
| `prd-<name>.json` | Optional per-prompt PRDs |

## `prd.json` Format

A JSON array of work items:

```json
[
  {
    "id": "functional-001",
    "category": "functional",
    "description": "User can send a message",
    "steps": ["Open chat", "Type message", "Click Send", "Verify it appears"],
    "status": "not-started",
    "passes": false
  }
]
```

| Field | Description |
|-------|-------------|
| `id` | Unique identifier (format: `category-XXX`) |
| `category` | `"functional"`, `"ui"`, `"setup"`, `"git"`, `"agent"`, or custom |
| `description` | One-line requirement |
| `steps` | How to verify it works (can be strings or objects with `text` and `completed`) |
| `status` | `"not-started"`, `"in-progress"`, `"in-review"`, or `"completed"` |
| `passes` | `false` → `true` when verified complete |

## Best Practices

- **Keep items small** — one feature per agent iteration
- **Be specific** — clear acceptance criteria help the agent
- **Use unique IDs** — format as `category-XXX` (e.g., `ui-001`, `functional-002`)
- **Start with `status: "not-started"`** — update to `in-progress` when working
- **Start with `passes: false`** — the agent flips it to `true` when verified
- **Order by priority** — agent picks from the top

## Per-Prompt PRDs

Use `--prd` to specify a different PRD file:

```bash
./ralph.sh --prd plans/prd-wordpress.json --prompt prompts/wp.txt --allow-profile safe 10
```

## Example Only

The included `prd.json` is a template (chat-app stories). Replace with your own requirements.
