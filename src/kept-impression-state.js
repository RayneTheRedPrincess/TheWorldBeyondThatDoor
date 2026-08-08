const DAMAGE_TYPES=['Physical','Fire','Cold','Lightning','Poison','Force','Psychic','Holy','Dark','Radiant'];
const NONPHYSICAL=['Fire','Cold','Lightning','Poison','Force','Psychic','Holy','Dark','Radiant'];
function clone(v){return typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v));}
function n(v,d=0){const x=Number(v);return Number.isFinite(x)?x:d;}
function cap(v,min,max){return Math.max(min,Math.min(max,n(v)));}
export function keptIds(actor){return Array.isArray(actor?.keptImpressions)?actor.keptImpressions:[];}
export function hasKept(actor,id){return keptIds(actor).includes(id);}
export function keptChoice(actor,id,key,fallback=null){const c=actor?.keptImpressionChoices?.[id];return c&&Object.prototype.hasOwnProperty.call(c,key)?c[key]:fallback;}
export function createKeptBattleState(ids=[]){
 const perId={}; for(const id of ids)perId[id]={};
 return {perId,round:{},turn:{},action:{},lastActionCategory:null,lastDamageTargetId:null,lastHealTargetId:null,lastDamageType:null,lastDirectAttackerId:null,energySpentCumulative:0,bonusEnergyGained:0};
}
export function resetKeptBattleState(actor){actor.keptState=createKeptBattleState(keptIds(actor));return actor.keptState;}
export function kiState(actor,id){if(!actor.keptState)resetKeptBattleState(actor);actor.keptState.perId[id]=actor.keptState.perId[id]||{};return actor.keptState.perId[id];}
export function resetKeptRoundFlags(actor){if(actor?.keptState)actor.keptState.round={};}
export function resetKeptTurnFlags(actor){if(actor?.keptState){actor.keptState.turn={};actor.keptState.action={};}}
export function actionCategory(ability){
 const components=ability?.components||[];
 if(components.some(c=>c.type==='damage'))return 'Damage';
 if(components.some(c=>c.type==='heal'||c.type==='shield'))return 'Support';
 return 'Utility';
}

// Core-stat multipliers happen before combat-derived stats, Max HP, and Initiative are calculated.
export function applyKeptPreCombatStats(stats={},subclass=null,ids=[],choices={}){
 const s={STR:n(stats.STR),DEX:n(stats.DEX),CON:n(stats.CON),INT:n(stats.INT),FTH:n(stats.FTH),CHA:n(stats.CHA),LCK:n(stats.LCK)};
 const has=id=>ids.includes(id);
 // Multiply effects first, then the explicitly printed "after all other multipliers" halves.
 if(subclass==='SteelBearer'&&has('KI-203'))s.CON*=1.5;
 if(subclass==='BrandBlade'&&has('KI-205'))s.INT*=1.5;
 if(subclass==='Gunslinger'&&has('KI-210'))s.CHA*=1.5;
 if(subclass==='Breachstrider'&&has('KI-231'))s.STR*=1.5;
 if(subclass==='Breachstrider'&&has('KI-232'))s.INT*=1.5;
 if(subclass==='Cadenceblade'&&has('KI-242'))s.CHA*=1.5;
 if(subclass==='Fontborn'&&has('KI-244'))s.INT*=1.5;
 if(subclass==='Pyrecovenant'&&has('KI-250'))s.STR*=1.5;
 if(subclass==='Belowcaller'&&has('KI-252'))s.FTH*=1.5;
 if(subclass==='Mortisworn'&&has('KI-253'))s.CON*=1.5;
 if(subclass==='Mortisworn'&&has('KI-254'))s.LCK*=1.5;
 if(subclass==='SteelBearer'&&has('KI-203')){s.STR*=.5;s.CHA*=.5;}
 if(subclass==='BrandBlade'&&has('KI-205'))s.STR*=.5;
 if(subclass==='Gunslinger'&&has('KI-210'))s.LCK*=.5;
 if(subclass==='Breachstrider'&&has('KI-232'))s.STR*=.5;
 if(subclass==='Cadenceblade'&&has('KI-242'))s.DEX*=.5;
 if(subclass==='Fontborn'&&has('KI-244'))s.CON*=.5;
 if(subclass==='Belowcaller'&&has('KI-252'))s.LCK*=.5;
 if(subclass==='Mortisworn'&&has('KI-253'))s.LCK*=.5;
 if(subclass==='Mortisworn'&&has('KI-254'))s.CON*=.5;
 for(const k of Object.keys(s))s[k]=Math.max(0,Math.round(s[k]*1000)/1000);
 return s;
}
export function keptMaxHpMultiplier(ids=[]){return ids.includes('KI-167') ? .85 : 1;}

