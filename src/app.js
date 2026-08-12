import { ROUTES } from './constants.js';
import { CanonRegistry } from './canon-registry.js';
import { Router } from './router.js';
import { applyAccountBootstrap, migrateMantleUnlocksFromTrainerHistory } from './account-bootstrap.js';
import { createVesselSlotState, validateVesselDraft } from './character-creator.js';
import { rebindVessel, setVesselRacialConfiguration } from './vessel-controller.js';
import { selectVesselPortrait, selectStaticVesselPortrait } from './portrait-controller.js';
import { SaveController } from './save-controller.js';
import { TavernController } from './tavern-controller.js';
import { equipKeptImpression, unequipKeptImpression, setKeptImpressionChoice } from './kept-impression-controller.js';
import { selectMantle } from './mantle-controller.js';
import { purchaseChronicleNode, respecChronicleFamily } from './chronicle-controller.js';
import { getCampaignDoorState, getCampaignPreparationSummary } from './campaign-door.js';
import { startCampaign, getCampaignRunView, applyCampaignSettlement, endCampaign, allocatePlayerRunStat, setTavernAdventurerParty } from './campaign-controller.js';
import { selectExpeditionCard, leaveCampsite, advanceAfterResolvedNoncombat, resolveCombatVictory, continueBeyondForest, continueAfterForestEventResult, enterBogRegion, enterTowerRegion, enterPlainsRegion, enterHellRegion, enterDragonRegion, enterNecropolisRegion, enterFinalRegion } from './expedition-controller.js';
import { resolveForestEventCheck, chooseTrainerFight, learnFromTrainer } from './forest-event-controller.js';
import { takePlayerTurnAction, endCombatTurn } from './combat-controller.js';
import { combatPresentationDelayMsForSpeed, combatCompletionDelayMsForSpeed } from './combat-presentation.js';
import { autoEndPlayerTurn } from './gameplay-efficiency.js';
import { predecodeUpcomingCombatPortraits } from './portrait-preload.js';
import { attachForestCombat, awardCurrentForestMaterialCache } from './forest-encounter-builder.js';
import { attachBogCombat, awardCurrentBogMaterialCache } from './bog-encounter-builder.js';
import { attachTowerCombat, awardCurrentTowerMaterialCache } from './tower-encounter-builder.js';
import { attachPlainsCombat, awardCurrentPlainsMaterialCache } from './plains-encounter-builder.js';
import { attachHellCombat, awardCurrentHellMaterialCache } from './hell-encounter-builder.js';
import { attachDragonCombat, awardCurrentDragonMaterialCache } from './dragon-encounter-builder.js';
import { attachNecropolisCombat, awardCurrentNecropolisMaterialCache } from './necropolis-encounter-builder.js';
import { attachFinalRegionCombat, awardCurrentFinalRegionMaterialCache } from './final-region-encounter-builder.js';
import { purchaseHellMerchantItem, leaveHellMerchant } from './hell-merchant-controller.js';
import { resolveEnemyTurn } from './enemy-ai.js';
import { resolveTavernAdventurerTurn } from './ally-ai.js';
import { awardCurrentForestCombatRewards } from './forest-reward-controller.js';
import { executeBaseAbility, chooseDruidStartingForm } from './ability-controller.js';
import { executeSubclassAbility, resolveSubclassTurnStartEvents } from './subclass-controller.js';
import { executeKeptActiveAbility, setKeptCombatStartChoice } from './kept-impression-runtime.js';
import { executeEquippedConsumable, resolveTrailstockTurnStart, equipConsumableAtCampsite, unequipConsumableAtCampsite, discardRunConsumableAtCampsite } from './consumable-controller.js';
import { executeEquipmentAbility } from './equipment-ability-controller.js';
import { executeRacialAbility } from './racial-ability-controller.js';
import { equipRunEquipmentAtCampsite, unequipRunEquipmentAtCampsite, discardRunEquipmentAtCampsite, recommendEquipmentLoadout, autoEquipRecommendedAtCampsite, scoreEquipmentItemsForRecommendation, legalEquipmentSlots } from './equipment-controller.js';
import { craftAtCampsite, mergeCraftingCatalogs, listCraftingRecipes } from './crafting-controller.js';
import { updateClasslessConfig, classlessLimits } from './classless-controller.js';
import { ensureMaraQuestOffers, acceptMaraQuest, abandonMaraQuest, selectBorrowedLenderItem, selectReturnedLenderItem, evaluateMaraQuest, purchaseKeptImpressionBoon } from './tavern-services-controller.js';
import { getStartingStatPool, readStartingStatsFromForm, redistributeStartingStats, CORE_STATS } from './starting-stats.js';
import { readRacialConfigurationFromForm } from './racial-configuration.js';
import { readKrassLibraryUi, writeKrassLibraryUi, DEFAULT_KRASS_LIBRARY_UI } from './library-ui.js';
import { renderHome } from './views/home.js';
import { renderSlots } from './views/slots.js';
import { renderCharacterCreation } from './views/create-character.js';
import { renderTavern } from './views/tavern.js';
import { renderChronicle } from './views/chronicle.js';
import { renderCampaignPreparation } from './views/campaign-prep.js';
import { renderCampaignRun } from './views/campaign-run.js';
import { renderCampaignResults } from './views/campaign-results.js';
import { renderSettings } from './views/settings.js';
import { escapeHtml } from './views/shared.js';
import { normalizeTutorialState, starterNeedsResolution, resolveStarterTutorial, setTutorialStatus, tutorialStatus, redeemTutorialKeptToken, redeemRaceChoiceToken, raceChoiceTokenBalance, markContextualSeen, contextualSeen } from './tutorial-controller.js';
import { renderTutorial, starterTutorialOverlay, guidedTutorialOverlay } from './views/tutorial.js';
import { renderHelp } from './views/help.js';
import { renderCredits } from './views/credits.js';

function cumulativeCampsiteCrafting(canon,regionId){
  const catalogs=[canon.getForestCrafting()];
  const order=['bog-of-lost-souls','heavenly-tower','ruined-vampiric-plains','caverns-to-hell','that-dragons-dungeon','necropolis','shadow-infused-dark-woods'];
  const index=order.indexOf(regionId);
  if(index>=0)catalogs.push(canon.getBogCrafting());
  if(index>=1)catalogs.push(canon.getTowerCrafting());
  if(index>=2)catalogs.push(canon.getPlainsCrafting());
  if(index>=3)catalogs.push(canon.getHellCrafting());
  if(index>=4)catalogs.push(canon.getDragonCrafting());
  if(index>=5)catalogs.push(canon.getNecropolisCrafting());
  return mergeCraftingCatalogs(catalogs);
}

class App {
  constructor(root) {
    this.root = root;
    this.save = new SaveController();
    this.account = null;
    this.canon = null;
    this.router = new Router(route => this.render(route));
    this.tavern = new TavernController();
    this.pendingCreationSlot = null;
    this.creationErrors = [];
    this.creationMessage = '';
    this.resetStage = 0;
    this.tavernMessage = '';
    this.chronicleMessage = '';
    this.chronicleFamily = null;
    this.craftingOnlyCraftable = false;
    this.craftingSortStat = '';
    this.craftingSortDirection = 'desc';
    this.craftingQuery = '';
    this.craftingSlot = 'all';
    this.craftingType = 'all';
    this.craftingSubtype = 'all';
    this.craftingWeaponType = 'all';
    this.craftingArmorWeight = 'all';
    this.craftingOpenCategories = null;
    this.craftingShowHidden = false;
    this.craftingMessage = '';
    this.resultsMessage = '';
    this.combatActionPanel = 'abilities';
    this.combatPlaybackTimer = null;
    this.combatCompletionHoldEncounterId = null;
    this.consumedCombatPresentationId = null;
    this.presentationCombatId = null;
    this.deferNextAiAction = false;
    this.campsiteEquipmentOwnerId = 'vessel';
    this.campsiteSidebarOpen = true;
    this.campsiteSidebarTab = 'party';
    this.campsiteItemsOpen = true;
    this.campsiteSidebarScrollTop = 0;
    this.campsiteCraftingScrollTop = 0;
    this.runStatsOwnerId = 'vessel';
    this.starterTutorialStep = 0;
    this.activeTutorialId = null;
    this.activeTutorialStep = 0;
    this.helpQuery = '';
    this.libraryQuery = '';
    this.librarySlotCost = 'all';
    this.libraryType = 'all';
    this.libraryFamily = 'all';
    this.libraryTags = [];
    this.librarySort = 'id';
    this.krassLibraryUi = readKrassLibraryUi();
    this.lenderQuery = '';
    this.lenderSlot = 'all';
    this.lenderWeaponType = 'all';
    this.lenderSort = 'name';
    this.portraitCarouselOffset = 0;
    this.contextLessonId = null;
    this.combatPortraitPredecode = { combatId:null, status:'idle', promise:null };
    this.tutorialReturnRoute = null;
    this.tutorialReturnTavernRoom = null;
    this.displayMode = null;
    this.started = false;
    this.startPromise = null;
    this.boundRootHandlers = {
      click: e => this.onClick(e),
      change: e => this.onChange(e),
      input: e => this.onInput(e),
      submit: e => this.onSubmit(e),
      toggle: e => this.onToggle(e)
    };
  }

  async start() {
    if (this.started) return;
    if (this.startPromise) return this.startPromise;
    this.startPromise = (async () => {
      this.root.innerHTML = '<main class="shell"><section class="hero"><p class="subtitle">Opening the Tavern…</p></section></main>';
      this.canon = await CanonRegistry.load();
      this.account = this.bootstrapAccount(this.save.ensureAccount());
      this.displayMode = this.readDisplayMode();
      this.applyDisplayMode(this.displayMode);
      this.root.addEventListener('click', this.boundRootHandlers.click);
      this.root.addEventListener('change', this.boundRootHandlers.change);
      this.root.addEventListener('input', this.boundRootHandlers.input);
      this.root.addEventListener('submit', this.boundRootHandlers.submit);
      this.root.addEventListener('toggle', this.boundRootHandlers.toggle, true);
      this.router.start();
      if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./sw.js').catch(() => {});
      this.started = true;
    })();
    try {
      return await this.startPromise;
    } catch (error) {
      this.root.removeEventListener('click', this.boundRootHandlers.click);
      this.root.removeEventListener('change', this.boundRootHandlers.change);
      this.root.removeEventListener('input', this.boundRootHandlers.input);
      this.root.removeEventListener('submit', this.boundRootHandlers.submit);
      this.root.removeEventListener('toggle', this.boundRootHandlers.toggle, true);
      this.router.stop();
      this.started = false;
      this.startPromise = null;
      throw error;
    } finally {
      if (this.started) this.startPromise = null;
    }
  }

  bootstrapAccount(account) {
    let next = applyAccountBootstrap(account, this.canon.getAccountBootstrap());
    next = migrateMantleUnlocksFromTrainerHistory(next, {entries:[...(this.canon.getForestTrainers()?.entries||[]),...(this.canon.getBogTrainers()?.entries||[])]});
    next.currencies = { ...(next.currencies || {}), onyx: Number(next.currencies?.onyx || 0) };
    next.settings = { combatSpeed: 1, autoEndTurn: true, reducedMotion: false, combatNumbers: true, screenFlash: 'standard', hiddenCraftingRecipes: [], ...(next.settings || {}) };
    next.settings.hiddenCraftingRecipes = [...new Set((Array.isArray(next.settings.hiddenCraftingRecipes)?next.settings.hiddenCraftingRecipes:[]).filter(id=>typeof id==='string'&&id))];
    const withTutorials = normalizeTutorialState(next);
    next.tutorials = withTutorials.tutorials;
    next.history = { ...(next.history || {}), settledCampaignIds: Array.isArray(next.history?.settledCampaignIds) ? next.history.settledCampaignIds : [] };
    return this.save.saveAccount(next);
  }

  slots() { return this.save.listSlots(); }
  activeSlotNumber() { const number = Number(this.account?.activeSlot || 0); return number >= 1 && number <= 9 ? number : null; }
  activeSlot() { const number = this.activeSlotNumber(); return number ? this.save.loadSlot(number) : null; }

  readDisplayMode() {
    try {
      const saved = localStorage.getItem('twbtd-display-mode');
      if (saved === 'mobile' || saved === 'desktop') return saved;
    } catch {}
    return globalThis.matchMedia?.('(max-width: 720px)')?.matches ? 'mobile' : 'desktop';
  }

  applyDisplayMode(mode = this.displayMode) {
    const next = mode === 'mobile' ? 'mobile' : 'desktop';
    this.displayMode = next;
    document.documentElement.dataset.displayMode = next;
    const viewport = document.querySelector('meta[name="viewport"]');
    if (viewport) viewport.setAttribute('content', next === 'desktop' ? 'width=1280, viewport-fit=cover' : 'width=device-width, initial-scale=1, viewport-fit=cover');
    return next;
  }

  setDisplayMode(mode) {
    const next = this.applyDisplayMode(mode);
    try { localStorage.setItem('twbtd-display-mode', next); } catch {}
    this.render(this.router.routeFromLocation());
  }

  updateKrassLibraryUi(patch = {}) {
    this.krassLibraryUi = writeKrassLibraryUi({ ...(this.krassLibraryUi || {}), ...patch });
    return this.krassLibraryUi;
  }

  clearKrassLibraryFilters(section) {
    const d = DEFAULT_KRASS_LIBRARY_UI;
    if (section === 'tokens') this.updateKrassLibraryUi({ tokenQuery:d.tokenQuery, tokenSlot:d.tokenSlot, tokenStatus:d.tokenStatus, tokenTags:[], tokenSort:d.tokenSort });
    else if (section === 'shop') this.updateKrassLibraryUi({ shopQuery:d.shopQuery, shopSlot:d.shopSlot, shopRegion:d.shopRegion, shopPrice:d.shopPrice, shopRequirement:d.shopRequirement, shopOwnership:d.shopOwnership, shopTags:[], shopSort:d.shopSort });
    return this.render(ROUTES.TAVERN);
  }

  toggleKrassLibrarySection(section) {
    if (section === 'tokens') this.updateKrassLibraryUi({ tokenOpen:!this.krassLibraryUi?.tokenOpen });
    else if (section === 'shop') this.updateKrassLibraryUi({ shopOpen:!this.krassLibraryUi?.shopOpen });
    return this.render(ROUTES.TAVERN);
  }

  mountDisplayModeSwitch(route) {
    const eligible = route === ROUTES.HOME || route === ROUTES.TAVERN || (route === ROUTES.CAMPAIGN_RUN && Boolean(this.root.querySelector('.combat-presentation')));
    if (!eligible || this.root.querySelector('.display-mode-switch')) return;
    const mobile = this.displayMode === 'mobile';
    this.root.insertAdjacentHTML('beforeend', `<aside class="display-mode-switch" aria-label="Display mode"><span>View</span><div><button type="button" data-action="display-mode" data-mode="desktop" aria-pressed="${mobile?'false':'true'}" class="${mobile?'':'active'}">Desktop</button><button type="button" data-action="display-mode" data-mode="mobile" aria-pressed="${mobile?'true':'false'}" class="${mobile?'active':''}">Mobile</button></div></aside>`);
  }

  combatPresentationDelayMs(){return combatPresentationDelayMsForSpeed(this.account?.settings?.combatSpeed||1);}

  clearCombatPlaybackTimer(){if(this.combatPlaybackTimer!==null){clearTimeout(this.combatPlaybackTimer);this.combatPlaybackTimer=null;}}

  ensureCombatPortraitsPredecoded(run){
    const combat=run?.combat;const combatId=combat?.id||combat?.encounterId||null;
    if(!combatId){this.combatPortraitPredecode={combatId:null,status:'idle',promise:null};return true;}
    if(this.combatPortraitPredecode.combatId===combatId&&this.combatPortraitPredecode.status==='done')return true;
    if(this.combatPortraitPredecode.combatId===combatId&&this.combatPortraitPredecode.status==='pending')return false;
    const state={combatId,status:'pending',promise:null};this.combatPortraitPredecode=state;
    const promise=predecodeUpcomingCombatPortraits(combat,{timeoutMs:750}).catch(()=>({attempted:0,decoded:0,failed:0,results:[]}));
    state.promise=promise;
    promise.finally(()=>{
      if(this.combatPortraitPredecode!==state)return;
      state.status='done';state.promise=null;
      if(this.router.routeFromLocation()===ROUTES.CAMPAIGN_RUN){
        const active=this.activeSlot()?.campaign?.state?.combat;const activeId=active?.id||active?.encounterId||null;
        if(activeId===combatId)this.render(ROUTES.CAMPAIGN_RUN);
      }
    });
    return false;
  }

