const test = require("node:test");
const assert = require("node:assert/strict");

const { parseSegments, skipTarget, videoIdFromUrl } = require("../shared/sponsor.js");

test("youtube video ids come from watch, shorts, and short links", () => {
  assert.equal(videoIdFromUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(videoIdFromUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(videoIdFromUrl("https://youtu.be/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(videoIdFromUrl("https://www.youtube.com/feed/subscriptions"), null);
  assert.equal(videoIdFromUrl("https://example.com/watch?v=dQw4w9WgXcQ"), null);
});

test("playback skips a sponsor segment and ignores a segment that covers the video", () => {
  const segments = parseSegments([{ segment: [12, 20] }, { segment: [20, 25] }, { segment: [0, 5000] }]);
  assert.equal(skipTarget(segments, 5, 600), null);
  assert.equal(skipTarget(segments, 12, 600), 25);
  assert.equal(skipTarget(segments, 24, 600), 25);
  assert.equal(skipTarget([[0, 5000]], 1, 600), null);
});