export function keptConsumableCapacity(actor,baseCap=5){
 let cap=Math.max(0,Math.floor(n(baseCap,5)));
 if(hasKept(actor,'KI-097'))cap+=1;
 if(hasKept(actor,'KI-133'))cap+=1;
 return cap;
}

export function effectiveKeptStats(actor){
 const out={...(actor?.stats||{})};
 // Redline Anatomy dynamically raises STR based on missing HP; cap at 50% missing.
 if(hasKept(actor,'KI-213')&&actor?.subclass==='Bloodknuckle'){
   const max=Math.max(1,n(actor.resources?.maxHp,1)),hp=Math.max(0,n(actor.resources?.hp));
   const missingPct=cap((max-hp)/max*100,0,50),steps=Math.floor(missingPct/10);
   out.STR=n(out.STR)*(1+steps*.03);
 }
 return out;
}

export function keptResourceCap(actor,{subclass=null,resourceName=null,defaultMax=0,combat=null}={}){
 let max=n(defaultMax);
 const sub=subclass||actor?.subclassState?.subclass||actor?.subclass;
 if(sub==='Ruinhewer'){if(hasKept(actor,'KI-201'))max=5;if(hasKept(actor,'KI-202'))max=2;}
 if(sub==='SteelBearer'&&hasKept(actor,'KI-203'))max=4;
 if(sub==='BrandBlade'){if(hasKept(actor,'KI-205'))max=6;if(hasKept(actor,'KI-206'))max=4;}
 if(sub==='Veil Blade'&&hasKept(actor,'KI-207'))max=5;
 if(sub==='Gunslinger'&&hasKept(actor,'KI-209'))max=5;
 if(sub==='Duelist'&&hasKept(actor,'KI-211'))max=5;
 if(sub==='Spellflare'&&hasKept(actor,'KI-219'))max=5;
 if(sub==='Sealweaver'&&hasKept(actor,'KI-221'))max=6;
 if(sub==='Lumenwrath'&&hasKept(actor,'KI-227'))max=6;
 if(sub==='Malisunder'&&hasKept(actor,'KI-229'))max=5;
 if(sub==='Longwatch'){if(hasKept(actor,'KI-233'))max=6;if(hasKept(actor,'KI-234'))max=3;}
 if(sub==='Trailguard'&&hasKept(actor,'KI-236'))max=Math.max(1,(combat?.actors||[]).filter(a=>a.real&&a.side===actor.side&&n(a.resources?.hp)>0).length||defaultMax);
 if(sub==='Choruswarden'&&hasKept(actor,'KI-238'))max=5;
 if(sub==='Dreadcantor'&&hasKept(actor,'KI-239'))max=5;
 if(sub==='Cadenceblade'&&hasKept(actor,'KI-241'))max=6;
 if(sub==='Fontborn'&&hasKept(actor,'KI-243'))max=5;
 if(sub==='Spellconductor'){if(hasKept(actor,'KI-247'))max=1;if(hasKept(actor,'KI-248'))max=5;}
 if(sub==='Pyrecovenant'&&hasKept(actor,'KI-249'))max=3;
 if(sub==='Dawnwarden'&&hasKept(actor,'KI-256'))max=4;
 if(sub==='Verdictbearer'&&hasKept(actor,'KI-258'))max=5;
 if(sub==='Barkmorph'){if(hasKept(actor,'KI-261'))max=3;if(hasKept(actor,'KI-262'))max=4;}
 if(sub==='Seedmarshal'&&hasKept(actor,'KI-263'))max=4;
 if(sub==='Hyphaweaver'&&(hasKept(actor,'KI-265')||hasKept(actor,'KI-266')))max=5;
 if(resourceName==='Arcane Charge'&&hasKept(actor,'KI-220')&&actor?.subclass==='Spellflare')max=3;
 return max;
}