  scheduleCombatPlayback(run){
    this.clearCombatPlaybackTimer(); const combat=run?.combat;if(!combat)return;
    const current=(combat.actors||[]).find(a=>a.id===combat.currentActorId);const needsStep=combat.state==='complete'||(combat.state==='active'&&current?.control==='ai');if(!needsStep)return;
    const delay=combat.state==='complete'?combatCompletionDelayMsForSpeed(this.account?.settings?.combatSpeed||1):this.combatPresentationDelayMs();
    this.combatPlaybackTimer=setTimeout(()=>{this.combatPlaybackTimer=null;if(this.router.routeFromLocation()===ROUTES.CAMPAIGN_RUN)this.render(ROUTES.CAMPAIGN_RUN);},delay);
  }

  normalizeActiveCampaignCombat() {
    const slotNumber=this.activeSlotNumber();let slot=this.activeSlot();if(!slotNumber||!slot?.campaign?.active||!slot.campaign.state)return{ok:true,slot};let changed=false;const run=()=>slot?.campaign?.state;
    if(run()?.expedition?.state==='combat-pending'&&run()?.expedition?.encounter?.combat&&!run()?.combat){const region=run()?.expedition?.regionId;const attached=region==='shadow-infused-dark-woods'?attachFinalRegionCombat(slot,{finalRegionEnemies:this.canon.getFinalRegionEnemies(),baseAbilities:this.canon.getBaseAbilities(),subclassAbilities:this.canon.getSubclassAbilities(),progression:this.canon.getCharacterProgression(),equipmentCatalog:this.canon.getEquipmentConsumablesStatus()}):region==='necropolis'?attachNecropolisCombat(slot,{necropolisEnemies:this.canon.getNecropolisEnemies(),baseAbilities:this.canon.getBaseAbilities(),subclassAbilities:this.canon.getSubclassAbilities(),progression:this.canon.getCharacterProgression(),equipmentCatalog:this.canon.getEquipmentConsumablesStatus()}):region==='that-dragons-dungeon'?attachDragonCombat(slot,{dragonEnemies:this.canon.getDragonEnemies(),baseAbilities:this.canon.getBaseAbilities(),subclassAbilities:this.canon.getSubclassAbilities(),progression:this.canon.getCharacterProgression(),equipmentCatalog:this.canon.getEquipmentConsumablesStatus()}):region==='caverns-to-hell'?attachHellCombat(slot,{hellEnemies:this.canon.getHellEnemies(),baseAbilities:this.canon.getBaseAbilities(),subclassAbilities:this.canon.getSubclassAbilities(),progression:this.canon.getCharacterProgression(),equipmentCatalog:this.canon.getEquipmentConsumablesStatus()}):region==='ruined-vampiric-plains'?attachPlainsCombat(slot,{plainsEnemies:this.canon.getPlainsEnemies(),baseAbilities:this.canon.getBaseAbilities(),subclassAbilities:this.canon.getSubclassAbilities(),progression:this.canon.getCharacterProgression(),equipmentCatalog:this.canon.getEquipmentConsumablesStatus()}):region==='heavenly-tower'?attachTowerCombat(slot,{towerEnemies:this.canon.getTowerEnemies(),baseAbilities:this.canon.getBaseAbilities(),subclassAbilities:this.canon.getSubclassAbilities(),progression:this.canon.getCharacterProgression(),equipmentCatalog:this.canon.getEquipmentConsumablesStatus()}):region==='bog-of-lost-souls'?attachBogCombat(slot,{bogEnemies:this.canon.getBogEnemies(),bogTrainers:this.canon.getBogTrainers(),baseAbilities:this.canon.getBaseAbilities(),subclassAbilities:this.canon.getSubclassAbilities(),progression:this.canon.getCharacterProgression(),equipmentCatalog:this.canon.getEquipmentConsumablesStatus()}):attachForestCombat(slot,{forestEnemies:this.canon.getForestEnemies(),forestTrainers:this.canon.getForestTrainers(),baseAbilities:this.canon.getBaseAbilities(),subclassAbilities:this.canon.getSubclassAbilities(),progression:this.canon.getCharacterProgression(),equipmentCatalog:this.canon.getEquipmentConsumablesStatus()});if(!attached.ok)return attached;slot=attached.slot;changed=true;if(changed)this.save.saveSlot(slotNumber,slot);return{ok:true,slot,changed};}
    let combat=run()?.combat;
    if(combat?.state==='active'){
      if(!combat.turn?.subclassStartResolved){const ev=resolveSubclassTurnStartEvents(slot);if(!ev.ok)return ev;slot=ev.slot;changed=true;this.save.saveSlot(slotNumber,slot);return{ok:true,slot,changed};}
      combat=run()?.combat;if(combat?.state==='active'&&combat.turn&&!combat.turn.trailstockResolved){const ev=resolveTrailstockTurnStart(slot,{catalog:this.canon.getEquipmentConsumablesStatus()});if(!ev.ok)return ev;slot=ev.slot;changed=true;this.save.saveSlot(slotNumber,slot);return{ok:true,slot,changed};}
      combat=run()?.combat;const current=(combat?.actors||[]).find(a=>a.id===combat?.currentActorId);
      if(combat?.state==='active'&&current?.control==='ai'){
        if(this.deferNextAiAction){this.deferNextAiAction=false;return{ok:true,slot,changed:false};}
        const ai=current.side==='enemy'?resolveEnemyTurn(slot,{difficulty:run()?.configuration?.difficulty||'Normal'}):(current.side==='party'&&current.kind==='tavern-adventurer'?resolveTavernAdventurerTurn(slot,{baseCatalog:this.canon.getBaseAbilities(),subclassCatalog:this.canon.getSubclassAbilities()}):null);
        if(ai){if(!ai.ok)return ai;slot=ai.slot;changed=true;combat=run()?.combat;if(combat?.state==='complete')this.combatCompletionHoldEncounterId=combat.encounterId||null;this.save.saveSlot(slotNumber,slot);return{ok:true,slot,changed};}
      }
    }
    combat=run()?.combat;
    if(combat?.state==='complete'){
      const encounterId=combat.encounterId||run()?.expedition?.encounter?.id||null;
      if(this.combatCompletionHoldEncounterId!==encounterId){this.combatCompletionHoldEncounterId=encounterId;return{ok:true,slot,changed:false};}
      this.combatCompletionHoldEncounterId=null;
      if(!run()?.expedition?.encounter?.rewardsAwarded){const rewards=awardCurrentForestCombatRewards(slot,{progression:this.canon.getCharacterProgression()});if(!rewards.ok)return rewards;slot=rewards.slot;changed=true;}
      if(combat.outcome==='victory'){
        if(!run()?.expedition?.encounter?.materialsAwarded){const rid=run()?.expedition?.regionId;const awarded=rid==='shadow-infused-dark-woods'?awardCurrentFinalRegionMaterialCache(slot):rid==='necropolis'?awardCurrentNecropolisMaterialCache(slot):rid==='that-dragons-dungeon'?awardCurrentDragonMaterialCache(slot):rid==='caverns-to-hell'?awardCurrentHellMaterialCache(slot):rid==='ruined-vampiric-plains'?awardCurrentPlainsMaterialCache(slot):rid==='heavenly-tower'?awardCurrentTowerMaterialCache(slot):rid==='bog-of-lost-souls'?awardCurrentBogMaterialCache(slot):awardCurrentForestMaterialCache(slot);if(!awarded.ok)return awarded;slot=awarded.slot;if((awarded.materials||[]).some(item=>item.materialKind==='soulfire-core'))this.contextLessonId='first-soulfire';}
        const resolved=resolveCombatVictory(slot,{regionsData:this.canon.getRegions(),forestEvents:this.canon.getForestEvents(),forestTrainers:this.canon.getForestTrainers(),bogEvents:this.canon.getBogEvents(),bogTrainers:this.canon.getBogTrainers(),towerEvents:this.canon.getTowerEvents(),plainsEvents:this.canon.getPlainsEvents(),hellEvents:this.canon.getHellEvents(),dragonEvents:this.canon.getDragonEvents(),necropolisEvents:this.canon.getNecropolisEvents()});if(!resolved.ok)return resolved;slot=resolved.slot;if(resolved.finalClearedNow){const ended=endCampaign(slot,this.account,'victory');if(!ended.ok)return ended;slot=ended.slot;changed=true;}if(resolved.forestClearedNow||resolved.bogClearedNow||resolved.towerClearedNow||resolved.plainsClearedNow||resolved.hellClearedNow){const account=structuredClone(this.account);account.history=account.history||{};if(resolved.forestClearedNow){account.history.forestCleared=true;if(!account.history.firstForestClearAt)account.history.firstForestClearAt=new Date().toISOString();}if(resolved.bogClearedNow){account.history.bogCleared=true;if(!account.history.firstBogClearAt)account.history.firstBogClearAt=new Date().toISOString();}if(resolved.towerClearedNow){account.history.towerCleared=true;if(!account.history.firstTowerClearAt)account.history.firstTowerClearAt=new Date().toISOString();}if(resolved.plainsClearedNow){account.history.plainsCleared=true;if(!account.history.firstPlainsClearAt)account.history.firstPlainsClearAt=new Date().toISOString();}if(resolved.hellClearedNow){account.history.hellCleared=true;if(!account.history.firstHellClearAt)account.history.firstHellClearAt=new Date().toISOString();}this.account=this.save.saveAccount(account);}changed=true;
      }else if(combat.outcome==='defeat'){const ended=endCampaign(slot,this.account,'defeat');if(!ended.ok)return ended;slot=ended.slot;changed=true;}
    }
    if(changed)this.save.saveSlot(slotNumber,slot);return{ok:true,slot,changed};
  }

  forcePendingSettlement(route) {
    const slot = this.activeSlot();
    if (slot?.campaign?.settlement && route !== ROUTES.CAMPAIGN_RESULTS) {
      this.router.replace(ROUTES.CAMPAIGN_RESULTS);
      return true;
    }
    return false;
  }

