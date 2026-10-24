/*
LEEWAY HEADER — DO NOT REMOVE
REGION: VOICE.STUDIO.DUPLEX_ADAPTER
TAG: EXISTING_UI_LAZY_VOICE_ENGINE
WHO: LeeWay Industries; WHAT: lazy Edge RTC backend in existing Studio
WHY: no replacement UI, no unrequested microphone permissions
WHERE: Studio ecosystem rack; WHEN: 2026-10-24
HOW: explicit click embeds local Voice Fabric endpoint.
AUTHORITY: experimental localhost; LICENSE: existing terms.
*/
const button=document.getElementById('duplexVoiceOpen');
const frame=document.getElementById('duplexVoiceFrame');
const status=document.getElementById('duplexVoiceStatus');
button?.addEventListener('click',()=>{
 if(!frame||!status)return;
 frame.src='http://127.0.0.1:5173/LeeWay-Edge-RTC/conversation-gate.html';
 frame.hidden=false;
 status.textContent='Engine opened. Readiness and audible duplex remain separate checks.';
 button.disabled=true;
});
