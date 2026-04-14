# Claude Development Guidelines

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

- **Run `npm run playwright:fix`** if you see "Browser is already in use" errors. Wait 2-3 seconds after running the fix, then retry.

- **Full-page screenshots are automatically optimized** - The MCP server compresses and resizes large screenshots to stay within limits.

### Troubleshooting

| Issue | Solution |
|-------|----------|
| "Browser is already in use" | Run `npm run playwright:fix`, wait 2-3 seconds |
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

*Last Updated: 2026-04-14*
