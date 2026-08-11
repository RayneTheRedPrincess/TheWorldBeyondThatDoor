export const KRASS_LIBRARY_UI_STORAGE_KEY = 'twbtd-krass-library-ui-v1';

export const DEFAULT_KRASS_LIBRARY_UI = Object.freeze({
  tokenOpen: true,
  tokenQuery: '',
  tokenSlot: 'all',
  tokenStatus: 'eligible',
  tokenTags: [],
  tokenSort: 'id',
  shopOpen: true,
  shopQuery: '',
  shopSlot: 'all',
  shopRegion: 'all',
  shopPrice: 'all',
  shopRequirement: 'all',
  shopOwnership: 'all',
  shopTags: [],
  shopSort: 'id'
});

const TOKEN_SORTS = new Set(['id','name','slots']);
const SHOP_SORTS = new Set(['id','name','slots','price','progress']);
const TOKEN_STATUSES = new Set(['eligible','all','owned']);
const SHOP_STATUSES = new Set(['all','owned','unowned']);
const REQUIREMENT_STATUSES = new Set(['all','met','locked']);
const PRICE_BANDS = new Set(['all','0-1000','1001-1500','1501-2000','2001-2500','2501-5000','5001+']);

function tags(value){return Array.isArray(value)?[...new Set(value.filter(v=>typeof v==='string'&&v.trim()).map(v=>v.trim()))]:[];}
function flag(value,fallback){return typeof value==='boolean'?value:fallback;}
function choice(value, allowed, fallback){return allowed.has(value)?value:fallback;}

export function normalizeKrassLibraryUi(raw={}) {
  const d=DEFAULT_KRASS_LIBRARY_UI;
  return {
    tokenOpen:flag(raw.tokenOpen,d.tokenOpen),
    tokenQuery:typeof raw.tokenQuery==='string'?raw.tokenQuery:d.tokenQuery,
    tokenSlot:/^(all|1|2|3)$/.test(String(raw.tokenSlot))?String(raw.tokenSlot):d.tokenSlot,
    tokenStatus:choice(raw.tokenStatus,TOKEN_STATUSES,d.tokenStatus),
    tokenTags:tags(raw.tokenTags),
    tokenSort:choice(raw.tokenSort,TOKEN_SORTS,d.tokenSort),
    shopOpen:flag(raw.shopOpen,d.shopOpen),
    shopQuery:typeof raw.shopQuery==='string'?raw.shopQuery:d.shopQuery,
    shopSlot:/^(all|[1-9]\d*)$/.test(String(raw.shopSlot))?String(raw.shopSlot):d.shopSlot,
    shopRegion:typeof raw.shopRegion==='string'&&raw.shopRegion?raw.shopRegion:d.shopRegion,
    shopPrice:choice(raw.shopPrice,PRICE_BANDS,d.shopPrice),
    shopRequirement:choice(raw.shopRequirement,REQUIREMENT_STATUSES,d.shopRequirement),
    shopOwnership:choice(raw.shopOwnership,SHOP_STATUSES,d.shopOwnership),
    shopTags:tags(raw.shopTags),
    shopSort:choice(raw.shopSort,SHOP_SORTS,d.shopSort)
  };
}

export function readKrassLibraryUi(storage=globalThis.localStorage){
  try { const raw=storage?.getItem?.(KRASS_LIBRARY_UI_STORAGE_KEY); return normalizeKrassLibraryUi(raw?JSON.parse(raw):{}); }
  catch { return normalizeKrassLibraryUi({}); }
}

export function writeKrassLibraryUi(ui,storage=globalThis.localStorage){
  const normalized=normalizeKrassLibraryUi(ui);
  try { storage?.setItem?.(KRASS_LIBRARY_UI_STORAGE_KEY,JSON.stringify(normalized)); } catch {}
  return normalized;
}

export function entryMatchesTags(entry,selected=[]){
  const wanted=tags(selected);if(!wanted.length)return true;const have=new Set(entry?.tags||[]);return wanted.every(tag=>have.has(tag));
}

