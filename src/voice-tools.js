/*
LEEWAY HEADER
REGION: VOICE.FABRIC.VOICE_TOOLS
TAG: VOICE.FABRIC.MCP.TOOLS
Model-agnostic tool surface for the Voice Fabric. Each tool is a plain
{name, description, inputSchema, handler} object, which is exactly what an MCP
server (`server.tool(...)`), an OpenAI/Gemini function-calling list, or any
agent runtime needs. The host that embeds the SDK owns the transport.
*/
const MAX_TEXT=12_000;
const object=(properties={},required=[])=>({type:'object',properties,required,additionalProperties:false});

export const VOICE_TOOL_DEFINITIONS=Object.freeze([
  {name:'voice_speak',description:'Speak text aloud with the active LeeWay voice. Prepares the best voice for this device automatically and fails over visibly if a provider breaks.',
    inputSchema:object({text:{type:'string',minLength:1,maxLength:MAX_TEXT}},['text'])},
  {name:'voice_stop',description:'Stop speech immediately. Does not cancel upstream reasoning.',inputSchema:object()},
  {name:'voice_list_voices',description:'List the available voice packages (28 Kokoro model voices, device voice, optional clone).',inputSchema:object()},
  {name:'voice_select_voice',description:'Select a voice package by ID, for example "kokoro-am_michael".',
    inputSchema:object({voicePackageId:{type:'string',minLength:1,maxLength:128}},['voicePackageId'])},
  {name:'voice_status',description:'Report the active provider, device, selected voice, the provider plan, any fallback in effect and the last error.',inputSchema:object()},
  {name:'voice_device_profile',description:'Probe this device (WebGPU, WebAssembly, memory, audio output, speech voices) and return the provider plan with reasons.',inputSchema:object()},
  {name:'voice_diagnostics',description:'Read device diagnostics: the native host snapshot and, when a loopback LeeWay Device Bridge URL and owner token are supplied, its health and passport.',
    inputSchema:object({bridgeUrl:{type:'string',maxLength:200},bearerToken:{type:'string',maxLength:512},useDeviceBridge:{type:'boolean'}})},
  {name:'voice_self_test',description:'Run a measured voice self-test (probe, diagnostics, prepare, synthesis). Set audible to also play a short phrase.',
    inputSchema:object({audible:{type:'boolean'},bridgeUrl:{type:'string',maxLength:200},bearerToken:{type:'string',maxLength:512}})}
]);

/** @param {import('./voice-sdk.js').LeeWayVoiceClient} client */
export function createVoiceTools(client){
  const text=args=>{
    const value=args?.text;
    if(typeof value!=='string'||!value.trim()||value.length>MAX_TEXT)throw new Error(`text must be a string of 1-${MAX_TEXT} characters.`);
    return value;
  };
  const handlers={
    voice_speak:args=>client.speak(text(args)),
    voice_stop:()=>client.stop(),
    voice_list_voices:()=>client.listVoices(),
    voice_select_voice:args=>{
      if(typeof args?.voicePackageId!=='string'||!args.voicePackageId)throw new Error('voicePackageId is required.');
      return client.selectVoice(args.voicePackageId);
    },
    voice_status:()=>client.status(),
    voice_device_profile:()=>client.probeDevice(),
    voice_diagnostics:args=>client.diagnostics({bridgeUrl:args?.bridgeUrl,bearerToken:args?.bearerToken,useDeviceBridge:args?.useDeviceBridge}),
    voice_self_test:args=>client.selfTest({audible:args?.audible===true,bridgeUrl:args?.bridgeUrl,bearerToken:args?.bearerToken})
  };
  return VOICE_TOOL_DEFINITIONS.map(definition=>({...definition,
    handler:async args=>{
      const data=await handlers[definition.name](args||{});
      return {content:[{type:'text',text:JSON.stringify(data??{ok:true})}],structuredContent:data??{ok:true}};
    }}));
}
