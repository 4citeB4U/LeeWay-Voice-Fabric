const fs=require('node:fs');
const assert=require('node:assert/strict');

const page=fs.readFileSync('mobile-runtime.html','utf8');
const src=fs.readFileSync('src/mobile-runtime.js','utf8');

assert.match(page,/browser-voice\.js/);
assert.match(page,/speech-pipeline\.js/);
assert.match(page,/mobile-runtime\.js/);
assert.match(src,/agent-lee-voice-one/);
assert.match(src,/LeeWayMobileVoice/);
assert.match(src,/AndroidVoice/);
assert.match(src,/voiceRegistry\.get/);
assert.match(src,/voice\.speak/);
assert.doesNotMatch(src,/speechSynthesis/);

console.log('PASS Voice One mobile runtime adapter source contract');
