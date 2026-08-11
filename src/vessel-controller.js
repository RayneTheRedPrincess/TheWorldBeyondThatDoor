import { CORE_STATS, getStartingStatPool, normalizeStartingStats } from './starting-stats.js';
import { validateRacialConfiguration } from './racial-configuration.js';

function clone(value){return typeof structuredClone==='function'?structuredClone(value):JSON.parse(JSON.stringify(value));}
function unique(list=[]){return [...new Set((Array.isArray(list)?list:[]).map(String))];}

function fitStatsToPool(stats,pool){
  const next=normalizeStartingStats(stats||{});
  let total=CORE_STATS.reduce((sum,stat)=>sum+Number(next[stat]||0),0);
  while(total>pool){
    const stat=[...CORE_STATS].sort((a,b)=>Number(next[b]||0)-Number(next[a]||0)||a.localeCompare(b))[0];
    if(!stat||Number(next[stat]||0)<=0)break;
    next[stat]-=1;total-=1;
  }
  while(total<pool){
    const stat=[...CORE_STATS].sort((a,b)=>Number(next[b]||0)-Number(next[a]||0)||a.localeCompare(b))[0]||'STR';
    next[stat]+=1;total+=1;
  }
  return next;
}

export function getVesselRebindState(slot,{unlockedRaces=[],baseClasses=[]}={}){
  if(!slot?.character)return {available:false,reason:'A Vessel is required.',races:[],baseClasses:[]};
  if(slot?.campaign?.active)return {available:false,reason:'Race and base class cannot be changed during an active campaign.',races:[],baseClasses:[]};
  if(slot?.campaign?.settlement)return {available:false,reason:'Finish the campaign return before changing this Vessel.',races:[],baseClasses:[]};
  return {available:true,reason:'',races:unique(unlockedRaces),baseClasses:unique(baseClasses)};
}

export function rebindVessel(slot,{race,baseClass,confirmed=false,racialConfiguration=null}={},options={}){
  const state=getVesselRebindState(slot,options);
  if(!state.available)return {ok:false,error:state.reason};
  race=String(race||'');baseClass=String(baseClass||'');
  if(!state.races.includes(race))return {ok:false,error:'Choose an unlocked race.'};
  if(!state.baseClasses.includes(baseClass))return {ok:false,error:'Choose a valid base class.'};
  if(!confirmed)return {ok:false,error:'Confirm the Tavern rebinding before applying it.'};
  const racial=validateRacialConfiguration(race,racialConfiguration,options.racialConfigurations);if(!racial.ok)return {ok:false,error:racial.errors[0]};
  const oldRace=slot.character.race,oldBaseClass=slot.character.baseClass;
  if(oldRace===race&&oldBaseClass===baseClass)return {ok:false,error:'Choose a different race or base class before rebinding.'};
  const next=clone(slot),pool=getStartingStatPool(race);
  next.character.race=race;
  next.character.baseClass=baseClass;
  next.character.racialConfiguration=clone(racial.value);
  next.character.startingStatPool=pool;
  next.character.startingStats=fitStatsToPool(next.character.startingStats,pool);
  if(oldBaseClass!==baseClass)next.character.subclass=null;
  next.character.appearance={...(next.character.appearance||{})};
  if(oldBaseClass!==baseClass){delete next.character.appearance.portraitId;delete next.character.appearance.portraitAsset;delete next.character.appearance.portraitSubclass;}
  if((oldRace!==race||oldBaseClass!==baseClass)&&next.character.appearance.portraitSystemId){for(const key of ['portraitSystemId','portraitIdentity','portraitRace','portraitGender','portraitSubclass','portraitAsset','portraitColors','portraitMasks'])delete next.character.appearance[key];}
  next.character.lastReboundAt=new Date().toISOString();
  next.character.rebindCount=Math.max(0,Number(next.character.rebindCount||0))+1;
  return {ok:true,slot:next,previous:{race:oldRace,baseClass:oldBaseClass},current:{race,baseClass},startingStatPool:pool,racialConfiguration:clone(racial.value)};
}

export function setVesselRacialConfiguration(slot, racialConfiguration, { racialConfigurations=null }={}){
  const state=getVesselRebindState(slot);if(!state.available)return {ok:false,error:state.reason};
  const race=String(slot.character.race||'');const valid=validateRacialConfiguration(race,racialConfiguration,racialConfigurations);if(!valid.ok)return {ok:false,error:valid.errors[0]};
  const next=clone(slot);next.character.racialConfiguration=clone(valid.value);next.character.racialConfigurationUpdatedAt=new Date().toISOString();
  return {ok:true,slot:next,race,racialConfiguration:clone(valid.value)};
}