  render(route) {
    this.resetStage = 0;
    if(route!==ROUTES.CAMPAIGN_RUN)this.clearCombatPlaybackTimer();
    if (starterNeedsResolution(this.account)) {
      this.root.innerHTML = renderHome({ hasContinuableSlot: this.slots().some(s => s?.character) }) + starterTutorialOverlay({ starter:this.canon.getTutorialsHelp().mandatoryStarter, stepIndex:this.starterTutorialStep });
      this.mountDisplayModeSwitch(ROUTES.HOME);
      return;
    }
    if (this.forcePendingSettlement(route)) return;

    if (route === ROUTES.NEW_GAME) { this.root.innerHTML = renderSlots({ slots: this.slots(), mode: 'new' }); this.offerTutorialForContext('character-creation',ROUTES.NEW_GAME); return; }
    if (route === ROUTES.CREATE) {
      if (!this.pendingCreationSlot || this.save.loadSlot(this.pendingCreationSlot)) {
        this.pendingCreationSlot = null; this.creationErrors = []; this.router.replace(ROUTES.NEW_GAME); return;
      }
      this.root.innerHTML = renderCharacterCreation({ slotNumber: this.pendingCreationSlot, unlockedRaces: this.account.unlocks?.races || [], allRaces: this.canon.getRaces(), account: this.account, classDetails: this.canon.getBaseClassDetails(), racialConfigurations:this.canon.getRacialConfigurations(), errors: this.creationErrors, message: this.creationMessage });
      this.refreshStatAllocator(this.root.querySelector('#vessel-form'));
      this.offerTutorialForContext('character-creation',ROUTES.CREATE);
      return;
    }
    if (route === ROUTES.CONTINUE) { this.root.innerHTML = renderSlots({ slots: this.slots(), mode: 'continue' }); return; }
    if (route === ROUTES.TAVERN) {
      let slot = this.activeSlot();
      if (!slot?.character) { this.tavern.leave(); this.router.replace(ROUTES.HOME); return; }
      if (slot.campaign?.active) { this.router.replace(ROUTES.CAMPAIGN_RUN); return; }
      if (!this.tavern.slotNumber) this.tavern.enter(this.activeSlotNumber());
      const prepared=ensureMaraQuestOffers(slot,this.account,{tavernServices:this.canon.getTavernServices(),forestTrainers:this.canon.getForestTrainers()});
      if(prepared.ok&&prepared.changed){slot=prepared.slot;this.save.saveSlot(this.activeSlotNumber(),slot);}
      this.root.innerHTML = renderTavern({
        room: this.tavern.currentRoom(), slot, account: this.account,
        subclassesForBase: this.canon.getSubclassesForBase(slot.character.baseClass),
        keptEntries: this.canon.getKeptImpressions(), keptRuntimeEntries: this.canon.getKeptImpressionRuntime().entries, tavernAdventurers: this.canon.getTavernAdventurers(), tavernServices:this.canon.getTavernServices(), equipmentCatalog:this.canon.getEquipmentConsumablesStatus(),
        baseAbilities: this.canon.getBaseAbilities(), subclassAbilities: this.canon.getSubclassAbilities(), portraitSystem:this.canon.getPortraitSystem(), racialConfigurations:this.canon.getRacialConfigurations(), unlockedRaces:this.account.unlocks?.races||[], allRaces:this.canon.getRaces(), baseClasses:this.canon.getBaseClasses(), message: this.tavernMessage,
        ux: { libraryQuery:this.libraryQuery, librarySlotCost:this.librarySlotCost, libraryType:this.libraryType, libraryFamily:this.libraryFamily, libraryTags:this.libraryTags, librarySort:this.librarySort, krassLibraryUi:this.krassLibraryUi, lenderQuery:this.lenderQuery, lenderSlot:this.lenderSlot, lenderWeaponType:this.lenderWeaponType, lenderSort:this.lenderSort, portraitCarouselOffset:this.portraitCarouselOffset }
      });
      this.mountDisplayModeSwitch(ROUTES.TAVERN);
      this.tavernMessage = '';
      this.refreshStatAllocator(this.root.querySelector('#starting-stat-form'));
      const roomId=this.tavern.currentRoom().id;
      const tutorialId=roomId==='main-hall'?'tavern-lobby':roomId==='krass-library'?'kept-impressions':roomId==='adventurer-quarters'?'getting-adventurer':null;
      if(tutorialId)this.offerTutorialForContext(tutorialId,ROUTES.TAVERN);
      if(this.account.progressionFeatures?.mantle&&!contextualSeen(this.account,'mantle-unlocked'))this.showContextualLesson('mantle-unlocked');
      else if(this.account.progressionFeatures?.chronicle&&!contextualSeen(this.account,'chronicle-unlocked'))this.showContextualLesson('chronicle-unlocked');
      return;
    }
    if (route === ROUTES.CAMPAIGN_PREP) {
      const slot = this.activeSlot();
      if (!slot?.character) { this.router.replace(ROUTES.HOME); return; }
      if (slot.campaign?.active) { this.router.replace(ROUTES.CAMPAIGN_RUN); return; }
      const door = getCampaignDoorState(slot);
      if (!door.available) { this.tavernMessage = door.reason; this.tavern.go('main-hall'); this.router.replace(ROUTES.TAVERN); return; }
      this.root.innerHTML = renderCampaignPreparation({ summary: getCampaignPreparationSummary(slot, this.canon.getKeptImpressions(), this.canon.getRacialConfigurations()), keptEntries: this.canon.getKeptImpressions() });
      this.offerTutorialForContext('starting-campaign',ROUTES.CAMPAIGN_PREP);
      return;
    }
    if (route === ROUTES.CAMPAIGN_RUN) {
      const normalized = this.normalizeActiveCampaignCombat();
      if (!normalized.ok) {
        this.root.innerHTML = `<main class="shell"><section class="panel"><h2>Combat could not continue.</h2><p class="muted">${escapeHtml(normalized.error || 'The Forest encounter could not be prepared.')}</p></section></main>`;
        return;
      }
      if (normalized.slot?.campaign?.settlement) { this.router.replace(ROUTES.CAMPAIGN_RESULTS); return; }
      const run = getCampaignRunView(normalized.slot);
      if (!run) { this.router.replace(ROUTES.TAVERN); return; }
      this.tavern.leave();
      const activeQuest=normalized.slot?.tavernServices?.mara?.activeQuest||null; const questEval=activeQuest?evaluateMaraQuest(activeQuest,run):null;
      const combatIdentity=run.combat?.id||run.combat?.encounterId||null;
      if(combatIdentity!==this.presentationCombatId){this.presentationCombatId=combatIdentity;this.consumedCombatPresentationId=null;}
      if(combatIdentity&&!this.ensureCombatPortraitsPredecoded(run)){
        const portraitCount=(run.combat?.actors||[]).filter(actor=>actor?.portraitAsset).length;
        this.root.innerHTML=`<main class="shell"><section class="panel"><div class="kicker">Combat Encounter</div><h2>Preparing the battlefield…</h2><p class="muted">Predecoding ${portraitCount} upcoming combatant portrait${portraitCount===1?'':'s'} with a bounded best-effort pass. Combat continues even if any portrait cannot be decoded in advance.</p></section></main>`;
        this.mountDisplayModeSwitch(ROUTES.CAMPAIGN_RUN);
        return;
      }
      if(!combatIdentity)this.ensureCombatPortraitsPredecoded(run);
      const persistedCraftingUi=this.syncCraftingUiFieldsFromState(this.activeCampaignCraftingUiState(normalized.slot));
      const regionId=run.expedition?.regionId,finalRegion=regionId==='shadow-infused-dark-woods',necropolisRegion=regionId==='necropolis',dragonRegion=regionId==='that-dragons-dungeon',hellRegion=regionId==='caverns-to-hell',plainsRegion=regionId==='ruined-vampiric-plains',towerRegion=regionId==='heavenly-tower',bogRegion=regionId==='bog-of-lost-souls';this.root.innerHTML = renderCampaignRun({ run, baseAbilities: this.canon.getBaseAbilities(), subclassAbilities: this.canon.getSubclassAbilities(), progression: this.canon.getCharacterProgression(), equipmentCatalog: this.canon.getEquipmentConsumablesStatus(), forestCrafting: cumulativeCampsiteCrafting(this.canon,regionId), forestTrainers: (towerRegion||plainsRegion||hellRegion||dragonRegion||necropolisRegion||finalRegion)?null:(bogRegion?this.canon.getBogTrainers():this.canon.getForestTrainers()), contentPortraits: this.canon.getContentPortraits(), maraQuestStatus:activeQuest?{...activeQuest,...questEval,status:questEval?.complete?'Completed — Pending Return':'In Progress'}:null, craftingUi: { ...persistedCraftingUi, message:this.craftingMessage }, presentationUi: { actionPanel:this.combatActionPanel, settings:this.account.settings || {}, equipmentOwnerId:this.campsiteEquipmentOwnerId, campsiteSidebarOpen:this.campsiteSidebarOpen, campsiteSidebarTab:this.campsiteSidebarTab, campsiteItemsOpen:this.campsiteItemsOpen, statsOwnerId:this.runStatsOwnerId, consumedPresentationId:this.consumedCombatPresentationId } });
      this.mountDisplayModeSwitch(ROUTES.CAMPAIGN_RUN);
      if(run.expedition?.state==='campsite')this.restoreCampsiteScrollState();
      const renderedPresentationId=this.root.querySelector('.combat-presentation')?.dataset?.presentationId||null;
      if(renderedPresentationId)this.consumedCombatPresentationId=renderedPresentationId;
      this.syncCombatTargetHighlight(this.root.querySelector('[data-primary-combat-target]'));
      this.scheduleCombatPlayback(run);
      this.craftingMessage = '';
      if(run.expedition?.state==='campsite')this.offerTutorialForContext('campsite',ROUTES.CAMPAIGN_RUN);
      else if(run.combat?.state==='active')this.offerTutorialForContext('forest-combat',ROUTES.CAMPAIGN_RUN);
      if(this.contextLessonId){const lesson=this.contextLessonId;this.contextLessonId=null;this.showContextualLesson(lesson);}
      return;
    }
    if (route === ROUTES.CAMPAIGN_RESULTS) {
      const settlement = this.activeSlot()?.campaign?.settlement;
      if (!settlement) { this.router.replace(ROUTES.HOME); return; }
      this.tavern.leave();
      this.root.innerHTML = renderCampaignResults({ settlement, equipmentCatalog:this.canon.getEquipmentConsumablesStatus(), message:this.resultsMessage });
      this.resultsMessage='';
      return;
    }
    if (route === ROUTES.CHRONICLE) {
      const activeBase = this.activeSlot()?.character?.baseClass;
      if (!this.chronicleFamily) this.chronicleFamily = activeBase || this.canon.getBaseClasses()[0];
      this.root.innerHTML = renderChronicle({ baseClasses: this.canon.getBaseClasses(), account: this.account, chronicle: this.canon.getChronicleSummary(), trees: this.canon.getChronicleTrees(), selectedFamily: this.chronicleFamily, message: this.chronicleMessage });
      this.chronicleMessage = '';
      return;
    }
    if (route === ROUTES.HELP) { this.root.innerHTML = renderHelp({ entries:this.canon.getTutorialsHelp().helpEntries, query:this.helpQuery }); return; }
    if (route === ROUTES.TUTORIAL) {
      const tutorial=this.canon.getTutorialsHelp().tutorials.find(t=>t.id===this.activeTutorialId);
      if(!tutorial){this.router.replace(ROUTES.HOME);return;}
      this.root.innerHTML=renderTutorial({tutorial,stepIndex:this.activeTutorialStep,replay:true,status:tutorialStatus(this.account,tutorial.id)});return;
    }
    if (route === ROUTES.CREDITS) { this.root.innerHTML = renderCredits(); return; }
    if (route === ROUTES.SETTINGS) { this.root.innerHTML = renderSettings({ combatSpeed: this.account.settings?.combatSpeed ?? 1, autoEndTurn:this.account.settings?.autoEndTurn !== false, reducedMotion:Boolean(this.account.settings?.reducedMotion), combatNumbers:this.account.settings?.combatNumbers !== false, screenFlash:this.account.settings?.screenFlash || 'standard' }); return; }
    this.root.innerHTML = renderHome({ hasContinuableSlot: this.slots().some(s => s?.character) });
    this.mountDisplayModeSwitch(ROUTES.HOME);
  }

  normalizeCampaignCraftingUiState(value = {}, { fallbackHiddenRecipeIds = null } = {}) {
    const source = value && typeof value === 'object' ? value : {};
    const fallbackHidden = Array.isArray(fallbackHiddenRecipeIds)
      ? fallbackHiddenRecipeIds
      : (Array.isArray(this.account?.settings?.hiddenCraftingRecipes) ? this.account.settings.hiddenCraftingRecipes : []);
    const list = entries => [...new Set((Array.isArray(entries) ? entries : []).filter(id => typeof id === 'string' && id))];
    return {
      onlyCraftable: Boolean(source.onlyCraftable),
      sortStat: typeof source.sortStat === 'string' ? source.sortStat : '',
      direction: source.direction === 'asc' ? 'asc' : 'desc',
      query: typeof source.query === 'string' ? source.query : '',
      slot: typeof source.slot === 'string' && source.slot ? source.slot : 'all',
      itemType: typeof source.itemType === 'string' && source.itemType ? source.itemType : 'all',
      subtype: typeof source.subtype === 'string' && source.subtype ? source.subtype : 'all',
      weaponType: typeof source.weaponType === 'string' && source.weaponType ? source.weaponType : 'all',
      armorWeight: typeof source.armorWeight === 'string' && source.armorWeight ? source.armorWeight : 'all',
      openCategories: list(source.openCategories),
      hiddenRecipeIds: list(source.hiddenRecipeIds ?? fallbackHidden),
      showHidden: Boolean(source.showHidden)
    };
  }

  activeCampaignCraftingUiState(slot = this.activeSlot()) {
    const runState = slot?.campaign?.active ? slot.campaign.state : null;
    return this.normalizeCampaignCraftingUiState(runState?.craftingUi || {}, { fallbackHiddenRecipeIds: this.account?.settings?.hiddenCraftingRecipes || [] });
  }

  syncCraftingUiFieldsFromState(state = {}) {
    const ui = this.normalizeCampaignCraftingUiState(state, { fallbackHiddenRecipeIds: this.account?.settings?.hiddenCraftingRecipes || [] });
    this.craftingOnlyCraftable = ui.onlyCraftable;
    this.craftingSortStat = ui.sortStat;
    this.craftingSortDirection = ui.direction;
    this.craftingQuery = ui.query;
    this.craftingSlot = ui.slot;
    this.craftingType = ui.itemType;
    this.craftingSubtype = ui.subtype;
    this.craftingWeaponType = ui.weaponType;
    this.craftingArmorWeight = ui.armorWeight;
    this.craftingOpenCategories = ui.openCategories;
    this.craftingShowHidden = ui.showHidden;
    return ui;
  }

  persistCampaignCraftingUiState(patch = {}, { saveHiddenToAccount = false } = {}) {
    const slotNumber = this.activeSlotNumber();
    const slot = this.activeSlot();
    if (!slotNumber || !slot?.campaign?.active) return null;
    const current = this.activeCampaignCraftingUiState(slot);
    const nextUi = this.normalizeCampaignCraftingUiState({ ...current, ...(patch && typeof patch === 'object' ? patch : {}) }, { fallbackHiddenRecipeIds: current.hiddenRecipeIds });
    const nextSlot = structuredClone(slot);
    nextSlot.campaign.state.craftingUi = nextUi;
    this.save.saveSlot(slotNumber, nextSlot);
    if (saveHiddenToAccount) {
      this.account.settings = { ...(this.account.settings || {}), hiddenCraftingRecipes: [...nextUi.hiddenRecipeIds] };
      this.account = this.save.saveAccount(this.account);
    }
    this.syncCraftingUiFieldsFromState(nextUi);
    return { slot: nextSlot, ui: nextUi };
  }

  captureCraftingExpansionState() {
    const categories=[...this.root.querySelectorAll('details.craft-category[data-craft-category]')];
    if(!categories.length)return;
    this.craftingOpenCategories=categories.filter(node=>node.open).map(node=>node.dataset.craftCategory).filter(Boolean);
  }

  captureCampsiteScrollState() {
    const sidebar=this.root.querySelector('[data-campsite-sidebar-scroll]');
    const crafting=this.root.querySelector('[data-campsite-crafting-scroll]');
    if(sidebar)this.campsiteSidebarScrollTop=sidebar.scrollTop;
    if(crafting)this.campsiteCraftingScrollTop=crafting.scrollTop;
  }

  restoreCampsiteScrollState() {
    const sidebar=this.root.querySelector('[data-campsite-sidebar-scroll]');
    const crafting=this.root.querySelector('[data-campsite-crafting-scroll]');
    if(sidebar)sidebar.scrollTop=Math.max(0,Number(this.campsiteSidebarScrollTop||0));
    if(crafting)crafting.scrollTop=Math.max(0,Number(this.campsiteCraftingScrollTop||0));
  }

  onToggle(event) {
    const node = event.target;
    if (!(node instanceof HTMLDetailsElement)) return;
    if (!node.matches('details.craft-category[data-craft-category]')) return;
    this.captureCraftingExpansionState();
    this.persistCampaignCraftingUiState({ openCategories: this.craftingOpenCategories || [] });
  }

