import { escapeHtml } from './shared.js';
import { racialConfigurationSummary, validateRacialConfiguration } from '../racial-configuration.js';
function selected(a,b){return String(a||'')===String(b||'')?'selected':'';}
function optionRows(list=[],current=''){return `<option value="">Choose…</option>${list.map(o=>`<option value="${escapeHtml(o.id)}" ${selected(o.id,current)}>${escapeHtml(o.label)}</option>`).join('')}`;}
function selectedBadges(id, selections={}){
 const badges=[];
 if(selections.single===id)badges.push('Selected');
 if(selections.main===id)badges.push('Main · 1.5×');
 const auxIndex=(selections.aux||[]).indexOf(id);if(auxIndex>=0)badges.push(`Auxiliary ${auxIndex+1} · 0.5×`);
 return badges;
}
function summaryRows(list=[],selections={},label='Racial option descriptions'){
 return `<div class="racial-option-notes" role="list" aria-label="${escapeHtml(label)}" tabindex="0">${list.map(o=>{const badges=selectedBadges(o.id,selections);return `<article class="racial-option-note ${badges.length?'is-selected':''}" role="listitem"><div class="racial-option-note-head"><strong>${escapeHtml(o.label)}</strong>${badges.length?`<span>${escapeHtml(badges.join(' · '))}</span>`:''}</div><p>${escapeHtml(o.summary||'')}</p></article>`;}).join('')}</div>`;
}
function configuredChoices(race,config,data){
 const def=data?.races?.[race];if(!def)return[];const valid=validateRacialConfiguration(race,config,data);if(!valid.ok)return[];const value=valid.value;
 if(def.type==='single'){
  const opt=(def.options||[]).find(x=>x.id===value[def.key]);return opt?[{label:opt.label,meta:def.label||'Selected feature',summary:opt.summary||''}]:[];
 }
 if(def.type==='paired')return (def.groups||[]).map(group=>{const opt=(group.options||[]).find(x=>x.id===value[group.key]);return opt?{label:opt.label,meta:group.label,summary:opt.summary||''}:null;}).filter(Boolean);
 if(def.type==='core-triad'){
  const byId=id=>(def.coreOptions||[]).find(x=>x.id===id);const out=[];const main=byId(value.mainCore);if(main)out.push({label:main.label,meta:'Main Core · 1.5×',summary:main.summary||''});
  (value.auxiliaryCores||[]).forEach((id,i)=>{const opt=byId(id);if(opt)out.push({label:opt.label,meta:`Auxiliary Core ${i+1} · 0.5×`,summary:opt.summary||''});});
  return out;
 }
 return[];
}
export function renderSelectedRaceDetails(race,config,data){
 const detail=data?.raceDetails?.[race];if(!detail)return'';const chosen=configuredChoices(race,config,data);const abilities=Array.isArray(detail.abilities)?detail.abilities:[];const drawbacks=Array.isArray(detail.drawbacks)&&detail.drawbacks.length?detail.drawbacks:['No dedicated racial drawback is currently listed.'];
 return `<section class="section stat-panel race-reference-panel"><div class="stat-panel-head"><div><div class="kicker">Selected Race</div><h3>${escapeHtml(race)} · Abilities &amp; Drawbacks</h3></div><span class="race-reference-badge">Vessel race</span></div>${detail.summary?`<p class="muted race-reference-summary">${escapeHtml(detail.summary)}</p>`:''}<div class="race-reference-scroll" tabindex="0">${chosen.length?`<div class="race-reference-selected"><h4>Current Selected Racial Features</h4><div class="race-reference-selected-grid">${chosen.map(x=>`<article><span>${escapeHtml(x.meta)}</span><strong>${escapeHtml(x.label)}</strong><p>${escapeHtml(x.summary)}</p></article>`).join('')}</div></div>`:''}<div class="race-reference-columns"><div class="race-reference-group"><h4>Abilities &amp; Traits</h4><ul>${abilities.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul></div><div class="race-reference-group drawbacks"><h4>Drawbacks &amp; Tradeoffs</h4><ul>${drawbacks.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul></div></div></div></section>`;
}
export function renderRacialConfigurationPanels(data,{prefix='racial',selectedRace='',currentConfig=null,legend='Racial Configuration'}={}){
 const races=data?.races||{};const damageTypes=data?.damageTypeOptions||[];
 return `<section class="panel creation-wide racial-configuration-shell" data-racial-config-shell><div class="kicker">Tavern-only Choice</div><h3>${escapeHtml(legend)}</h3><p class="muted">Configurable racial features are chosen in the Tavern and become immutable snapshots when a campaign begins. Dragonblooded’s bound element is configured separately in Krass’s Library.</p>${Object.entries(races).map(([race,def])=>{
  const cfg=race===selectedRace?(currentConfig||{}):{};let body='';
  if(def.type==='single')body=`<label>${escapeHtml(def.label)}<select name="${prefix}_${escapeHtml(def.key)}">${optionRows(def.options,cfg[def.key])}</select></label>${summaryRows(def.options,{single:cfg[def.key]},`${def.label} descriptions`)}`;
  else if(def.type==='paired')body=`<div class="filter-grid">${(def.groups||[]).map(g=>`<label>${escapeHtml(g.label)}<select name="${prefix}_${escapeHtml(g.key)}">${optionRows(g.options,cfg[g.key])}</select></label>`).join('')}</div>${(def.groups||[]).map(g=>`<div class="racial-option-group"><h5>${escapeHtml(g.label)} descriptions</h5>${summaryRows(g.options,{single:cfg[g.key]},`${g.label} descriptions`)}</div>`).join('')}`;
  else if(def.type==='core-triad'){
   const aux=Array.isArray(cfg.auxiliaryCores)?cfg.auxiliaryCores:[];body=`<div class="filter-grid"><label>Main Core · 1.5×<select name="${prefix}_main_core">${optionRows(def.coreOptions,cfg.mainCore)}</select></label><label>Auxiliary Core 1 · 0.5×<select name="${prefix}_aux_core_1">${optionRows(def.coreOptions,aux[0])}</select></label><label>Auxiliary Core 2 · 0.5×<select name="${prefix}_aux_core_2">${optionRows(def.coreOptions,aux[1])}</select></label><label>Ward damage type<select name="${prefix}_ward_damage_type"><option value="">Only if Ward selected</option>${damageTypes.map(t=>`<option ${selected(t,cfg.coreElements?.ward)}>${escapeHtml(t)}</option>`).join('')}</select></label><label>Prism damage type<select name="${prefix}_prism_damage_type"><option value="">Only if Prism selected</option>${damageTypes.map(t=>`<option ${selected(t,cfg.coreElements?.prism)}>${escapeHtml(t)}</option>`).join('')}</select></label></div>${summaryRows(def.coreOptions,{main:cfg.mainCore,aux},'SoulFire Core descriptions')}`;
  }
  const hidden=race===selectedRace?'':'hidden';return `<div class="racial-configuration-panel" data-racial-config-panel="${escapeHtml(race)}" ${hidden}><h4>${escapeHtml(race)} · ${escapeHtml(def.label||'Configuration')}</h4><p>${escapeHtml(def.help||'')}</p>${body}</div>`;
 }).join('')}<div class="racial-fixed-message" data-racial-fixed-message ${races[selectedRace]?'hidden':''}><p class="muted">This race has fixed racial features and does not require an additional configuration.</p></div></section>`;
}
export function renderRacialConfigurationStatus(race,config,data){return `<div class="notice"><strong>Current racial configuration:</strong> ${escapeHtml(racialConfigurationSummary(race,config,data))}</div>`;}
