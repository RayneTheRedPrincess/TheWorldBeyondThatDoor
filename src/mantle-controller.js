import { isClasslessEquipped } from './kept-impression-controller.js';
function clone(value){return typeof structuredClone==='function'?structuredClone(value):JSON.parse(JSON.stringify(value));}
export function getMantleAvailability({slot,account,subclassesForBase=[]}){
  const baseClass=slot?.character?.baseClass||null;
  const opened=Boolean(baseClass&&(account?.unlocks?.mantleBaseClasses||[]).includes(baseClass));
  if(!opened)return {available:false,reason:'The Mantle Room has not opened yet.',unlockedChoices:[]};
  if(slot?.campaign?.active)return {available:false,reason:'Mantles cannot be changed during an active campaign.',unlockedChoices:[]};
  if(isClasslessEquipped(slot))return {available:false,reason:'Classless cannot use Mantle subclass selection.',unlockedChoices:[]};
  const allowed=new Set(subclassesForBase); const unlockedChoices=(account?.unlocks?.subclasses||[]).filter(name=>allowed.has(name));
  return {available:true,reason:'',unlockedChoices};
}
export function selectMantle({slot,account,subclass,subclassesForBase=[]}){const state=getMantleAvailability({slot,account,subclassesForBase});if(!state.available)return{ok:false,error:state.reason};if(subclass!==null&&!state.unlockedChoices.includes(subclass))return{ok:false,error:'That subclass Mantle is not available to this Vessel.'};const next=clone(slot);next.character={...(next.character||{}),subclass:subclass||null};return{ok:true,slot:next};}
