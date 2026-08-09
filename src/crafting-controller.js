function clone(v){return typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v));}
function n(v){const x=Number(v);return Number.isFinite(x)?x:0;}
function recipeIndex(crafting){return new Map((crafting?.recipes||[]).map(x=>[x.id,x]));}
function materialIndex(crafting){return new Map((crafting?.materials||[]).map(x=>[x.id,x]));}
function equipmentIndex(catalog){return new Map((catalog?.equipment||[]).map(x=>[x.id,x]));}
function consumableIndex(catalog){return new Map((catalog?.consumables||[]).map(x=>[x.id,x]));}
export function starterGearForBaseClass(baseClass,crafting){const shared=[...(crafting?.starterGear?.shared||[])];const own=[...(crafting?.starterGear?.byBaseClass?.[baseClass]||[])];return [...new Set([...shared,...own])];}
export function initializeCampaignCraftingInventory(baseClass,crafting,{borrowedItem=null}={}){
 const ids=starterGearForBaseClass(baseClass,crafting);const equipment={};for(const id of ids)equipment[id]={quantity:1,source:'starter'};
 const borrowedId=typeof borrowedItem==='string'?borrowedItem:borrowedItem?.id||borrowedItem?.itemId||null;if(borrowedId)equipment[borrowedId]={quantity:1,source:'lender'};
 const initialEquipment={};for(const id of ids){if(id.includes('starter-wayfarer-vest'))initialEquipment.chest=id;else initialEquipment.mainHand=id;}
 return {equipment,initialEquipment,equippedHistory:[...ids]};
}
function threadedDiscount(run,ingredient,crafting){const threaded=run?.keptImpressions?.materialThread?.threadedMaterialId;if(threaded!==ingredient.materialId)return 0;const kind=materialIndex(crafting).get(ingredient.materialId)?.kind;return (crafting?.rules?.materialThreadEligibleKinds||[]).includes(kind)?1:0;}
export function recipeEffectiveIngredients(run,recipe,crafting){return (recipe?.ingredients||[]).map(ing=>{const discount=threadedDiscount(run,ing,crafting);return {...ing,baseQuantity:n(ing.quantity),discount,quantity:Math.max(1,n(ing.quantity)-discount)};});}
export function recipeCraftability(run,recipe,crafting){
 if(!recipe)return {craftable:false,missing:[],ingredients:[]};const ingredients=recipeEffectiveIngredients(run,recipe,crafting);const missing=[];
 for(const ing of ingredients){const have=n(run?.inventory?.materials?.[ing.materialId]?.quantity);if(have<ing.quantity)missing.push({materialId:ing.materialId,need:ing.quantity,have,short:ing.quantity-have});}
 return {craftable:missing.length===0,missing,ingredients};
}
export function craftAtCampsite(slot,{recipeId,crafting,catalog}={}){
 if(!slot?.campaign?.active||slot.campaign.state?.expedition?.state!=='campsite')return {ok:false,error:'Crafting is available only at an active Campsite.'};
 const recipe=recipeIndex(crafting).get(recipeId);if(!recipe)return {ok:false,error:'Unknown crafting recipe.'};const next=clone(slot),run=next.campaign.state;run.inventory=run.inventory||{};run.inventory.materials=run.inventory.materials||{};run.inventory.equipment=run.inventory.equipment||{};run.inventory.consumables=run.inventory.consumables||{};
 const check=recipeCraftability(run,recipe,crafting);if(!check.craftable)return {ok:false,error:'Required crafting materials are missing.',missing:check.missing};
 for(const ing of check.ingredients){const entry=run.inventory.materials[ing.materialId];entry.quantity=Math.max(0,n(entry.quantity)-ing.quantity);}
 const output=recipe.output||{};if(output.type==='equipment'){
   const item=equipmentIndex(catalog).get(output.id);if(!item)return {ok:false,error:'Crafted equipment definition is missing.'};const entry=run.inventory.equipment[output.id]||{quantity:0};entry.quantity=n(entry.quantity)+Math.max(1,n(output.quantity)||1);entry.source='crafted';run.inventory.equipment[output.id]=entry;
 } else if(output.type==='consumable'){
   const item=consumableIndex(catalog).get(output.id);if(!item)return {ok:false,error:'Crafted consumable definition is missing.'};const entry=run.inventory.consumables[output.id]||{quantity:0};entry.quantity=n(entry.quantity)+Math.max(1,n(output.quantity)||1);entry.source='crafted';run.inventory.consumables[output.id]=entry;
 } else return {ok:false,error:'Unsupported crafting output type.'};
 const usedThreaded=check.ingredients.some(x=>x.discount>0);if(usedThreaded&&run.keptImpressions?.materialThread)run.keptImpressions.materialThread.threadedMaterialId=null;
 run.crafting=run.crafting||{crafted:[],equippedHistory:[]};run.crafting.crafted=Array.isArray(run.crafting.crafted)?run.crafting.crafted:[];run.crafting.crafted.push({recipeId:recipe.id,output:clone(output),at:new Date().toISOString()});
 return {ok:true,slot:next,recipe:clone(recipe),ingredients:clone(check.ingredients),usedThreadedMaterial:usedThreaded};
}
export function listCraftingRecipes(run,crafting,catalog,{onlyCraftable=false,sortStat=null,direction='desc',query='',slot='all',itemType='all',subtype='all',weaponType='all',armorWeight='all'}={}){
 const eidx=equipmentIndex(catalog),cidx=consumableIndex(catalog),needle=String(query||'').trim().toLowerCase();let rows=(crafting?.recipes||[]).map(recipe=>{const output=recipe.output?.type==='equipment'?eidx.get(recipe.output.id):cidx.get(recipe.output?.id);const check=recipeCraftability(run,recipe,crafting);const statValue=n(output?.listedStats?.[sortStat]);return {recipe:clone(recipe),output:clone(output),craftable:check.craftable,ingredients:check.ingredients,missing:check.missing,sortValue:statValue};});
 if(onlyCraftable)rows=rows.filter(x=>x.craftable);
 if(needle)rows=rows.filter(({recipe,output})=>[recipe?.name,recipe?.category,output?.name,output?.itemType,output?.itemSubtype,output?.subtype,output?.charmType,output?.weaponType,output?.armorCategory].filter(Boolean).some(v=>String(v).toLowerCase().includes(needle)));
 if(slot!=='all')rows=rows.filter(({output})=>(output?.slot||'consumable')===slot);
 if(itemType!=='all')rows=rows.filter(({output})=>(output?.itemType||'Consumable')===itemType);
 if(subtype!=='all')rows=rows.filter(({output})=>(output?.itemSubtype||output?.charmType||output?.subtype||'')===subtype);
 if(weaponType!=='all')rows=rows.filter(({output})=>output?.weaponType===weaponType);
 if(armorWeight!=='all')rows=rows.filter(({output})=>output?.armorCategory===armorWeight);
 if(sortStat){const dir=direction==='asc'?1:-1;rows.sort((a,b)=>(a.sortValue-b.sortValue)*dir||a.recipe.name.localeCompare(b.recipe.name));}
 return rows;
}
