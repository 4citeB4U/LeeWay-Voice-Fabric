import {renderAudio} from './studio-audio.js';
self.onmessage=async({data})=>{
  try{const result=await renderAudio(data.raw,data.tuning);self.postMessage({result},[result.audio.buffer]);}
  catch(error){self.postMessage({error:error.message});}
};
