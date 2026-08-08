import { keptResourceCap, keptCanGainSubclassResource, keptSubclassResourceGain, keptSubclassModifiers, hasKept, keptChoice, kiState } from './kept-impression-state.js';
const SUBCLASS_BASE_CLASS = {
  'Ruinhewer':'Warrior','SteelBearer':'Warrior','BrandBlade':'Warrior',
  'Veil Blade':'Rogue','Gunslinger':'Rogue','Duelist':'Rogue',
  'Bloodknuckle':'Brawler','Prismatic Palm':'Brawler','AdaptedFist':'Brawler',
  'Spellflare':'Mage','Sealweaver':'Mage','Glyphmorpher':'Mage',
  'Solaceweaver':'Cleric','Lumenwrath':'Cleric','Malisunder':'Cleric',
  'Breachstrider':'Ranger','Longwatch':'Ranger','Trailguard':'Ranger',
  'Choruswarden':'Bard','Dreadcantor':'Bard','Cadenceblade':'Bard',
  'Fontborn':'Sorcerer','Fluxwrought':'Sorcerer','Spellconductor':'Sorcerer',
  'Pyrecovenant':'Warlock','Belowcaller':'Warlock','Mortisworn':'Warlock',
  'Dawnwarden':'Paladin','Verdictbearer':'Paladin','Vowscarred':'Paladin',
  'Barkmorph':'Druid','Seedmarshal':'Druid','Hyphaweaver':'Druid'
};

const DEFINITIONS = {
  'Ruinhewer': { kind:'counter', name:'Overpressure', key:'overpressure', max:3 },
  'SteelBearer': { kind:'counter', name:'Bearing', key:'bearing', max:3 },
  'BrandBlade': { kind:'counter', name:'Heat', key:'heat', max:5 },
  'Veil Blade': { kind:'per-target', name:'Veil Imprints', key:'imprints', max:3 },
  'Gunslinger': { kind:'counter', name:'Redline', key:'redline', max:4 },
  'Duelist': { kind:'duelist', name:'Tempo', key:'tempo', max:3 },
  'Bloodknuckle': { kind:'passive-only', name:'Blood Momentum' },
  'Prismatic Palm': { kind:'facet', name:'Prismatic Cycle', values:['Ember','Storm','Lumen'] },
  'AdaptedFist': { kind:'adaptation', name:'Adaptation', values:['Flow','Guard','Grit'] },
  'Spellflare': { kind:'counter', name:'Flare', key:'flare', max:3 },
  'Sealweaver': { kind:'collection', name:'Seals', key:'seals', max:4 },
  'Glyphmorpher': { kind:'glyphs', name:'Glyph Matrix', key:'glyphs', max:3 },
  'Solaceweaver': { kind:'counter', name:'Solace', key:'solace', max:3 },
  'Lumenwrath': { kind:'counter', name:'Fervor', key:'fervor', max:4 },
  'Malisunder': { kind:'per-target', name:'Fractures', key:'fractures', max:3 },
  'Breachstrider': { kind:'counter', name:'Breach Charge', key:'breachCharge', max:4 },
  'Longwatch': { kind:'counter', name:'Aim', key:'aim', max:4 },
  'Trailguard': { kind:'trail', name:'Trailmarks + Trail Charge', key:'trailCharge', max:3 },
  'Choruswarden': { kind:'counter', name:'Harmony', key:'harmony', max:3 },
  'Dreadcantor': { kind:'counter', name:'Discord', key:'discord', max:4 },
  'Cadenceblade': { kind:'cadence', name:'Cadence', key:'cadence', max:4 },
  'Fontborn': { kind:'counter', name:'Font', key:'font', max:3 },
  'Fluxwrought': { kind:'flux', name:'Flux', values:['Surge','Twist','Collapse'] },
  'Spellconductor': { kind:'collection', name:'Conduits', key:'conduits', max:3 },
  'Pyrecovenant': { kind:'counter', name:'Cinders', key:'cinders', max:5 },
  'Belowcaller': { kind:'counter', name:'Whispers', key:'whispers', max:4 },
  'Mortisworn': { kind:'counter', name:'Remains', key:'remains', max:4 },
  'Dawnwarden': { kind:'counter', name:'Dawn', key:'dawn', max:3 },
  'Verdictbearer': { kind:'judgment', name:'Judgment + Verdict', key:'verdict', max:4 },
  'Vowscarred': { kind:'oath', name:'Oath / Fractures', max:3 },
  'Barkmorph': { kind:'morphs', name:'Morphs', key:'morphs', max:3 },
  'Seedmarshal': { kind:'plantings', name:'Growth + Plantings', key:'growth', max:4 },
  'Hyphaweaver': { kind:'nodes', name:'Hypha Nodes', key:'nodes', max:4 }
};

