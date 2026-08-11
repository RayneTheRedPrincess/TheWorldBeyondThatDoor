import { compactEncounterHistoryEntry } from './storage-efficiency.js';
function clone(v){return typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v));}
export function purchaseHellMerchantItem(slot,{itemId,hellCrafting,equipmentCatalog}={}){
 if(!slot?.campaign?.active||!slot.campaign.state)return{ok:false,error:'No active campaign.'};
 const run=slot.campaign.state,ex=run.expedition;if(ex?.regionId!=='caverns-to-hell'||ex?.state!=='hell-merchant'||!ex?.encounter?.hellMerchant)return{ok:false,error:'No Infernal Broker is active.'};
 const merchant=hellCrafting?.merchant;if(!merchant)return{ok:false,error:'Infernal Broker stock is unavailable.'};
 const stock=(merchant.items||[]).find(x=>x.itemId===itemId);if(!stock)return{ok:false,error:'That item is not offered here.'};
 if((ex.hellMerchantPurchases||[]).includes(itemId))return{ok:false,error:'The broker has already sold that item during this expedition.'};
 const item=(equipmentCatalog?.equipment||[]).find(x=>x.id===itemId);if(!item)return{ok:false,error:'That broker item is missing from the equipment catalogue.'};
 const cost=Math.max(0,Math.round(Number(stock.onyxCost||0)));if(Number(run.rewards?.carriedOnyx||0)<cost)return{ok:false,error:'Not enough carried Onyx.'};
 const next=clone(slot),nr=next.campaign.state,nex=nr.expedition;nr.rewards=nr.rewards||{};nr.rewards.carriedOnyx=Math.max(0,Number(nr.rewards.carriedOnyx||0)-cost);nr.inventory=nr.inventory||{};nr.inventory.equipment=nr.inventory.equipment||{};const cur=nr.inventory.equipment[itemId]||{quantity:0,source:'infernal-broker'};cur.quantity=Number(cur.quantity||0)+1;cur.source='infernal-broker';nr.inventory.equipment[itemId]=cur;nex.hellMerchantPurchases=[...new Set([...(nex.hellMerchantPurchases||[]),itemId])];nex.greedsDebt=true;nr.regionalMetrics=nr.regionalMetrics||{};const hm=nr.regionalMetrics.hell||(nr.regionalMetrics.hell={});hm.merchantPurchases=Number(hm.merchantPurchases||0)+1;
 return{ok:true,slot:next,item:clone(item),cost,remainingOnyx:Number(nr.rewards.carriedOnyx||0)};
}
export function leaveHellMerchant(slot,{now=new Date().toISOString()}={}){
 if(!slot?.campaign?.active||!slot.campaign.state)return{ok:false,error:'No active campaign.'};const run=slot.campaign.state,ex=run.expedition;if(ex?.regionId!=='caverns-to-hell'||ex?.state!=='hell-merchant'||!ex?.encounter?.hellMerchant)return{ok:false,error:'No Infernal Broker is active.'};
 const next=clone(slot),nex=next.campaign.state.expedition,enc=nex.encounter;enc.state='resolved';enc.resolution={type:'hell-merchant',purchasedItemIds:clone(nex.hellMerchantPurchases||[]),at:now};nex.history=Array.isArray(nex.history)?nex.history:[];if(!nex.history.some(x=>x.id===enc.id))nex.history.push(compactEncounterHistoryEntry(enc));nex.encounter=null;nex.state='awaiting-next-step';return{ok:true,slot:next};
}
