import { resolveCritical, roundFinal, applyDamageReduction } from './combat-math.js';
function clone(v){return typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v));}
function n(v){const x=Number(v);return Number.isFinite(x)?x:0;}
function statusKey(effect){return effect?.memory?.statusId||effect?.memory?.statusKind||effect?.id||null;}
function isStacking(effect){return effect?.stacking==='stack-refresh'||effect?.memory?.stackable===true;}
export function mergeCombatEffect(effects=[],effect={}){
 const list=[...(effects||[])],incoming=clone(effect),key=statusKey(incoming);
 if(!key){list.push(incoming);return {effects:list,effect:incoming,merged:false};}
 const sameIndex=list.findIndex(entry=>statusKey(entry)===key&&entry.sourceActorId===incoming.sourceActorId);
 if(sameIndex<0){if(isStacking(incoming)){incoming.memory={...(incoming.memory||{}),stacks:Math.max(1,n(incoming.memory?.stacks)||1)};}list.push(incoming);return {effects:list,effect:incoming,merged:false};}
 const existing=list[sameIndex];
 if(isStacking(incoming)){
  const stacks=Math.max(1,n(existing.memory?.stacks)||1)+Math.max(1,n(incoming.memory?.stacks)||1);
  const duration=incoming.duration?clone(incoming.duration):clone(existing.duration);
  list[sameIndex]={...existing,...incoming,modifiers:{...(existing.modifiers||{}),...(incoming.modifiers||{})},memory:{...(existing.memory||{}),...(incoming.memory||{}),stacks},duration};
  return {effects:list,effect:list[sameIndex],merged:true};
 }
 if(incoming.stacking==='refresh'){
  list[sameIndex]={...existing,...incoming,modifiers:{...(existing.modifiers||{}),...(incoming.modifiers||{})},memory:{...(existing.memory||{}),...(incoming.memory||{})},duration:incoming.duration?clone(incoming.duration):clone(existing.duration)};
  return {effects:list,effect:list[sameIndex],merged:true};
 }
 list.push(incoming);return {effects:list,effect:incoming,merged:false};
}
export function statusDefinition(catalog,statusId){return (catalog?.statuses||[]).find(s=>s.id===statusId)||null;}
export function buildStatusEffect({statusId,sourceActorId=null,negative=true,removable=true,modifiers={},duration=null,stacks=1,tickBase=0,tickPctMaxHp=0,damageType=null,canCrit=true,critSnapshot=null,stackable=false,memory={}}={}){
 return {id:`status:${statusId}`,sourceActorId,negative,removable,modifiers:{...modifiers},duration:duration?clone(duration):null,stacking:stackable?'stack-refresh':'refresh',memory:{...memory,statusId,statusKind:statusId,stackable:Boolean(stackable),stacks:Math.max(1,Math.trunc(n(stacks)||1)),dot:Boolean(tickBase||tickPctMaxHp),tickTiming:(tickBase||tickPctMaxHp)?'owner-turn-start':memory.tickTiming,tickBase:n(tickBase),tickPctMaxHp:n(tickPctMaxHp),damageType,canCrit:canCrit!==false,critSnapshot:critSnapshot?clone(critSnapshot):null}};
}
export function periodicStatusDescriptor(effect,owner,timing=null){
 if(!effect?.memory?.dot)return null;
 if(timing&&effect.memory.tickTiming!==timing)return null;
 const stacks=Math.max(1,n(effect.memory.stacks)||1);const raw=(n(effect.memory.tickBase)+n(owner?.resources?.maxHp)*n(effect.memory.tickPctMaxHp)/100)*stacks;
 if(raw<=0)return null;return {raw,stacks,damageType:effect.memory.damageType||(effect.memory.statusKind==='Burn'?'Fire':effect.memory.statusKind==='Poison'?'Poison':effect.memory.statusKind==='Bleed'?'Physical':'Force'),canCrit:effect.memory.canCrit!==false,critSnapshot:effect.memory.critSnapshot||null};
}
export function resolvePeriodicStatusPacket(effect,owner,{rng=Math.random,incomingDamagePct=0,armorMitigationPct=0,resistancePct=0}={}){
 const d=periodicStatusDescriptor(effect,owner,'owner-turn-start');if(!d)return null;let critical={amount:d.raw,critical:false,recursive:false};if(d.canCrit&&d.critSnapshot)critical=resolveCritical(d.raw,{chancePct:n(d.critSnapshot.chancePct),criticalDamagePct:n(d.critSnapshot.criticalDamagePct)||150,rng});
 let amount=critical.amount;amount=applyDamageReduction(amount,-n(incomingDamagePct));amount=applyDamageReduction(amount,n(armorMitigationPct));amount=applyDamageReduction(amount,n(resistancePct));
 return {...d,amount:roundFinal(amount),critical:Boolean(critical.critical),recursiveCritical:Boolean(critical.recursive)};
}
export function isPeriodicStatus(effect){return Boolean(effect?.memory?.dot);}
