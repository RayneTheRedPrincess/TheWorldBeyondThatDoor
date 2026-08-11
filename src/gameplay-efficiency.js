import { endCombatTurn } from './combat-controller.js';

export const COMBAT_SPEED_OPTIONS = Object.freeze([0.1,0.25,0.5,0.75,1,1.25,1.5,1.75,2,3,4]);

export function normalizeCombatSpeed(value=1){
  const parsed=Number(value);
  return Math.max(0.1,Math.min(4,Number.isFinite(parsed)?parsed:1));
}

export function autoEndPlayerTurn(slot,{enabled=true,rng=Math.random}={}){
  if(!enabled)return{ok:true,slot,ended:false};
  const combat=slot?.campaign?.state?.combat;
  if(combat?.state!=='active'||!combat.turn?.actionTaken||!combat.turn?.canEndTurn)return{ok:true,slot,ended:false};
  const actor=(combat.actors||[]).find(a=>a.id===combat.turn.actorId);
  if(!actor||actor.control!=='player')return{ok:true,slot,ended:false};
  const ended=endCombatTurn(slot,{rng});
  if(!ended.ok)return ended;
  return{...ended,ended:true};
}