export function keptStartingSubclassState(actor){
 const s=actor?.subclassState;if(!s)return;
 if(actor.subclass==='Longwatch'&&hasKept(actor,'KI-234'))s.aim=2;
 if(actor.subclass==='Vowscarred'&&hasKept(actor,'KI-259')){s.oath=0;s.fractures=3;}
 if(actor.subclass==='Vowscarred'&&hasKept(actor,'KI-260')){s.oath=3;s.fractures=0;}
 if(actor.subclass==='Fluxwrought'&&hasKept(actor,'KI-245'))s.flux=keptChoice(actor,'KI-245','flux','Surge');
 if(actor.subclass==='Prismatic Palm'&&hasKept(actor,'KI-215'))s.facet=keptChoice(actor,'KI-215','facet','Ember');
}

export function keptCanGainSubclassResource(actor,subclass){
 if(subclass==='Spellflare'&&hasKept(actor,'KI-220'))return false;
 if(subclass==='Gunslinger'&&hasKept(actor,'KI-209')&&kiState(actor,'KI-209').lockedRedline)return false;
 if(subclass==='AdaptedFist'&&hasKept(actor,'KI-218'))return false; // natural Adaptation generation only; explicit ability path may bypass.
 if(subclass==='BrandBlade'&&hasKept(actor,'KI-206')&&kiState(actor,'KI-206').overcooled)return false;
 return true;
}
export function keptSubclassResourceGain(actor,subclass,amount,{reason=null}={}){
 let a=n(amount);
 if(subclass==='BrandBlade'&&hasKept(actor,'KI-206')&&reason==='ability-damage')a*=2;
 if(subclass==='BrandBlade'&&hasKept(actor,'KI-206')&&reason==='flash-temper')a=2;
 if(subclass==='Fontborn'&&hasKept(actor,'KI-244')&&reason==='energy-spend')a=2;
 return a;
}

export function keptDamageType(actor,ability,component){
 let type=component?.damageType||'Physical';
 if(ability?.subclass==='Prismatic Palm'&&hasKept(actor,'KI-215')){
   const f=keptChoice(actor,'KI-215','facet','Ember'); type=f==='Ember'?'Fire':f==='Storm'?'Lightning':'Radiant';
 }
 if(ability?.subclass==='Spellflare'&&hasKept(actor,'KI-220'))type=keptChoice(actor,'KI-220','damageType','Fire');
 if(ability?.subclass==='Dreadcantor'&&hasKept(actor,'KI-239'))type=keptChoice(actor,'KI-239','damageType','Psychic');
 if(ability?.subclass==='Cadenceblade'&&hasKept(actor,'KI-242'))type='Force';
 return type;
}
export function keptScaling(actor,ability,scaling={}){
 const out={...(scaling||{})};
 if(ability?.subclass==='BrandBlade'&&hasKept(actor,'KI-205'))delete out.STR;
 if(ability?.subclass==='Gunslinger'&&hasKept(actor,'KI-210'))delete out.LCK;
 if(ability?.subclass==='Breachstrider'&&hasKept(actor,'KI-231'))delete out.DEX;
 if(ability?.subclass==='Pyrecovenant'&&hasKept(actor,'KI-250'))delete out.INT;
 return out;
}
export function keptEnergyCost(actor,ability,cost){
 let v=Math.max(0,n(cost));
 const damaging=(ability?.components||[]).some(c=>c.type==='damage');
 if(hasKept(actor,'KI-001')&&kiState(actor,'KI-001').lastlight>=3&&damaging)v=Math.max(0,v-1);
 if(hasKept(actor,'KI-143')&&kiState(actor,'KI-143').overdraw)v=Math.max(0,v-1);
 if(hasKept(actor,'KI-159')&&kiState(actor,'KI-159').surgebackReady)v=Math.max(0,v-1);
 if(ability?.subclass==='BrandBlade'&&hasKept(actor,'KI-206')&&damaging&&n(actor.subclassState?.heat)>=4){/* Flashforge removes White-Hot surcharge */}
 if(ability?.subclass==='BrandBlade'&&hasKept(actor,'KI-205')&&damaging&&n(actor.subclassState?.heat)>=6)v+=2;
 if(ability?.subclass==='Sealweaver'&&hasKept(actor,'KI-222')&&['Inscribed Blow','Ward Script','Mercy Seal','Grand Unsealing'].includes(ability.name)&&ability.name!=='Grand Unsealing')v+=1;
 if(ability?.subclass==='Prismatic Palm'&&hasKept(actor,'KI-216')&&ability.name==='Refract Stance')v=2;
 if(ability?.subclass==='Duelist'&&hasKept(actor,'KI-212')&&ability.name==='Parrying Measure')v=2;
 if(ability?.subclass==='AdaptedFist'&&hasKept(actor,'KI-218')&&ability.name==='Read the Exchange'){} // cooldown change below
 if(ability?.subclass==='Fluxwrought'&&hasKept(actor,'KI-245')&&keptChoice(actor,'KI-245','flux','Surge')==='Collapse')v=Math.max(0,n(ability.energyCost)-1);
 if(ability?.subclass==='Barkmorph'&&hasKept(actor,'KI-262')&&n(actor.subclassState?.morphs?.length)>=4)v+=1;
 return v;
}
export function keptCooldown(actor,ability,cooldown){if(ability?.subclass==='AdaptedFist'&&ability.name==='Read the Exchange'&&hasKept(actor,'KI-218'))return 3;return n(cooldown);}
export function keptHpCostPct(actor,ability,pct){let v=n(pct);if(ability?.subclass==='Pyrecovenant'&&hasKept(actor,'KI-250'))v*=2;return v;}