function textMatches(entry,query){
  const q=String(query||'').trim().toLowerCase();if(!q)return true;
  return `${entry?.id||''} ${entry?.name||''} ${entry?.mechanic||entry?.canonical_text||''} ${entry?.subclass||''} ${entry?.family||''} ${(entry?.tags||[]).join(' ')}`.toLowerCase().includes(q);
}
function kiNumber(entry){return Number(String(entry?.id||'').replace(/^KI-/,''))||0;}

export function filterTokenEntries(entries,ownedIds,uiRaw={}){
  const ui=normalizeKrassLibraryUi(uiRaw),owned=ownedIds instanceof Set?ownedIds:new Set(ownedIds||[]);
  let rows=(entries||[]).filter(entry=>Number(entry?.slots||0)<=3);
  rows=rows.filter(entry=>textMatches(entry,ui.tokenQuery)&&entryMatchesTags(entry,ui.tokenTags));
  if(ui.tokenSlot!=='all')rows=rows.filter(entry=>Number(entry.slots)===Number(ui.tokenSlot));
  if(ui.tokenStatus==='eligible')rows=rows.filter(entry=>!owned.has(entry.id));
  else if(ui.tokenStatus==='owned')rows=rows.filter(entry=>owned.has(entry.id));
  rows=[...rows].sort((a,b)=>ui.tokenSort==='name'?String(a.name).localeCompare(String(b.name)):ui.tokenSort==='slots'?Number(a.slots)-Number(b.slots)||kiNumber(a)-kiNumber(b):kiNumber(a)-kiNumber(b));
  return rows;
}

export function shopPriceMatches(cost,band='all'){
  const n=Math.max(0,Number(cost)||0);
  if(band==='0-1000')return n<=1000;
  if(band==='1001-1500')return n>=1001&&n<=1500;
  if(band==='1501-2000')return n>=1501&&n<=2000;
  if(band==='2001-2500')return n>=2001&&n<=2500;
  if(band==='2501-5000')return n>=2501&&n<=5000;
  if(band==='5001+')return n>=5001;
  return true;
}

export function requirementRatio(row){
  const p=Math.max(0,Number(row?.requirement?.progress||0)),t=Math.max(1,Number(row?.requirement?.target||1));return Math.min(1,p/t);
}

export function filterShopRows(rows,uiRaw={}){
  const ui=normalizeKrassLibraryUi(uiRaw);
  let result=(rows||[]).filter(row=>row?.entry&&textMatches(row.entry,ui.shopQuery)&&entryMatchesTags(row.entry,ui.shopTags));
  if(ui.shopSlot!=='all')result=result.filter(row=>Number(row.entry.slots)===Number(ui.shopSlot));
  if(ui.shopRegion!=='all')result=result.filter(row=>(row.offer?.region||'forest')===ui.shopRegion);
  result=result.filter(row=>shopPriceMatches(row.cost,ui.shopPrice));
  if(ui.shopRequirement==='met')result=result.filter(row=>Boolean(row.requirement?.met));
  else if(ui.shopRequirement==='locked')result=result.filter(row=>!row.requirement?.met);
  if(ui.shopOwnership==='owned')result=result.filter(row=>Boolean(row.owned));
  else if(ui.shopOwnership==='unowned')result=result.filter(row=>!row.owned);
  result=[...result].sort((a,b)=>{
    if(ui.shopSort==='name')return String(a.entry.name).localeCompare(String(b.entry.name));
    if(ui.shopSort==='slots')return Number(a.entry.slots)-Number(b.entry.slots)||kiNumber(a.entry)-kiNumber(b.entry);
    if(ui.shopSort==='price')return Number(a.cost)-Number(b.cost)||kiNumber(a.entry)-kiNumber(b.entry);
    if(ui.shopSort==='progress')return requirementRatio(b)-requirementRatio(a)||kiNumber(a.entry)-kiNumber(b.entry);
    return kiNumber(a.entry)-kiNumber(b.entry);
  });
  return result;
}