  onClick(event) {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    this.captureCraftingExpansionState();
    this.captureCampsiteScrollState();
    this.persistCampaignCraftingUiState({ openCategories: this.craftingOpenCategories || [] });
    if (action === 'display-mode') return this.setDisplayMode(button.dataset.mode);
    if (action === 'starter-next') { const max=this.canon.getTutorialsHelp().mandatoryStarter.steps.length-1; this.starterTutorialStep=Math.min(max,this.starterTutorialStep+1); return this.render(this.router.routeFromLocation()); }
    if (action === 'starter-prev') { this.starterTutorialStep=Math.max(0,this.starterTutorialStep-1); return this.render(this.router.routeFromLocation()); }
    if (action === 'starter-complete') return this.resolveStarterOnboarding('completed');
    if (action === 'starter-skip') return this.resolveStarterOnboarding('skipped');
    if (action === 'tutorial-next') { const t=this.canon.getTutorialsHelp().tutorials.find(x=>x.id===this.activeTutorialId); this.activeTutorialStep=Math.min(Math.max(0,(t?.steps?.length||1)-1),this.activeTutorialStep+1); return this.render(ROUTES.TUTORIAL); }
    if (action === 'tutorial-prev') { this.activeTutorialStep=Math.max(0,this.activeTutorialStep-1); return this.render(ROUTES.TUTORIAL); }
    if (action === 'tutorial-offer-start') return this.startContextTutorial(button.dataset.tutorial);
    if (action === 'tutorial-offer-skip') return this.skipOfferedTutorial(button.dataset.tutorial);
    if (action === 'guided-tutorial-next') return this.stepGuidedTutorial(1);
    if (action === 'guided-tutorial-prev') return this.stepGuidedTutorial(-1);
    if (action === 'guided-tutorial-complete') return this.finishGuidedTutorial('completed');
    if (action === 'guided-tutorial-skip') return this.finishGuidedTutorial('skipped');
    if (action === 'tutorial-complete') return this.finishTutorialReplay('completed');
    if (action === 'tutorial-skip') return this.confirmTutorialSkip();
    if (action === 'tutorial-exit') return this.exitTutorialReplay();
    if (action === 'tutorial-skip-confirm') return this.finishTutorialReplay('skipped');
    if (action === 'tutorial-skip-cancel') return this.render(ROUTES.TUTORIAL);
    if (action === 'help') { this.helpQuery=''; return this.router.go(ROUTES.HELP); }
    if (action === 'credits') return this.router.go(ROUTES.CREDITS);
    if (action === 'contextual-dismiss') return this.dismissContextualLesson(button.dataset.lesson);
    if (action === 'library-section-toggle') return this.toggleKrassLibrarySection(button.dataset.section);
    if (action === 'library-token-clear') return this.clearKrassLibraryFilters('tokens');
    if (action === 'library-shop-clear') return this.clearKrassLibraryFilters('shop');
    if (action === 'library-shop-region-quick') { this.updateKrassLibraryUi({shopRegion:button.dataset.region||'all'}); return this.render(ROUTES.TAVERN); }
    if (action === 'tutorial-token-redeem') return this.redeemStarterToken(button.dataset.ki);
    if (action === 'race-token-redeem') return this.requestRaceTokenUnlock(button.dataset.race);
    if (action === 'race-token-confirm') return this.redeemRaceToken(button.dataset.race);
    if (action === 'race-token-cancel') { this.root.querySelector('.modal-backdrop')?.remove(); return; }
    if (action === 'kept-shop-buy') return this.buyKeptBoon(button.dataset.ki);
    if (action === 'home') return this.router.go(ROUTES.HOME);
    if (action === 'new-game') return this.router.go(ROUTES.NEW_GAME);
    if (action === 'continue') return this.router.go(ROUTES.CONTINUE);
    if (action === 'chronicle') return this.router.go(ROUTES.CHRONICLE);
    if (action === 'settings') return this.router.go(ROUTES.SETTINGS);
    if (action === 'campaign-prep') return this.openCampaignDoor();
    if (action === 'start-campaign') return this.beginCampaign();
    if (action === 'pause-campaign') return this.router.go(ROUTES.HOME);
    if (action === 'expedition-select-card') return this.chooseExpeditionCard(button.dataset.card);
    if (action === 'forest-event-roll') return this.rollForestEvent(button);
    if (action === 'forest-event-continue-combat') return this.continueForestEventCombat();
    if (action === 'trainer-fight') return this.fightForestTrainer(button.dataset.trainer);
    if (action === 'trainer-learn') return this.learnForestTrainer(button.dataset.trainer);
    if (action === 'expedition-leave-campsite') return this.finishExpeditionCampsite();
    if (action === 'expedition-next-step') return this.continueExpeditionStep();
    if (action === 'campaign-results-done') return this.completeCampaignSettlement();
    if (action === 'campaign-lender-select') return this.selectCampaignLenderItem(button.dataset.item);
    if (action === 'campaign-return-tavern') return this.returnFromForest();
    if (action === 'campaign-continue-beyond') return this.continueBeyondForest();
    if (action === 'hell-merchant-buy') return this.buyHellMerchantItem(button.dataset.item);
    if (action === 'hell-merchant-leave') return this.leaveHellMerchantEncounter();
    if (action === 'combat-panel') { this.combatActionPanel = button.dataset.panel === 'consumable' ? 'consumable' : 'abilities'; return this.render(ROUTES.CAMPAIGN_RUN); }
    if (action === 'combat-select-actor') return this.selectBattlefieldActor(button);
    if (action === 'combat-charge') return this.performCombatAction('charge');
    if (action === 'combat-guard') return this.performCombatAction('guard');
    if (action === 'combat-use-consumable') return this.performConsumable(button);
    if (action === 'combat-use-equipment-ability') return this.performEquipmentAbility(button);
    if (action === 'combat-use-racial-ability') return this.performRacialAbility(button);
    if (action === 'campsite-sidebar-toggle') { this.campsiteSidebarOpen=!this.campsiteSidebarOpen; return this.render(ROUTES.CAMPAIGN_RUN); }
    if (action === 'campsite-sidebar-tab') { this.campsiteSidebarTab=button.dataset.tab==='inventory'?'inventory':'party'; this.campsiteSidebarScrollTop=0; return this.render(ROUTES.CAMPAIGN_RUN); }
    if (action === 'campsite-items-toggle') { this.campsiteItemsOpen=!this.campsiteItemsOpen; return this.render(ROUTES.CAMPAIGN_RUN); }
    if (action === 'campsite-equipment-owner') { this.campsiteEquipmentOwnerId=button.dataset.owner||'vessel'; return this.render(ROUTES.CAMPAIGN_RUN); }
    if (action === 'campsite-equip-consumable') return this.equipCampConsumable(button);
    if (action === 'campsite-unequip-consumable') return this.unequipCampConsumable(button);
    if (action === 'campsite-equip-equipment') return this.equipCampEquipment(button);
    if (action === 'campsite-unequip-equipment') return this.unequipCampEquipment(button);
    if (action === 'campsite-discard-equipment') return this.discardCampEquipment(button);
    if (action === 'campsite-discard-consumable') return this.discardCampConsumable(button);
    if (action === 'campsite-craft') return this.craftCampRecipe(button);
    if (action === 'craft-hide-recipe') return this.toggleCraftRecipeHidden(button.dataset.recipe);
    if (action === 'craft-toggle-hidden') { this.craftingShowHidden=!this.craftingShowHidden; this.persistCampaignCraftingUiState({ showHidden:this.craftingShowHidden }); return this.render(ROUTES.CAMPAIGN_RUN); }
    if (action === 'craft-unhide-all') return this.unhideAllCraftRecipes();
    if (action === 'campsite-auto-craft') return this.autoCraftRecommendedGear(button.dataset.owner||this.campsiteEquipmentOwnerId);
    if (action === 'campsite-auto-equip') return this.autoEquipRecommendedGear(button.dataset.owner||this.campsiteEquipmentOwnerId);
    if (action === 'craft-sort-direction') { this.craftingSortDirection = this.craftingSortDirection === 'asc' ? 'desc' : 'asc'; this.persistCampaignCraftingUiState({ direction:this.craftingSortDirection }); return this.render(ROUTES.CAMPAIGN_RUN); }
    if (action === 'combat-use-ability') return this.performBaseAbility(button);
    if (action === 'combat-use-subclass-ability') return this.performSubclassAbility(button);
    if (action === 'combat-use-kept-active') return this.performKeptActive(button);
    if (action === 'combat-kept-start-choice') return this.chooseKeptCombatStart(button);
    if (action === 'combat-druid-form') return this.chooseCombatDruidForm(button.dataset.form);
    if (action === 'combat-end-turn') return this.finishCombatTurn();
    if (action === 'run-stats-owner') { this.runStatsOwnerId=button.dataset.owner||'vessel'; return this.render(ROUTES.CAMPAIGN_RUN); }
    if (action === 'run-stat-add') return this.addRunStat(button.dataset.stat);
    if (action === 'adventurer-toggle') return this.toggleTavernAdventurer(button.dataset.adventurer);
    if (action === 'portrait-carousel-prev') return this.stepPortraitCarousel(-1);
    if (action === 'portrait-carousel-next') return this.stepPortraitCarousel(1);
    if (action === 'static-portrait-select') return this.changeStaticVesselPortrait(button.dataset.portrait);
    if (action === 'vessel-portrait-select') return this.changeVesselPortrait(button.dataset.portrait);
    if (action === 'mara-quest-accept') return this.acceptMaraQuestOffer(button.dataset.quest);
    if (action === 'mara-quest-abandon') return this.abandonMaraQuestOffer();
    if (action === 'lender-borrow') return this.chooseLenderBorrow(button.dataset.item);
    if (action === 'lender-clear') return this.chooseLenderBorrow(null);
    if (action === 'tutorial-select') return this.startTutorialReplay(button.dataset.tutorial);
    if (action === 'stat-step') return this.stepStat(button);
    if (action === 'back-to-tavern') { this.tavern.go('main-hall'); return this.router.go(ROUTES.TAVERN); }
    if (action === 'reset') return this.openResetConfirmation(1);
    if (action === 'reset-cancel') return this.render(this.router.routeFromLocation());
    if (action === 'reset-next') return this.openResetConfirmation(2);
    if (action === 'reset-final') {
      this.account = this.bootstrapAccount(this.save.resetAllTWBTDData());
      this.pendingCreationSlot = null; this.creationErrors = []; this.tavern.leave(); this.chronicleFamily = null;
      this.router.go(ROUTES.HOME); return;
    }
    if (action === 'empty-slot') return this.beginCreation(Number(button.dataset.slot));
    if (action === 'cancel-create') { this.pendingCreationSlot = null; this.creationErrors = []; this.creationMessage=''; return this.router.go(ROUTES.NEW_GAME); }
    if (action === 'delete-slot') return this.confirmDeleteSlot(Number(button.dataset.slot));
    if (action === 'delete-slot-final') return this.deleteSlotFinal(Number(button.dataset.slot));
    if (action === 'select-slot') return this.selectSlot(Number(button.dataset.slot));
    if (action === 'leave-tavern') { this.tavern.leave(); return this.router.go(ROUTES.HOME); }
    if (action === 'tavern-main-hall') { this.tavern.go('main-hall'); this.tavernMessage = ''; return this.render(ROUTES.TAVERN); }
    if (action === 'tavern-room') { this.tavern.go(button.dataset.room); this.tavernMessage = ''; return this.render(ROUTES.TAVERN); }
    if (action === 'kept-equip') return this.changeKeptImpression(button.dataset.ki, true);
    if (action === 'kept-unequip') return this.changeKeptImpression(button.dataset.ki, false);
    if (action === 'mantle-select') return this.changeMantle(button.dataset.subclass || null);
    if (action === 'chronicle-family') { this.chronicleFamily = button.dataset.family; this.chronicleMessage = ''; return this.render(ROUTES.CHRONICLE); }
    if (action === 'chronicle-buy') return this.buyChronicleNode(button.dataset.node);
    if (action === 'chronicle-respec') return this.respecChronicle(button.dataset.family);
  }

  onSubmit(event) {
    const vesselForm = event.target.closest('#vessel-form');
    if (vesselForm) { event.preventDefault(); this.completeCreation(vesselForm); return; }
    const rebindForm = event.target.closest('#vessel-rebind-form');
    if (rebindForm) { event.preventDefault(); this.saveVesselRebind(rebindForm); return; }
    const racialForm = event.target.closest('#racial-config-form');
    if (racialForm) { event.preventDefault(); this.saveVesselRacialConfiguration(racialForm); return; }
    const statForm = event.target.closest('#starting-stat-form');
    if (statForm) { event.preventDefault(); this.saveStartingStatRedistribution(statForm); return; }
    const classlessForm = event.target.closest('#classless-config-form');
    if (classlessForm) { event.preventDefault(); this.saveClasslessConfiguration(classlessForm); }
  }

  onInput(event) {
    this.captureCraftingExpansionState();
    this.captureCampsiteScrollState();
    this.persistCampaignCraftingUiState({ openCategories: this.craftingOpenCategories || [] });
    if (event.target.matches('[data-stat-input]')) this.refreshStatAllocator(event.target.closest('form'));
    if (event.target.matches('[data-help-search]')) { this.helpQuery=event.target.value||''; this.render(ROUTES.HELP); const input=this.root.querySelector('[data-help-search]'); if(input){input.focus();input.setSelectionRange(input.value.length,input.value.length);} }
    if (event.target.matches('[data-library-search]')) { this.libraryQuery=event.target.value||''; this.render(ROUTES.TAVERN); const input=this.root.querySelector('[data-library-search]'); if(input){input.focus();input.setSelectionRange(input.value.length,input.value.length);} }
    if (event.target.matches('[data-token-library-search]')) { this.updateKrassLibraryUi({tokenQuery:event.target.value||''}); this.render(ROUTES.TAVERN); const input=this.root.querySelector('[data-token-library-search]'); if(input){input.focus();input.setSelectionRange(input.value.length,input.value.length);} }
    if (event.target.matches('[data-shop-library-search]')) { this.updateKrassLibraryUi({shopQuery:event.target.value||''}); this.render(ROUTES.TAVERN); const input=this.root.querySelector('[data-shop-library-search]'); if(input){input.focus();input.setSelectionRange(input.value.length,input.value.length);} }
    if (event.target.matches('[data-lender-search]')) { this.lenderQuery=event.target.value||''; this.render(ROUTES.TAVERN); const input=this.root.querySelector('[data-lender-search]'); if(input){input.focus();input.setSelectionRange(input.value.length,input.value.length);} }
    if (event.target.matches('[data-crafting-search]')) { this.craftingQuery=event.target.value||''; this.persistCampaignCraftingUiState({ query:this.craftingQuery }); this.render(ROUTES.CAMPAIGN_RUN); const input=this.root.querySelector('[data-crafting-search]'); if(input){input.focus();input.setSelectionRange(input.value.length,input.value.length);} }
  }

  onChange(event) {
    this.captureCraftingExpansionState();
    this.captureCampsiteScrollState();
    this.persistCampaignCraftingUiState({ openCategories: this.craftingOpenCategories || [] });
    if (event.target.matches('[data-library-slot]')) { this.librarySlotCost=event.target.value||'all'; this.render(ROUTES.TAVERN); return; }
    if (event.target.matches('[data-library-type]')) { this.libraryType=event.target.value||'all'; this.render(ROUTES.TAVERN); return; }
    if (event.target.matches('[data-library-family]')) { this.libraryFamily=event.target.value||'all'; this.render(ROUTES.TAVERN); return; }
    if (event.target.matches('[data-library-sort]')) { this.librarySort=event.target.value||'id'; this.render(ROUTES.TAVERN); return; }
    if (event.target.matches('[data-library-tag]')) { const value=event.target.value;const set=new Set(this.libraryTags||[]);event.target.checked?set.add(value):set.delete(value);this.libraryTags=[...set];this.render(ROUTES.TAVERN);return; }
    if (event.target.matches('[data-token-library-slot]')) { this.updateKrassLibraryUi({tokenSlot:event.target.value||'all'}); this.render(ROUTES.TAVERN); return; }
    if (event.target.matches('[data-token-library-status]')) { this.updateKrassLibraryUi({tokenStatus:event.target.value||'eligible'}); this.render(ROUTES.TAVERN); return; }
    if (event.target.matches('[data-token-library-sort]')) { this.updateKrassLibraryUi({tokenSort:event.target.value||'id'}); this.render(ROUTES.TAVERN); return; }
    if (event.target.matches('[data-token-library-tag]')) { const value=event.target.value;const set=new Set(this.krassLibraryUi?.tokenTags||[]);event.target.checked?set.add(value):set.delete(value);this.updateKrassLibraryUi({tokenTags:[...set]});this.render(ROUTES.TAVERN);return; }
    if (event.target.matches('[data-shop-library-slot]')) { this.updateKrassLibraryUi({shopSlot:event.target.value||'all'}); this.render(ROUTES.TAVERN); return; }
    if (event.target.matches('[data-shop-library-region]')) { this.updateKrassLibraryUi({shopRegion:event.target.value||'all'}); this.render(ROUTES.TAVERN); return; }
    if (event.target.matches('[data-shop-library-price]')) { this.updateKrassLibraryUi({shopPrice:event.target.value||'all'}); this.render(ROUTES.TAVERN); return; }
    if (event.target.matches('[data-shop-library-requirement]')) { this.updateKrassLibraryUi({shopRequirement:event.target.value||'all'}); this.render(ROUTES.TAVERN); return; }
    if (event.target.matches('[data-shop-library-ownership]')) { this.updateKrassLibraryUi({shopOwnership:event.target.value||'all'}); this.render(ROUTES.TAVERN); return; }
    if (event.target.matches('[data-shop-library-sort]')) { this.updateKrassLibraryUi({shopSort:event.target.value||'id'}); this.render(ROUTES.TAVERN); return; }
    if (event.target.matches('[data-shop-library-tag]')) { const value=event.target.value;const set=new Set(this.krassLibraryUi?.shopTags||[]);event.target.checked?set.add(value):set.delete(value);this.updateKrassLibraryUi({shopTags:[...set]});this.render(ROUTES.TAVERN);return; }
    if (event.target.matches('[data-lender-slot]')) { this.lenderSlot=event.target.value||'all'; this.render(ROUTES.TAVERN); return; }
    if (event.target.matches('[data-lender-weapon-type]')) { this.lenderWeaponType=event.target.value||'all'; this.render(ROUTES.TAVERN); return; }
    if (event.target.matches('[data-lender-sort]')) { this.lenderSort=event.target.value||'name'; this.render(ROUTES.TAVERN); return; }
    if (event.target.matches('[data-primary-combat-target]')) { this.syncCombatTargetHighlight(event.target); return; }
    if (event.target.matches('[data-ability-target-shield], [data-ability-target-heal]')) return;
    if (event.target.matches('[data-crafting-only]')) { this.craftingOnlyCraftable = Boolean(event.target.checked); this.persistCampaignCraftingUiState({ onlyCraftable:this.craftingOnlyCraftable }); this.render(ROUTES.CAMPAIGN_RUN); return; }
    if (event.target.matches('[data-crafting-sort]')) { this.craftingSortStat = event.target.value || ''; this.persistCampaignCraftingUiState({ sortStat:this.craftingSortStat }); this.render(ROUTES.CAMPAIGN_RUN); return; }
    if (event.target.matches('[data-crafting-slot]')) { this.craftingSlot=event.target.value||'all'; this.persistCampaignCraftingUiState({ slot:this.craftingSlot }); this.render(ROUTES.CAMPAIGN_RUN); return; }
    if (event.target.matches('[data-crafting-type]')) { this.craftingType=event.target.value||'all'; this.persistCampaignCraftingUiState({ itemType:this.craftingType }); this.render(ROUTES.CAMPAIGN_RUN); return; }
    if (event.target.matches('[data-crafting-subtype]')) { this.craftingSubtype=event.target.value||'all'; this.persistCampaignCraftingUiState({ subtype:this.craftingSubtype }); this.render(ROUTES.CAMPAIGN_RUN); return; }
    if (event.target.matches('[data-crafting-weapon-type]')) { this.craftingWeaponType=event.target.value||'all'; this.persistCampaignCraftingUiState({ weaponType:this.craftingWeaponType }); this.render(ROUTES.CAMPAIGN_RUN); return; }
    if (event.target.matches('[data-crafting-armor-weight]')) { this.craftingArmorWeight=event.target.value||'all'; this.persistCampaignCraftingUiState({ armorWeight:this.craftingArmorWeight }); this.render(ROUTES.CAMPAIGN_RUN); return; }
    if (event.target.matches('[data-race-config-select]')) { const form=event.target.closest('form');this.updateRacialConfigurationPanels(form,event.target.value);if(event.target.matches('[data-starting-race]'))this.refreshStatAllocator(form);return; }
    if (event.target.matches('[data-starting-race]')) { this.refreshStatAllocator(event.target.closest('form')); return; }
    const keptChoice = event.target.closest('[data-kept-choice]');
    if (keptChoice) { this.changeKeptChoice(keptChoice); return; }
    const select = event.target.closest('[data-setting]');
    if (!select) return;
    if (select.dataset.setting === 'combatSpeed') {
      const value = Number(select.value);
      if (value >= 0.1 && value <= 4) this.account.settings = { ...(this.account.settings || {}), combatSpeed: value };
    } else if (select.dataset.setting === 'autoEndTurn') {
      this.account.settings = { ...(this.account.settings || {}), autoEndTurn: Boolean(select.checked) };
    } else if (select.dataset.setting === 'reducedMotion') {
      this.account.settings = { ...(this.account.settings || {}), reducedMotion: Boolean(select.checked) };
    } else if (select.dataset.setting === 'combatNumbers') {
      this.account.settings = { ...(this.account.settings || {}), combatNumbers: Boolean(select.checked) };
    } else if (select.dataset.setting === 'screenFlash') {
      const value = ['off','low','standard'].includes(select.value) ? select.value : 'standard';
      this.account.settings = { ...(this.account.settings || {}), screenFlash: value };
    }
    this.account = this.save.saveAccount(this.account);
    if (this.router.routeFromLocation() === ROUTES.SETTINGS) this.render(ROUTES.SETTINGS);
    else if(select.dataset.setting==='combatSpeed'&&this.router.routeFromLocation()===ROUTES.CAMPAIGN_RUN){const node=this.root.querySelector('.combat-presentation');if(node)node.style.setProperty('--combat-speed',String(this.account.settings.combatSpeed));this.scheduleCombatPlayback(this.activeSlot()?.campaign?.state);}
  }

