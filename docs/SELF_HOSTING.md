# ClawPad Cloud — Self Hosting Guide

You can run the entire ClawPad Cloud stack (UI + Relay) on your own infrastructure.

## 1. Prerequisites
-   Node.js 18+
-   A server with a public IP (VPS) or a PaaS (Railway/Heroku/Vercel).
-   GitHub OAuth App credentials (for authentication).

## 2. The Relay Server
This is the WebSocket tunnel that connects your local agent to the internet.

```bash
cd packages/relay
npm install
node server.js
```

**Environment Variables:**
-   `PORT`: Default 8080.

## 3. The Cloud UI
This is the Next.js application (`apps/web`).

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Start
pnpm start
```

**Environment Variables:**
-   `NEXTAUTH_URL`: Your deployed URL (e.g., `https://my-clawpad.com`).
-   `NEXTAUTH_SECRET`: Generate with `openssl rand -base64 32`.
-   `GITHUB_ID` / `GITHUB_SECRET`: From GitHub Developer Settings.
-   `CLAWPAD_RELAY_URL`: The WebSocket URL of your relay (e.g., `wss://relay.my-clawpad.com`).

## 4. Connecting Your Agent
Once your stack is running, log in to your Cloud UI to get your **Relay Token**.

Then run locally:
```bash
clawpad share --token=YOUR_TOKEN --relay-url=wss://relay.my-clawpad.com
```
