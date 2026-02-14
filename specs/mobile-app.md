# ClawPad Mobile App — Specification

**Goal:** Native iOS/Android wrapper for ClawPad Cloud.
**Tech:** Capacitor + Next.js (Existing codebase).

## 1. Strategy
We will not rewrite the app. We will wrap the existing Responsive Web App using **Capacitor**.
This gives us:
-   Native Home Screen Icon.
-   Push Notifications (Future).
-   App Store Presence (Discovery).

## 2. Implementation Plan

### Phase 1: Capacitor Integration
1.  Install Capacitor in the `clawpad` root.
    ```bash
    npm install @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
    npx cap init ClawPad com.clawpad.app
    ```
2.  Configure `capacitor.config.ts` to point to the production Cloud URL (`app.clawpad.io`) for the "Live" version, OR bundle the static export for offline-first (but Cloud requires online anyway).
    *   *Decision:* We will use a **Hybrid App**. The shell loads, then loads the Cloud UI webview.

### Phase 2: Native Features
1.  **Haptics:** Add tactile feedback when AI completes a task.
2.  **Notifications:** Notify user when a long-running agent task finishes.

### Phase 3: Biometrics
1.  Use FaceID/TouchID to unlock the app instead of typing GitHub passwords repeatedly.

## 3. Timeline
-   **Draft:** Done (This spec).
-   **Prototype:** Can be built in ~2 hours once the Cloud URL is stable.