  offerTutorialForContext(id,returnRoute) {
    if(tutorialStatus(this.account,id)!=='never-seen')return;
    const tutorial=this.canon.getTutorialsHelp().tutorials.find(t=>t.id===id);if(!tutorial)return;
    this.root.insertAdjacentHTML('beforeend',`<aside class="tutorial-offer" role="region" aria-label="Tutorial offer"><div><div class="kicker">Optional Tutorial</div><strong>${escapeHtml(tutorial.name)}</strong><p>Learn this system now, or skip it and replay it later from the Training Chambers.</p></div><div class="tutorial-offer-actions"><button class="secondary" data-action="tutorial-offer-skip" data-tutorial="${escapeHtml(id)}">Skip For Now</button><button class="primary" data-action="tutorial-offer-start" data-tutorial="${escapeHtml(id)}" data-return-route="${escapeHtml(returnRoute)}">Start Tutorial</button></div></aside>`);
  }

  startContextTutorial(id) {
    const tutorial=this.canon.getTutorialsHelp().tutorials.find(t=>t.id===id);if(!tutorial)return;
    const marked=setTutorialStatus(this.account,id,'started');if(marked.ok)this.account=this.save.saveAccount(marked.account);
    this.activeTutorialId=id;this.activeTutorialStep=0;this.tutorialReturnRoute=this.router.routeFromLocation();this.tutorialReturnTavernRoom=this.tavern.currentRoom()?.id||null;
    this.root.querySelector('.tutorial-offer')?.remove();this.refreshGuidedTutorialOverlay();
  }

  guidedHighlightSelector(id) {
    return ({'character-creation':'#vessel-form','tavern-lobby':'.room-grid','kept-impressions':'.library-panel','getting-adventurer':'.kept-grid','building-team':'.kept-grid','starting-campaign':'[data-action="start-campaign"]','forest-combat':'.combat-command-bar','campsite':'.campsite-owner'})[id]||null;
  }

  refreshGuidedTutorialOverlay() {
    this.root.querySelector('.guided-tutorial-overlay')?.remove();
    this.root.querySelectorAll('.tutorial-highlighted').forEach(node=>node.classList.remove('tutorial-highlighted'));
    const tutorial=this.canon.getTutorialsHelp().tutorials.find(t=>t.id===this.activeTutorialId);if(!tutorial)return;
    const selector=this.guidedHighlightSelector(tutorial.id);const target=selector?this.root.querySelector(selector):null;if(target)target.classList.add('tutorial-highlighted');
    this.root.insertAdjacentHTML('beforeend',guidedTutorialOverlay({tutorial,stepIndex:this.activeTutorialStep}));
  }

  stepGuidedTutorial(delta) {
    const tutorial=this.canon.getTutorialsHelp().tutorials.find(t=>t.id===this.activeTutorialId);if(!tutorial)return;
    this.activeTutorialStep=Math.max(0,Math.min((tutorial.steps?.length||1)-1,this.activeTutorialStep+delta));this.refreshGuidedTutorialOverlay();
  }

  finishGuidedTutorial(status) {
    if(!this.activeTutorialId)return;
    const marked=setTutorialStatus(this.account,this.activeTutorialId,status);if(marked.ok)this.account=this.save.saveAccount(marked.account);
    this.activeTutorialId=null;this.activeTutorialStep=0;this.root.querySelector('.guided-tutorial-overlay')?.remove();this.root.querySelectorAll('.tutorial-highlighted').forEach(node=>node.classList.remove('tutorial-highlighted'));
  }

  skipOfferedTutorial(id) {
    const marked=setTutorialStatus(this.account,id,'skipped');if(marked.ok)this.account=this.save.saveAccount(marked.account);
    const node=this.root.querySelector('.tutorial-offer');if(node)node.remove();
  }

  resolveStarterOnboarding(resolution) {
    const result=resolveStarterTutorial(this.account,resolution);if(!result.ok)return;
    this.account=this.save.saveAccount(result.account);this.starterTutorialStep=0;
    this.router.replace(ROUTES.HOME);
  }

  startTutorialReplay(id) {
    const tutorial=this.canon.getTutorialsHelp().tutorials.find(t=>t.id===id);if(!tutorial)return;
    const marked=setTutorialStatus(this.account,id,'started');if(marked.ok)this.account=this.save.saveAccount(marked.account);
    this.activeTutorialId=id;this.activeTutorialStep=0;this.tutorialReturnRoute=ROUTES.TAVERN;this.tutorialReturnTavernRoom='training-chambers';this.tavern.leave();this.router.go(ROUTES.TUTORIAL);
  }

  finishTutorialReplay(status) {
    if(!this.activeTutorialId)return this.router.go(ROUTES.HOME);
    const marked=setTutorialStatus(this.account,this.activeTutorialId,status);if(marked.ok)this.account=this.save.saveAccount(marked.account);
    const returnRoute=this.tutorialReturnRoute||ROUTES.HOME, returnRoom=this.tutorialReturnTavernRoom;
    this.activeTutorialId=null;this.activeTutorialStep=0;this.tutorialReturnRoute=null;this.tutorialReturnTavernRoom=null;
    const slotNumber=this.activeSlotNumber();if(returnRoute===ROUTES.TAVERN&&slotNumber&&this.activeSlot()?.character){this.tavern.enter(slotNumber,returnRoom||'main-hall');this.tavernMessage=status==='completed'?'Tutorial completed. You can replay it at any time.':'Tutorial skipped. You can replay it at any time.';return this.router.replace(ROUTES.TAVERN);}
    this.router.replace(returnRoute);
  }

  confirmTutorialSkip() {
    this.root.querySelector('.modal-backdrop')?.remove();
    this.root.insertAdjacentHTML('beforeend',`<div class="modal-backdrop" role="dialog" aria-modal="true"><div class="modal"><h2>Leave this tutorial?</h2><p>You can replay it from the Training Chambers at any time. Replays never grant additional starter tokens.</p><div class="modal-actions"><button class="secondary" data-action="tutorial-skip-cancel">Keep Learning</button><button class="primary" data-action="tutorial-skip-confirm">Skip Tutorial</button></div></div></div>`);
  }

  exitTutorialReplay() { if(!this.activeTutorialId)return this.router.go(ROUTES.HOME); return this.confirmTutorialSkip(); }

  redeemStarterToken(id) {
    const result=redeemTutorialKeptToken(this.account,id,this.canon.getKeptImpressions());
    this.tavernMessage=result.ok?`${result.entry.name} is now Kept. ${result.remaining} free token${result.remaining===1?'':'s'} remain.`:result.error;
    if(result.ok)this.account=this.save.saveAccount(result.account);this.render(ROUTES.TAVERN);
  }

  requestRaceTokenUnlock(race) {
    const selected=String(race||'');
    const allRaces=this.canon.getRaces();
    if(!allRaces.includes(selected))return;
    const owned=new Set(this.account?.unlocks?.races||[]);
    const balance=raceChoiceTokenBalance(this.account);
    if(owned.has(selected)||balance<1){
      const message=owned.has(selected)?`${selected} is already unlocked for this account.`:'No free Race Choice token remains.';
      const route=this.router.routeFromLocation();
      if(route===ROUTES.CREATE){this.creationMessage=message;this.creationErrors=[];return this.render(ROUTES.CREATE);}
      this.tavernMessage=message;return this.render(ROUTES.TAVERN);
    }
    const racialData=this.canon.getRacialConfigurations();
    const detail=racialData?.raceDetails?.[selected]||{};
    const abilities=Array.isArray(detail.abilities)?detail.abilities:[];
    const drawbacks=Array.isArray(detail.drawbacks)&&detail.drawbacks.length?detail.drawbacks:['No dedicated racial drawback is currently listed.'];
    const configurable=Boolean(racialData?.races?.[selected]);
    this.root.querySelector('.modal-backdrop')?.remove();
    this.root.insertAdjacentHTML('beforeend',`<div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="race-unlock-confirm-title"><div class="modal race-unlock-confirm-modal"><div class="kicker">Permanent Account Unlock</div><h2 id="race-unlock-confirm-title">Unlock ${escapeHtml(selected)}?</h2>${detail.summary?`<p class="race-unlock-summary">${escapeHtml(detail.summary)}</p>`:''}<div class="race-unlock-confirm-scroll" tabindex="0"><section class="race-unlock-detail-group"><h3>Abilities &amp; Traits</h3><ul>${abilities.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul></section><section class="race-unlock-detail-group drawbacks"><h3>Drawbacks &amp; Tradeoffs</h3><ul>${drawbacks.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul></section>${configurable?`<div class="notice"><strong>Configurable racial features:</strong> after unlocking ${escapeHtml(selected)}, its racial choices are selected in the Tavern before a campaign begins.</div>`:''}</div><div class="notice section"><strong>This cannot be undone.</strong> Unlocking ${escapeHtml(selected)} permanently adds the race to this account and consumes 1 Race Choice token. You currently have ${balance} token${balance===1?'':'s'}.</div><div class="modal-actions"><button class="secondary" data-action="race-token-cancel">Cancel</button><button class="primary" data-action="race-token-confirm" data-race="${escapeHtml(selected)}">Unlock ${escapeHtml(selected)} Permanently</button></div></div></div>`);
  }

  redeemRaceToken(race) {
    this.root.querySelector('.modal-backdrop')?.remove();
    const result=redeemRaceChoiceToken(this.account,race,this.canon.getRaces());
    const route=this.router.routeFromLocation();
    const message=result.ok?`${result.race} is now permanently unlocked for this account. The Race Choice token has been consumed.`:result.error;
    if(result.ok)this.account=this.save.saveAccount(result.account);
    if(route===ROUTES.CREATE){this.creationMessage=message;this.creationErrors=[];return this.render(ROUTES.CREATE);}
    this.tavernMessage=message;this.render(ROUTES.TAVERN);
  }


  buyKeptBoon(keptId) {
    const result = purchaseKeptImpressionBoon(this.account, keptId, {
      tavernServices: this.canon.getTavernServices(),
      keptEntries: this.canon.getKeptImpressions()
    });
    if (!result.ok) {
      this.tavernMessage = result.error;
      return this.render(ROUTES.TAVERN);
    }
    this.account = this.save.saveAccount(result.account);
    this.tavernMessage = `${result.entry.name} is now permanently Kept by this account. ${result.offer.onyxCost} Onyx spent; ${result.remainingOnyx} Onyx remain.`;
    return this.render(ROUTES.TAVERN);
  }

  showContextualLesson(id,route=this.router.routeFromLocation()) {
    if(contextualSeen(this.account,id))return;
    if(this.root.querySelector('.contextual-lesson'))return;
    const lesson=this.canon.getTutorialsHelp().contextualLessons.find(x=>x.id===id);if(!lesson)return;
    this.root.insertAdjacentHTML('beforeend',`<div class="contextual-lesson" data-contextual-lesson="${escapeHtml(id)}" role="status"><div><div class="kicker">New Mechanic</div><strong>${escapeHtml(lesson.name)}</strong><p>${escapeHtml(lesson.body)}</p></div><button class="secondary" data-action="contextual-dismiss" data-lesson="${escapeHtml(id)}">Got It</button></div>`);
  }

  dismissContextualLesson(id) {
    const node=this.root.querySelector('.contextual-lesson');
    const lessonId=id||node?.dataset?.contextualLesson||null;
    if(lessonId&&!contextualSeen(this.account,lessonId))this.account=this.save.saveAccount(markContextualSeen(this.account,lessonId));
    if(node)node.remove();
  }

  syncCombatTargetHighlight(select) {
    const primary=[...this.root.querySelectorAll('[data-primary-combat-target]')];const actorId=select?.value||null;
    if(select?.matches('[data-primary-combat-target]')&&actorId){for(const other of primary){if([...other.options].some(o=>o.value===actorId))other.value=actorId;}}
    for(const node of primary)node.dataset.combatTargetActive=node===select?'true':'false';for(const card of this.root.querySelectorAll('[data-combat-actor-id]'))card.classList.remove('selected-target');
    if(!actorId)return;const card=[...this.root.querySelectorAll('[data-combat-actor-id]')].find(node=>node.dataset.combatActorId===actorId);if(card)card.classList.add('selected-target');
  }

  selectBattlefieldActor(card) {
    const actorId=card?.dataset?.combatActorId;if(!actorId)return;const selects=[...this.root.querySelectorAll('[data-primary-combat-target]')];const accepts=select=>[...select.options].some(option=>option.value===actorId);const active=selects.find(select=>select.dataset.combatTargetActive==='true'&&accepts(select))||selects.find(accepts);if(!active)return;for(const select of selects)if(accepts(select))select.value=actorId;this.syncCombatTargetHighlight(active);
  }

  statPoolForForm(form) {
    if (!form) return 0;
    if (form.id === 'vessel-form') return getStartingStatPool(form.querySelector('[name="race"]')?.value || '');
    return Number(this.activeSlot()?.character?.startingStatPool || 0);
  }

  refreshStatAllocator(form) {
    if (!form) return;
    const pool = this.statPoolForForm(form);
    const inputs = [...form.querySelectorAll('[data-stat-input]')];
    let total = 0;
    for (const input of inputs) {
      const value = Math.max(0, Math.trunc(Number(input.value || 0)));
      if (String(value) !== input.value) input.value = String(value);
      total += value;
    }
    const raceRequired = form.id === 'vessel-form';
    const hasRace = !raceRequired || Boolean(form.querySelector('[name="race"]')?.value);
    const remaining = Math.max(0, pool - total);
    for (const button of form.querySelectorAll('[data-action="stat-step"]')) {
      const stat = button.dataset.stat;
      const step = Number(button.dataset.statStep || 0);
      const input = form.querySelector(`[data-stat-input="${stat}"]`);
      const value = Math.max(0, Math.trunc(Number(input?.value || 0)));
      button.disabled = step > 0 ? (!hasRace || remaining <= 0) : value <= 0;
    }
    const label = form.querySelector('[data-stat-remaining]');
    if (!label) return;
    if (!hasRace) label.textContent = 'Choose a race';
    else label.textContent = String(remaining);
  }

  stepStat(button) {
    const form = button.closest('form');
    const stat = button.dataset.stat;
    const input = form?.querySelector(`[data-stat-input="${stat}"]`);
    if (!form || !input || !CORE_STATS.includes(stat)) return;
    if (form.id === 'vessel-form' && !form.querySelector('[name="race"]')?.value) return this.refreshStatAllocator(form);
    const step = Number(button.dataset.statStep || 0);
    const current = Math.max(0, Math.trunc(Number(input.value || 0)));
    const pool = this.statPoolForForm(form);
    const total = [...form.querySelectorAll('[data-stat-input]')].reduce((sum, item) => sum + Math.max(0, Math.trunc(Number(item.value || 0))), 0);
    if (step > 0 && total >= pool) return this.refreshStatAllocator(form);
    input.value = String(Math.max(0, current + Math.sign(step)));
    this.refreshStatAllocator(form);
  }