function clone(v){return typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v));}
function cap(n,max){return Math.max(0,Math.min(Number(max||0),Number(n||0)));}
function alive(a){return Number(a?.resources?.hp||0)>0;}
function effectSum(actor,key){return (actor?.effects||[]).reduce((n,e)=>n+Number(e?.modifiers?.[key]||0),0);}

export function subclassBaseClass(subclass){return SUBCLASS_BASE_CLASS[subclass]||null;}
export function subclassDefinition(subclass){return DEFINITIONS[subclass]?clone(DEFINITIONS[subclass]):null;}
export function subclassDefinitions(){return clone(DEFINITIONS);}
export function isSubclassPassiveActive(actor, subclass=actor?.subclass){return Boolean(subclass && actor?.subclass===subclass);}
export function isSubclassResourceActive(actor, subclass){return Boolean(subclass && (actor?.subclass===subclass || actor?.resourceImprint?.subclass===subclass));}
export function isBaseResourceActive(actor, baseClass){return Boolean(baseClass && (actor?.baseClass===baseClass || actor?.resourceImprint?.baseClass===baseClass || subclassBaseClass(actor?.resourceImprint?.subclass)===baseClass));}

export function createSubclassState(subclass, seed={}){
  const def=DEFINITIONS[subclass]; if(!def)return null;
  const s={subclass,kind:def.kind,turnFlags:{},betweenTurnFlags:{},memory:{...(seed.memory||{})}};
  if(def.kind==='counter')s[def.key]=cap(seed[def.key],def.max);
  if(def.kind==='per-target')s[def.key]={...(seed[def.key]||{})};
  if(def.kind==='collection')s[def.key]=Array.isArray(seed[def.key])?clone(seed[def.key]).slice(0,def.max):[];
  if(def.kind==='glyphs')s.glyphs=Array.isArray(seed.glyphs)?seed.glyphs.filter(x=>['Edge','Echo','Veil'].includes(x)).slice(0,3):[];
  if(def.kind==='duelist'){s.tempo=cap(seed.tempo,3);s.measuredTargetId=seed.measuredTargetId||null;s.measuredRemaining=Number(seed.measuredRemaining||0);}
  if(def.kind==='facet')s.facet=def.values.includes(seed.facet)?seed.facet:'Ember';
  if(def.kind==='adaptation')s.adaptation=def.values.includes(seed.adaptation)?seed.adaptation:null;
  if(def.kind==='trail'){s.trailCharge=cap(seed.trailCharge,3);s.trailmarks=Array.isArray(seed.trailmarks)?[...new Set(seed.trailmarks)].slice(0,3):[];}
  if(def.kind==='cadence'){s.cadence=cap(seed.cadence,4);s.lastAbilityId=seed.lastAbilityId||null;}
  if(def.kind==='flux')s.flux=def.values.includes(seed.flux)?seed.flux:'Surge';
  if(def.kind==='judgment'){s.verdict=cap(seed.verdict,4);s.judgedTargetId=seed.judgedTargetId||null;}
  if(def.kind==='oath'){s.oath=cap(seed.oath??3,3);s.fractures=cap(seed.fractures??0,3);if(s.oath+s.fractures!==3){s.oath=3;s.fractures=0;}}
  if(def.kind==='morphs')s.morphs=Array.isArray(seed.morphs)?[...new Set(seed.morphs.filter(x=>['Claw','Hide','Heartwood'].includes(x)))].slice(0,3):[];
  if(def.kind==='plantings'){s.growth=cap(seed.growth,4);s.plantings={...(seed.plantings||{})};}
  if(def.kind==='nodes')s.nodes=Array.isArray(seed.nodes)?[...new Set(seed.nodes)].slice(0,4):[];
  return s;
}
export function resetSubclassTurnFlags(actor){if(actor?.subclassState)actor.subclassState.turnFlags={};}
export function resetSubclassBetweenTurnFlags(actor){if(actor?.subclassState)actor.subclassState.betweenTurnFlags={};}

