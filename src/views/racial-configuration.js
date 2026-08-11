import { escapeHtml } from './shared.js';
import { racialConfigurationSummary } from '../racial-configuration.js';
function selected(a,b){return String(a||'')===String(b||'')?'selected':'';}
function optionRows(list=[],current=''){return `<option value="">Choose…</option>${list.map(o=>`<option value="${escapeHtml(o.id)}" ${selected(o.id,current)}>${escapeHtml(o.label)}</option>`).join('')}`;}
function summaryRows(list=[]){return `<div class="racial-option-notes">${list.map(o=>`<small><strong>${escapeHtml(o.label)}:</strong> ${escapeHtml(o.summary||'')}</small>`).join('')}</div>`;}
export function renderRacialConfigurationPanels(data,{prefix='racial',selectedRace='',currentConfig=null,legend='Racial Configuration'}={}){
 const races=data?.races||{};const damageTypes=data?.damageTypeOptions||[];
 return `<section class="panel creation-wide racial-configuration-shell" data-racial-config-shell><div class="kicker">Tavern-only Choice</div><h3>${escapeHtml(legend)}</h3><p class="muted">Configurable racial features are chosen in the Tavern and become immutable snapshots when a campaign begins. Dragonblooded’s bound element is configured separately in Krass’s Library.</p>${Object.entries(races).map(([race,def])=>{
  const cfg=race===selectedRace?(currentConfig||{}):{};let body='';
  if(def.type==='single')body=`<label>${escapeHtml(def.label)}<select name="${prefix}_${escapeHtml(def.key)}">${optionRows(def.options,cfg[def.key])}</select></label>${summaryRows(def.options)}`;
  else if(def.type==='paired')body=`<div class="filter-grid">${(def.groups||[]).map(g=>`<label>${escapeHtml(g.label)}<select name="${prefix}_${escapeHtml(g.key)}">${optionRows(g.options,cfg[g.key])}</select></label>`).join('')}</div>${(def.groups||[]).map(g=>summaryRows(g.options)).join('')}`;
  else if(def.type==='core-triad'){
   const aux=Array.isArray(cfg.auxiliaryCores)?cfg.auxiliaryCores:[];body=`<div class="filter-grid"><label>Main Core · 1.5×<select name="${prefix}_main_core">${optionRows(def.coreOptions,cfg.mainCore)}</select></label><label>Auxiliary Core 1 · 0.5×<select name="${prefix}_aux_core_1">${optionRows(def.coreOptions,aux[0])}</select></label><label>Auxiliary Core 2 · 0.5×<select name="${prefix}_aux_core_2">${optionRows(def.coreOptions,aux[1])}</select></label><label>Ward damage type<select name="${prefix}_ward_damage_type"><option value="">Only if Ward selected</option>${damageTypes.map(t=>`<option ${selected(t,cfg.coreElements?.ward)}>${escapeHtml(t)}</option>`).join('')}</select></label><label>Prism damage type<select name="${prefix}_prism_damage_type"><option value="">Only if Prism selected</option>${damageTypes.map(t=>`<option ${selected(t,cfg.coreElements?.prism)}>${escapeHtml(t)}</option>`).join('')}</select></label></div>${summaryRows(def.coreOptions)}`;
  }
  const hidden=race===selectedRace?'':'hidden';return `<div class="racial-configuration-panel" data-racial-config-panel="${escapeHtml(race)}" ${hidden}><h4>${escapeHtml(race)} · ${escapeHtml(def.label||'Configuration')}</h4><p>${escapeHtml(def.help||'')}</p>${body}</div>`;
 }).join('')}<div class="racial-fixed-message" data-racial-fixed-message ${races[selectedRace]?'hidden':''}><p class="muted">This race has fixed racial features and does not require an additional configuration.</p></div></section>`;
}
export function renderRacialConfigurationStatus(race,config,data){return `<div class="notice"><strong>Current racial configuration:</strong> ${escapeHtml(racialConfigurationSummary(race,config,data))}</div>`;}