  changeKeptImpression(id, equip) {
    const slotNumber = this.activeSlotNumber();
    const slot = this.activeSlot();
    if (!slotNumber || !slot) return;
    const result = equip
      ? equipKeptImpression(slot, this.account, id, this.canon.getKeptImpressions())
      : unequipKeptImpression(slot, id, this.canon.getKeptImpressions());
    this.tavernMessage = result.ok ? (equip ? 'Kept Impression equipped.' : 'Kept Impression unequipped.') : result.error;
    if (result.ok) this.save.saveSlot(slotNumber, result.slot);
    this.render(ROUTES.TAVERN);
  }

  changeKeptChoice(control) {
    const slotNumber=this.activeSlotNumber(),slot=this.activeSlot();if(!slotNumber||!slot)return;
    const id=control.dataset.ki,key=control.dataset.choiceKey;
    const value=control.multiple?[...control.selectedOptions].map(o=>o.value):control.value;
    const result=setKeptImpressionChoice(slot,id,key,value,this.canon.getKeptImpressionRuntime().entries);
    this.tavernMessage=result.ok?'Kept Impression choice saved.':result.error;
    if(result.ok)this.save.saveSlot(slotNumber,result.slot);
    this.render(ROUTES.TAVERN);
  }

  changeMantle(subclass) {
    const slotNumber = this.activeSlotNumber();
    const slot = this.activeSlot();
    if (!slotNumber || !slot) return;
    const result = selectMantle({ slot, account: this.account, subclass, subclassesForBase: this.canon.getSubclassesForBase(slot.character.baseClass) });
    this.tavernMessage = result.ok ? (subclass ? `${subclass} Mantle selected.` : 'Mantle removed for the next campaign.') : result.error;
    if (result.ok) this.save.saveSlot(slotNumber, result.slot);
    this.render(ROUTES.TAVERN);
  }

  buyChronicleNode(nodeId) {
    const familyName = this.chronicleFamily || this.activeSlot()?.character?.baseClass;
    const result = purchaseChronicleNode({ account: this.account, chronicleTrees: this.canon.getChronicleTrees(), familyName, nodeId, activeCampaign: Boolean(this.activeSlot()?.campaign?.active) });
    if (result.ok) { this.account = this.save.saveAccount(result.account); this.chronicleMessage = 'Chronicle node activated.'; }
    else this.chronicleMessage = result.reason;
    this.render(ROUTES.CHRONICLE);
  }

  respecChronicle(familyName) {
    const result = respecChronicleFamily({ account: this.account, chronicleTrees: this.canon.getChronicleTrees(), familyName, activeCampaign: Boolean(this.activeSlot()?.campaign?.active) });
    if (result.ok) { this.account = this.save.saveAccount(result.account); this.chronicleMessage = 'Chronicle Points refunded.'; }
    else this.chronicleMessage = result.error;
    this.render(ROUTES.CHRONICLE);
  }

  openCampaignDoor() {
    const slot = this.activeSlot();
    if (!slot) return;
    if (slot.campaign?.settlement) return this.router.go(ROUTES.CAMPAIGN_RESULTS);
    if (slot.campaign?.active) return this.router.go(ROUTES.CAMPAIGN_RUN);
    return this.router.go(ROUTES.CAMPAIGN_PREP);
  }

  beginCampaign() {
    const slotNumber = this.activeSlotNumber();
    const slot = this.activeSlot();
    if (!slotNumber || !slot) return;
    const difficulty = this.root.querySelector('[data-campaign-difficulty]:checked')?.value || 'Normal';
    const result = startCampaign(slot, { account: this.account, chronicleTrees: this.canon.getChronicleTrees(), regionsData: this.canon.getRegions(), forestEvents: this.canon.getForestEvents(), forestTrainers: this.canon.getForestTrainers(), tavernAdventurers: this.canon.getTavernAdventurers(), progression: this.canon.getCharacterProgression(), equipmentConsumablesStatus: this.canon.getEquipmentConsumablesStatus(), forestCrafting: this.canon.getForestCrafting(), racialConfigurations: this.canon.getRacialConfigurations(), difficulty });
    if (!result.ok) { this.tavernMessage = result.error; this.tavern.enter(slotNumber, 'main-hall'); this.router.replace(ROUTES.TAVERN); return; }
    this.save.saveSlot(slotNumber, result.slot);
    if (result.run?.expedition?.firstEverIntro && !this.account.history?.forestIntroSeen) {
      this.account.history = { ...(this.account.history || {}), forestIntroSeen: true };
      this.account = this.save.saveAccount(this.account);
    }
    this.tavern.leave();
    this.router.go(ROUTES.CAMPAIGN_RUN);
  }

  chooseExpeditionCard(cardId) {
    const slotNumber = this.activeSlotNumber();
    const slot = this.activeSlot();
    if (!slotNumber || !slot?.campaign?.active) return;
    const result = selectExpeditionCard(slot, cardId);
    if (!result.ok) return;
    this.save.saveSlot(slotNumber, result.slot);
    this.render(ROUTES.CAMPAIGN_RUN);
    if(result.slot.campaign.state?.expedition?.encounter?.trainerId)this.showContextualLesson('trainer-first');
  }

  rollForestEvent(button) {
    const slotNumber=this.activeSlotNumber(),slot=this.activeSlot(); if(!slotNumber||!slot?.campaign?.active)return;
    const participantId=this.root.querySelector('[data-forest-check-participant]')?.value||'vessel';
    const rid=slot.campaign.state.expedition?.regionId;const crafting=rid==='shadow-infused-dark-woods'?this.canon.getNecropolisCrafting():rid==='necropolis'?this.canon.getNecropolisCrafting():rid==='that-dragons-dungeon'?this.canon.getDragonCrafting():rid==='caverns-to-hell'?this.canon.getHellCrafting():rid==='ruined-vampiric-plains'?this.canon.getPlainsCrafting():rid==='heavenly-tower'?this.canon.getTowerCrafting():rid==='bog-of-lost-souls'?this.canon.getBogCrafting():this.canon.getForestCrafting();const result=resolveForestEventCheck(slot,{participantId,equipmentCatalog:this.canon.getEquipmentConsumablesStatus(),forestCrafting:crafting,progression:this.canon.getCharacterProgression()});
    if(!result.ok)return; this.save.saveSlot(slotNumber,result.slot); this.render(ROUTES.CAMPAIGN_RUN);
  }

  fightForestTrainer(trainerId) {
    const slotNumber=this.activeSlotNumber(),slot=this.activeSlot(); if(!slotNumber||!slot?.campaign?.active)return;
    const result=chooseTrainerFight(slot,{trainerId}); if(!result.ok)return; this.save.saveSlot(slotNumber,result.slot); this.render(ROUTES.CAMPAIGN_RUN);
  }

  learnForestTrainer(trainerId) {
    const slotNumber=this.activeSlotNumber(),slot=this.activeSlot(); if(!slotNumber||!slot?.campaign?.active)return;
    const trainers=slot.campaign.state.expedition?.regionId==='bog-of-lost-souls'?this.canon.getBogTrainers():this.canon.getForestTrainers();const result=learnFromTrainer(slot,this.account,{trainerId,forestTrainers:trainers}); if(!result.ok)return;
    this.account=this.save.saveAccount(result.account); this.save.saveSlot(slotNumber,result.slot); this.render(ROUTES.CAMPAIGN_RUN); this.showContextualLesson('first-subclass');
  }

  finishExpeditionCampsite() {
    const slotNumber = this.activeSlotNumber();
    const slot = this.activeSlot();
    if (!slotNumber || !slot?.campaign?.active) return;
    const result = leaveCampsite(slot, { regionsData: this.canon.getRegions(), forestEvents: this.canon.getForestEvents(), forestTrainers: this.canon.getForestTrainers(), bogEvents:this.canon.getBogEvents(), bogTrainers:this.canon.getBogTrainers(), towerEvents:this.canon.getTowerEvents(), plainsEvents:this.canon.getPlainsEvents(), hellEvents:this.canon.getHellEvents(), dragonEvents:this.canon.getDragonEvents(), necropolisEvents:this.canon.getNecropolisEvents() });
    if (!result.ok) return;
    this.save.saveSlot(slotNumber, result.slot);
    this.render(ROUTES.CAMPAIGN_RUN);
  }

  continueExpeditionStep() {
    const slotNumber = this.activeSlotNumber();
    const slot = this.activeSlot();
    if (!slotNumber || !slot?.campaign?.active) return;
    const result = advanceAfterResolvedNoncombat(slot, { regionsData: this.canon.getRegions(), forestEvents: this.canon.getForestEvents(), forestTrainers: this.canon.getForestTrainers(), bogEvents:this.canon.getBogEvents(), bogTrainers:this.canon.getBogTrainers(), towerEvents:this.canon.getTowerEvents(), plainsEvents:this.canon.getPlainsEvents(), hellEvents:this.canon.getHellEvents(), dragonEvents:this.canon.getDragonEvents(), necropolisEvents:this.canon.getNecropolisEvents() });
    if (!result.ok) return;
    this.save.saveSlot(slotNumber, result.slot);
    this.render(ROUTES.CAMPAIGN_RUN);
  }

  continueForestEventCombat(){const slotNumber=this.activeSlotNumber(),slot=this.activeSlot();if(!slotNumber||!slot?.campaign?.active)return;const result=continueAfterForestEventResult(slot);if(!result.ok)return;this.save.saveSlot(slotNumber,result.slot);this.render(ROUTES.CAMPAIGN_RUN);}

  commitPlayerActionResult(slotNumber,result) {
    if(!result?.ok)return result;
    let nextSlot=result.slot;
    const auto=autoEndPlayerTurn(nextSlot,{enabled:this.account?.settings?.autoEndTurn!==false});
    if(!auto.ok)return auto;
    nextSlot=auto.slot;
    this.save.saveSlot(slotNumber,nextSlot);
    if(auto.ended){this.combatActionPanel='abilities';this.deferNextAiAction=true;}
    this.render(ROUTES.CAMPAIGN_RUN);
    return{ok:true,slot:nextSlot,autoEnded:Boolean(auto.ended)};
  }

  performCombatAction(type) {
    const slotNumber = this.activeSlotNumber();
    const slot = this.activeSlot();
    if (!slotNumber || !slot?.campaign?.active) return;
    const result = takePlayerTurnAction(slot, { type });
    if (!result.ok) return;
    return this.commitPlayerActionResult(slotNumber,result);
  }

  performEquipmentAbility(button) {
    const slotNumber=this.activeSlotNumber(),slot=this.activeSlot();if(!slotNumber||!slot?.campaign?.active)return;
    const abilityId=button.dataset.equipmentAbility||null;const targetId=abilityId?this.root.querySelector(`[data-equipment-ability-target="${CSS.escape(abilityId)}"]`)?.value||null:null;
    const result=executeEquipmentAbility(slot,{abilityId,targetId});if(!result.ok)return;
    return this.commitPlayerActionResult(slotNumber,result);
  }

  performRacialAbility(button) {
    const slotNumber=this.activeSlotNumber(),slot=this.activeSlot();if(!slotNumber||!slot?.campaign?.active)return;
    const abilityId=button.dataset.racialAbility||null;
    const targetId=abilityId?this.root.querySelector(`[data-racial-ability-target="${CSS.escape(abilityId)}"]`)?.value||null:null;
    const secondaryTargetId=abilityId?this.root.querySelector(`[data-racial-ability-secondary="${CSS.escape(abilityId)}"]`)?.value||null:null;
    const result=executeRacialAbility(slot,{abilityId,targetId,secondaryTargetId});if(!result.ok)return;
    return this.commitPlayerActionResult(slotNumber,result);
  }

  performConsumable(button) {
    const slotNumber=this.activeSlotNumber(),slot=this.activeSlot();if(!slotNumber||!slot?.campaign?.active)return;
    const itemId=button.dataset.consumable||null;const targetId=itemId?this.root.querySelector(`[data-consumable-target="${CSS.escape(itemId)}"]`)?.value||null:null;
    const result=executeEquippedConsumable(slot,{itemId,targetId,catalog:this.canon.getEquipmentConsumablesStatus()});if(!result.ok)return;
    return this.commitPlayerActionResult(slotNumber,result);
  }

  equipCampConsumable(button) {
    const slotNumber=this.activeSlotNumber(),slot=this.activeSlot();if(!slotNumber||!slot?.campaign?.active)return;
    const result=equipConsumableAtCampsite(slot,{itemId:button.dataset.item,slotIndex:Number(button.dataset.slot||1),catalog:this.canon.getEquipmentConsumablesStatus()});if(!result.ok)return;
    this.save.saveSlot(slotNumber,result.slot);this.render(ROUTES.CAMPAIGN_RUN);
  }

  unequipCampConsumable(button) {
    const slotNumber=this.activeSlotNumber(),slot=this.activeSlot();if(!slotNumber||!slot?.campaign?.active)return;
    const result=unequipConsumableAtCampsite(slot,{slotIndex:Number(button.dataset.slot||1)});if(!result.ok)return;
    this.save.saveSlot(slotNumber,result.slot);this.render(ROUTES.CAMPAIGN_RUN);
  }

  equipCampEquipment(button) {
    const slotNumber=this.activeSlotNumber(),slot=this.activeSlot();if(!slotNumber||!slot?.campaign?.active)return;
    const result=equipRunEquipmentAtCampsite(slot,{itemId:button.dataset.item,slotKey:button.dataset.slot,catalog:this.canon.getEquipmentConsumablesStatus(),ownerId:button.dataset.owner||this.campsiteEquipmentOwnerId});if(!result.ok)return;
    this.save.saveSlot(slotNumber,result.slot);this.render(ROUTES.CAMPAIGN_RUN);
  }

  unequipCampEquipment(button) {
    const slotNumber=this.activeSlotNumber(),slot=this.activeSlot();if(!slotNumber||!slot?.campaign?.active)return;
    const result=unequipRunEquipmentAtCampsite(slot,{slotKey:button.dataset.slot,ownerId:button.dataset.owner||this.campsiteEquipmentOwnerId});if(!result.ok)return;
    this.save.saveSlot(slotNumber,result.slot);this.render(ROUTES.CAMPAIGN_RUN);
  }

  discardCampEquipment(button) {
    const slotNumber=this.activeSlotNumber(),slot=this.activeSlot();if(!slotNumber||!slot?.campaign?.active)return;
    const name=button.dataset.itemName||'this item';
    if(!window.confirm(`Discard one ${name}? This permanently removes that carried copy from the current campaign and cannot be undone.`))return;
    const result=discardRunEquipmentAtCampsite(slot,{itemId:button.dataset.item,count:1});
    if(!result.ok){window.alert(result.error||'That item could not be discarded.');return;}
    this.save.saveSlot(slotNumber,result.slot);this.render(ROUTES.CAMPAIGN_RUN);
  }

  discardCampConsumable(button) {
    const slotNumber=this.activeSlotNumber(),slot=this.activeSlot();if(!slotNumber||!slot?.campaign?.active)return;
    const name=button.dataset.itemName||'this consumable';
    if(!window.confirm(`Discard one ${name}? This permanently removes that carried copy from the current campaign and cannot be undone.`))return;
    const result=discardRunConsumableAtCampsite(slot,{itemId:button.dataset.item,count:1});
    if(!result.ok){window.alert(result.error||'That consumable could not be discarded.');return;}
    this.save.saveSlot(slotNumber,result.slot);this.render(ROUTES.CAMPAIGN_RUN);
  }

  craftCampRecipe(button) {
    const slotNumber=this.activeSlotNumber(),slot=this.activeSlot();if(!slotNumber||!slot?.campaign?.active)return;
    const rid=slot.campaign.state.expedition?.regionId,crafting=cumulativeCampsiteCrafting(this.canon,rid);const result=craftAtCampsite(slot,{recipeId:button.dataset.recipe,crafting,catalog:this.canon.getEquipmentConsumablesStatus()});
    if(!result.ok){this.craftingMessage=result.error||'That recipe cannot be crafted.';this.render(ROUTES.CAMPAIGN_RUN);return;}
    this.craftingMessage=`Crafted ${result.recipe.name}.`;this.save.saveSlot(slotNumber,result.slot);this.render(ROUTES.CAMPAIGN_RUN);
  }

  toggleCraftRecipeHidden(recipeId) {
    if(!recipeId)return;
    const hidden=new Set(this.activeCampaignCraftingUiState().hiddenRecipeIds||[]);
    if(hidden.has(recipeId))hidden.delete(recipeId);else hidden.add(recipeId);
    this.persistCampaignCraftingUiState({ hiddenRecipeIds:[...hidden] }, { saveHiddenToAccount:true });
    this.render(ROUTES.CAMPAIGN_RUN);
  }