export function subclassResourceValue(actor, resourceName=null, targetId=null){
  const s=actor?.subclassState,sub=s?.subclass||actor?.subclass;if(!s)return 0;
  switch(sub){
    case'Ruinhewer':return s.overpressure||0;case'SteelBearer':return s.bearing||0;case'BrandBlade':return s.heat||0;
    case'Veil Blade':return Number(s.imprints?.[targetId]||0);case'Gunslinger':return s.redline||0;case'Duelist':return s.tempo||0;
    case'Spellflare':return s.flare||0;case'Sealweaver':return s.seals?.length||0;case'Glyphmorpher':return s.glyphs?.length||0;
    case'Solaceweaver':return s.solace||0;case'Lumenwrath':return s.fervor||0;case'Malisunder':return Number(s.fractures?.[targetId]||0);
    case'Breachstrider':return s.breachCharge||0;case'Longwatch':return s.aim||0;case'Trailguard':return s.trailCharge||0;
    case'Choruswarden':return s.harmony||0;case'Dreadcantor':return s.discord||0;case'Cadenceblade':return s.cadence||0;
    case'Fontborn':return s.font||0;case'Spellconductor':return s.conduits?.length||0;case'Pyrecovenant':return s.cinders||0;
    case'Belowcaller':return s.whispers||0;case'Mortisworn':return s.remains||0;case'Dawnwarden':return s.dawn||0;case'Verdictbearer':return s.verdict||0;
    case'Vowscarred':return resourceName==='Oath'?s.oath||0:s.fractures||0;case'Barkmorph':return s.morphs?.length||0;case'Seedmarshal':return s.growth||0;case'Hyphaweaver':return s.nodes?.length||0;
    default:return 0;
  }
}
export function gainSubclassResource(actor, amount=1,{targetId=null,resourceName=null,reason=null,explicit=false,combat=null}={}){
  const s=actor?.subclassState,sub=s?.subclass||actor?.subclass,def=DEFINITIONS[sub];if(!s||!def)return 0;
  if(!explicit&&!keptCanGainSubclassResource(actor,sub))return subclassResourceValue(actor,resourceName,targetId);
  const a=keptSubclassResourceGain(actor,sub,amount,{reason}); const mx=keptResourceCap(actor,{subclass:sub,resourceName,defaultMax:def.max||0,combat});
  if(def.kind==='counter'){const k=def.key;s[k]=cap(Number(s[k]||0)+Number(a||0),mx);return s[k];}
  if(def.kind==='per-target'&&targetId){const k=def.key;s[k]=s[k]||{};if(sub==='Malisunder'&&hasKept(actor,'KI-229')){for(const id of Object.keys(s[k]))if(id!==targetId)delete s[k][id];}s[k][targetId]=cap(Number(s[k][targetId]||0)+Number(a||0),mx);return s[k][targetId];}
  if(def.kind==='duelist'){s.tempo=cap(Number(s.tempo||0)+Number(a||0),mx);return s.tempo;}
  if(def.kind==='trail'){s.trailCharge=cap(Number(s.trailCharge||0)+Number(a||0),mx);return s.trailCharge;}
  if(def.kind==='cadence'){s.cadence=cap(Number(s.cadence||0)+Number(a||0),mx);return s.cadence;}
  if(def.kind==='judgment'){s.verdict=cap(Number(s.verdict||0)+Number(a||0),mx);return s.verdict;}
  if(def.kind==='plantings'){s.growth=cap(Number(s.growth||0)+Number(a||0),mx);return s.growth;}
  return subclassResourceValue(actor,resourceName,targetId);
}

