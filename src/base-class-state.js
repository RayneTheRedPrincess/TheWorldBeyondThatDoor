const RESOURCE_DEFS = {
  Warrior: { name: 'Pressure', max: 5 }, Rogue: { name: 'Openings', max: 4 }, Brawler: { name: 'Impact', max: 4 }, Mage: { name: 'Arcane Charge', max: 5 }, Cleric: { name: 'Grace', max: 4 }, Ranger: { name: 'Quarry Marks', max: 4 }, Bard: { name: 'Resonance', max: 4 }, Sorcerer: { name: 'Redline', max: 4 }, Warlock: { name: 'Covenant Marks', max: 4 }, Paladin: { name: 'Conviction', max: 5 }, Druid: { name: 'Cycle', max: 3 }
};
export function createBaseClassState(baseClass, seed = {}) { const def=RESOURCE_DEFS[baseClass]; if(!def)return null; const state={baseClass,resource:{name:def.name,value:Math.max(0,Math.min(def.max,Number(seed.resourceValue||0)||0)),max:def.max},turnFlags:{},betweenTurnFlags:{},memory:{}}; if(baseClass==='Ranger')state.quarry={targetId:seed.quarryTargetId||null}; if(baseClass==='Druid')state.form=seed.form||null; return state; }
export function resourceValue(actor){return Number(actor?.classState?.resource?.value||0);} export function resourceMax(actor){return Number(actor?.classState?.resource?.max||0);} export function setResourceValue(actor,value){if(!actor?.classState?.resource)return 0;const next=Math.max(0,Math.min(resourceMax(actor),Number(value)||0));actor.classState.resource.value=next;return next;}
export function gainResource(actor, amount=1){
  if(!actor?.classState?.resource)return 0; let left=Math.max(0,Number(amount||0));
  while(left-->0){const cur=resourceValue(actor),max=resourceMax(actor); if(cur<max){setResourceValue(actor,cur+1);continue;}
    // Overpressure and Flare are extensions of their underlying base resource systems.
    const s=actor.subclassState;
    if(s?.subclass==='Ruinhewer'){s.overpressure=Math.min(3,Number(s.overpressure||0)+1);continue;}
    if(s?.subclass==='Spellflare'){s.flare=Math.min(3,Number(s.flare||0)+1);continue;}
  }
  return resourceValue(actor);
}
export function spendResource(actor,amount=1){const cost=Math.max(0,Number(amount)||0);if(resourceValue(actor)<cost)return false;setResourceValue(actor,resourceValue(actor)-cost);
  // Spending Grace can generate Fervor once per turn for Lumenwrath's resource system.
  if(cost>0&&actor?.subclassState?.subclass==='Lumenwrath'&&!actor.subclassState.turnFlags?.fervorGrace){actor.subclassState.fervor=Math.min(4,Number(actor.subclassState.fervor||0)+1);actor.subclassState.turnFlags.fervorGrace=true;}
  return true;}
export function resetOwnTurnFlags(actor){if(actor?.classState)actor.classState.turnFlags={};} export function resetBetweenTurnFlags(actor){if(actor?.classState)actor.classState.betweenTurnFlags={};} export function resourceDefinition(baseClass){return RESOURCE_DEFS[baseClass]?{...RESOURCE_DEFS[baseClass]}:null;}