export function keptSubclassModifiers(actor,{ability=null,target=null,componentType=null,combat=null}={}){
 const out={finalDamagePct:0,critChancePct:0,critDamagePct:0,outgoingHealingPct:0,incomingHealingPct:0,shieldStrengthPct:0,blockChancePct:0,dodgeChancePct:0,incomingDamagePct:0};
 const sub=actor?.subclass,s=actor?.subclassState,isSub=ability?.subclass===sub,targetId=target?.id;
 if(!sub||!s)return out;
 // 201-266 override/additive mechanics.
 if(sub==='Ruinhewer'){
   const o=n(s.overpressure);
   if(hasKept(actor,'KI-201')){if(isSub){out.finalDamagePct+=o;out.critDamagePct+=o*8;}out.incomingDamagePct+=o*2;} // replaces normal +4/+3 in subclass-state: added deltas
   if(hasKept(actor,'KI-202')){if(isSub)out.finalDamagePct-=o*2;out.incomingDamagePct-=o*3;}
 }
 if(sub==='SteelBearer'&&hasKept(actor,'KI-203')&&n(s.bearing)>=keptResourceCap(actor,{subclass:sub,defaultMax:3,combat})){out.blockChancePct+=10;out.incomingDamagePct-=10;}
 if(sub==='BrandBlade'){
   const heat=n(s.heat);
   if(hasKept(actor,'KI-205')&&isSub&&heat>=6){out.finalDamagePct+=10;out.critChancePct+=5;} // base White-Hot already supplies +15/+10; Blue-White target is +25/+15
   if(hasKept(actor,'KI-206')&&isSub&&kiState(actor,'KI-206').overcooled)out.finalDamagePct-=20;
 }
 if(sub==='Veil Blade'){
   if(hasKept(actor,'KI-207')&&isSub&&targetId)out.finalDamagePct-=n(s.imprints?.[targetId])*4; // removes normal imprint damage
   if(hasKept(actor,'KI-208')&&isSub&&!kiState(actor,'KI-208').halfSeen)out.finalDamagePct-=15;
   if(hasKept(actor,'KI-208')&&kiState(actor,'KI-208').halfSeen){out.dodgeChancePct+=25;if(isSub)out.critChancePct+=20;}
 }
 if(sub==='Gunslinger'){
   const r=n(s.redline);
   if(hasKept(actor,'KI-209')&&isSub)out.critDamagePct+=r*3; // normal +3 becomes +6
   if(hasKept(actor,'KI-210')){if(isSub){out.critDamagePct-=r*3;if(['Quickdraw','Called Shot'].includes(ability?.name))out.finalDamagePct+=15;}if(r>=2)out.dodgeChancePct+=10;}
 }
 if(sub==='Duelist'){
   const t=n(s.tempo);
   if(hasKept(actor,'KI-211')){out.critChancePct+=t;out.dodgeChancePct+=t;if(isSub&&s.measuredTargetId&&targetId!==s.measuredTargetId)out.finalDamagePct-=30;}
   if(hasKept(actor,'KI-212')&&isSub&&['Testing Thrust','Turn the Blade','Final Measure'].includes(ability?.name))out.finalDamagePct-=12;
 }
 if(sub==='Bloodknuckle'){
   const max=Math.max(1,n(actor.resources?.maxHp,1)),hp=n(actor.resources?.hp),pct=hp/max*100;
   if(hasKept(actor,'KI-213')&&isSub){if(pct>70)out.finalDamagePct-=15;if(ability?.name==='Heartbreaker'&&pct<30)out.finalDamagePct+=20;}
   if(hasKept(actor,'KI-214')&&isSub&&ability?.name==='Heartbreaker'&&pct<50)out.finalDamagePct-=20;
 }
 if(sub==='Prismatic Palm'&&hasKept(actor,'KI-215')&&isSub){const f=keptChoice(actor,'KI-215','facet','Ember');if(f==='Ember')out.finalDamagePct+=12;if(f==='Storm')out.critChancePct+=15;}
 if(sub==='AdaptedFist'){
   const a=s.adaptation;
   if(hasKept(actor,'KI-217')){const held=Array.isArray(s.adaptations)?s.adaptations.length:(a?1:0);if(isSub)out.finalDamagePct-=held*5;}
   if(hasKept(actor,'KI-218')){if(a==='Flow')out.dodgeChancePct+=10;if(a==='Guard')out.blockChancePct+=10;if(a==='Grit'&&isSub)out.finalDamagePct+=10;}
 }
 if(sub==='Spellflare'){
   const f=n(s.flare);
   if(hasKept(actor,'KI-219')&&isSub){out.finalDamagePct+=f;out.critDamagePct+=f*2;} // normal 4/5 -> 5/7
   if(hasKept(actor,'KI-219'))out.incomingDamagePct+=f*4;
   if(hasKept(actor,'KI-220')&&isSub)out.finalDamagePct+=18;
 }
 if(sub==='Glyphmorpher'&&hasKept(actor,'KI-224')&&isSub)out.finalDamagePct-=10;
 if(sub==='Solaceweaver'){
   if(hasKept(actor,'KI-225')&&isSub&&componentType==='damage')out.finalDamagePct-=25;
   if(hasKept(actor,'KI-226')&&isSub&&componentType==='heal')out.outgoingHealingPct-=15;
 }
 if(sub==='Lumenwrath'){
   const f=n(s.fervor);
   if(hasKept(actor,'KI-227')){if(isSub){out.critDamagePct+=f*2;if((ability?.components||[]).some(c=>['Radiant','Holy'].includes(keptDamageType(actor,ability,c))))out.finalDamagePct+=f;}out.incomingDamagePct+=f*3;}
   if(hasKept(actor,'KI-228')&&isSub&&componentType==='heal')out.outgoingHealingPct-=35;
 }
 if(sub==='Malisunder'){
   const f=n(s.fractures?.[targetId]);
   if(hasKept(actor,'KI-229')&&isSub&&targetId)out.finalDamagePct+=f*2; // 4 -> 6
   if(hasKept(actor,'KI-230')&&isSub)out.finalDamagePct-=12;
 }
 if(sub==='Breachstrider'){
   if(hasKept(actor,'KI-232')&&isSub&&n(target?.resources?.shield)>0)out.finalDamagePct-=10;
 }
 if(sub==='Longwatch'){
   const a=n(s.aim);
   if(hasKept(actor,'KI-233')){out.critChancePct+=a;out.critDamagePct+=a;}
   if(hasKept(actor,'KI-234')&&isSub&&ability?.name==='Measured Shot'&&a<=2)out.finalDamagePct+=10;
 }
 if(sub==='Trailguard'&&hasKept(actor,'KI-236')&&isSub&&componentType==='damage')out.finalDamagePct-=20;
 if(sub==='Choruswarden'){
   const h=n(s.harmony);
   if(hasKept(actor,'KI-238')){if(isSub){out.outgoingHealingPct+=h;out.shieldStrengthPct+=h;out.finalDamagePct-=30;}}
   if(hasKept(actor,'KI-237')&&isSub&&target){const lead=keptChoice(actor,'KI-237','allyId',null);if(target.id===lead){out.outgoingHealingPct+=50;out.shieldStrengthPct+=50;}else if(target.id!==actor.id){out.outgoingHealingPct-=20;out.shieldStrengthPct-=20;}}
 }
 if(sub==='Dreadcantor'){
   if(hasKept(actor,'KI-239')&&isSub)out.finalDamagePct+=20;
   if(hasKept(actor,'KI-240')&&isSub)out.finalDamagePct-=12;
 }
 if(sub==='Cadenceblade'){
   const c=n(s.cadence);
   if(hasKept(actor,'KI-241')){if(isSub){out.critChancePct+=c; if(c>=6)out.finalDamagePct+=15;}out.dodgeChancePct+=c;}
   if(hasKept(actor,'KI-242')){out.dodgeChancePct-=c*2;if(isSub&&n(actor.classState?.resource?.value)>=2)out.finalDamagePct+=10;}
 }
 if(sub==='Fontborn'){
   const f=n(s.font);
   if(hasKept(actor,'KI-243')){if(isSub){out.finalDamagePct+=f*2;out.shieldStrengthPct+=f;}out.dodgeChancePct-=f*4;}
   if(hasKept(actor,'KI-244')&&isSub)out.critChancePct+=10;
 }
 if(sub==='Fluxwrought'&&hasKept(actor,'KI-245')&&isSub){const f=keptChoice(actor,'KI-245','flux','Surge');if(f==='Surge')out.finalDamagePct+=8;if(f==='Twist')out.critChancePct+=10;if(f==='Collapse')out.critDamagePct+=15;}
 if(sub==='Spellconductor'){
   const conducted=targetId&&(s.conduits||[]).some(x=>(x?.targetId||x)===targetId);
   if(hasKept(actor,'KI-247')&&isSub&&conducted)out.finalDamagePct+=15;
   if(hasKept(actor,'KI-247')&&isSub&&ability?.name==='Closed Circuit')out.finalDamagePct+=25;
   if(hasKept(actor,'KI-248')&&isSub)out.finalDamagePct-=15;
 }
 if(sub==='Pyrecovenant'){
   const c=n(s.cinders);
   if(hasKept(actor,'KI-249')){if(isSub){out.finalDamagePct+=c*2;out.critDamagePct+=c*2;}out.incomingDamagePct+=c*5;}
   if(hasKept(actor,'KI-250')&&isSub&&(ability?.components||[]).some(x=>keptDamageType(actor,ability,x)==='Fire'))out.finalDamagePct+=10;
 }
 if(sub==='Belowcaller'&&hasKept(actor,'KI-252')&&isSub)out.finalDamagePct-=15;
 if(sub==='Mortisworn'){
   const r=n(s.remains);
   if(hasKept(actor,'KI-253')){if(isSub){out.shieldStrengthPct+=r*4;out.finalDamagePct-=15;}}
   if(hasKept(actor,'KI-254')){out.incomingHealingPct-=20;if(isSub)out.critDamagePct+=r*3;}
 }
 if(sub==='Dawnwarden'){
   const d=n(s.dawn);
   if(hasKept(actor,'KI-256')){if(isSub){out.shieldStrengthPct+=d;out.outgoingHealingPct+=d;if(d>=4)out.finalDamagePct-=40;}if(d>=4)out.dodgeChancePct-=10;}
   if(hasKept(actor,'KI-255')&&isSub&&target){const lead=keptChoice(actor,'KI-255','allyId',null);if(target.id===lead){out.shieldStrengthPct+=60;out.outgoingHealingPct+=40;}else if(target.id!==actor.id){out.shieldStrengthPct-=20;out.outgoingHealingPct-=20;}}
 }
 if(sub==='Verdictbearer'){
   const v=n(s.verdict);
   if(hasKept(actor,'KI-257')&&isSub)out.finalDamagePct-=v*2; // 3 -> 1
   if(hasKept(actor,'KI-258')&&isSub){if(targetId===s.judgedTargetId)out.finalDamagePct+=v*2;else if(s.judgedTargetId&&combat?.actors?.some(a=>a.id===s.judgedTargetId&&n(a.resources?.hp)>0))out.finalDamagePct-=25;}
 }
 if(sub==='Vowscarred'){
   if(hasKept(actor,'KI-259')){out.incomingDamagePct+=0; if(s.fractures>=3&&isSub)out.critDamagePct+=10;}
   if(hasKept(actor,'KI-260')){out.blockChancePct+=n(s.oath)*2;if(isSub){out.critDamagePct+=n(s.oath)*2;if((ability?.components||[]).some(c=>['Radiant','Holy'].includes(keptDamageType(actor,ability,c))))out.finalDamagePct+=15;}}
 }
 if(sub==='Barkmorph'){
   const morphs=s.morphs||[];
   if(hasKept(actor,'KI-261')){const m=keptChoice(actor,'KI-261','morph','Claw'),count=morphs.filter(x=>x===m).length; if(m==='Claw'&&isSub)out.finalDamagePct+=count*10-(morphs.includes('Claw')?5:0);if(m==='Hide'){if(isSub)out.shieldStrengthPct+=count*10-(morphs.includes('Hide')?5:0);out.blockChancePct+=count*5-(morphs.includes('Hide')?2:0);}if(m==='Heartwood'){out.incomingHealingPct+=count*10-(morphs.includes('Heartwood')?5:0);if(isSub)out.outgoingHealingPct+=count*10-(morphs.includes('Heartwood')?5:0);}}
   if(hasKept(actor,'KI-262')&&morphs.length>=4){if(isSub)out.finalDamagePct+=15;out.incomingDamagePct-=10;}
 }
 if(sub==='Hyphaweaver'){
   if(hasKept(actor,'KI-265')){if(isSub&&componentType==='damage'&&ability?.name==='Fruiting Network')out.finalDamagePct+=20;if(isSub&&['heal','shield'].includes(componentType)){if(componentType==='heal')out.outgoingHealingPct-=30;else out.shieldStrengthPct-=30;}}
   if(hasKept(actor,'KI-266')&&isSub&&componentType==='damage')out.finalDamagePct-=25;
 }
 return out;
}