export function setSubclassResource(actor,value,{targetId=null,resourceName=null,combat=null}={}){
 const s=actor?.subclassState,sub=s?.subclass||actor?.subclass,def=DEFINITIONS[sub];if(!s||!def)return 0;const mx=keptResourceCap(actor,{subclass:sub,resourceName,defaultMax:def.max||0,combat});
 if(def.kind==='counter'){s[def.key]=cap(value,mx);return s[def.key];}
 if(def.kind==='per-target'&&targetId){s[def.key]=s[def.key]||{};s[def.key][targetId]=cap(value,mx);return s[def.key][targetId];}
 if(def.kind==='duelist'){s.tempo=cap(value,mx);return s.tempo;}if(def.kind==='trail'){s.trailCharge=cap(value,mx);return s.trailCharge;}if(def.kind==='cadence'){s.cadence=cap(value,mx);return s.cadence;}if(def.kind==='judgment'){s.verdict=cap(value,mx);return s.verdict;}if(def.kind==='plantings'){s.growth=cap(value,mx);return s.growth;}
 if(def.kind==='oath'){if(resourceName==='Oath')s.oath=cap(value,3);else s.fractures=cap(value,3);return resourceName==='Oath'?s.oath:s.fractures;} return 0;
}
export function spendSubclassResource(actor, amount, opts={}){const cur=subclassResourceValue(actor,opts.resourceName,opts.targetId);const n=amount==='all'?cur:Math.max(0,Number(amount||0));if(cur<n)return false;setSubclassResource(actor,cur-n,opts);return n;}
export function addCollectionResource(actor, value){const s=actor?.subclassState,def=DEFINITIONS[s?.subclass||actor?.subclass];if(!s||!def)return false;const key=def.key;if(!['collection','nodes'].includes(def.kind))return false;const arr=s[key]||[];if(arr.some(x=>typeof x==='object'?x.targetId===value:x===value))return false;const mx=keptResourceCap(actor,{subclass:s.subclass,defaultMax:def.max});if(arr.length>=mx)return false;arr.push(value);s[key]=arr;return true;}
export function removeCollectionResource(actor,value){const s=actor?.subclassState,def=DEFINITIONS[s?.subclass||actor?.subclass];if(!s||!def)return false;const key=def.key,arr=s[key]||[],i=arr.findIndex(x=>typeof x==='object'?x.targetId===value:x===value);if(i<0)return false;arr.splice(i,1);return true;}
export function clearCollectionResource(actor){const s=actor?.subclassState,def=DEFINITIONS[s?.subclass||actor?.subclass];if(!s||!def)return 0;const key=def.key;if(Array.isArray(s[key])){const n=s[key].length;s[key]=[];return n;}return 0;}
export function advanceFacet(actor,direction=1){const s=actor?.subclassState;if(s?.subclass!=='Prismatic Palm')return null;const vals=['Ember','Storm','Lumen'];const i=vals.indexOf(s.facet);s.facet=vals[(i+(direction<0?2:1))%3];return s.facet;}
export function advanceFlux(actor,direction=1,{rng=Math.random,forceRandom=false}={}){const s=actor?.subclassState;if(s?.subclass!=='Fluxwrought')return null;const vals=['Surge','Twist','Collapse'];const i=vals.indexOf(s.flux);let step=direction<0?2:1;if(hasKept(actor,'KI-246')){const roll=Math.max(0,Math.min(.999999,Number(rng?.()??Math.random())));if(roll<.50)step=direction<0?2:1;else if(roll<.75)step=0;else step=direction<0?1:2;if(step===0||Math.abs(step)!==1){const st=kiState(actor,'KI-246');st.bonusDamageReady=true;st.lastTransition=step===0?'remain':'skip';}}s.flux=vals[(i+step)%3];return s.flux;}
export function gainMorph(actor,morph){const s=actor?.subclassState;if(s?.subclass!=='Barkmorph'||!['Claw','Hide','Heartwood'].includes(morph))return false;const mx=keptResourceCap(actor,{subclass:'Barkmorph',defaultMax:3});if((!hasKept(actor,'KI-261')&&s.morphs.includes(morph))||s.morphs.length>=mx)return false;s.morphs.push(morph);return true;}
export function placeTrailmark(actor,targetId){const s=actor?.subclassState;if(s?.subclass!=='Trailguard')return false;if(s.trailmarks.includes(targetId))return true;const protectedId=hasKept(actor,'KI-235')?keptChoice(actor,'KI-235','allyId',null):null;if(targetId===protectedId)return true;const mx=keptResourceCap(actor,{subclass:'Trailguard',defaultMax:3});if(s.trailmarks.length>=mx)return false;s.trailmarks.push(targetId);return true;}
export function placeNode(actor,targetId){const s=actor?.subclassState;if(s?.subclass!=='Hyphaweaver')return false;if(s.nodes.includes(targetId))return true;const mx=keptResourceCap(actor,{subclass:'Hyphaweaver',defaultMax:4});if(s.nodes.length>=mx)return false;s.nodes.push(targetId);return true;}
export function placeConduit(actor,targetId){const s=actor?.subclassState;if(s?.subclass!=='Spellconductor')return false;if(s.conduits.some(x=>x===targetId||x?.targetId===targetId))return true;const mx=keptResourceCap(actor,{subclass:'Spellconductor',defaultMax:3});if(s.conduits.length>=mx)return false;s.conduits.push(targetId);return true;}
export function placeSeal(actor,targetId,type,turns=3,{empowered=false,scaling={}}={}){const s=actor?.subclassState;if(s?.subclass!=='Sealweaver')return false;s.seals=(s.seals||[]).filter(x=>x.targetId!==targetId);if(hasKept(actor,'KI-221'))type=keptChoice(actor,'KI-221','seal','Fracture');const mx=keptResourceCap(actor,{subclass:'Sealweaver',defaultMax:4});if(s.seals.length>=mx)s.seals.shift();s.seals.push({targetId,type,remaining:turns,empowered:Boolean(empowered),scaling:{...scaling},markedTurns:0});return true;}
export function addGlyph(actor,glyph){const s=actor?.subclassState;if(s?.subclass!=='Glyphmorpher'||!['Edge','Echo','Veil'].includes(glyph)||s.glyphs.length>=3)return false;if(hasKept(actor,'KI-223'))glyph=keptChoice(actor,'KI-223','glyph','Edge');s.glyphs.push(glyph);return true;}
export function consumeGlyphs(actor,count=1){const s=actor?.subclassState;if(s?.subclass!=='Glyphmorpher')return [];return s.glyphs.splice(0,Math.max(0,Number(count||0)));}
export function setMeasured(actor,targetId){const s=actor?.subclassState;if(s?.subclass!=='Duelist')return;s.measuredTargetId=targetId;s.measuredRemaining=4;s.tempo=0;}
export function setJudged(actor,targetId){const s=actor?.subclassState;if(s?.subclass!=='Verdictbearer')return;if(s.judgedTargetId!==targetId)s.verdict=0;s.judgedTargetId=targetId;}
export function fractureOath(actor,amount=1){const s=actor?.subclassState;if(s?.subclass!=='Vowscarred')return 0;const n=Math.min(s.oath,Math.max(0,Number(amount||0)));s.oath-=n;s.fractures+=n;return n;}
export function restoreOath(actor){const s=actor?.subclassState;if(s?.subclass!=='Vowscarred')return 0;const n=s.fractures;s.oath=Math.min(3,s.oath+n);s.fractures=0;return n;}

