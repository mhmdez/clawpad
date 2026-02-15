import test from "node:test";
import assert from "node:assert/strict";

import { computeAppendDelta } from "@/lib/chat/stream-delta";

test("computeAppendDelta handles cumulative payloads", () => {
  const delta = computeAppendDelta("Hello", "Hello world");
  assert.equal(delta, " world");
});

test("computeAppendDelta handles chunk payloads", () => {
  const delta = computeAppendDelta("Hello ", "world");
  assert.equal(delta, "world");
});

test("computeAppendDelta handles overlap payloads", () => {
  const delta = computeAppendDelta("abcde", "cdefg");
  assert.equal(delta, "fg");
});

test("computeAppendDelta drops duplicate trailing chunk", () => {
  const delta = computeAppendDelta("Three research agents running. Now", "Now");
  assert.equal(delta, "");
});

test("computeAppendDelta avoids repeated text when stream mode switches", () => {
  let emitted = "";
  const chunks = [
    "Let me start:",
    "Three research agents running. Now",
    "Let me start:Three research agents running. Now I have the recordings interface.",
  ];

  for (const incoming of chunks) {
    const delta = computeAppendDelta(emitted, incoming);
    emitted += delta;
  }

  assert.equal(
    emitted,
    "Let me start:Three research agents running. Now I have the recordings interface.",
  );
  assert.doesNotMatch(emitted, /NowNow/);
});