export function keptGlobalModifiers(actor,{ability=null,target=null,componentType=null,combat=null}={}){
 const out={finalDamagePct:0,critChancePct:0,critDamagePct:0,outgoingHealingPct:0,incomingHealingPct:0,shieldStrengthPct:0,blockChancePct:0,dodgeChancePct:0,incomingDamagePct:0,aggroMultiplierAdd:0,aggroMultiplierFactor:1,energyGainPct:0};
 const st=actor?.keptState; if(!st)return out;
 if(hasKept(actor,'KI-012'))out.dodgeChancePct+=5;
 for(const e of actor.effects||[]){const mem=e?.memory||{};if(componentType==='damage'&&n(mem.keptDamageTypePct)>0&&mem.damageType&&(ability?.components||[]).some(c=>c.type==='damage'&&c.damageType===mem.damageType))out.finalDamagePct+=n(mem.keptDamageTypePct);}
 if(hasKept(actor,'KI-093')&&kiState(actor,'KI-093').energyGainWindow)out.energyGainPct+=15;
 if(hasKept(actor,'KI-016'))out.critChancePct+=5;
 if(hasKept(actor,'KI-057'))out.outgoingHealingPct-=15;
 if(hasKept(actor,'KI-063'))out.finalDamagePct-=10;
 if(hasKept(actor,'KI-170'))out.outgoingHealingPct-=20;
 if(hasKept(actor,'KI-171')){out.finalDamagePct-=12;out.outgoingHealingPct+=20;out.shieldStrengthPct+=20;}
 if(hasKept(actor,'KI-144')&&kiState(actor,'KI-144').ghostwake){out.aggroMultiplierFactor*=.30;out.dodgeChancePct+=20;if(ability&&(ability.components||[]).some(c=>c.type==='damage'))out.critChancePct+=15;}
 if(hasKept(actor,'KI-081')&&(actor.effects||[]).filter(e=>e.negative).length>=2){if(componentType==='damage')out.finalDamagePct+=15;if(componentType==='heal')out.outgoingHealingPct+=15;if(componentType==='shield')out.shieldStrengthPct+=15;}
 if(hasKept(actor,'KI-134')){/* threshold action rider handled event-side */}
 if(hasKept(actor,'KI-135')){/* aggro conditional reactions handled event-side */}
 if(hasKept(actor,'KI-168'))out.finalDamagePct-=n(kiState(actor,'KI-168').notes)*5;
 if(hasKept(actor,'KI-181')&&kiState(actor,'KI-181').active){if(componentType==='heal')out.outgoingHealingPct+=25;if(componentType==='shield')out.shieldStrengthPct+=25;}
 if(hasKept(actor,'KI-194')&&componentType==='heal-target'&&target&&target.id===actor.id){/* direct other-healer penalty applied with source context */}
 if(hasKept(actor,'KI-204')&&componentType==='defense'&&combat&&(combat.actors||[]).some(a=>a.id!==actor.id&&a.side===actor.side&&(a.effects||[]).some(e=>e.sourceActorId===actor.id&&e.memory?.redirectTo===actor.id)))out.incomingDamagePct+=15;
 if(hasKept(actor,'KI-246')&&ability?.subclass==='Fluxwrought'&&(ability.components||[]).some(c=>c.type==='damage')&&kiState(actor,'KI-246').useBonusThisAction)out.finalDamagePct+=15;
 return out;
}

