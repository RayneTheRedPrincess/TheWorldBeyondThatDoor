import { awardCharacterExp } from './campaign-controller.js';
import { adventurerOnyxMultiplier, chronicleFromRawOnyx } from './character-progression.js';
function clone(v){return typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v));}
export function awardCurrentForestCombatRewards(slot,{progression,rng=Math.random,now=new Date().toISOString()}={}){
  if(!slot?.campaign?.active||!slot.campaign.state?.expedition?.encounter)return {ok:false,error:'No active Forest encounter.'};
  if(slot.campaign.state.expedition.encounter.rewardsAwarded)return {ok:true,slot:clone(slot),alreadyAwarded:true,reward:clone(slot.campaign.state.expedition.encounter.rewardAward||{})};
  const run=slot.campaign.state,combat=run.combat;if(!combat||combat.state!=='complete')return {ok:false,error:'Forest combat rewards require a completed combat.'};
  const defeated=(combat.actors||[]).filter(a=>a.side==='enemy'&&a.real!==false&&Number(a.resources?.hp||0)<=0);
  const exp=defeated.reduce((n,a)=>n+Math.max(0,Number(a.expReward||0)),0),rawOnyx=defeated.reduce((n,a)=>n+Math.max(0,Number(a.onyxReward||0)),0);const deployedAdventurers=Object.keys(run.adventurers||{}).length;const multiplier=adventurerOnyxMultiplier(deployedAdventurers,progression);const onyx=Math.round(rawOnyx*multiplier);const chronicleProgress=chronicleFromRawOnyx(rawOnyx,progression);
  let next=clone(slot);next.campaign.state.rewards.carriedOnyx=Number(next.campaign.state.rewards.carriedOnyx||0)+onyx;next.campaign.state.rewards.chronicleProgress=Number(next.campaign.state.rewards.chronicleProgress||0)+chronicleProgress;
  const expResult=awardCharacterExp(next,exp,progression,{rng});if(!expResult.ok)return expResult;next=expResult.slot;
  const reward={outcome:combat.outcome,defeatedEnemyIds:defeated.map(a=>a.id),exp,rawOnyx,onyxMultiplier:multiplier,onyxAwarded:onyx,chronicleProgress,deployedAdventurers,experienceAwards:clone(expResult.awards),awardedAt:now};
  next.campaign.state.expedition.encounter.rewardsAwarded=true;next.campaign.state.expedition.encounter.rewardAward=clone(reward);next.campaign.state.lastCombatReward=clone(reward);
  return {ok:true,slot:next,reward};
}