  unhideAllCraftRecipes() {
    this.craftingShowHidden=false;
    this.persistCampaignCraftingUiState({ hiddenRecipeIds:[], showHidden:false }, { saveHiddenToAccount:true });
    this.render(ROUTES.CAMPAIGN_RUN);
  }

  buildRecommendedCraftPlan(slot,ownerId,crafting,{maxCrafts=10}={}) {
    const catalog=this.canon.getEquipmentConsumablesStatus(),baseAbilities=this.canon.getBaseAbilities(),subclassAbilities=this.canon.getSubclassAbilities(),hidden=new Set(this.activeCampaignCraftingUiState(slot).hiddenRecipeIds||[]),run=slot.campaign.state;
    const baseline=recommendEquipmentLoadout(run,{ownerId,catalog,baseAbilities,subclassAbilities});if(!baseline.ok)return {ok:false,slot,steps:[],finalRecommendation:baseline};
    const rows=listCraftingRecipes(run,crafting,catalog,{onlyCraftable:true}).filter(row=>row.recipe?.output?.type==='equipment'&&!hidden.has(row.recipe.id)),eqIndex=new Map((catalog?.equipment||[]).map(item=>[item.id,item])),recipeByItem=new Map();for(const row of rows)if(row.output?.id&&!recipeByItem.has(row.output.id))recipeByItem.set(row.output.id,row);
    const itemIds=[...new Set([...Object.values(baseline.loadout||{}),...rows.map(row=>row.output?.id).filter(Boolean)])],scoreInfo=scoreEquipmentItemsForRecommendation(run,{ownerId,catalog,baseAbilities,subclassAbilities,itemIds});if(!scoreInfo.ok)return {ok:false,slot,steps:[],finalRecommendation:baseline};const score=id=>Number(scoreInfo.scores?.[id]??-Infinity);
    const candidateIds=rows.map(row=>row.output?.id).filter(id=>id&&Number.isFinite(score(id))),desired={},fixed=['helmet','chest','boots','gloves','accessory','abilityItem'];
    for(const slotKey of fixed){const current=baseline.loadout?.[slotKey]||null;let best=current,bestScore=current?score(current):0;for(const id of candidateIds){const item=eqIndex.get(id);if(!item||!legalEquipmentSlots(item).includes(slotKey))continue;if(score(id)>bestScore+.05){best=id;bestScore=score(id);}}if(best)desired[slotKey]=best;}
    const charmOptions=[...new Set([baseline.loadout?.charm1,baseline.loadout?.charm2,...candidateIds].filter(Boolean))].filter(id=>{const item=eqIndex.get(id);return item&&legalEquipmentSlots(item).some(s=>s==='charm1'||s==='charm2')&&Number.isFinite(score(id));}).sort((a,b)=>score(b)-score(a));if(charmOptions[0])desired.charm1=charmOptions[0];if(charmOptions[1]&&charmOptions[1]!==charmOptions[0])desired.charm2=charmOptions[1];
    const handIds=[...new Set([baseline.loadout?.mainHand,baseline.loadout?.offHand,...candidateIds].filter(Boolean))].filter(id=>{const item=eqIndex.get(id);return item&&legalEquipmentSlots(item).some(s=>s==='mainHand'||s==='offHand')&&Number.isFinite(score(id));}).sort((a,b)=>score(b)-score(a)).slice(0,24),mainOptions=[null,...handIds.filter(id=>legalEquipmentSlots(eqIndex.get(id)).includes('mainHand'))],offOptions=[null,...handIds.filter(id=>legalEquipmentSlots(eqIndex.get(id)).includes('offHand'))];let bestHands={score:0,main:null,off:null};
    for(const main of mainOptions)for(const off of offOptions){if(!main&&!off)continue;const mainItem=main?eqIndex.get(main):null;if(mainItem?.handedness==='two-handed'&&off)continue;if(main&&off&&main===off&&!(mainItem?.itemType==='Weapon'&&mainItem?.handedness==='one-handed'&&mainItem?.offHandCompatible===true))continue;const pairScore=(main?score(main):0)+(off?score(off):0);if(pairScore>bestHands.score){bestHands={score:pairScore,main,off};}}
    if(bestHands.main)desired.mainHand=bestHands.main;if(bestHands.off)desired.offHand=bestHands.off;
    const countIds=loadout=>Object.values(loadout||{}).reduce((m,id)=>(m.set(id,(m.get(id)||0)+1),m),new Map()),before=countIds(baseline.loadout),after=countIds(desired),needs=[];
    for(const [id,count] of after){const missing=Math.max(0,count-(before.get(id)||0)),row=recipeByItem.get(id);if(!missing||!row)continue;let improvement=0;for(const [slotKey,wanted] of Object.entries(desired))if(wanted===id){const old=baseline.loadout?.[slotKey];improvement+=Math.max(.05,score(id)-(old?score(old):0));}needs.push({id,row,count:missing,improvement});}
    needs.sort((a,b)=>b.improvement-a.improvement);let simulated=typeof structuredClone==='function'?structuredClone(slot):JSON.parse(JSON.stringify(slot)),steps=[];
    for(const need of needs){for(let i=0;i<need.count&&steps.length<maxCrafts;i++){const crafted=craftAtCampsite(simulated,{recipeId:need.row.recipe.id,crafting,catalog});if(!crafted.ok)break;simulated=crafted.slot;steps.push({recipeId:need.row.recipe.id,name:need.row.output?.name||need.row.recipe.name,improvement:need.improvement/need.count});}if(steps.length>=maxCrafts)break;}
    const finalRecommendation=recommendEquipmentLoadout(simulated.campaign.state,{ownerId,catalog,baseAbilities,subclassAbilities});return {ok:true,slot:simulated,steps,finalRecommendation};
  }

  autoCraftRecommendedGear(ownerId='vessel') {
    const slotNumber=this.activeSlotNumber(),slot=this.activeSlot();if(!slotNumber||!slot?.campaign?.active)return;const rid=slot.campaign.state.expedition?.regionId,crafting=cumulativeCampsiteCrafting(this.canon,rid),plan=this.buildRecommendedCraftPlan(slot,ownerId,crafting);
    if(!plan.steps.length){this.craftingMessage='No currently craftable equipment would improve the recommended loadout for that character. Hidden recipes are ignored.';this.render(ROUTES.CAMPAIGN_RUN);return;}
    const counts=new Map();for(const step of plan.steps)counts.set(step.name,(counts.get(step.name)||0)+1);const list=[...counts].map(([name,count])=>`${count>1?`${count}× `:''}${name}`).join('\n• '),who=plan.finalRecommendation?.ownerName||'that character';
    if(!window.confirm(`Auto Craft Recommended Gear for ${who}?

This will consume materials to craft:
• ${list}

Only gear that improves the recommendation is included. Hidden recipes are skipped.`))return;
    this.save.saveSlot(slotNumber,plan.slot);this.craftingMessage=`Auto-crafted ${plan.steps.length} recommended ${plan.steps.length===1?'item':'items'} for ${who}. Use Auto Equip Recommended Gear to apply the recommended loadout.`;this.render(ROUTES.CAMPAIGN_RUN);
  }

  autoEquipRecommendedGear(ownerId='vessel') {
    const slotNumber=this.activeSlotNumber(),slot=this.activeSlot();if(!slotNumber||!slot?.campaign?.active)return;const result=autoEquipRecommendedAtCampsite(slot,{ownerId,catalog:this.canon.getEquipmentConsumablesStatus(),baseAbilities:this.canon.getBaseAbilities(),subclassAbilities:this.canon.getSubclassAbilities()});
    if(!result.ok){this.craftingMessage=result.error||'Recommended gear could not be equipped.';this.render(ROUTES.CAMPAIGN_RUN);return;}
    if(result.changed)this.save.saveSlot(slotNumber,result.slot);const rec=result.recommendation;this.craftingMessage=result.changed?`Equipped recommended gear for ${rec.ownerName}. Priority stats: ${rec.topStats.join(' / ')}. Existing gear was returned to shared inventory.`:`${rec.ownerName} is already wearing the recommended carried loadout.`;this.render(ROUTES.CAMPAIGN_RUN);
  }

  performBaseAbility(button) {
    const slotNumber = this.activeSlotNumber();
    const slot = this.activeSlot();
    if (!slotNumber || !slot?.campaign?.active) return;
    const abilityId = button.dataset.ability;
    const primary = this.root.querySelector(`[data-ability-target="${CSS.escape(abilityId)}"]`)?.value || null;
    const shield = this.root.querySelector(`[data-ability-target-shield="${CSS.escape(abilityId)}"]`)?.value || null;
    const heal = this.root.querySelector(`[data-ability-target-heal="${CSS.escape(abilityId)}"]`)?.value || null;
    const form = this.root.querySelector(`[data-ability-form="${CSS.escape(abilityId)}"]`)?.value || null;
    const result = executeBaseAbility(slot, { abilityId, catalog: this.canon.getBaseAbilities(), targets: { primary, shield, heal }, form });
    if (!result.ok) return;
    return this.commitPlayerActionResult(slotNumber,result);
  }

  performSubclassAbility(button) {
    const slotNumber = this.activeSlotNumber();
    const slot = this.activeSlot();
    if (!slotNumber || !slot?.campaign?.active) return;
    const abilityId = button.dataset.ability;
    const card = button.closest('[data-subclass-ability-card]') || this.root;
    const primary = this.root.querySelector(`[data-ability-target="${CSS.escape(abilityId)}"]`)?.value || null;
    const shield = this.root.querySelector(`[data-ability-target-shield="${CSS.escape(abilityId)}"]`)?.value || null;
    const heal = this.root.querySelector(`[data-ability-target-heal="${CSS.escape(abilityId)}"]`)?.value || null;
    const choice = key => card.querySelector(`[data-subclass-choice="${key}"]`);
    const choices = {};
    const facetDirection = choice('facetDirection'); if (facetDirection) choices.facetDirection = Number(facetDirection.value);
    const fluxDirection = choice('fluxDirection'); if (fluxDirection) choices.fluxDirection = Number(fluxDirection.value);
    const damageType = choice('damageType'); if (damageType) choices.damageType = damageType.value;
    const glyph1 = choice('glyph1'), glyph2 = choice('glyph2'); if (glyph1 || glyph2) choices.glyphs = [glyph1?.value, glyph2?.value].filter(Boolean);
    const ally1 = choice('ally1'), ally2 = choice('ally2'); if (ally1 || ally2) choices.allyIds = [...new Set([ally1?.value, ally2?.value].filter(Boolean))];
    const glyphCount = choice('consumeGlyphCount'); if (glyphCount) choices.consumeGlyphCount = Number(glyphCount.value);
    const createGlyph = choice('createGlyph'); if (createGlyph) choices.createGlyph = createGlyph.value;
    const consumeResource = choice('consumeResource'); if (consumeResource) choices.consumeResource = Boolean(consumeResource.checked);
    const result = executeSubclassAbility(slot, { abilityId, catalog: this.canon.getSubclassAbilities(), targets: { primary, shield, heal }, choices });
    if (!result.ok) return;
    return this.commitPlayerActionResult(slotNumber,result);
  }

  performKeptActive(button) {
    const slotNumber=this.activeSlotNumber(),slot=this.activeSlot();if(!slotNumber||!slot?.campaign?.active)return;
    const kiAbilityId=button.dataset.kiAbility;
    const targetId=this.root.querySelector(`[data-kept-active-target="${CSS.escape(kiAbilityId)}"]`)?.value||null;
    const result=executeKeptActiveAbility(slot,{kiAbilityId,targetId});if(!result.ok)return;
    return this.commitPlayerActionResult(slotNumber,result);
  }

  chooseKeptCombatStart(button) {
    const slotNumber=this.activeSlotNumber(),slot=this.activeSlot();if(!slotNumber||!slot?.campaign?.active)return;
    const actorId=slot.campaign.state?.combat?.currentActorId;
    const value=button.dataset.value==='true';
    const result=setKeptCombatStartChoice(slot,{actorId,kiId:button.dataset.ki,key:button.dataset.key,value});if(!result.ok)return;
    this.save.saveSlot(slotNumber,result.slot);this.render(ROUTES.CAMPAIGN_RUN);
  }

  chooseCombatDruidForm(form) {
    const slotNumber = this.activeSlotNumber();
    const slot = this.activeSlot();
    if (!slotNumber || !slot?.campaign?.active || !slot.campaign.state?.combat?.currentActorId) return;
    const result = chooseDruidStartingForm(slot, slot.campaign.state.combat.currentActorId, form);
    if (!result.ok) return;
    this.save.saveSlot(slotNumber, result.slot);
    this.render(ROUTES.CAMPAIGN_RUN);
  }

  finishCombatTurn() {
    const slotNumber = this.activeSlotNumber();
    const slot = this.activeSlot();
    if (!slotNumber || !slot?.campaign?.active) return;
    const result = endCombatTurn(slot);
    if (!result.ok) return;
    this.save.saveSlot(slotNumber, result.slot);
    this.combatActionPanel = 'abilities';
    this.deferNextAiAction = true;
    // Presentation/onboarding state is independent from the combat turn owner. Keeping
    // it intact prevents a guided combat lesson from disappearing when End Turn is used.
    this.render(ROUTES.CAMPAIGN_RUN);
  }

  completeCampaignSettlement() {
    const slotNumber = this.activeSlotNumber();
    const slot = this.activeSlot();
    if (!slotNumber || !slot?.campaign?.settlement) return;
    const mantleWas=Boolean(this.account.progressionFeatures?.mantle),chronicleWas=Boolean(this.account.progressionFeatures?.chronicle);
    const result = applyCampaignSettlement(slot, this.account, { tavernServices:this.canon.getTavernServices() });
    if (!result.ok) { this.resultsMessage=result.error; return this.render(ROUTES.CAMPAIGN_RESULTS); }
    // Account is saved first. The settlement id ledger makes a retry idempotent if slot persistence is interrupted.
    this.account = this.save.saveAccount(result.account);
    this.save.saveSlot(slotNumber, result.slot);
    this.tavern.enter(slotNumber, 'main-hall');
    const names=(result.newRecruitIds||[]).map(id=>this.canon.getTavernAdventurers().entries.find(a=>a.id===id)?.name||id);
    const races=result.newRaceUnlocks||[];
    this.tavernMessage = `Campaign settled. ${result.slot.character.name} is ready for another Level 1 campaign.${names.length?` ${names.join(', ')} joined the Tavern roster.`:''}${races.length?` New account-wide race unlock${races.length===1?'':'s'}: ${races.join(', ')}.`:''}`;
    this.router.replace(ROUTES.TAVERN);
    if(!mantleWas&&this.account.progressionFeatures?.mantle)this.showContextualLesson('mantle-unlocked');
    else if(!chronicleWas&&this.account.progressionFeatures?.chronicle)this.showContextualLesson('chronicle-unlocked');
  }

  selectCampaignLenderItem(itemId) {
    const slotNumber=this.activeSlotNumber(),slot=this.activeSlot();if(!slotNumber||!slot?.campaign?.settlement)return;
    const result=selectReturnedLenderItem(slot,itemId);if(!result.ok){this.resultsMessage=result.error;return this.render(ROUTES.CAMPAIGN_RESULTS);}this.save.saveSlot(slotNumber,result.slot);this.resultsMessage='Mara will remember that item for this Vessel.';this.render(ROUTES.CAMPAIGN_RESULTS);this.showContextualLesson('first-lender');
  }

  returnFromForest() {
    const slotNumber=this.activeSlotNumber(),slot=this.activeSlot();if(!slotNumber||!slot?.campaign?.active)return;
    if(!['region-boundary','awaiting-next-region'].includes(slot.campaign.state?.expedition?.state))return;
    const result=endCampaign(slot,this.account,'return');if(!result.ok)return;this.save.saveSlot(slotNumber,result.slot);this.router.go(ROUTES.CAMPAIGN_RESULTS);
  }