export function keptResistanceBonus(actor,damageType){
 let bonus=(actor?.effects||[]).reduce((sum,e)=>sum+n(e?.memory?.resistanceAllPct),0);
 if(hasKept(actor,'KI-192')&&damageType==='Cold')bonus-=20;
 if(hasKept(actor,'KI-193')&&damageType==='Poison')bonus-=15;
 const s87=hasKept(actor,'KI-087')?kiState(actor,'KI-087'):null;if(s87?.resistType===damageType)bonus+=15;
 const s178=hasKept(actor,'KI-178')?kiState(actor,'KI-178'):null;if(s178?.accord&&keptChoice(actor,'KI-178','damageType','Force')===damageType)bonus+=20;
 return bonus;
}

export function keptLifestealPct(actor,ability,damageType){
 let pct=0;
 if(hasKept(actor,'KI-170'))pct+=8;
 if(hasKept(actor,'KI-192')&&damageType==='Fire')pct+=14;
 if(hasKept(actor,'KI-193')&&damageType==='Poison')pct+=18;
 if(hasKept(actor,'KI-194')&&damageType==='Dark')pct+=16;
 if(actor?.subclass==='Bloodknuckle'&&ability?.subclass==='Bloodknuckle'){
   const max=Math.max(1,n(actor.resources?.maxHp,1)),hp=n(actor.resources?.hp),p=hp/max*100;
   let innate=8;if(hasKept(actor,'KI-213')&&p>70)innate=4;
   if(hasKept(actor,'KI-213'))innate+=Math.floor(cap((max-hp)/max*100,0,50)/10)*4;
   pct+=innate;
   // Blood Keeps Blood reduces all Lifesteal generated by Bloodknuckle damage, after additions.
   if(hasKept(actor,'KI-214'))pct*=.75;
 }
 if(actor?.subclass==='Mortisworn'&&ability?.subclass==='Mortisworn'){
   const r=n(actor.subclassState?.remains);pct+=r*(hasKept(actor,'KI-253')?5:3);if(ability?.name==='Gravetouch')pct+=10;
 }
 return pct;
}

