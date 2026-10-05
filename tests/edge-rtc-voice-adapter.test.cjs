const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const src = fs.readFileSync("src/edge-rtc-voice-adapter.js", "utf8");

test("RTC voice adapter preserves authority split", () => {
  assert.match(src, /UPSTREAM_AGENT_LEE_RUNTIME/);
  assert.match(src, /4citeB4U\/LeeWay-Voice-Fabric/);
  assert.match(src, /invalidate-stale-speech/);
  assert.match(src, /do not maintain divergent copies/);
});
