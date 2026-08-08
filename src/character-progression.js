export const CORE_STATS = ['STR','DEX','CON','INT','FTH','CHA','LCK'];

function clone(v){return typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v));}
function cleanInt(v){const n=Number(v);return Number.isFinite(n)?Math.max(0,Math.trunc(n)):0;}
function unit(rng){const n=Number(rng());return Number.isFinite(n)?Math.min(.999999999,Math.max(0,n)):0;}
export function emptyStats(){return Object.fromEntries(CORE_STATS.map(s=>[s,0]));}
export function combinedCharacterStats(character={}){const out=emptyStats();for(const s of CORE_STATS)out[s]=cleanInt(character.startingStats?.[s])+cleanInt(character.levelEarnedStats?.[s]);return out;}
export function maxHpFor({level=1,con=0,progression}={}){
  const base=Number(progression?.baseMaxHp??10), perCon=Number(progression?.hpPerCon??2), perLevel=Number(progression?.hpPerLevelAfterFirst??3);
  return Math.max(1,Math.round(base+Math.max(0,Number(con)||0)*perCon+Math.max(0,cleanInt(level)-1)*perLevel));
}
export function totalExpThreshold(level, progression){const lv=Math.max(1,cleanInt(level));const map=progression?.totalExpThresholds||{};if(map[String(lv)]!=null)return Number(map[String(lv)]);const keys=Object.keys(map).map(Number).filter(Number.isFinite).sort((a,b)=>a-b);if(!keys.length)return (lv-1)*500;let last=keys.at(-1), total=Number(map[String(last)]||0), step=Math.max(100,total-Number(map[String(Math.max(1,last-1))]||0));for(let n=last+1;n<=lv;n++){step+=100;total+=step;}return total;}
export function levelForTotalExp(exp, progression){const total=Math.max(0,Number(exp)||0);let level=1;while(total>=totalExpThreshold(level+1,progression)&&level<100)level++;return level;}
export function expToNextLevel(character, progression){const level=Math.max(1,cleanInt(character?.level||1));return Math.max(0,totalExpThreshold(level+1,progression)-Math.max(0,Number(character?.exp)||0));}
function weightedStat(weights,rng){const rows=CORE_STATS.map(stat=>({stat,w:Math.max(0,Number(weights?.[stat]??1))}));let total=rows.reduce((s,r)=>s+r.w,0);if(total<=0)return CORE_STATS[Math.floor(unit(rng)*CORE_STATS.length)];let roll=unit(rng)*total;for(const row of rows){roll-=row.w;if(roll<0)return row.stat;}return rows.at(-1).stat;}
export function randomlyAssignAdventurerLevelStats(character, points, weights, rng=Math.random){const next=character;next.levelEarnedStats=next.levelEarnedStats||emptyStats();const picks=[];for(let i=0;i<cleanInt(points);i++){const stat=weightedStat(weights,rng);next.levelEarnedStats[stat]=cleanInt(next.levelEarnedStats[stat])+1;picks.push(stat);}return picks;}
function humanExtraPoints(race, newLevel){return race==='Human'&&newLevel%2===1?1:0;}
export function awardExpToCharacter(character, amount, progression, {isPlayer=false,race=null,weights=null,rng=Math.random}={}){
  const next=character;const before=Math.max(1,cleanInt(next.level||1));next.exp=Math.max(0,Number(next.exp)||0)+Math.max(0,Number(amount)||0);const after=levelForTotalExp(next.exp,progression);const levelUps=[];
  for(let level=before+1;level<=after;level++){
    const basePoints=cleanInt(progression?.statPointsPerLevel??3);const extra=isPlayer?humanExtraPoints(race,level):0;const points=basePoints+extra;
    if(isPlayer)next.unspentLevelStatPoints=cleanInt(next.unspentLevelStatPoints)+points;
    else levelUps.push({level,points,assigned:randomlyAssignAdventurerLevelStats(next,points,weights,rng)});
    if(isPlayer)levelUps.push({level,points,assigned:[]});
  }
  next.level=after;
  return {beforeLevel:before,afterLevel:after,levelsGained:after-before,levelUps,totalExp:next.exp};
}
export function allocateRunStat(character,stat,amount=1){if(!CORE_STATS.includes(stat))return {ok:false,error:'Unknown core stat.'};const qty=cleanInt(amount);if(!qty)return {ok:false,error:'Choose at least one Stat Point.'};const unspent=cleanInt(character?.unspentLevelStatPoints);if(unspent<qty)return {ok:false,error:'Not enough unspent run Stat Points.'};character.levelEarnedStats=character.levelEarnedStats||emptyStats();character.levelEarnedStats[stat]=cleanInt(character.levelEarnedStats[stat])+qty;character.unspentLevelStatPoints=unspent-qty;return {ok:true};}
export function adventurerOnyxMultiplier(count,progression){const n=Math.max(0,Math.min(3,cleanInt(count)));return Number(progression?.tavernAdventurerOnyxMultipliers?.[String(n)]??(n?0.1:1));}
export function chronicleFromRawOnyx(rawOnyx,progression){return Math.max(0,Number(rawOnyx)||0)/Math.max(1,Number(progression?.chroniclePerOnyxDivisor||25));}
export function cloneProgressionState(v){return clone(v);}