export function keptActiveAbilityDefinitions(actor){
 const out=[];
 if(hasKept(actor,'KI-004'))out.push({id:'ki-004-woundshare-rite',kiId:'KI-004',name:'Woundshare Rite',energyCost:1,cooldown:3,targetMode:'single-ally'});
 if(hasKept(actor,'KI-188'))out.push({id:'ki-188-venomburst',kiId:'KI-188',name:'Venomburst',energyCost:1,cooldown:4,targetMode:'single-enemy'});
 if(hasKept(actor,'KI-190'))out.push({id:'ki-190-cascade-detonation',kiId:'KI-190',name:'Cascade Detonation',energyCost:3,cooldown:6,targetMode:'single-enemy'});
 if(hasKept(actor,'KI-196'))out.push({id:'ki-196-borrow-tomorrow',kiId:'KI-196',name:'Borrow Tomorrow',energyCost:1,cooldown:5,targetMode:'self'});
 return out;
}

export function validateKeptChoiceValue(schema,value){
 if(!schema)return {ok:true};
 if(schema.type==='single')return {ok:schema.options.includes(value),error:'Choose one allowed value.'};
 if(schema.type==='multiple'){const arr=Array.isArray(value)?value:[];return {ok:arr.length===schema.count&&(!schema.unique||new Set(arr).size===arr.length)&&arr.every(v=>schema.options.includes(v)),error:`Choose ${schema.count} different allowed values.`};}
 if(schema.type==='party-ally')return {ok:typeof value==='string'&&value.length>0,error:'Choose a real ally.'};
 if(schema.type==='combat-start-toggle')return {ok:typeof value==='boolean',error:'Choose on or off.'};
 return {ok:true};
}
export {DAMAGE_TYPES,NONPHYSICAL};
