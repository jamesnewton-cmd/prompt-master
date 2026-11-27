# Prompt Master

A Claude Code mod that helps you write better prompts.

- **Live score**: your prompt is scored 0–100 as you type (and again when you send it) on six checks (clear goal, enough detail, specifics, context, constraints, what "done" looks like). A band above the prompt box shows the score and the top tip; the status line shows it too.
- **Ask before sending**: when a prompt scores below 45, Prompt Master holds it and asks "Improve it before sending?". Pick **Improve it first** and the rewrite lands in your prompt box, unsent, so you can edit it and press Enter to approve it. Pick **Send as is** and your original goes through. Prompts at or above the threshold, and slash commands, are never held. `/pm-gate off` turns the check off, `/pm-gate on` turns it back on, and `/pm-gate 60` changes the threshold. The setting persists across sessions.
- **Improve**: `/pm-improve [rough prompt]` (or the "Improve my draft" button) rewrites a rough request into a strong prompt and drops it in your prompt box to edit.
- **Library**: `/pm-save <name> [text]` saves a prompt (the last one you sent if no text), `/pm-use <name>` loads it, `/pm-list`, `/pm-delete <name>`. Saved prompts persist across sessions.
- **Pane**: `/pm` opens the Prompt Master pane with the score breakdown, improve buttons and your library.

Scoring is local and never changes what you send: a held prompt is either sent as you typed it or replaced only by a rewrite you approve. Improving uses one small model call through your session.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install prompt-master --marketplace jamesnewton-cmd/prompt-master
```

Answer `y` to add the marketplace, then pick a scope (user scope loads it in every session).

From a shell:

```bash
claude plugin install prompt-master --marketplace jamesnewton-cmd/prompt-master
```

In the desktop app: click + next to the prompt box, then Plugins, Add marketplace with `jamesnewton-cmd/prompt-master`, then Add plugin.
