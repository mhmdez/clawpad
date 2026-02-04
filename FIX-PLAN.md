# ClawPad v2 — Fix Plan

## Priority 1: Chat Through Gateway ✅ DONE
**Goal:** Chat panel sends messages to the actual OpenClaw agent, not a stub OpenAI call.

**Approach:** Use the gateway's HTTP `/v1/responses` endpoint (OpenResponses-compatible, already enabled in Mo's config). This is simpler than WebSocket for request-response chat and supports SSE streaming.

**Tasks:**
- Rewrite `/api/chat/route.ts` to proxy to `http://127.0.0.1:18789/v1/responses`
- Read gateway URL + auth token from openclaw.json (use existing detect.ts)
- Fix auth token path (config has `gateway.auth.token`, not `gateway.token`)
- Support SSE streaming from gateway → client
- Send page context as system instructions
- Handle errors gracefully (gateway down, auth failed)

## Priority 2: Gateway WebSocket Client ✅ DONE
**Goal:** Persistent WebSocket connection for real-time events.

**Tasks:**
- Implement WS client on the server side (Next.js API route or middleware)
- Handle Protocol v3 handshake: connect.challenge → connect request → hello-ok
- Auth with `gateway.auth.token`
- Subscribe to events: agent, chat, presence, health
- Expose events to client via SSE endpoint (`/api/gateway/events`)
- Auto-reconnect on disconnect (5s delay)

## Priority 3: Real-Time Activity Feed (HIGH)
**Goal:** Show live agent activity in sidebar.

**Tasks:**
- Process gateway events (agent lifecycle, tool calls, exec, chat)
- Update activity store with structured events
- Show in sidebar: agent thinking, tool usage, file edits, sub-agents
- Status indicators: connected/thinking/active/idle
- Relative timestamps

## Priority 4: Fix Gateway Detection & Auth (HIGH)
**Goal:** Auto-detect and authenticate correctly.

**Tasks:**
- Fix detect.ts to read `gateway.auth.token` (not `gateway.token`)
- Fix gateway status check to pass auth header correctly
- Show proper connection status in UI
- Add manual token input in settings

## Priority 5: AI Writing Through Gateway (MEDIUM)
**Goal:** AI writing features use the agent, not direct OpenAI.

**Tasks:**
- Rewrite `/api/ai/write/route.ts` to route through gateway
- Use same OpenResponses endpoint with appropriate system prompts
- Remove OpenAI API key dependency

## Priority 6: Cross-Channel Chat History (MEDIUM)
**Goal:** Show chat history from all channels.

**Tasks:**
- Use gateway WS `chat.history` method to fetch history
- Display channel badges (Telegram, Web, ClawPad)
- Show unified timeline

## Priority 7: Polish (LOW)
- Image upload in chat
- Session list/switching
- QMD semantic search integration
