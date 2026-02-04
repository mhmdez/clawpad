# Spec 07: Image Upload in Chat

## Status: DONE

## Goal
Users can paste or drag images into the chat panel to send them to the agent for analysis.

## Current State
- Chat panel at `src/components/chat/chat-panel.tsx`
- Uses singleton `Chat` instance with `useChat` from `@ai-sdk/react`
- Chat route at `src/app/api/chat/route.ts` — posts to gateway `/v1/responses`
- Gateway OpenResponses API supports multi-part input including images

## Tasks

### 7.1 — Image paste handler
Detect image paste (Cmd+V with image data) in the chat textarea.

**Implementation:**
- Listen for `paste` event on the textarea/chat container
- Check `clipboardData.items` for image types
- Convert to base64 data URL
- Show image preview in the input area before sending
- Store pending images in state

**Files:** `src/components/chat/chat-panel.tsx`

### 7.2 — Drag and drop support
Allow dragging images into the chat panel.

**Implementation:**
- Add drag-over visual indicator (dashed border, overlay)
- Handle `drop` event for image files
- Same flow as paste: preview → send

**Files:** `src/components/chat/chat-panel.tsx`

### 7.3 — File picker button
Add a paperclip/image icon button next to the send button.

**Implementation:**
- Hidden file input with `accept="image/*"`
- Click handler opens file picker
- Selected image goes through same preview → send flow

**Files:** `src/components/chat/chat-panel.tsx`

### 7.4 — Send images to gateway
Include images in the OpenResponses request.

**Implementation:**
The OpenResponses `/v1/responses` API accepts multi-part input:
```json
{
  "input": [
    {
      "role": "user",
      "content": [
        { "type": "input_text", "text": "What's in this image?" },
        { "type": "input_image", "image_url": "data:image/png;base64,..." }
      ]
    }
  ]
}
```

Update the chat route to handle image attachments from the request body and format them as `input_image` content parts.

**Files:** `src/app/api/chat/route.ts`, `src/components/chat/chat-panel.tsx`

### 7.5 — Image display in messages
Render images inline in chat messages (both sent and in history).

**Implementation:**
- Detect image content parts in messages
- Render with `<img>` tag, max-width constrained
- Click to open full-size in a dialog/lightbox
- Loading skeleton while image loads

**Files:** `src/components/chat/chat-panel.tsx`

## Dependencies
- Chat must be working (P1 ✅)
- Gateway must accept images (OpenResponses supports this)

## Test Criteria
- [ ] Paste image into chat shows preview
- [ ] Drag and drop image shows preview
- [ ] File picker button opens image selector
- [ ] Images sent to gateway as part of message
- [ ] Agent receives and responds to images
- [ ] Images display inline in chat history
- [ ] Image preview dismissable before sending