  continueBeyondForest() {
    const slotNumber=this.activeSlotNumber(),slot=this.activeSlot();if(!slotNumber||!slot?.campaign?.active)return;
    const from=slot.campaign.state?.expedition?.regionId,result=continueBeyondForest(slot);if(!result.ok)return;
    if(from==='forest'){const entered=enterBogRegion(result.slot,{regionsData:this.canon.getRegions(),bogEvents:this.canon.getBogEvents(),bogTrainers:this.canon.getBogTrainers(),unlockedSubclasses:this.account.unlocks?.subclasses||[]});if(!entered.ok)return;this.save.saveSlot(slotNumber,entered.slot);}
    else if(from==='bog-of-lost-souls'){const entered=enterTowerRegion(result.slot,{regionsData:this.canon.getRegions(),towerEvents:this.canon.getTowerEvents()});if(!entered.ok)return;this.save.saveSlot(slotNumber,entered.slot);}
    else if(from==='heavenly-tower'){const entered=enterPlainsRegion(result.slot,{regionsData:this.canon.getRegions(),plainsEvents:this.canon.getPlainsEvents()});if(!entered.ok)return;this.save.saveSlot(slotNumber,entered.slot);}
    else if(from==='ruined-vampiric-plains'){const entered=enterHellRegion(result.slot,{regionsData:this.canon.getRegions(),hellEvents:this.canon.getHellEvents()});if(!entered.ok)return;this.save.saveSlot(slotNumber,entered.slot);}
    else if(from==='caverns-to-hell'){const entered=enterDragonRegion(result.slot,{regionsData:this.canon.getRegions(),dragonEvents:this.canon.getDragonEvents()});if(!entered.ok)return;this.save.saveSlot(slotNumber,entered.slot);}
    else if(from==='that-dragons-dungeon'){const entered=enterNecropolisRegion(result.slot,{regionsData:this.canon.getRegions(),necropolisEvents:this.canon.getNecropolisEvents()});if(!entered.ok)return;this.save.saveSlot(slotNumber,entered.slot);}
    else if(from==='necropolis'){const entered=enterFinalRegion(result.slot,{regionsData:this.canon.getRegions(),baseAbilities:this.canon.getBaseAbilities(),subclassAbilities:this.canon.getSubclassAbilities(),progression:this.canon.getCharacterProgression(),equipmentCatalog:this.canon.getEquipmentConsumablesStatus()});if(!entered.ok)return;this.save.saveSlot(slotNumber,entered.slot);}
    else this.save.saveSlot(slotNumber,result.slot);
    this.render(ROUTES.CAMPAIGN_RUN);
  }

  buyHellMerchantItem(itemId) {
    const slotNumber=this.activeSlotNumber(),slot=this.activeSlot();if(!slotNumber||!slot?.campaign?.active)return;
    const result=purchaseHellMerchantItem(slot,{itemId,hellCrafting:this.canon.getHellCrafting(),equipmentCatalog:this.canon.getEquipmentConsumablesStatus()});
    this.craftingMessage=result.ok?`Purchased ${result.item?.name||'infernal bargain'}.`:result.error;
    if(result.ok)this.save.saveSlot(slotNumber,result.slot);
    this.render(ROUTES.CAMPAIGN_RUN);
  }

  leaveHellMerchantEncounter() {
    const slotNumber=this.activeSlotNumber(),slot=this.activeSlot();if(!slotNumber||!slot?.campaign?.active)return;
    const result=leaveHellMerchant(slot);if(!result.ok)return;this.save.saveSlot(slotNumber,result.slot);this.render(ROUTES.CAMPAIGN_RUN);
  }

  acceptMaraQuestOffer(questId) {
    const slotNumber=this.activeSlotNumber(),slot=this.activeSlot();if(!slotNumber||!slot)return;const result=acceptMaraQuest(slot,questId);this.tavernMessage=result.ok?'Mara marked the quest for this Vessel.':result.error;if(result.ok)this.save.saveSlot(slotNumber,result.slot);this.render(ROUTES.TAVERN);
  }

  abandonMaraQuestOffer() {
    const slotNumber=this.activeSlotNumber(),slot=this.activeSlot();if(!slotNumber||!slot)return;const result=abandonMaraQuest(slot);this.tavernMessage=result.ok?'The active Mara quest was released. The current board will not reroll until a campaign ends.':result.error;if(result.ok)this.save.saveSlot(slotNumber,result.slot);this.render(ROUTES.TAVERN);
  }

  chooseLenderBorrow(itemId) {
    const slotNumber=this.activeSlotNumber(),slot=this.activeSlot();if(!slotNumber||!slot)return;const result=selectBorrowedLenderItem(slot,itemId,this.canon.getEquipmentConsumablesStatus());this.tavernMessage=result.ok?(itemId?'Lender item selected for the next campaign.':'No lender item will be brought through the Door.'):result.error;if(result.ok)this.save.saveSlot(slotNumber,result.slot);this.render(ROUTES.TAVERN);
  }

  addRunStat(stat) {
    const slotNumber=this.activeSlotNumber(), slot=this.activeSlot(); if(!slotNumber||!slot?.campaign?.active)return;
    const result=allocatePlayerRunStat(slot,stat,1); if(!result.ok)return;
    this.save.saveSlot(slotNumber,result.slot); this.render(ROUTES.CAMPAIGN_RUN);
  }

  toggleTavernAdventurer(id) {
    const slotNumber=this.activeSlotNumber(), slot=this.activeSlot(); if(!slotNumber||!slot?.character)return;
    const recruited=this.account.unlocks?.tavernAdventurers||[]; if(!recruited.includes(id)){this.tavernMessage='That Tavern Adventurer has not joined this account yet.';return this.render(ROUTES.TAVERN);}
    const current=[...new Set(slot.party?.tavernAdventurerIds||[])]; const nextIds=current.includes(id)?current.filter(x=>x!==id):[...current,id];
    const result=setTavernAdventurerParty(slot,nextIds,{catalog:this.canon.getTavernAdventurers(),recruitedIds:recruited}); this.tavernMessage=result.ok?'Expedition party updated.':result.error;
    if(result.ok)this.save.saveSlot(slotNumber,result.slot); this.render(ROUTES.TAVERN);
  }

  stepPortraitCarousel(direction=1) {
    const slot=this.activeSlot();
    if(!slot?.character)return;
    const options=staticPortraitOptionsForSlot(slot,this.canon.getSubclassAbilities(),this.canon.getPortraitSystem());
    if(!options.length)return;
    const step=direction<0?-1:1;
    this.portraitCarouselOffset=(Number(this.portraitCarouselOffset||0)+step+options.length)%options.length;
    this.render(ROUTES.TAVERN);
  }

  changeStaticVesselPortrait(portraitId) {
    const slotNumber=this.activeSlotNumber(),slot=this.activeSlot();if(!slotNumber||!slot?.character)return;
    const result=selectStaticVesselPortrait(slot,{portraitId},this.canon.getSubclassAbilities(),this.canon.getPortraitSystem());
    this.tavernMessage=result.ok?'Static Vessel portrait updated.':result.error;
    if(result.ok)this.save.saveSlot(slotNumber,result.slot);
    this.render(ROUTES.TAVERN);
  }

  changeVesselPortrait(portraitId) {
    const slotNumber=this.activeSlotNumber(),slot=this.activeSlot();if(!slotNumber||!slot?.character)return;
    const result=selectVesselPortrait(slot,{portraitId},this.canon.getSubclassAbilities());
    this.tavernMessage=result.ok?'Vessel portrait updated.':result.error;
    if(result.ok)this.save.saveSlot(slotNumber,result.slot);
    this.render(ROUTES.TAVERN);
  }

  updateRacialConfigurationPanels(form, race) {
    if(!form)return;const selected=String(race||'');let shown=false;
    for(const panel of form.querySelectorAll('[data-racial-config-panel]')){const match=panel.dataset.racialConfigPanel===selected;panel.hidden=!match;if(match)shown=true;}
    const fixed=form.querySelector('[data-racial-fixed-message]');if(fixed)fixed.hidden=shown;
    let detailShown=false;
    for(const panel of form.querySelectorAll('[data-selected-race-details]')){const match=panel.dataset.selectedRaceDetails===selected;panel.hidden=!match;if(match)detailShown=true;}
    const detailEmpty=form.querySelector('[data-selected-race-details-empty]');if(detailEmpty)detailEmpty.hidden=detailShown;
  }

  saveVesselRacialConfiguration(form) {
    const slotNumber=this.activeSlotNumber(),slot=this.activeSlot();if(!slotNumber||!slot?.character)return;const fd=new FormData(form),data=this.canon.getRacialConfigurations();
    const cfg=readRacialConfigurationFromForm(fd,slot.character.race,data,'racial_current');const result=setVesselRacialConfiguration(slot,cfg,{racialConfigurations:data});
    this.tavernMessage=result.ok?'Racial configuration saved for future campaigns.':result.error;if(result.ok)this.save.saveSlot(slotNumber,result.slot);this.render(ROUTES.TAVERN);
  }

  saveVesselRebind(form) {
    const slotNumber=this.activeSlotNumber(),slot=this.activeSlot();if(!slotNumber||!slot?.character)return;
    const fd=new FormData(form);
    const race=String(fd.get('rebind_race')||''),racialConfigurations=this.canon.getRacialConfigurations(),racialConfiguration=readRacialConfigurationFromForm(fd,race,racialConfigurations,'rebind_racial');const result=rebindVessel(slot,{race,baseClass:fd.get('rebind_base_class'),confirmed:Boolean(fd.get('rebind_confirmed')),racialConfiguration},{unlockedRaces:this.account.unlocks?.races||[],baseClasses:this.canon.getBaseClasses(),racialConfigurations});
    this.tavernMessage=result.ok?`Vessel rebound to ${result.current.race} ${result.current.baseClass}. Existing records and account unlocks were preserved.`:result.error;
    if(result.ok){this.portraitCarouselOffset=0;this.save.saveSlot(slotNumber,result.slot);}
    this.render(ROUTES.TAVERN);
  }

  saveClasslessConfiguration(form) {
    const slotNumber = this.activeSlotNumber(), slot = this.activeSlot();
    if (!slotNumber || !slot?.character) return;
    const fd = new FormData(form), rank = Number(this.account?.chronicle?.classless?.rank || 0), limits = classlessLimits(rank);
    const baseAbilityIds = Array.from({ length: limits.base }, (_, i) => fd.get(`classless_base_${i}`)).filter(Boolean).map(String);
    const subclassAbilityIds = Array.from({ length: limits.subclass }, (_, i) => fd.get(`classless_subclass_${i}`)).filter(Boolean).map(String);
    const rawImprint = String(fd.get('classless_resource_imprint') || '');
    const resourceImprint = rawImprint.startsWith('base:') ? { baseClass: rawImprint.slice(5) } : rawImprint.startsWith('subclass:') ? { subclass: rawImprint.slice(9) } : null;
    const subNames = [...new Set((this.canon.getSubclassAbilities().abilities || []).map(a => a.subclass))];
    const result = updateClasslessConfig(slot, { baseAbilityIds, subclassAbilityIds, resourceImprint }, { rank, baseAbilities: this.canon.getBaseAbilities(), subclassAbilities: this.canon.getSubclassAbilities(), baseClasses: this.canon.getBaseClasses(), subclasses: subNames });
    this.tavernMessage = result.ok ? 'Classless selections updated for the next campaign.' : result.error;
    if (result.ok) this.save.saveSlot(slotNumber, result.slot);
    this.render(ROUTES.TAVERN);
  }

  saveStartingStatRedistribution(form) {
    const slotNumber = this.activeSlotNumber();
    const slot = this.activeSlot();
    if (!slotNumber || !slot) return;
    const result = redistributeStartingStats(slot, readStartingStatsFromForm(new FormData(form)));
    this.tavernMessage = result.ok ? 'Starting stats redistributed. The fixed starting pool did not change.' : result.error;
    if (result.ok) this.save.saveSlot(slotNumber, result.slot);
    this.render(ROUTES.TAVERN);
  }

  openResetConfirmation(stage) {
    this.root.querySelector('.modal-backdrop')?.remove();
    this.resetStage = stage;
    const title = stage === 1 ? 'Reset all data?' : 'Final confirmation';
    const text = stage === 1 ? 'This will permanently delete the TWBTD account and all nine vessel slots on this device.' : 'This cannot be undone. Delete all TWBTD_V2 save data now?';
    const action = stage === 1 ? 'reset-next' : 'reset-final';
    this.root.insertAdjacentHTML('beforeend', `<div class="modal-backdrop" role="dialog" aria-modal="true"><div class="modal"><h2>${title}</h2><p>${text}</p><div class="modal-actions"><button class="secondary" data-action="reset-cancel">Cancel</button><button class="danger" data-action="${action}">${stage === 1 ? 'Continue' : 'Delete Everything'}</button></div></div></div>`);
  }

  beginCreation(slotNumber) {
    if (slotNumber < 1 || slotNumber > 9 || this.save.loadSlot(slotNumber)) return;
    this.pendingCreationSlot = slotNumber; this.creationErrors = []; this.creationMessage=''; this.router.go(ROUTES.CREATE);
  }

  completeCreation(form) {
    const slotNumber = this.pendingCreationSlot;
    if (!slotNumber || this.save.loadSlot(slotNumber)) { this.creationErrors = ['That Vessel slot is no longer empty.']; this.render(ROUTES.CREATE); return; }
    const values = new FormData(form);
    const race=String(values.get('race')||''),racialConfigurations=this.canon.getRacialConfigurations();const validation = validateVesselDraft({ name: values.get('name'), race, baseClass: values.get('baseClass'), startingStats: readStartingStatsFromForm(values), racialConfiguration:readRacialConfigurationFromForm(values,race,racialConfigurations,'racial') }, { unlockedRaces: this.account.unlocks?.races || [], baseClasses: this.canon.getBaseClasses(), racialConfigurations });
    if (!values.get('bindingConfirmed')) validation.errors.push('Confirm this initial Vessel setup before continuing.');
    validation.ok = validation.errors.length === 0;
    if (!validation.ok) { this.creationErrors = validation.errors; this.render(ROUTES.CREATE); return; }
    const slotState = createVesselSlotState(validation.value);
    this.save.createSlot(slotNumber, slotState);
    this.account.activeSlot = slotNumber; this.account = this.save.saveAccount(this.account);
    this.tavern.enter(slotNumber, 'main-hall'); this.pendingCreationSlot = null; this.creationErrors = []; this.creationMessage=''; this.chronicleFamily = validation.value.baseClass;
    this.router.go(ROUTES.TAVERN);
  }

  confirmDeleteSlot(slotNumber) {
    const slot = this.save.loadSlot(slotNumber); if (!slot) return;
    const name = slot.character?.name || `Vessel ${slotNumber}`;
    this.root.querySelector('.modal-backdrop')?.remove();
    this.root.insertAdjacentHTML('beforeend', `<div class="modal-backdrop" role="dialog" aria-modal="true"><div class="modal"><h2>Delete ${escapeHtml(name)}?</h2><p>Deleting a vessel slot is permanent. Account-wide unlocks remain on the account.</p><div class="modal-actions"><button class="secondary" data-action="reset-cancel">Cancel</button><button class="danger" data-action="delete-slot-final" data-slot="${slotNumber}">Delete Slot</button></div></div></div>`);
  }

  deleteSlotFinal(slotNumber) {
    if (!this.save.loadSlot(slotNumber)) return;
    this.save.deleteSlot(slotNumber); this.account = this.bootstrapAccount(this.save.ensureAccount());
    if (this.tavern.slotNumber === slotNumber) this.tavern.leave();
    this.render(this.router.routeFromLocation());
  }

  selectSlot(slotNumber) {
    const slot = this.save.loadSlot(slotNumber); if (!slot?.character) return;
    this.account.activeSlot = slotNumber; this.account = this.save.saveAccount(this.account);
    this.chronicleFamily = slot.character.baseClass;
    if (slot.campaign?.settlement) { this.tavern.leave(); this.router.go(ROUTES.CAMPAIGN_RESULTS); return; }
    if (slot.campaign?.active) { this.tavern.leave(); this.router.go(ROUTES.CAMPAIGN_RUN); return; }
    this.tavern.enter(slotNumber, 'main-hall'); this.router.go(ROUTES.TAVERN);
  }
}

const root = document.querySelector('#app');
const app = new App(root);
app.start().catch(error => {
  console.error(error);
  root.innerHTML = `<main class="shell"><section class="panel"><h2>The door would not open.</h2><p class="muted">The Tavern's records could not be read. No save data was changed.</p></section></main>`;
});