export function subclassPassiveModifiers(actor,{ability=null,target=null,componentType=null,combat=null}={}){
  const sub=actor?.subclass,s=actor?.subclassState;
  const out={finalDamagePct:0,critChancePct:0,critDamagePct:0,outgoingHealingPct:0,incomingHealingPct:0,shieldStrengthPct:0,blockChancePct:0,dodgeChancePct:0,incomingDamagePct:0,aggroMultiplierOverride:null};
  if(!sub||!s||s.subclass!==sub)return out; // Resource Imprints never grant the source passive.
  const isSubAbility=ability?.subclass===sub;
  const targetId=target?.id;
  switch(sub){
    case'Ruinhewer': out.finalDamagePct+=(s.overpressure||0)*4; out.incomingDamagePct+=(s.overpressure||0)*3; break;
    case'SteelBearer': out.aggroMultiplierOverride=Math.max(.15,1+Math.max(0,Number(actor.stats?.CHA||0))*.0017); break;
    case'BrandBlade': if(isSubAbility&&(s.heat||0)>=5){out.finalDamagePct+=15;out.critChancePct+=10;} break;
    case'Veil Blade': if(isSubAbility&&targetId)out.finalDamagePct+=Number(s.imprints?.[targetId]||0)*4; break;
    case'Gunslinger': if(isSubAbility){out.critDamagePct+=(s.redline||0)*3;if((s.redline||0)>=4)out.critChancePct+=10;} break;
    case'Duelist': out.critChancePct+=(s.tempo||0)*4;out.dodgeChancePct+=(s.tempo||0)*2;break;
    case'Spellflare': if(isSubAbility){out.finalDamagePct+=(s.flare||0)*4;out.critDamagePct+=(s.flare||0)*5;} break;
    case'Solaceweaver': if(isSubAbility){out.outgoingHealingPct+=(s.solace||0)*4;out.shieldStrengthPct+=(s.solace||0)*3;}break;
    case'Lumenwrath': if(isSubAbility){out.critDamagePct+=(s.fervor||0)*4;if((s.fervor||0)>=4)out.critChancePct+=10;if((ability?.components||[]).some(c=>['Holy','Radiant'].includes(c.damageType)))out.finalDamagePct+=(s.fervor||0)*4;}break;
    case'Malisunder': if(isSubAbility&&targetId)out.finalDamagePct+=Number(s.fractures?.[targetId]||0)*4;break;
    case'Breachstrider': if(isSubAbility&&target&&(Number(target.resources?.shield||0)>0 || Number(target?.derivedBlockChancePct||0)>0 || Number(target?.defense?.explicitBlockChancePct||0)>0))out.finalDamagePct+=(s.breachCharge||0)*3;break;
    case'Longwatch': if(isSubAbility){out.critChancePct+=(s.aim||0)*4;out.critDamagePct+=(s.aim||0)*3;if((s.aim||0)>=4&&targetId&&actor.classState?.quarry?.targetId===targetId)out.finalDamagePct+=10;}break;
    case'Choruswarden': if(isSubAbility){out.outgoingHealingPct+=(s.harmony||0)*4;out.shieldStrengthPct+=(s.harmony||0)*4;}break;
    case'Dreadcantor': if(isSubAbility){out.finalDamagePct+=(s.discord||0)*3;out.critDamagePct+=(s.discord||0)*3;if((s.discord||0)>=4)out.critChancePct+=10;}break;
    case'Cadenceblade': if(isSubAbility){out.critChancePct+=(s.cadence||0)*3;if((s.cadence||0)>=4)out.finalDamagePct+=12;}out.dodgeChancePct+=(s.cadence||0)*2;break;
    case'Fontborn': if(isSubAbility){out.shieldStrengthPct+=(s.font||0)*4;out.finalDamagePct+=(s.font||0)*3;}if((s.font||0)>=3)out.incomingHealingPct+=10;break;
    case'Fluxwrought': if(isSubAbility){if(s.flux==='Surge')out.finalDamagePct+=12;if(s.flux==='Twist')out.critChancePct+=18;if(s.flux==='Collapse')out.critDamagePct+=25;}break;
    case'Spellconductor': if(isSubAbility&&targetId&&(s.conduits||[]).some(x=>x===targetId||x?.targetId===targetId))out.finalDamagePct+=5;break;
    case'Pyrecovenant': if(isSubAbility){if((ability?.components||[]).some(c=>c.damageType==='Fire'))out.finalDamagePct+=(s.cinders||0)*3;out.critDamagePct+=(s.cinders||0)*2;if((s.cinders||0)>=5)out.critChancePct+=10;}if((s.cinders||0)>=5)out.incomingDamagePct+=8;break;
    case'Belowcaller': if(isSubAbility){if((ability?.components||[]).some(c=>c.damageType==='Dark'))out.finalDamagePct+=(s.whispers||0)*3;if((s.whispers||0)>=4)out.critChancePct+=10;}break;
    case'Mortisworn': if(isSubAbility)out.critDamagePct+=(s.remains||0)*2;if((s.remains||0)>=4)out.incomingHealingPct+=10;break;
    case'Dawnwarden': if(isSubAbility){out.shieldStrengthPct+=(s.dawn||0)*4;out.outgoingHealingPct+=(s.dawn||0)*3;}break;
    case'Verdictbearer': if(isSubAbility&&targetId===s.judgedTargetId){out.finalDamagePct+=(s.verdict||0)*3;if((s.verdict||0)>=4)out.critChancePct+=10;}break;
    case'Vowscarred': out.blockChancePct+=(s.oath||0)*3-(s.fractures>=3?10:0);if(isSubAbility){out.critDamagePct+=(s.oath||0)*3+(s.fractures>=3?15:0);out.finalDamagePct+=(s.fractures||0)*5;out.critChancePct+=(s.fractures||0)*5;}out.incomingDamagePct+=(s.fractures||0)*4;break;
    case'Barkmorph': {const m=s.morphs||[];if(isSubAbility&&m.includes('Claw'))out.finalDamagePct+=5;if(isSubAbility&&m.includes('Hide'))out.shieldStrengthPct+=5;if(m.includes('Hide'))out.blockChancePct+=2;if(m.includes('Heartwood')){out.incomingHealingPct+=5;if(isSubAbility)out.outgoingHealingPct+=5;}if(m.length>=3)out.incomingDamagePct-=8;break;}
    default:break;
  }
  const kept=keptSubclassModifiers(actor,{ability,target,componentType,combat});
  for(const key of ['finalDamagePct','critChancePct','critDamagePct','outgoingHealingPct','incomingHealingPct','shieldStrengthPct','blockChancePct','dodgeChancePct','incomingDamagePct'])out[key]+=Number(kept[key]||0);
  // Dawnwarden Daybreak is a party aura and therefore evaluated through combat context.
  if(combat&&actor?.side&&componentType==='defense'){
    const daybreak=(combat.actors||[]).some(a=>a.side===actor.side&&alive(a)&&a.subclass==='Dawnwarden'&&Number(a.subclassState?.dawn||0)>=3);
    if(daybreak)out.incomingDamagePct-=15;
  }
  return out;
}

