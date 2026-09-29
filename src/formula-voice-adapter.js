export const VOICE_DIMENSIONS=[
  'first_audio_latency_ms',
  'synthesis_realtime_factor',
  'playback_gap_ms',
  'interruption_spill_ms',
  'queue_pressure',
  'delivery_integrity'
];

function finiteNumber(v){return typeof v==='number'&&Number.isFinite(v)}
function validRanges(ranges){
  return Array.isArray(ranges)&&ranges.length===6&&ranges.every(r=>Array.isArray(r)&&r.length===2&&r.every(finiteNumber)&&r[0]<r[1]);
}
function validRow(row){return Array.isArray(row)&&row.length===6&&row.every(finiteNumber)}

export function buildVoiceFormulaRequest({rows,ranges,caller='leeway-voice-fabric',traceId}={}){
  if(!Array.isArray(rows)||rows.length!==16||!rows.every(validRow))throw new Error('Voice Formula mapping requires exactly 16 rows x 6 finite measurements.');
  if(!validRanges(ranges))throw new Error('Voice Formula mapping requires six calibrated finite increasing ranges.');
  if(traceId!==undefined&&typeof traceId!=='string')throw new Error('traceId must be a string when supplied.');
  return {
    adapterId:'runtime-state-v1',
    caller,
    ...(traceId?{traceId}:{}),
    input:{stateRows:rows.map(r=>[...r]),ranges:ranges.map(r=>[...r])}
  };
}

export function voiceFormulaProvenance({source,mapping='voice-runtime-state-v1',authorization}={}){
  if(!source||!authorization)throw new Error('Voice Formula provenance requires source and authorization.');
  return {source,mapping,authorization};
}
