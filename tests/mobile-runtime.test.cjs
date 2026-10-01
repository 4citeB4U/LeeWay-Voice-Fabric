const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'mobile.html'),'utf8');
const runtime=fs.readFileSync(path.join(root,'src','mobile-runtime.js'),'utf8');

test('mobile bridge binds only canonical Agent Lee Voice One',()=>{
  assert.match(runtime,/VOICE_PACKAGE_ID='agent-lee-voice-one'/);
  assert.match(runtime,/selectVoice\(VOICE_PACKAGE_ID\)/);
  assert.match(runtime,/prepare\('browser-chatterbox'\)/);
  assert.doesNotMatch(runtime,/speechSynthesis|TextToSpeech|System\.Speech/i);
});

test('mobile bridge exposes native WebView boundary and explicit completion events',()=>{
  assert.match(runtime,/LeeWayAndroidVoice/);
  assert.match(runtime,/LeeWayMobileVoice=/);
  assert.match(runtime,/voice\.engine\.ready/);
  assert.match(runtime,/voice\.speak\.complete/);
  assert.match(html,/src\/mobile-runtime\.js/);
});
