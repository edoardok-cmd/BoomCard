# Claude Development Guidelines

## 🚨 CRITICAL: Never Kill Browser Processes

**NEVER run `pkill`, `kill`, or any command targeting `chrome`, `chromium`, or `playwright` processes.**

This machine runs multiple Claude agents in parallel. A system-wide `pkill -f chrome` or `pkill -f playwright` will instantly kill every other agent's browser session.

**If you see "Browser is already in use":** just retry the MCP tool. Each agent has its own isolated browser via `--isolated` mode — there is nothing to fix.

Forbidden commands (never run these):
```
pkill -f chrome
pkill -f playwright
pkill -9 -f chrome
kill $(lsof ...)   # targeting chrome/playwright
rm -f .../mcp-chrome*/.lock
```

---

## Playwright MCP Usage (Visual Testing)

When working on frontend, design, UI/UX, or visual components, use Playwright MCP tools for visual validation.

### Quick Start

1. **Start the dev server:**
   ```bash
   npm run dev
   ```

2. **Ask Claude to navigate:**
   ```
   Navigate to http://localhost:3000
   ```

3. **Take a screenshot:**
   ```
   Take a screenshot of the current page
   ```

4. **Take a full-page screenshot:**
   ```
   Take a full-page screenshot of the current page
   ```

5. **Check for console errors:**
   ```
   Check the console for any errors
   ```

### MCP Commands Reference

```javascript
// Navigate to a page
mcp__playwright__browser_navigate("http://localhost:3000")

// Viewport screenshot (captures visible area)
mcp__playwright__browser_screenshot()

// Full-page screenshot (captures entire scrollable page)
mcp__playwright__browser_screenshot({ fullPage: true })

// Element screenshot (captures specific element)
mcp__playwright__browser_screenshot({ element: "main", ref: "element_ref" })

// Check console messages
mcp__playwright__browser_console_messages()
```

### Important Reminders

- **Take ONE screenshot at a time** - Wait for Claude to process before requesting another screenshot. Multiple screenshots in quick succession can overwhelm Claude's context.

- **Video is DISABLED** - This is intentional to prevent hitting Claude's context limits. Don't expect video recordings.

- **"Browser is already in use"** — just retry the MCP tool. Each agent runs an isolated browser via `--isolated` mode; do NOT run `pkill`, `kill`, or any command targeting `chrome` or `playwright` processes — this will destroy other agents' sessions running in parallel.

- **Full-page screenshots are automatically optimized** - The MCP server compresses and resizes large screenshots to stay within limits.

### Troubleshooting

| Issue | Solution |
|-------|----------|
| "Browser is already in use" | Retry the MCP tool — do NOT run pkill or kill commands |
| Screenshot too large | Automatically handled by optimizer |
| Tools not responding | Restart Claude Desktop |
| Dev server not running | Run `npm run dev` first |

### Visual Validation Workflow

**Before making changes:**
1. Navigate to affected pages
2. Take baseline screenshots
3. Check console for existing errors

**After making changes:**
1. Refresh the page
2. Take new screenshots
3. Compare with baseline
4. Check for new console errors

### Best Practices

- Use viewport screenshots for quick checks
- Use full-page screenshots to capture entire page content
- Use element screenshots for specific components
- Always check console for JavaScript errors
- Close browser sessions when done

---

## Workflow Orchestration

### 1. Plan Mode Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately — don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop
- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant context

### 4. Verification Before Done
- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes — don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests — then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

---

## Task Management

1. **Plan First**: Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Explain Changes**: High-level summary at each step
5. **Document Results**: Add review section to `tasks/todo.md`
6. **Capture Lessons**: Update `tasks/lessons.md` after corrections

---

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Minimal code impact.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.

---

## Session Protocol

### Handover Prompt
- **End every session with a kickoff prompt** — before closing out, provide a concise prompt the user can paste at the start of the next session to restore context quickly.
- Format the prompt as a markdown code block so VSCode shows a copy icon
- Keep it focused: key files/PRs touched, current state, next steps (2-3 sentences max)
- Example:
  ```
  Working on BoomCard partner dashboard. Just added CORS fix for production domains. Next: test payment flow integration with Paysera.
  ```

---

*Last Updated: 2026-04-15*
