const fs=require('node:fs');
const assert=require('node:assert/strict');

const html=fs.readFileSync('android-bridge.html','utf8');
const js=fs.readFileSync('src/android-bridge.js','utf8');

assert.match(html,/src\/browser-voice\.js/);
assert.match(html,/src\/speech-pipeline\.js/);
assert.match(html,/src\/android-bridge\.js/);
assert.match(js,/agent-lee-voice-one/);
assert.match(js,/voiceRegistry\.get/);
assert.match(js,/voiceRegistry\.audio/);
assert.match(js,/LeeWayBrowserVoice/);
assert.match(js,/LeeWayPocketNative/);
assert.match(js,/onSpeakComplete/);
assert.match(js,/LeeWaySpeechStream/);
assert.match(js,/streamStart/);
assert.match(js,/streamChunk/);
assert.match(js,/streamEnd/);
assert.match(js,/onRendered/);
assert.match(js,/VOICE_STREAM_READY/);
assert.doesNotMatch(js,/speechSynthesis/);
assert.doesNotMatch(js,/TextToSpeech/);

console.log('PASS Android WebView Voice One streaming bridge source contract');