export function recordSubclassDefenseEvent(combat,target,outcome,{actualHpRemoved=0,shieldAbsorbed=0}={}){
  if(!target?.subclassState)return;
  const sub=target.subclassState.subclass;
  if(isSubclassResourceActive(target,'SteelBearer')&&outcome==='block'&&!target.subclassState.betweenTurnFlags.bearing){gainSubclassResource(target,1);target.subclassState.betweenTurnFlags.bearing=true;}
  if(isSubclassResourceActive(target,'Breachstrider')&&outcome==='block'&&!target.subclassState.betweenTurnFlags.breach){gainSubclassResource(target,1);target.subclassState.betweenTurnFlags.breach=true;}
  if(isSubclassResourceActive(target,'AdaptedFist')){
    if(outcome==='dodge')target.subclassState.adaptation='Flow';
    else if(outcome==='block')target.subclassState.adaptation='Guard';
    else if(actualHpRemoved>0)target.subclassState.adaptation='Grit';
  }
  if(isSubclassResourceActive(target,'AdaptedFist')&&(outcome==='dodge'||outcome==='block'||actualHpRemoved>0)){
    const read=(target.effects||[]).find(e=>e.memory?.grantImpactOnAdaptation&&!e.memory?.triggered);
    if(read&&target.classState?.resource?.name==='Impact'){target.classState.resource.value=Math.min(target.classState.resource.max,Number(target.classState.resource.value||0)+1);read.memory.triggered=true;}
  }
  if(isSubclassResourceActive(target,'Bloodknuckle')&&actualHpRemoved>0&&!target.subclassState.betweenTurnFlags.impactFromHpDamage){
    if(target.classState?.resource)target.classState.resource.value=Math.min(target.classState.resource.max,Number(target.classState.resource.value||0)+1);
    target.subclassState.betweenTurnFlags.impactFromHpDamage=true;
  }
  if(isSubclassResourceActive(target,'Fontborn')&&actualHpRemoved>0&&!target.subclassState.betweenTurnFlags.fontFromHpDamage){gainSubclassResource(target,1);target.subclassState.betweenTurnFlags.fontFromHpDamage=true;}
  if(outcome==='dodge'){
    for(const owner of combat?.actors||[]){
      if(owner.side===target.side&&isSubclassResourceActive(owner,'Trailguard')&&owner.subclassState?.trailmarks?.includes(target.id)&&!owner.subclassState.betweenTurnFlags.trailChargeFromDodge){gainSubclassResource(owner,1);owner.subclassState.betweenTurnFlags.trailChargeFromDodge=true;}
    }
  }
}

