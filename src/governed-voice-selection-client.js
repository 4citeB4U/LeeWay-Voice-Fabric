/* LeeWay Voice Fabric — bounded canonical selection client.
 * This module is NOT a second voice owner and does not bypass Runtime Fabric's 409.
 * Caller supplies its existing authenticated owner transport.
 */
const SHA=/^[a-f0-9]{64}$/;
export class GovernedVoiceSelectionClient {
  constructor({readBinding,requestSelection}={}){
    if(typeof readBinding!=='function'||typeof requestSelection!=='function')throw Error('CANONICAL_VOICE_OWNER_TRANSPORT_REQUIRED');
    this.readBinding=readBinding;this.requestSelection=requestSelection;this.pending=false;
  }
  async binding(){
    const r=await this.readBinding();
    const b=r?.voiceBinding??r;
    if(b?.authority!=='LEEWAY_VOICE_FABRIC'||!SHA.test(b.selectionRevision??'')||
       typeof b.voicePackageId!=='string'||!b.voicePackageId||
       typeof b.personaFamily!=='string'||!b.personaFamily)throw Error('CANONICAL_VOICE_BINDING_INVALID');
    return Object.freeze({...b});
  }
  async select({voicePackageId,approvalId}={}){
    if(typeof voicePackageId!=='string'||!voicePackageId.trim()||voicePackageId.length>128)throw Error('VOICE_PACKAGE_ID_REQUIRED');
    if(typeof approvalId!=='string'||!approvalId.trim()||approvalId.length>256)throw Error('VOICE_APPROVAL_REQUIRED');
    if(this.pending)throw Error('VOICE_SELECTION_ALREADY_IN_PROGRESS');
    this.pending=true;
    try{
    const before=await this.binding();
    if(before.voicePackageId===voicePackageId)return {status:'UNCHANGED',binding:before};
    // Only the existing authority may decide and commit. A local UI cannot mutate selection.
    // Record CAS and resolved voice identity have distinct revision domains.
    if(before.recordRevision!==undefined&&!SHA.test(before.recordRevision))throw Error('VOICE_RECORD_REVISION_INVALID');
    const response=await this.requestSelection({voicePackageId,expectedSelectionRevision:before.selectionRevision,...(before.recordRevision?{expectedRecordRevision:before.recordRevision}:{}),approvalId});
    if(response?.status!=='COMMITTED'||response?.authority!=='LEEWAY_VOICE_FABRIC'||!SHA.test(response?.selectionRevision??''))throw Error('VOICE_SELECTION_NOT_COMMITTED_BY_OWNER');
    const after=await this.binding();
    if(before.recordRevision&&(!SHA.test(after.recordRevision??'')||after.recordRevision===before.recordRevision||response.recordRevision!==after.recordRevision))throw Error('VOICE_OWNER_RECORD_READBACK_MISMATCH');
    if(after.voicePackageId!==voicePackageId||after.selectionRevision===before.selectionRevision||
       after.personaFamily!==before.personaFamily||
       (before.agentId&&after.agentId!==before.agentId)||
       response.selectionRevision!==after.selectionRevision)throw Error('VOICE_OWNER_READBACK_MISMATCH');
    return {status:'COMMITTED',before,after};
    }finally{this.pending=false;}
  }
}
