# Prompt Master

A Claude Code mod that helps you write better prompts.

- **Live score**: every prompt you send is scored 0–100 on six checks (clear goal, enough detail, specifics, context, constraints, what "done" looks like). A band above the prompt box shows the score and the top tip; the status line shows it too.
- **Improve**: `/pm-improve [rough prompt]` (or the "Improve my draft" button) rewrites a rough request into a strong prompt and drops it in your prompt box to edit.
- **Library**: `/pm-save <name> [text]` saves a prompt (the last one you sent if no text), `/pm-use <name>` loads it, `/pm-list`, `/pm-delete <name>`. Saved prompts persist across sessions.
- **Pane**: `/pm` opens the Prompt Master pane with the score breakdown, improve buttons and your library.

Scoring is local and never changes what you send. Improving uses one small model call through your session.

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