export function recordSubclassShieldAbsorb(combat,absorbedBySource,actualHpRemoved){
  for(const [sourceId,amount] of Object.entries(absorbedBySource||{})){
    if(!(Number(amount)>0))continue;const source=(combat?.actors||[]).find(a=>a.id===sourceId);if(!source?.subclassState)continue;
    if(isSubclassResourceActive(source,'Solaceweaver')&&!source.subclassState.betweenTurnFlags.solaceFromShield){gainSubclassResource(source,1);source.subclassState.betweenTurnFlags.solaceFromShield=true;}
    if(isSubclassResourceActive(source,'Choruswarden')&&!source.subclassState.betweenTurnFlags.harmonyFromShield){gainSubclassResource(source,1);source.subclassState.betweenTurnFlags.harmonyFromShield=true;}
    if(isSubclassResourceActive(source,'Dawnwarden')&&Number(actualHpRemoved||0)===0&&!source.subclassState.betweenTurnFlags.dawnFromShieldPrevent){gainSubclassResource(source,1);source.subclassState.betweenTurnFlags.dawnFromShieldPrevent=true;}
  }
}

export function recordSubclassDamageDealt(combat,source,target,ability,result,{targetHpBeforePct=100,targetHadShieldBefore=false}={}){
  if(!source?.subclassState||!ability)return;
  const sub=source.subclassState.subclass;
  const actual=Number(result?.actualHpRemoved||0), hit=Boolean(result?.hit), crit=Boolean(result?.critical);
  const isSubAbility=ability.subclass===sub;
  const isFamilyAbility=(ability.baseClass||source.baseClass)===SUBCLASS_BASE_CLASS[sub];
  if(isSubclassResourceActive(source,'Veil Blade')&&isSubAbility&&hit){gainSubclassResource(source,1,{targetId:target.id});if(crit)gainSubclassResource(source,1,{targetId:target.id});}
  if(isSubclassResourceActive(source,'Gunslinger')&&isSubAbility&&!source.subclassState.turnFlags.redline&&(crit||targetHpBeforePct<50)){gainSubclassResource(source,1);source.subclassState.turnFlags.redline=true;}
  if(isSubclassResourceActive(source,'Duelist')&&isSubAbility&&hit){if(!source.subclassState.measuredTargetId)setMeasured(source,target.id);if(source.subclassState.measuredTargetId===target.id&&!source.subclassState.turnFlags.tempo){gainSubclassResource(source,1);source.subclassState.turnFlags.tempo=true;}}
  if(isSubclassResourceActive(source,'Lumenwrath')&&isSubAbility&&crit&&!source.subclassState.turnFlags.fervorCrit){gainSubclassResource(source,1);source.subclassState.turnFlags.fervorCrit=true;}
  if(isSubclassResourceActive(source,'Malisunder')&&isSubAbility&&hit){gainSubclassResource(source,1,{targetId:target.id});if(crit)gainSubclassResource(source,1,{targetId:target.id});source.subclassState.memory.fractureRemaining=source.subclassState.memory.fractureRemaining||{};source.subclassState.memory.fractureRemaining[target.id]=3;}
  if(isSubclassResourceActive(source,'Breachstrider')&&isSubAbility&&!source.subclassState.turnFlags.breach){const shielded=Boolean(targetHadShieldBefore)||Number(target?.resources?.shield||0)>0;const blocked=Boolean(result?.blocked);if(shielded||blocked){gainSubclassResource(source,1);source.subclassState.turnFlags.breach=true;}}
  if(isSubclassResourceActive(source,'Longwatch')&&isFamilyAbility&&hit){const arr=source.subclassState.memory.rangerTargetsDamaged||[];if(!arr.includes(target.id))arr.push(target.id);source.subclassState.memory.rangerTargetsDamaged=arr;}
  if(isSubclassResourceActive(source,'Dreadcantor')&&isSubAbility&&crit&&!source.subclassState.turnFlags.discordCrit){gainSubclassResource(source,1);source.subclassState.turnFlags.discordCrit=true;}
  if(isSubclassResourceActive(source,'Pyrecovenant')&&isSubAbility&&actual>0&&!source.subclassState.turnFlags.cinderDamage){gainSubclassResource(source,1);source.subclassState.turnFlags.cinderDamage=true;}
  if(isSubclassResourceActive(source,'Mortisworn')&&isSubAbility&&actual>0&&targetHpBeforePct<50&&!source.subclassState.turnFlags.remainLowHp){gainSubclassResource(source,1);source.subclassState.turnFlags.remainLowHp=true;}
  if(isSubclassResourceActive(source,'Verdictbearer')&&isSubAbility&&hit){setJudged(source,target.id);if(source.subclassState.judgedTargetId===target.id&&!source.subclassState.turnFlags.verdictSelf){gainSubclassResource(source,1);source.subclassState.turnFlags.verdictSelf=true;}}
  // Other real allies can build a Verdictbearer's Verdict on its current Judged target.
  if(actual>0){for(const owner of combat?.actors||[]){if(owner.id!==source.id&&owner.side===source.side&&owner.real&&isSubclassResourceActive(owner,'Verdictbearer')&&owner.subclassState?.judgedTargetId===target.id&&!owner.subclassState.turnFlags.verdictAlly){gainSubclassResource(owner,1);owner.subclassState.turnFlags.verdictAlly=true;}}}
}
export function recordSubclassEnemyDefeated(combat,defeatedActor,source){
  if(!defeatedActor||alive(defeatedActor))return;
  for(const owner of combat?.actors||[]){
    if(owner.side===source?.side&&isSubclassResourceActive(owner,'Mortisworn')&&!owner.subclassState.turnFlags.remainKill){gainSubclassResource(owner,1);owner.subclassState.turnFlags.remainKill=true;}
    if(owner.subclassState?.subclass==='Duelist'&&owner.subclassState.measuredTargetId===defeatedActor.id){owner.subclassState.measuredTargetId=null;owner.subclassState.measuredRemaining=0;owner.subclassState.tempo=0;}
  }
}

