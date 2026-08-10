function clone(value){return typeof structuredClone==='function'?structuredClone(value):JSON.parse(JSON.stringify(value));}
function isRecord(value){return Boolean(value)&&typeof value==='object'&&!Array.isArray(value);}
function stringList(value){return Array.isArray(value)?[...new Set(value.filter(x=>typeof x==='string'&&x.trim()).map(x=>x.trim()))]:[];}
export const TUTORIAL_STATES=Object.freeze(['never-seen','started','completed','skipped']);
function baseState(){return {starter:{resolved:false,resolution:null,rewardGranted:false,raceChoiceGranted:false,resolvedAt:null},statuses:{},tokenWallet:{keptImpression3OrLess:0,raceChoice:0},contextualSeen:[]};}
export function normalizeTutorialState(account){
  const next=clone(isRecord(account)?account:{});const current=isRecord(next.tutorials)?next.tutorials:{};const base=baseState();const starter=isRecord(current.starter)?current.starter:{};const wallet=isRecord(current.tokenWallet)?current.tokenWallet:{};const rawStatuses=isRecord(current.statuses)?current.statuses:{};const statuses={};
  for(const [id,status] of Object.entries(rawStatuses))statuses[id]=TUTORIAL_STATES.includes(status)?status:'never-seen';
  const keptToken=Number(wallet.keptImpression3OrLess),raceToken=Number(wallet.raceChoice);
  next.tutorials={...base,...current,starter:{...base.starter,...starter,resolved:Boolean(starter.resolved),resolution:['completed','skipped'].includes(starter.resolution)?starter.resolution:null,rewardGranted:Boolean(starter.rewardGranted),raceChoiceGranted:Boolean(starter.raceChoiceGranted),resolvedAt:typeof starter.resolvedAt==='string'?starter.resolvedAt:null},statuses,tokenWallet:{...base.tokenWallet,...wallet,keptImpression3OrLess:Number.isFinite(keptToken)?Math.min(2,Math.max(0,Math.trunc(keptToken))):0,raceChoice:Number.isFinite(raceToken)?Math.min(1,Math.max(0,Math.trunc(raceToken))):0},contextualSeen:stringList(current.contextualSeen)};
  return next;
}
export function starterNeedsResolution(account){return !normalizeTutorialState(account).tutorials.starter.resolved;}
export function resolveStarterTutorial(account,resolution='completed'){
  if(!['completed','skipped'].includes(resolution))return {ok:false,error:'Starter tutorial must be completed or skipped.'};
  let next=normalizeTutorialState(account);if(next.tutorials.starter.resolved)return {ok:true,account:next,granted:0,raceGranted:0,alreadyResolved:true};
  next.tutorials.starter={resolved:true,resolution,rewardGranted:true,raceChoiceGranted:true,resolvedAt:new Date().toISOString()};
  const before=Math.max(0,Math.min(2,Math.trunc(Number(next.tutorials.tokenWallet.keptImpression3OrLess||0))));
  const raceBefore=Math.max(0,Math.min(1,Math.trunc(Number(next.tutorials.tokenWallet.raceChoice||0))));
  next.tutorials.tokenWallet.keptImpression3OrLess=2;
  next.tutorials.tokenWallet.raceChoice=1;
  return {ok:true,account:next,granted:2-before,raceGranted:1-raceBefore,alreadyResolved:false};
}
export function tutorialStatus(account,id){return normalizeTutorialState(account).tutorials.statuses?.[id]||'never-seen';}
export function setTutorialStatus(account,id,status){if(!TUTORIAL_STATES.includes(status))return {ok:false,error:'Unknown tutorial status.'};const next=normalizeTutorialState(account);next.tutorials.statuses[id]=status;return {ok:true,account:next};}
export function markContextualSeen(account,id){const next=normalizeTutorialState(account);next.tutorials.contextualSeen=[...new Set([...(next.tutorials.contextualSeen||[]),id])];return next;}
export function contextualSeen(account,id){return normalizeTutorialState(account).tutorials.contextualSeen.includes(id);}
export function tutorialTokenBalance(account){return Number(normalizeTutorialState(account).tutorials.tokenWallet.keptImpression3OrLess||0);}
export function raceChoiceTokenBalance(account){return Number(normalizeTutorialState(account).tutorials.tokenWallet.raceChoice||0);}
export function redeemTutorialKeptToken(account,id,entries=[]){
  let next=normalizeTutorialState(account);const entry=entries.find(e=>e.id===id);if(!entry)return {ok:false,error:'That Kept Impression does not exist.'};
  if(Number(entry.slots)>3)return {ok:false,error:'Starter tokens can only unlock Kept Impressions costing 3 slots or less.'};
  const owned=new Set(next.unlocks?.keptImpressions||[]);if(owned.has(id))return {ok:false,error:'That Kept Impression is already kept by this account.'};
  const balance=tutorialTokenBalance(next);if(balance<1)return {ok:false,error:'No free Kept Impression tokens remain.'};
  next.unlocks={...(next.unlocks||{}),keptImpressions:[...owned,id]};next.tutorials.tokenWallet.keptImpression3OrLess=balance-1;
  return {ok:true,account:next,entry,remaining:balance-1};
}
export function redeemRaceChoiceToken(account,race,allRaces=[]){
  let next=normalizeTutorialState(account);const selected=String(race||'').trim();const legal=new Set((Array.isArray(allRaces)?allRaces:[]).map(String));
  if(!selected||!legal.has(selected))return {ok:false,error:'Choose a valid race for the free Race Choice token.'};
  const owned=new Set(next.unlocks?.races||[]);if(owned.has(selected))return {ok:false,error:'That race is already unlocked for this account.'};
  const balance=raceChoiceTokenBalance(next);if(balance<1)return {ok:false,error:'No free Race Choice token remains.'};
  owned.add(selected);next.unlocks={...(next.unlocks||{}),races:[...owned]};next.tutorials.tokenWallet.raceChoice=balance-1;
  return {ok:true,account:next,race:selected,remaining:balance-1};
}
