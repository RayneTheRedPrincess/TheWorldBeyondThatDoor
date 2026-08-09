import { ROUTES } from './constants.js';
import { CanonRegistry } from './canon-registry.js';
import { Router } from './router.js';
import { applyAccountBootstrap, migrateMantleUnlocksFromTrainerHistory } from './account-bootstrap.js';
import { createVesselSlotState, validateVesselDraft } from './character-creator.js';
import { rebindVessel } from './vessel-controller.js';
import { selectVesselPortrait, selectStaticVesselPortrait } from './portrait-controller.js';
import { SaveController } from './save-controller.js';
import { TavernController } from './tavern-controller.js';
import { equipKeptImpression, unequipKeptImpression, setKeptImpressionChoice } from './kept-impression-controller.js';
import { selectMantle } from './mantle-controller.js';
import { purchaseChronicleNode, respecChronicleFamily } from './chronicle-controller.js';
import { getCampaignDoorState, getCampaignPreparationSummary } from './campaign-door.js';
import { startCampaign, getCampaignRunView, applyCampaignSettlement, endCampaign, allocatePlayerRunStat, setTavernAdventurerParty } from './campaign-controller.js';
import { selectExpeditionCard, leaveCampsite, advanceAfterResolvedNoncombat, resolveCombatVictory, continueBeyondForest, continueAfterForestEventResult } from './expedition-controller.js';
import { resolveForestEventCheck, chooseTrainerFight, learnFromTrainer } from './forest-event-controller.js';
import { takePlayerTurnAction, endCombatTurn } from './combat-controller.js';
import { combatPresentationDelayMsForSpeed } from './combat-presentation.js';
import { attachForestCombat, awardCurrentForestMaterialCache } from './forest-encounter-builder.js';
import { resolveEnemyTurn } from './enemy-ai.js';
import { resolveTavernAdventurerTurn } from './ally-ai.js';
import { awardCurrentForestCombatRewards } from './forest-reward-controller.js';
import { executeBaseAbility, chooseDruidStartingForm } from './ability-controller.js';
import { executeSubclassAbility, resolveSubclassTurnStartEvents } from './subclass-controller.js';
import { executeKeptActiveAbility, setKeptCombatStartChoice } from './kept-impression-runtime.js';
import { executeEquippedConsumable, resolveTrailstockTurnStart, equipConsumableAtCampsite, unequipConsumableAtCampsite } from './consumable-controller.js';
import { executeEquipmentAbility } from './equipment-ability-controller.js';
import { equipRunEquipmentAtCampsite, unequipRunEquipmentAtCampsite } from './equipment-controller.js';
import { craftAtCampsite } from './crafting-controller.js';
import { updateClasslessConfig, classlessLimits } from './classless-controller.js';
import { ensureMaraQuestOffers, acceptMaraQuest, abandonMaraQuest, selectBorrowedLenderItem, selectReturnedLenderItem, evaluateMaraQuest } from './tavern-services-controller.js';
import { getStartingStatPool, readStartingStatsFromForm, redistributeStartingStats, CORE_STATS } from './starting-stats.js';
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
import { normalizeTutorialState, starterNeedsResolution, resolveStarterTutorial, setTutorialStatus, tutorialStatus, redeemTutorialKeptToken, markContextualSeen, contextualSeen } from './tutorial-controller.js';
import { renderTutorial, starterTutorialOverlay, guidedTutorialOverlay } from './views/tutorial.js';
import { renderHelp } from './views/help.js';
import { renderCredits } from './views/credits.js';

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
    this.craftingMessage = '';
    this.resultsMessage = '';
    this.combatActionPanel = 'abilities';
    this.combatPlaybackTimer = null;
    this.combatCompletionHoldEncounterId = null;
    this.consumedCombatPresentationId = null;
    this.presentationCombatId = null;
    this.deferNextAiAction = false;
    this.campsiteEquipmentOwnerId = 'vessel';
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
    this.lenderQuery = '';
    this.lenderSlot = 'all';
    this.lenderWeaponType = 'all';
    this.lenderSort = 'name';
    this.contextLessonId = null;
    this.tutorialReturnRoute = null;
    this.tutorialReturnTavernRoom = null;
    this.displayMode = null;
    this.started = false;
    this.startPromise = null;
    this.boundRootHandlers = {
      click: e => this.onClick(e),
      change: e => this.onChange(e),
      input: e => this.onInput(e),
      submit: e => this.onSubmit(e)
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
    next = migrateMantleUnlocksFromTrainerHistory(next, this.canon.getForestTrainers());
    next.currencies = { ...(next.currencies || {}), onyx: Number(next.currencies?.onyx || 0) };
    next.settings = { combatSpeed: 1, reducedMotion: false, combatNumbers: true, screenFlash: 'standard', ...(next.settings || {}) };
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

  mountDisplayModeSwitch(route) {
    const eligible = route === ROUTES.HOME || route === ROUTES.TAVERN || (route === ROUTES.CAMPAIGN_RUN && Boolean(this.root.querySelector('.combat-presentation')));
    if (!eligible || this.root.querySelector('.display-mode-switch')) return;
    const mobile = this.displayMode === 'mobile';
    this.root.insertAdjacentHTML('beforeend', `<aside class="display-mode-switch" aria-label="Display mode"><span>View</span><div><button type="button" data-action="display-mode" data-mode="desktop" aria-pressed="${mobile?'false':'true'}" class="${mobile?'':'active'}">Desktop</button><button type="button" data-action="display-mode" data-mode="mobile" aria-pressed="${mobile?'true':'false'}" class="${mobile?'active':''}">Mobile</button></div></aside>`);
  }

  combatPresentationDelayMs(){return combatPresentationDelayMsForSpeed(this.account?.settings?.combatSpeed||1);}

  clearCombatPlaybackTimer(){if(this.combatPlaybackTimer!==null){clearTimeout(this.combatPlaybackTimer);this.combatPlaybackTimer=null;}}

  scheduleCombatPlayback(run){
    this.clearCombatPlaybackTimer(); const combat=run?.combat;if(!combat)return;
    const current=(combat.actors||[]).find(a=>a.id===combat.currentActorId);const needsStep=combat.state==='complete'||(combat.state==='active'&&current?.control==='ai');if(!needsStep)return;
    const delay=combat.state==='complete'?650:this.combatPresentationDelayMs();
    this.combatPlaybackTimer=setTimeout(()=>{this.combatPlaybackTimer=null;if(this.router.routeFromLocation()===ROUTES.CAMPAIGN_RUN)this.render(ROUTES.CAMPAIGN_RUN);},delay);
  }

  normalizeActiveCampaignCombat() {
    const slotNumber=this.activeSlotNumber();let slot=this.activeSlot();if(!slotNumber||!slot?.campaign?.active||!slot.campaign.state)return{ok:true,slot};let changed=false;const run=()=>slot?.campaign?.state;
    if(run()?.expedition?.state==='combat-pending'&&run()?.expedition?.encounter?.combat&&!run()?.combat){const attached=attachForestCombat(slot,{forestEnemies:this.canon.getForestEnemies(),forestTrainers:this.canon.getForestTrainers(),baseAbilities:this.canon.getBaseAbilities(),subclassAbilities:this.canon.getSubclassAbilities(),progression:this.canon.getCharacterProgression(),equipmentCatalog:this.canon.getEquipmentConsumablesStatus()});if(!attached.ok)return attached;slot=attached.slot;changed=true;if(changed)this.save.saveSlot(slotNumber,slot);return{ok:true,slot,changed};}
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
        if(!run()?.expedition?.encounter?.materialsAwarded){const awarded=awardCurrentForestMaterialCache(slot);if(!awarded.ok)return awarded;slot=awarded.slot;if((awarded.materials||[]).some(item=>item.materialKind==='soulfire-core'))this.contextLessonId='first-soulfire';}
        const resolved=resolveCombatVictory(slot);if(!resolved.ok)return resolved;slot=resolved.slot;if(resolved.forestClearedNow){const account=structuredClone(this.account);account.history=account.history||{};account.history.forestCleared=true;if(!account.history.firstForestClearAt)account.history.firstForestClearAt=new Date().toISOString();this.account=this.save.saveAccount(account);}changed=true;
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
      this.root.innerHTML = renderCharacterCreation({ slotNumber: this.pendingCreationSlot, unlockedRaces: this.account.unlocks?.races || [], classDetails: this.canon.getBaseClassDetails(), errors: this.creationErrors });
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
        baseAbilities: this.canon.getBaseAbilities(), subclassAbilities: this.canon.getSubclassAbilities(), portraitSystem:this.canon.getPortraitSystem(), unlockedRaces:this.account.unlocks?.races||[], baseClasses:this.canon.getBaseClasses(), message: this.tavernMessage,
        ux: { libraryQuery:this.libraryQuery, librarySlotCost:this.librarySlotCost, libraryType:this.libraryType, libraryFamily:this.libraryFamily, libraryTags:this.libraryTags, librarySort:this.librarySort, lenderQuery:this.lenderQuery, lenderSlot:this.lenderSlot, lenderWeaponType:this.lenderWeaponType, lenderSort:this.lenderSort }
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
      this.root.innerHTML = renderCampaignPreparation({ summary: getCampaignPreparationSummary(slot, this.canon.getKeptImpressions()), keptEntries: this.canon.getKeptImpressions() });
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
      this.root.innerHTML = renderCampaignRun({ run, baseAbilities: this.canon.getBaseAbilities(), subclassAbilities: this.canon.getSubclassAbilities(), progression: this.canon.getCharacterProgression(), equipmentCatalog: this.canon.getEquipmentConsumablesStatus(), forestCrafting: this.canon.getForestCrafting(), forestTrainers: this.canon.getForestTrainers(), maraQuestStatus:activeQuest?{...activeQuest,...questEval,status:questEval?.complete?'Completed — Pending Return':'In Progress'}:null, craftingUi: { onlyCraftable:this.craftingOnlyCraftable, sortStat:this.craftingSortStat, direction:this.craftingSortDirection, query:this.craftingQuery, slot:this.craftingSlot, itemType:this.craftingType, subtype:this.craftingSubtype, weaponType:this.craftingWeaponType, armorWeight:this.craftingArmorWeight, message:this.craftingMessage }, presentationUi: { actionPanel:this.combatActionPanel, settings:this.account.settings || {}, equipmentOwnerId:this.campsiteEquipmentOwnerId, consumedPresentationId:this.consumedCombatPresentationId } });
      this.mountDisplayModeSwitch(ROUTES.CAMPAIGN_RUN);
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
    if (route === ROUTES.SETTINGS) { this.root.innerHTML = renderSettings({ combatSpeed: this.account.settings?.combatSpeed ?? 1, reducedMotion:Boolean(this.account.settings?.reducedMotion), combatNumbers:this.account.settings?.combatNumbers !== false, screenFlash:this.account.settings?.screenFlash || 'standard' }); return; }
    this.root.innerHTML = renderHome({ hasContinuableSlot: this.slots().some(s => s?.character) });
    this.mountDisplayModeSwitch(ROUTES.HOME);
  }

  onClick(event) {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
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
    if (action === 'tutorial-token-redeem') return this.redeemStarterToken(button.dataset.ki);
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
    if (action === 'combat-panel') { this.combatActionPanel = button.dataset.panel === 'consumable' ? 'consumable' : 'abilities'; return this.render(ROUTES.CAMPAIGN_RUN); }
    if (action === 'combat-select-actor') return this.selectBattlefieldActor(button);
    if (action === 'combat-charge') return this.performCombatAction('charge');
    if (action === 'combat-guard') return this.performCombatAction('guard');
    if (action === 'combat-use-consumable') return this.performConsumable(button);
    if (action === 'combat-use-equipment-ability') return this.performEquipmentAbility(button);
    if (action === 'campsite-equipment-owner') { this.campsiteEquipmentOwnerId=button.dataset.owner||'vessel'; return this.render(ROUTES.CAMPAIGN_RUN); }
    if (action === 'campsite-equip-consumable') return this.equipCampConsumable(button);
    if (action === 'campsite-unequip-consumable') return this.unequipCampConsumable(button);
    if (action === 'campsite-equip-equipment') return this.equipCampEquipment(button);
    if (action === 'campsite-unequip-equipment') return this.unequipCampEquipment(button);
    if (action === 'campsite-craft') return this.craftCampRecipe(button);
    if (action === 'craft-sort-direction') { this.craftingSortDirection = this.craftingSortDirection === 'asc' ? 'desc' : 'asc'; return this.render(ROUTES.CAMPAIGN_RUN); }
    if (action === 'combat-use-ability') return this.performBaseAbility(button);
    if (action === 'combat-use-subclass-ability') return this.performSubclassAbility(button);
    if (action === 'combat-use-kept-active') return this.performKeptActive(button);
    if (action === 'combat-kept-start-choice') return this.chooseKeptCombatStart(button);
    if (action === 'combat-druid-form') return this.chooseCombatDruidForm(button.dataset.form);
    if (action === 'combat-end-turn') return this.finishCombatTurn();
    if (action === 'run-stat-add') return this.addRunStat(button.dataset.stat);
    if (action === 'adventurer-toggle') return this.toggleTavernAdventurer(button.dataset.adventurer);
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
    if (action === 'cancel-create') { this.pendingCreationSlot = null; this.creationErrors = []; return this.router.go(ROUTES.NEW_GAME); }
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
    const statForm = event.target.closest('#starting-stat-form');
    if (statForm) { event.preventDefault(); this.saveStartingStatRedistribution(statForm); return; }
    const classlessForm = event.target.closest('#classless-config-form');
    if (classlessForm) { event.preventDefault(); this.saveClasslessConfiguration(classlessForm); }
  }

  onInput(event) {
    if (event.target.matches('[data-stat-input]')) this.refreshStatAllocator(event.target.closest('form'));
    if (event.target.matches('[data-help-search]')) { this.helpQuery=event.target.value||''; this.render(ROUTES.HELP); const input=this.root.querySelector('[data-help-search]'); if(input){input.focus();input.setSelectionRange(input.value.length,input.value.length);} }
    if (event.target.matches('[data-library-search]')) { this.libraryQuery=event.target.value||''; this.render(ROUTES.TAVERN); const input=this.root.querySelector('[data-library-search]'); if(input){input.focus();input.setSelectionRange(input.value.length,input.value.length);} }
    if (event.target.matches('[data-lender-search]')) { this.lenderQuery=event.target.value||''; this.render(ROUTES.TAVERN); const input=this.root.querySelector('[data-lender-search]'); if(input){input.focus();input.setSelectionRange(input.value.length,input.value.length);} }
    if (event.target.matches('[data-crafting-search]')) { this.craftingQuery=event.target.value||''; this.render(ROUTES.CAMPAIGN_RUN); const input=this.root.querySelector('[data-crafting-search]'); if(input){input.focus();input.setSelectionRange(input.value.length,input.value.length);} }
  }

  onChange(event) {
    if (event.target.matches('[data-library-slot]')) { this.librarySlotCost=event.target.value||'all'; this.render(ROUTES.TAVERN); return; }
    if (event.target.matches('[data-library-type]')) { this.libraryType=event.target.value||'all'; this.render(ROUTES.TAVERN); return; }
    if (event.target.matches('[data-library-family]')) { this.libraryFamily=event.target.value||'all'; this.render(ROUTES.TAVERN); return; }
    if (event.target.matches('[data-library-sort]')) { this.librarySort=event.target.value||'id'; this.render(ROUTES.TAVERN); return; }
    if (event.target.matches('[data-library-tag]')) { const value=event.target.value;const set=new Set(this.libraryTags||[]);event.target.checked?set.add(value):set.delete(value);this.libraryTags=[...set];this.render(ROUTES.TAVERN);return; }
    if (event.target.matches('[data-lender-slot]')) { this.lenderSlot=event.target.value||'all'; this.render(ROUTES.TAVERN); return; }
    if (event.target.matches('[data-lender-weapon-type]')) { this.lenderWeaponType=event.target.value||'all'; this.render(ROUTES.TAVERN); return; }
    if (event.target.matches('[data-lender-sort]')) { this.lenderSort=event.target.value||'name'; this.render(ROUTES.TAVERN); return; }
    if (event.target.matches('[data-primary-combat-target]')) { this.syncCombatTargetHighlight(event.target); return; }
    if (event.target.matches('[data-ability-target-shield], [data-ability-target-heal]')) return;
    if (event.target.matches('[data-crafting-only]')) { this.craftingOnlyCraftable = Boolean(event.target.checked); this.render(ROUTES.CAMPAIGN_RUN); return; }
    if (event.target.matches('[data-crafting-sort]')) { this.craftingSortStat = event.target.value || ''; this.render(ROUTES.CAMPAIGN_RUN); return; }
    if (event.target.matches('[data-crafting-slot]')) { this.craftingSlot=event.target.value||'all'; this.render(ROUTES.CAMPAIGN_RUN); return; }
    if (event.target.matches('[data-crafting-type]')) { this.craftingType=event.target.value||'all'; this.render(ROUTES.CAMPAIGN_RUN); return; }
    if (event.target.matches('[data-crafting-subtype]')) { this.craftingSubtype=event.target.value||'all'; this.render(ROUTES.CAMPAIGN_RUN); return; }
    if (event.target.matches('[data-crafting-weapon-type]')) { this.craftingWeaponType=event.target.value||'all'; this.render(ROUTES.CAMPAIGN_RUN); return; }
    if (event.target.matches('[data-crafting-armor-weight]')) { this.craftingArmorWeight=event.target.value||'all'; this.render(ROUTES.CAMPAIGN_RUN); return; }
    if (event.target.matches('[data-starting-race]')) { this.refreshStatAllocator(event.target.closest('form')); return; }
    const keptChoice = event.target.closest('[data-kept-choice]');
    if (keptChoice) { this.changeKeptChoice(keptChoice); return; }
    const select = event.target.closest('[data-setting]');
    if (!select) return;
    if (select.dataset.setting === 'combatSpeed') {
      const value = Number(select.value);
      if (value >= 0.1 && value <= 2) this.account.settings = { ...(this.account.settings || {}), combatSpeed: value };
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
    let total = 0;
    for (const input of form.querySelectorAll('[data-stat-input]')) {
      const value = Math.max(0, Math.trunc(Number(input.value || 0)));
      if (String(value) !== input.value) input.value = String(value);
      total += value;
    }
    const label = form.querySelector('[data-stat-remaining]');
    if (!label) return;
    if (form.id === 'vessel-form' && !form.querySelector('[name="race"]')?.value) label.textContent = 'Choose a race';
    else label.textContent = String(Math.max(0, pool - total));
  }

  stepStat(button) {
    const form = button.closest('form');
    const stat = button.dataset.stat;
    const input = form?.querySelector(`[data-stat-input="${stat}"]`);
    if (!form || !input || !CORE_STATS.includes(stat)) return;
    const step = Number(button.dataset.statStep || 0);
    const current = Math.max(0, Math.trunc(Number(input.value || 0)));
    const pool = this.statPoolForForm(form);
    const total = [...form.querySelectorAll('[data-stat-input]')].reduce((sum, item) => sum + Math.max(0, Math.trunc(Number(item.value || 0))), 0);
    if (step > 0 && total >= pool) return;
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
    const result = startCampaign(slot, { account: this.account, chronicleTrees: this.canon.getChronicleTrees(), regionsData: this.canon.getRegions(), forestEvents: this.canon.getForestEvents(), forestTrainers: this.canon.getForestTrainers(), tavernAdventurers: this.canon.getTavernAdventurers(), progression: this.canon.getCharacterProgression(), equipmentConsumablesStatus: this.canon.getEquipmentConsumablesStatus(), forestCrafting: this.canon.getForestCrafting() });
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
    const result=resolveForestEventCheck(slot,{participantId,equipmentCatalog:this.canon.getEquipmentConsumablesStatus(),forestCrafting:this.canon.getForestCrafting(),progression:this.canon.getCharacterProgression()});
    if(!result.ok)return; this.save.saveSlot(slotNumber,result.slot); this.render(ROUTES.CAMPAIGN_RUN);
  }

  fightForestTrainer(trainerId) {
    const slotNumber=this.activeSlotNumber(),slot=this.activeSlot(); if(!slotNumber||!slot?.campaign?.active)return;
    const result=chooseTrainerFight(slot,{trainerId}); if(!result.ok)return; this.save.saveSlot(slotNumber,result.slot); this.render(ROUTES.CAMPAIGN_RUN);
  }

  learnForestTrainer(trainerId) {
    const slotNumber=this.activeSlotNumber(),slot=this.activeSlot(); if(!slotNumber||!slot?.campaign?.active)return;
    const result=learnFromTrainer(slot,this.account,{trainerId,forestTrainers:this.canon.getForestTrainers()}); if(!result.ok)return;
    this.account=this.save.saveAccount(result.account); this.save.saveSlot(slotNumber,result.slot); this.render(ROUTES.CAMPAIGN_RUN); this.showContextualLesson('first-subclass');
  }

  finishExpeditionCampsite() {
    const slotNumber = this.activeSlotNumber();
    const slot = this.activeSlot();
    if (!slotNumber || !slot?.campaign?.active) return;
    const result = leaveCampsite(slot, { regionsData: this.canon.getRegions(), forestEvents: this.canon.getForestEvents(), forestTrainers: this.canon.getForestTrainers() });
    if (!result.ok) return;
    this.save.saveSlot(slotNumber, result.slot);
    this.render(ROUTES.CAMPAIGN_RUN);
  }

  continueExpeditionStep() {
    const slotNumber = this.activeSlotNumber();
    const slot = this.activeSlot();
    if (!slotNumber || !slot?.campaign?.active) return;
    const result = advanceAfterResolvedNoncombat(slot, { regionsData: this.canon.getRegions(), forestEvents: this.canon.getForestEvents(), forestTrainers: this.canon.getForestTrainers() });
    if (!result.ok) return;
    this.save.saveSlot(slotNumber, result.slot);
    this.render(ROUTES.CAMPAIGN_RUN);
  }

  continueForestEventCombat(){const slotNumber=this.activeSlotNumber(),slot=this.activeSlot();if(!slotNumber||!slot?.campaign?.active)return;const result=continueAfterForestEventResult(slot);if(!result.ok)return;this.save.saveSlot(slotNumber,result.slot);this.render(ROUTES.CAMPAIGN_RUN);}

  performCombatAction(type) {
    const slotNumber = this.activeSlotNumber();
    const slot = this.activeSlot();
    if (!slotNumber || !slot?.campaign?.active) return;
    const result = takePlayerTurnAction(slot, { type });
    if (!result.ok) return;
    this.save.saveSlot(slotNumber, result.slot);
    this.render(ROUTES.CAMPAIGN_RUN);
  }

  performEquipmentAbility(button) {
    const slotNumber=this.activeSlotNumber(),slot=this.activeSlot();if(!slotNumber||!slot?.campaign?.active)return;
    const abilityId=button.dataset.equipmentAbility||null;const targetId=abilityId?this.root.querySelector(`[data-equipment-ability-target="${CSS.escape(abilityId)}"]`)?.value||null:null;
    const result=executeEquipmentAbility(slot,{abilityId,targetId});if(!result.ok)return;
    this.save.saveSlot(slotNumber,result.slot);this.render(ROUTES.CAMPAIGN_RUN);
  }

  performConsumable(button) {
    const slotNumber=this.activeSlotNumber(),slot=this.activeSlot();if(!slotNumber||!slot?.campaign?.active)return;
    const itemId=button.dataset.consumable||null;const targetId=itemId?this.root.querySelector(`[data-consumable-target="${CSS.escape(itemId)}"]`)?.value||null:null;
    const result=executeEquippedConsumable(slot,{itemId,targetId,catalog:this.canon.getEquipmentConsumablesStatus()});if(!result.ok)return;
    this.save.saveSlot(slotNumber,result.slot);this.render(ROUTES.CAMPAIGN_RUN);
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

  craftCampRecipe(button) {
    const slotNumber=this.activeSlotNumber(),slot=this.activeSlot();if(!slotNumber||!slot?.campaign?.active)return;
    const result=craftAtCampsite(slot,{recipeId:button.dataset.recipe,crafting:this.canon.getForestCrafting(),catalog:this.canon.getEquipmentConsumablesStatus()});
    if(!result.ok){this.craftingMessage=result.error||'That recipe cannot be crafted.';this.render(ROUTES.CAMPAIGN_RUN);return;}
    this.craftingMessage=`Crafted ${result.recipe.name}.`;this.save.saveSlot(slotNumber,result.slot);this.render(ROUTES.CAMPAIGN_RUN);
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
    this.save.saveSlot(slotNumber, result.slot);
    this.render(ROUTES.CAMPAIGN_RUN);
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
    this.save.saveSlot(slotNumber, result.slot);
    this.render(ROUTES.CAMPAIGN_RUN);
  }

  performKeptActive(button) {
    const slotNumber=this.activeSlotNumber(),slot=this.activeSlot();if(!slotNumber||!slot?.campaign?.active)return;
    const kiAbilityId=button.dataset.kiAbility;
    const targetId=this.root.querySelector(`[data-kept-active-target="${CSS.escape(kiAbilityId)}"]`)?.value||null;
    const result=executeKeptActiveAbility(slot,{kiAbilityId,targetId});if(!result.ok)return;
    this.save.saveSlot(slotNumber,result.slot);this.render(ROUTES.CAMPAIGN_RUN);
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
    this.tavernMessage = `Campaign settled. ${result.slot.character.name} is ready for another Level 1 campaign.${names.length?` ${names.join(', ')} joined the Tavern roster.`:''}`;
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
    if(slot.campaign.state?.expedition?.state!=='region-boundary')return;
    const result=endCampaign(slot,this.account,'return');if(!result.ok)return;this.save.saveSlot(slotNumber,result.slot);this.router.go(ROUTES.CAMPAIGN_RESULTS);
  }

  continueBeyondForest() {
    const slotNumber=this.activeSlotNumber(),slot=this.activeSlot();if(!slotNumber||!slot?.campaign?.active)return;
    const result=continueBeyondForest(slot);if(!result.ok)return;this.save.saveSlot(slotNumber,result.slot);this.render(ROUTES.CAMPAIGN_RUN);
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

  saveVesselRebind(form) {
    const slotNumber=this.activeSlotNumber(),slot=this.activeSlot();if(!slotNumber||!slot?.character)return;
    const fd=new FormData(form);
    const result=rebindVessel(slot,{race:fd.get('rebind_race'),baseClass:fd.get('rebind_base_class'),confirmed:Boolean(fd.get('rebind_confirmed'))},{unlockedRaces:this.account.unlocks?.races||[],baseClasses:this.canon.getBaseClasses()});
    this.tavernMessage=result.ok?`Vessel rebound to ${result.current.race} ${result.current.baseClass}. Existing records and account unlocks were preserved.`:result.error;
    if(result.ok)this.save.saveSlot(slotNumber,result.slot);
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
    this.pendingCreationSlot = slotNumber; this.creationErrors = []; this.router.go(ROUTES.CREATE);
  }

  completeCreation(form) {
    const slotNumber = this.pendingCreationSlot;
    if (!slotNumber || this.save.loadSlot(slotNumber)) { this.creationErrors = ['That Vessel slot is no longer empty.']; this.render(ROUTES.CREATE); return; }
    const values = new FormData(form);
    const validation = validateVesselDraft({ name: values.get('name'), race: values.get('race'), baseClass: values.get('baseClass'), startingStats: readStartingStatsFromForm(values) }, { unlockedRaces: this.account.unlocks?.races || [], baseClasses: this.canon.getBaseClasses() });
    if (!values.get('bindingConfirmed')) validation.errors.push('Confirm this initial Vessel setup before continuing.');
    validation.ok = validation.errors.length === 0;
    if (!validation.ok) { this.creationErrors = validation.errors; this.render(ROUTES.CREATE); return; }
    const slotState = createVesselSlotState(validation.value);
    this.save.createSlot(slotNumber, slotState);
    this.account.activeSlot = slotNumber; this.account = this.save.saveAccount(this.account);
    this.tavern.enter(slotNumber, 'main-hall'); this.pendingCreationSlot = null; this.creationErrors = []; this.chronicleFamily = validation.value.baseClass;
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