export function recordSubclassDebuffApplied(actor){if(isSubclassResourceActive(actor,'Dreadcantor')&&!actor.subclassState.turnFlags.discordDebuff){gainSubclassResource(actor,1);actor.subclassState.turnFlags.discordDebuff=true;}if(isSubclassResourceActive(actor,'Belowcaller')&&!actor.subclassState.turnFlags.whisperDebuff){gainSubclassResource(actor,1);actor.subclassState.turnFlags.whisperDebuff=true;}}
export function recordSubclassHeal(actor,target,{hpBeforePct=100,actualRestored=0}={}){if(!(actualRestored>0))return;if(isSubclassResourceActive(actor,'Solaceweaver')&&target.id!==actor.id&&hpBeforePct<50&&!actor.subclassState.turnFlags.solaceHeal){gainSubclassResource(actor,1);actor.subclassState.turnFlags.solaceHeal=true;}if(isSubclassResourceActive(actor,'Dawnwarden')&&target.id!==actor.id&&hpBeforePct<50&&!actor.subclassState.turnFlags.dawnHeal){gainSubclassResource(actor,1);actor.subclassState.turnFlags.dawnHeal=true;}}
export function recordSubclassMultiAllyEffect(actor,count){if(count>=2&&isSubclassResourceActive(actor,'Choruswarden')&&!actor.subclassState.turnFlags.harmonyMulti){gainSubclassResource(actor,1);actor.subclassState.turnFlags.harmonyMulti=true;}}
export function recordSubclassEnergySpend(actor,ability,energySpent){if(isSubclassResourceActive(actor,'Fontborn')&&ability?.baseClass==='Sorcerer'&&Number(energySpent)>=2&&!actor.subclassState.turnFlags.fontEnergy){gainSubclassResource(actor,1);actor.subclassState.turnFlags.fontEnergy=true;}}

export function tickSubclassEndOwnTurn(actor){
  const s=actor?.subclassState;if(!s)return;
  if(isSubclassResourceActive(actor,'Longwatch')){const q=actor.classState?.quarry?.targetId;const damaged=s.memory?.rangerTargetsDamaged||[];if(q&&damaged.length===1&&damaged[0]===q)gainSubclassResource(actor,1);else if(damaged.some(id=>id!==q))setSubclassResource(actor,Math.max(0,(s.aim||0)-2));s.memory.rangerTargetsDamaged=[];}
  if(s.subclass==='Duelist'&&s.measuredTargetId){const targetAlive=(actor?.combatMemory?.lastKnownAliveTargets||{})[s.measuredTargetId];if(targetAlive===false){s.measuredTargetId=null;s.measuredRemaining=0;s.tempo=0;}}
}
