function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function assert(condition, message) {
  if (!condition) throw new Error(`Canon validation failed: ${message}`);
}

export class CanonRegistry {
  constructor({ authority, keptImpressions, keptImpressionRuntime, accountBootstrap, chronicleTrees, regions, combatRules, racialConfigurations = null, baseAbilities, subclassAbilities, baseResources, forestEnemies, forestEvents, forestTrainers, bogEnemies = null, bogEvents = null, bogTrainers = null, bogCrafting = null, towerEnemies = null, towerEvents = null, towerCrafting = null, plainsEnemies = null, plainsEvents = null, plainsCrafting = null, hellEnemies = null, hellEvents = null, hellCrafting = null, dragonEnemies = null, dragonEvents = null, dragonCrafting = null, necropolisEnemies = null, necropolisEvents = null, necropolisCrafting = null, finalRegionEnemies = null, characterProgression, tavernAdventurers, equipmentConsumablesStatus, forestCrafting, tavernServices, tutorialsHelp, portraitSystem = null, contentPortraits = null }) {
    this.authority = deepFreeze(authority);
    this.keptImpressions = deepFreeze(keptImpressions);
    this.keptImpressionRuntime = deepFreeze(keptImpressionRuntime);
    this.accountBootstrap = deepFreeze(accountBootstrap);
    this.chronicleTrees = deepFreeze(chronicleTrees);
    this.regions = deepFreeze(regions);
    this.combatRules = deepFreeze(combatRules);
    this.racialConfigurations = deepFreeze(racialConfigurations);
    this.baseAbilities = deepFreeze(baseAbilities);
    this.subclassAbilities = deepFreeze(subclassAbilities);
    this.baseResources = deepFreeze(baseResources);
    this.forestEnemies = deepFreeze(forestEnemies);
    this.forestEvents = deepFreeze(forestEvents);
    this.forestTrainers = deepFreeze(forestTrainers);
    this.bogEnemies = deepFreeze(bogEnemies);
    this.bogEvents = deepFreeze(bogEvents);
    this.bogTrainers = deepFreeze(bogTrainers);
    this.bogCrafting = deepFreeze(bogCrafting);
    this.towerEnemies = deepFreeze(towerEnemies);
    this.towerEvents = deepFreeze(towerEvents);
    this.towerCrafting = deepFreeze(towerCrafting);
    this.plainsEnemies = deepFreeze(plainsEnemies);
    this.plainsEvents = deepFreeze(plainsEvents);
    this.plainsCrafting = deepFreeze(plainsCrafting);
    this.hellEnemies = deepFreeze(hellEnemies);
    this.hellEvents = deepFreeze(hellEvents);
    this.hellCrafting = deepFreeze(hellCrafting);
    this.dragonEnemies = deepFreeze(dragonEnemies);
    this.dragonEvents = deepFreeze(dragonEvents);
    this.dragonCrafting = deepFreeze(dragonCrafting);
    this.necropolisEnemies = deepFreeze(necropolisEnemies);
    this.necropolisEvents = deepFreeze(necropolisEvents);
    this.necropolisCrafting = deepFreeze(necropolisCrafting);
    this.finalRegionEnemies = deepFreeze(finalRegionEnemies);
    this.characterProgression = deepFreeze(characterProgression);
    this.tavernAdventurers = deepFreeze(tavernAdventurers);
    this.equipmentConsumablesStatus = deepFreeze(equipmentConsumablesStatus);
    this.forestCrafting = deepFreeze(forestCrafting);
    this.tavernServices = deepFreeze(tavernServices);
    this.tutorialsHelp = deepFreeze(tutorialsHelp);
    this.portraitSystem = deepFreeze(portraitSystem);
    this.contentPortraits = deepFreeze(contentPortraits);
    this.baseAbilityIndex = new Map((baseAbilities?.abilities || []).map(entry => [entry.id, entry]));
    this.subclassAbilityIndex = new Map((subclassAbilities?.abilities || []).map(entry => [entry.id, entry]));
    this.keptIndex = new Map((keptImpressions.entries || []).map(entry => [entry.id, entry]));
    this.validate();
  }

  static async load() {
    const [authorityResponse, keptResponse, keptRuntimeResponse, bootstrapResponse, chronicleResponse, regionsResponse, combatRulesResponse, racialConfigurationsResponse, baseAbilitiesResponse, subclassAbilitiesResponse, baseResourcesResponse, forestEnemiesResponse, forestEventsResponse, forestTrainersResponse, characterProgressionResponse, tavernAdventurersResponse, equipmentResponse, forestCraftingResponse, tavernServicesResponse, tutorialsHelpResponse, bogEnemiesResponse, bogEventsResponse, bogTrainersResponse, bogCraftingResponse, towerEnemiesResponse, towerEventsResponse, towerCraftingResponse, plainsEnemiesResponse, plainsEventsResponse, plainsCraftingResponse, hellEnemiesResponse, hellEventsResponse, hellCraftingResponse, dragonEnemiesResponse, dragonEventsResponse, dragonCraftingResponse, necropolisEnemiesResponse, necropolisEventsResponse, necropolisCraftingResponse, finalRegionEnemiesResponse, portraitSystemResponse, contentPortraitsResponse] = await Promise.all([
      fetch('./data/canon-authority.json', { cache: 'no-cache' }),
      fetch('./data/kept-impressions.json', { cache: 'no-cache' }),
      fetch('./data/kept-impression-runtime.json', { cache: 'no-cache' }),
      fetch('./data/account-bootstrap.json', { cache: 'no-cache' }),
      fetch('./data/chronicle-trees.json', { cache: 'no-cache' }),
      fetch('./data/regions.json', { cache: 'no-cache' }),
      fetch('./data/combat-rules.json', { cache: 'no-cache' }),
      fetch('./data/racial-configurations.json', { cache: 'no-cache' }),
      fetch('./data/base-abilities.json', { cache: 'no-cache' }),
      fetch('./data/subclass-abilities.json', { cache: 'no-cache' }),
      fetch('./data/base-class-resources.json', { cache: 'no-cache' }),
      fetch('./data/forest-enemies.json', { cache: 'no-cache' }),
      fetch('./data/forest-events.json', { cache: 'no-cache' }),
      fetch('./data/forest-trainers.json', { cache: 'no-cache' }),
      fetch('./data/character-progression.json', { cache: 'no-cache' }),
      fetch('./data/tavern-adventurers.json', { cache: 'no-cache' }),
      fetch('./data/equipment-consumables-status.json', { cache: 'no-cache' }),
      fetch('./data/forest-crafting.json', { cache: 'no-cache' }),
      fetch('./data/tavern-services.json', { cache: 'no-cache' }),
      fetch('./data/tutorials-help.json', { cache: 'no-cache' }),
      fetch('./data/bog-enemies.json', { cache: 'no-cache' }),
      fetch('./data/bog-events.json', { cache: 'no-cache' }),
      fetch('./data/bog-trainers.json', { cache: 'no-cache' }),
      fetch('./data/bog-crafting.json', { cache: 'no-cache' }),
      fetch('./data/tower-enemies.json', { cache: 'no-cache' }),
      fetch('./data/tower-events.json', { cache: 'no-cache' }),
      fetch('./data/tower-crafting.json', { cache: 'no-cache' }),
      fetch('./data/plains-enemies.json', { cache: 'no-cache' }),
      fetch('./data/plains-events.json', { cache: 'no-cache' }),
      fetch('./data/plains-crafting.json', { cache: 'no-cache' }),
      fetch('./data/hell-enemies.json', { cache: 'no-cache' }),
      fetch('./data/hell-events.json', { cache: 'no-cache' }),
      fetch('./data/hell-crafting.json', { cache: 'no-cache' }),
      fetch('./data/dragon-enemies.json', { cache: 'no-cache' }),
      fetch('./data/dragon-events.json', { cache: 'no-cache' }),
      fetch('./data/dragon-crafting.json', { cache: 'no-cache' }),
      fetch('./data/necropolis-enemies.json', { cache: 'no-cache' }),
      fetch('./data/necropolis-events.json', { cache: 'no-cache' }),
      fetch('./data/necropolis-crafting.json', { cache: 'no-cache' }),
      fetch('./data/final-region-enemies.json', { cache: 'no-cache' }),
      fetch('./data/portrait-system.json', { cache: 'no-cache' }),
      fetch('./data/content-portraits.json', { cache: 'no-cache' })
    ]);
    if (!authorityResponse.ok || !keptResponse.ok || !keptRuntimeResponse.ok || !bootstrapResponse.ok || !chronicleResponse.ok || !regionsResponse.ok || !combatRulesResponse.ok || !racialConfigurationsResponse.ok || !baseAbilitiesResponse.ok || !subclassAbilitiesResponse.ok || !baseResourcesResponse.ok || !forestEnemiesResponse.ok || !forestEventsResponse.ok || !forestTrainersResponse.ok || !characterProgressionResponse.ok || !tavernAdventurersResponse.ok || !equipmentResponse.ok || !forestCraftingResponse.ok || !tavernServicesResponse.ok || !tutorialsHelpResponse.ok || !bogEnemiesResponse.ok || !bogEventsResponse.ok || !bogTrainersResponse.ok || !bogCraftingResponse.ok || !towerEnemiesResponse.ok || !towerEventsResponse.ok || !towerCraftingResponse.ok || !plainsEnemiesResponse.ok || !plainsEventsResponse.ok || !plainsCraftingResponse.ok || !hellEnemiesResponse.ok || !hellEventsResponse.ok || !hellCraftingResponse.ok || !dragonEnemiesResponse.ok || !dragonEventsResponse.ok || !dragonCraftingResponse.ok || !necropolisEnemiesResponse.ok || !necropolisEventsResponse.ok || !necropolisCraftingResponse.ok || !finalRegionEnemiesResponse.ok || !portraitSystemResponse.ok || !contentPortraitsResponse.ok) {
      throw new Error('Canonical data files could not be loaded.');
    }
    return new CanonRegistry({
      authority: await authorityResponse.json(),
      keptImpressions: await keptResponse.json(),
      keptImpressionRuntime: await keptRuntimeResponse.json(),
      accountBootstrap: await bootstrapResponse.json(),
      chronicleTrees: await chronicleResponse.json(),
      regions: await regionsResponse.json(),
      combatRules: await combatRulesResponse.json(),
      racialConfigurations: await racialConfigurationsResponse.json(),
      baseAbilities: await baseAbilitiesResponse.json(),
      subclassAbilities: await subclassAbilitiesResponse.json(),
      baseResources: await baseResourcesResponse.json(),
      forestEnemies: await forestEnemiesResponse.json(),
      forestEvents: await forestEventsResponse.json(),
      forestTrainers: await forestTrainersResponse.json(),
      characterProgression: await characterProgressionResponse.json(),
      tavernAdventurers: await tavernAdventurersResponse.json(),
      equipmentConsumablesStatus: await equipmentResponse.json(),
      forestCrafting: await forestCraftingResponse.json(),
      tavernServices: await tavernServicesResponse.json(),
      tutorialsHelp: await tutorialsHelpResponse.json(),
      bogEnemies: await bogEnemiesResponse.json(),
      bogEvents: await bogEventsResponse.json(),
      bogTrainers: await bogTrainersResponse.json(),
      bogCrafting: await bogCraftingResponse.json(),
      towerEnemies: await towerEnemiesResponse.json(),
      towerEvents: await towerEventsResponse.json(),
      towerCrafting: await towerCraftingResponse.json(),
      plainsEnemies: await plainsEnemiesResponse.json(),
      plainsEvents: await plainsEventsResponse.json(),
      plainsCrafting: await plainsCraftingResponse.json(),
      hellEnemies: await hellEnemiesResponse.json(),
      hellEvents: await hellEventsResponse.json(),
      hellCrafting: await hellCraftingResponse.json(),
      dragonEnemies: await dragonEnemiesResponse.json(),
      dragonEvents: await dragonEventsResponse.json(),
      dragonCrafting: await dragonCraftingResponse.json(),
      necropolisEnemies: await necropolisEnemiesResponse.json(),
      necropolisEvents: await necropolisEventsResponse.json(),
      necropolisCrafting: await necropolisCraftingResponse.json(),
      finalRegionEnemies: await finalRegionEnemiesResponse.json(),
      portraitSystem: await portraitSystemResponse.json(),
      contentPortraits: await contentPortraitsResponse.json()
    });
  }

  validate() {
    const rc=this.racialConfigurations;
    // Production CanonRegistry.load() always supplies the racial-configuration authority.
    // Historical/unit fixtures may construct a partial registry directly, so preserve
    // backward-compatible fixture validation when this optional authority is omitted.
    if(rc){
      assert(rc?.rules?.configurationLocation==='Tavern only'&&rc?.rules?.lockedDuringActiveCampaign===true,'racial configuration must be Tavern-only and campaign-locked');
      assert(Object.keys(rc?.races||{}).sort().join(',')==='Demon,Faervani,Kyravari,Rhazekai,Rifthari,Veyssryn','exactly six races must expose configurable racial choices');
      assert((rc?.races?.Rhazekai?.options||[]).length===6,'Rhazekai must expose six Draconic Organs');
      assert((rc?.races?.Veyssryn?.coreOptions||[]).length===10,'Veyssryn must expose ten SoulFire Core types');
      assert((rc?.races?.Faervani?.options||[]).length===5,'Faervani must expose five Instincts');
      assert((rc?.races?.Kyravari?.options||[]).length===6&&(rc?.races?.Rifthari?.options||[]).length===6,'Kyravari and Rifthari must each expose six choices');
      assert((rc?.races?.Demon?.groups||[]).map(g=>g.options?.length).join(',')==='3,7','Demon must expose three Origins and seven Vices');
    }
    const families = this.authority.class_families;
    assert(Array.isArray(families) && families.length === 11, 'expected 11 base class families');
    const classEntities = families.flatMap(f => f.entities || []);
    assert(classEntities.length === 44, 'expected 44 class entities');
    const abilityCount = classEntities.reduce((sum, e) => sum + (e.abilities?.length || 0), 0);
    assert(abilityCount === 187, 'expected 187 class/subclass abilities');
    assert(this.authority.races?.count === 16, 'expected 16 races');

    const entries = this.keptImpressions.entries;
    assert(Array.isArray(entries) && entries.length === 267, 'expected 267 Kept Impressions');
    const ids = new Set(entries.map(e => e.id));
    assert(ids.size === 267, 'Kept Impression IDs must be unique');
    assert(ids.has('KI-001') && ids.has('KI-182') && ids.has('KI-267'), 'Kept Impression range must include KI-001, KI-182 and KI-267');
    assert(entries.find(e => e.id === 'KI-182')?.slots === 6, 'Classless must cost 6 Kept Impression slots');
    assert(this.keptImpressionRuntime?.entries?.length===267,'runtime registry must own all 267 Kept Impressions');
    assert(new Set(this.keptImpressionRuntime.entries.map(e=>e.id)).size===267,'runtime registry ids must be unique');
    const fullKeptShop=this.tavernServices?.keptImpressionShop?.catalogOffers||[];
    assert(fullKeptShop.length===267,'The Library must expose one priced regional requirement for every Kept Impression');
    assert(new Set(fullKeptShop.map(o=>o.keptId)).size===267,'Full Kept Impression shop ids must be unique');
    assert(fullKeptShop.every(o=>Number(o.onyxCost)>0&&Number(o.strengthScore)>0&&o.requirement?.type&&o.region),'Every Kept Impression offer must have strength price + reachable regional requirement metadata');
    const classlessOffer=fullKeptShop.find(o=>o.keptId==='KI-182');
    assert(classlessOffer?.requirement?.type==='final-region-cleared','Classless must require a full campaign / Broken Mirror clear');
    const dragonblooded=entries.find(e=>e.id==='KI-267');
    assert(dragonblooded?.name==='Dragonblooded'&&dragonblooded?.slots===2,'KI-267 must be Dragonblooded at 2 slots');


    const raceNames = new Set(this.authority.races.names);
    assert(Array.isArray(this.accountBootstrap.startingUnlockedRaces), 'starting unlocked races must be an array');
    for (const race of this.accountBootstrap.startingUnlockedRaces) assert(raceNames.has(race), `starter race ${race} must exist in canon`);
    assert(this.accountBootstrap.baseClassAvailability === 'all-approved-base-classes', 'base class availability policy mismatch');
    assert(this.accountBootstrap.startingProgressionFeatures?.mantle === false, 'Mantle must not start as a required/unlocked early system');
    assert(this.accountBootstrap.startingProgressionFeatures?.chronicle === false, 'Chronicle must not start as a required/unlocked early system');

    assert(this.chronicleTrees?.families?.length === 11, 'expected 11 normal Chronicle trees');
    const chronicleNodes = this.chronicleTrees.families.flatMap(f => f.nodes || []);
    assert(chronicleNodes.length === 352, 'expected 352 normal Chronicle nodes');
    for (const family of this.chronicleTrees.families) {
      assert(family.nodes.length === 32, `${family.name} must have 32 Chronicle nodes`);
      assert(family.nodes.reduce((sum, node) => sum + node.cost, 0) === 49, `${family.name} Chronicle full cost must be 49 CP`);
    }

    const forest = this.regions?.regions?.find(region => region.id === 'forest');
    assert(forest?.depthCount === 30, 'Forest must contain exactly 30 Depth');
    assert(forest?.cardsPerStep === 3, 'each expedition step must offer exactly 3 event cards');
    assert(forest?.introductoryBand?.start === 1 && forest?.introductoryBand?.end === 5, 'Forest introductory band must be Depths 1-5');
    assert(forest?.trainerEligibility?.start === 3 && forest?.trainerEligibility?.end === 29, 'trainer eligibility must be Depths 3-29');
    assert(Number(forest?.completionReward?.onyx) === 100 && Number(forest?.completionReward?.chronicleProgress) === 4, 'I16 Forest completion reward must be +100 Onyx / +4 Chronicle Progress');
    assert(forest?.nextRegion?.id === 'bog-of-lost-souls' && forest?.nextRegion?.expectedEntryLevel?.join(',') === '5,6' && Number(forest?.nextRegion?.targetEndLevel) === 12, 'I16 Forest boundary must preserve the Bog Level 5-6 -> 12 pacing target');
    const bog=this.regions?.regions?.find(region=>region.id==='bog-of-lost-souls');
    assert(bog?.depthCount===30&&bog?.combatStructure?.minibossDepth===15&&bog?.combatStructure?.bossDepth===30,'Bog must be a 30-Depth region with special combats at 15/30');
    assert(bog?.merchants===false,'Bog of Lost Souls must not contain merchants');
    // Older sealed unit fixtures construct the registry without post-I22 Bog payloads. When any Bog payload is supplied,
    // require the entire image-free Bog authority to be present and coherent; production load() always supplies all four.
    if(this.bogEnemies||this.bogEvents||this.bogTrainers||this.bogCrafting){
      assert(this.bogEnemies&&this.bogEvents&&this.bogTrainers&&this.bogCrafting,'Bog authority must load enemies, events, Trainers, and crafting together');
      assert(this.bogEnemies?.regularEnemies?.length===16,'Bog foundation requires 16 regular enemy types');
      assert(this.bogEnemies?.miniboss?.actors?.map(x=>x.id).join(',')==='mirebound-abomination,varris-blackbanner','Bog miniboss must be Abomination + Varris');
      assert(this.bogEnemies?.boss?.actors?.map(x=>x.id).join(',')==='crazed-witch-mira,bandit-king-jack','Bog boss must be Mira + Jack');
      assert(Number(this.bogEnemies?.miniboss?.actors?.[0]?.maxEnergy)===8,'Mira’s Mirebound Abomination must have 8 Max Energy');
      assert(this.bogTrainers?.count===11&&this.bogTrainers?.entries?.length===11,'Bog must contain the 11 remaining subclass Trainers');
      assert(Number(this.bogTrainers?.rules?.activeRosterMin)===8&&Number(this.bogTrainers?.rules?.activeRosterMax)===11,'Bog campaign must show 8–11 of its 11 Trainers');
      assert(this.bogEvents?.events?.length===143&&new Set(this.bogEvents.events.map(e=>e.id)).size===143,'Bog event catalogue must contain 143 unique definitions');
      assert(this.bogEvents.events.filter(e=>e.kind==='combat'&&e.combat===true).length>=42,'Bog event catalogue must contain a substantial direct-combat route pool');
      assert(this.bogEvents.events.filter(e=>e.majorHaunting).length>=6,'Bog Fog Pressure must have Major Haunting event definitions across the region');
      assert(this.bogCrafting?.rules?.location==='Campsite'&&this.bogCrafting?.rules?.merchants===false,'Bog crafting must be Campsite-only with no merchants');
      assert(this.bogCrafting?.sets?.length===3&&this.bogCrafting.sets.every(s=>s.pieceIds?.length===4),'Bog foundation must contain three four-piece regional armor sets');
      assert(this.bogCrafting?.recipes?.length===61,'Bog foundation crafting must contain 61 image-free recipes');
      assert(this.bogTrainers.entries.every(t=>Array.isArray(t.soulfireItemIds)&&t.soulfireItemIds.length===3),'each Bog Trainer must own exactly three SoulFire craftables');
      assert((this.tavernServices?.keptImpressionShop?.offers||[]).filter(o=>o.region==='bog-of-lost-souls').length===12,'Bog must expose 12 regional account-wide Kept Impression purchases');
      assert((this.tavernServices?.regionalRaceUnlocks?.['bog-of-lost-souls']||[]).length===2,'Bog must retain two account-wide regional race unlocks after Demon moves to Caverns to Hell');
    }

    const tower=this.regions?.regions?.find(region=>region.id==='heavenly-tower');
    assert(tower?.depthCount===30&&tower?.combatStructure?.minibossDepth===15&&tower?.combatStructure?.bossDepth===30,'Heavenly Tower must be a 30-Depth region with special combats at 15/30');
    if(this.towerEnemies||this.towerEvents||this.towerCrafting){
      assert(this.towerEnemies&&this.towerEvents&&this.towerCrafting,'Heavenly Tower authority must load enemies, events, and crafting together');
      assert(this.towerEnemies?.regularEnemies?.length===19,'Heavenly Tower foundation requires 19 regular robot types');
      assert(this.towerEnemies?.rules?.affinityPrevalence?.join(',')==='Holy,Cold,Fire,Psychic','Tower affinity prevalence must be Holy > Cold > Fire > Psychic');
      assert(this.towerEnemies?.miniboss?.actors?.map(x=>x.id).join(',')==='aureofrost-colossus-body,aureofrost-left-arm,aureofrost-right-arm','Tower miniboss must be the three-actor Aureofrost Colossus');
      assert(Number(this.towerEnemies?.miniboss?.actors?.[0]?.maxEnergy)===6,'Aureofrost Colossus Main Body must have 6 Max Energy');
      assert(this.towerEnemies?.boss?.actors?.[0]?.id==='divine-lich','Tower final boss must be the Divine Lich');
      assert(Number(this.towerEnemies?.boss?.actors?.[0]?.ai?.revival?.charges)===3,'Divine Lich must have exactly three resurrection charges');
      assert(this.towerEvents?.events?.length===123&&new Set(this.towerEvents.events.map(e=>e.id)).size===123,'Tower event catalogue must contain 123 unique definitions');
      assert(this.towerCrafting?.sets?.length===4&&this.towerCrafting.sets.every(s=>s.pieceIds?.length===4),'Tower must contain four four-piece affinity armor sets');
      assert(this.towerCrafting?.recipes?.length===42,'Tower crafting must contain 42 image-free recipes');
      assert((this.tavernServices?.keptImpressionShop?.offers||[]).filter(o=>o.region==='heavenly-tower').length===12,'Tower must expose 12 regional account-wide Kept Impression purchases');
      assert((this.tavernServices?.regionalRaceUnlocks?.['heavenly-tower']||[]).length===3,'Tower must define three account-wide regional race unlocks');
    }


    const plains=this.regions?.regions?.find(region=>region.id==='ruined-vampiric-plains');
    assert(plains?.depthCount===30&&plains?.combatStructure?.minibossDepths?.join(',')==='10,20'&&plains?.combatStructure?.bossDepth===30,'Ruined Vampiric Plains must be a 30-Depth region with special combats at 10/20/30');
    assert(plains?.regionalMechanic?.id==='blood-moon'&&Number(plains?.regionalMechanic?.travelGain)===3,'Ruined Vampiric Plains must use the persistent Blood Moon mechanic');
    if(this.plainsEnemies||this.plainsEvents||this.plainsCrafting){
      assert(this.plainsEnemies&&this.plainsEvents&&this.plainsCrafting,'Ruined Vampiric Plains authority must load enemies, events, and crafting together');
      assert(this.plainsEnemies?.regularEnemies?.length===20,'Ruined Vampiric Plains foundation requires 20 regular enemy types');
      assert(this.plainsEnemies?.minibosses?.map(x=>x.fixedDepth).join(',')==='10,20','Plains minibosses must occur at Depths 10 and 20');
      assert(this.plainsEnemies?.minibosses?.[0]?.actors?.map(x=>x.id).join(',')==='lord-varrek,nightblood-charger','Depth 10 must contain Lord Varrek and the Nightblood Charger');
      assert(this.plainsEnemies?.minibosses?.[1]?.actors?.[0]?.id==='veiled-seer','Depth 20 must contain the Veiled Seer');
      assert(this.plainsEnemies?.boss?.actors?.map(x=>x.id).join(',')==='tenairah,tenairah-crimson-root,tenairah-sable-root,tenairah-crown-root','Plains final boss must be Tenairah plus three Blood Roots');
      assert(this.plainsEvents?.events?.length===123&&new Set(this.plainsEvents.events.map(e=>e.id)).size===123,'Plains event catalogue must contain 123 unique definitions');
      assert(this.plainsCrafting?.sets?.length===4&&this.plainsCrafting.sets.every(x=>x.pieceIds?.length===4),'Plains must contain four four-piece armor sets');
      assert(this.plainsCrafting?.recipes?.length===42,'Plains crafting must contain 42 image-free recipes');
      assert((this.tavernServices?.regionalRaceUnlocks?.['ruined-vampiric-plains']||[]).map(x=>x.race).join(',')==='Duvenari,Veldrathi','Plains must unlock Duvenari and Veldrathi');
      assert((this.tavernServices?.keptImpressionShop?.offers||[]).filter(o=>o.region==='ruined-vampiric-plains').length>=12,'Plains must expose at least 12 regional Kept Impression purchases');
    }


    const hell=this.regions?.regions?.find(region=>region.id==='caverns-to-hell');
    assert(hell?.depthCount===30&&hell?.combatStructure?.minibossDepth===10&&hell?.combatStructure?.bossDepth===30,'Caverns to Hell must be a 30-Depth region with special combats at 10/30');
    assert(hell?.regionalMechanic==null,'Caverns to Hell must not use a region-wide meter/mechanic');
    assert(hell?.nextRegion?.id==='that-dragons-dungeon','Caverns to Hell must lead to That Dragon’s Dungeon');
    if(this.hellEnemies||this.hellEvents||this.hellCrafting){
      assert(this.hellEnemies&&this.hellEvents&&this.hellCrafting,'Caverns to Hell authority must load enemies, events, and crafting together');
      assert(this.hellEnemies?.regularEnemies?.length===22,'Caverns to Hell foundation requires 22 regular enemy types');
      assert(this.hellEnemies?.miniboss?.fixedDepth===10&&this.hellEnemies?.miniboss?.actors?.[0]?.id==='kharvax-the-gatebound','Depth 10 must contain Kharvax, the Gatebound');
      const sevenfold=this.hellEnemies?.boss?.actors?.[0];
      assert(this.hellEnemies?.boss?.fixedDepth===30&&sevenfold?.id==='serevakh-sevenfold-regent','Depth 30 must contain Serevakh, the Sevenfold Regent');
      assert((sevenfold?.abilities||[]).filter(x=>x.sinForm).length===14,'Serevakh must have exactly fourteen Sin-form attacks');
      assert(sevenfold?.ai?.startsIn==='Pride','Serevakh must always begin in Pride');
      assert(this.hellEvents?.events?.length===123&&new Set(this.hellEvents.events.map(e=>e.id)).size===123,'Caverns to Hell event catalogue must contain 123 unique definitions');
      assert(this.hellEvents?.rules?.merchantWarning===false,'Infernal Broker must not warn about Greed’s Debt');
      assert(this.hellCrafting?.materials?.length===20,'Caverns to Hell must contain 20 regional materials');
      assert(this.hellCrafting?.sets?.length===4&&this.hellCrafting.sets.every(x=>x.pieceIds?.length===4),'Caverns to Hell must contain four four-piece armor sets');
      assert(this.hellCrafting?.recipes?.length===42&&this.hellCrafting.recipes.filter(x=>x.rarity==='SoulFire').length===10,'Caverns to Hell must contain 42 recipes including 10 SoulFire recipes');
      assert(this.hellCrafting?.merchant?.items?.length===5&&this.hellCrafting?.merchant?.warningText==null,'Infernal Broker must sell five unannounced bargain items');
      assert((this.tavernServices?.regionalRaceUnlocks?.['caverns-to-hell']||[]).map(x=>x.race).join(',')==='Demon','Caverns to Hell must be the sole regional Demon unlock');
      assert(!(this.tavernServices?.regionalRaceUnlocks?.['bog-of-lost-souls']||[]).some(x=>x.race==='Demon'),'Demon must no longer unlock in the Bog');
      assert((this.tavernServices?.keptImpressionShop?.offers||[]).filter(o=>o.region==='caverns-to-hell').length===12,'Caverns to Hell must expose 12 regional Kept Impression purchases');
      assert(this.equipmentConsumablesStatus?.rules?.lateForestGearEndgameViable===true&&this.equipmentConsumablesStatus?.rules?.horizontalProgressionFromLateForest===true,'late Forest gear must remain endgame-viable through horizontal progression');
      const heartwood=(this.equipmentConsumablesStatus?.equipment||[]).find(x=>x.id==='eq-heartwood-scepter');
      const heartwoodCore=Object.entries(heartwood?.listedStats||{}).filter(([k])=>['STR','DEX','CON','INT','FTH','CHA','LCK'].includes(k)).map(([,v])=>v).reduce((sum,v)=>sum+(Number(v)||0),0);
      assert(heartwoodCore>=16,'Heartwood Sovereign late-Forest weapon must be normalized to an endgame-capable core-stat budget');
    }



    const dragon=this.regions?.regions?.find(region=>region.id==='that-dragons-dungeon');
    assert(dragon?.depthCount===30&&dragon?.combatStructure?.minibossDepths?.join(',')==='10,20'&&dragon?.combatStructure?.bossDepth===30,'That Dragon’s Dungeon must be a 30-Depth region with special combats at 10/20/30');
    assert(dragon?.regionalMechanic==null,'That Dragon’s Dungeon must not use a region-wide meter/mechanic');
    assert(dragon?.nextRegion?.id==='necropolis','That Dragon’s Dungeon must lead to Necropolis');
    if(this.dragonEnemies||this.dragonEvents||this.dragonCrafting){
      assert(this.dragonEnemies&&this.dragonEvents&&this.dragonCrafting,'That Dragon’s Dungeon authority must load enemies, events, and crafting together');
      assert(this.dragonEnemies?.regularEnemies?.length===24,'That Dragon’s Dungeon foundation requires 24 regular enemy types');
      for(const family of ['Drake','Wyvern','Dragon'])assert(this.dragonEnemies.regularEnemies.filter(e=>e.dragonFamily===family).length===8,`That Dragon’s Dungeon requires eight ${family} enemies`);
      assert(this.dragonEnemies?.minibosses?.map(x=>x.fixedDepth).join(',')==='10,20','Dungeon minibosses must occur at Depths 10 and 20');
      assert(this.dragonEnemies?.minibosses?.[0]?.actors?.[0]?.id==='hoard-sentinel','Depth 10 must contain the Hoard Sentinel');
      const wyrm=this.dragonEnemies?.minibosses?.[1]?.actors||[];assert(wyrm.length===5&&wyrm[0]?.id==='leviathan-central-head','Depth 20 Leviathan Wyrm must have five separately targetable heads with the central head as boss body');
      const q=this.dragonEnemies?.boss?.actors?.[0];assert(this.dragonEnemies?.boss?.fixedDepth===30&&q?.id==='quentaliaus-devanpierus','Depth 30 must contain Quentaliaus Devanpierus');
      const breathTypes=new Set((q?.abilities||[]).flatMap(a=>(a.components||[]).filter(c=>c.type==='damage').map(c=>c.damageType)));for(const type of ['Fire','Cold','Lightning','Holy','Psychic','Force'])assert(breathTypes.has(type),`Quentaliaus must use ${type} damage`);
      assert(this.dragonEvents?.events?.length===123&&new Set(this.dragonEvents.events.map(e=>e.id)).size===123,'That Dragon’s Dungeon event catalogue must contain 123 unique definitions');
      assert(this.dragonEvents?.rules?.treasureCurses==='expedition-only','Dungeon treasure curses must last only for the current expedition');
      assert(this.dragonCrafting?.sets?.length===4&&this.dragonCrafting.sets.every(x=>x.pieceIds?.length===4),'That Dragon’s Dungeon must contain four four-piece armor sets');
      assert(this.dragonCrafting?.recipes?.length===42&&this.dragonCrafting.recipes.filter(x=>x.rarity==='SoulFire').length===10,'That Dragon’s Dungeon must contain 42 recipes including 10 SoulFire recipes');
      assert((this.tavernServices?.regionalRaceUnlocks?.['that-dragons-dungeon']||[]).map(x=>x.race).join(',')==='Rhazekai','That Dragon’s Dungeon must be the regional Rhazekai unlock');
      assert(!(this.tavernServices?.regionalRaceUnlocks?.forest||[]).some(x=>x.race==='Rhazekai'),'Rhazekai must no longer unlock in the Forest');
      assert((this.tavernServices?.keptImpressionShop?.offers||[]).filter(o=>o.region==='that-dragons-dungeon').length===12,'That Dragon’s Dungeon must expose 12 regional Kept Impression purchases');
    }


    const necropolis=this.regions?.regions?.find(region=>region.id==='necropolis');
    assert(necropolis?.depthCount===30&&necropolis?.combatStructure?.minibossDepths?.join(',')==='10,20'&&necropolis?.combatStructure?.bossDepth===30,'Necropolis must be a 30-Depth region with special combats at 10/20/30');
    assert(necropolis?.regionalMechanic==null,'Necropolis must not use a region-wide meter/mechanic');
    assert(necropolis?.nextRegion?.id==='shadow-infused-dark-woods','Necropolis must lead to the Shadow Infused Dark Woods');
    if(this.necropolisEnemies||this.necropolisEvents||this.necropolisCrafting){
      assert(this.necropolisEnemies&&this.necropolisEvents&&this.necropolisCrafting,'Necropolis authority must load enemies, events, and crafting together');
      assert(this.necropolisEnemies?.regularEnemies?.length===24,'Necropolis foundation requires 24 regular enemy types');
      assert(this.necropolisEnemies.regularEnemies.filter(e=>e.necropolisFamily==='Undead Fodder').length===12,'Necropolis must contain twelve intentionally weak skeleton/zombie fodder types');
      assert(this.necropolisEnemies?.minibosses?.map(x=>x.fixedDepth).join(',')==='10,20','Necropolis minibosses must occur at Depths 10 and 20');
      assert(this.necropolisEnemies?.minibosses?.[0]?.actors?.[0]?.id==='vicar-malrec-bone-tithe','Depth 10 must contain the cult Bone-Tithe Executioner');
      assert(this.necropolisEnemies?.minibosses?.[1]?.actors?.[0]?.id==='grave-colossus','Depth 20 must contain the Grave Colossus');
      const oss=this.necropolisEnemies?.boss?.actors||[];assert(this.necropolisEnemies?.boss?.fixedDepth===30&&oss?.[0]?.id==='ossuary-king'&&oss.length===4,'Depth 30 must contain the Ossuary King and three Royal Ossuaries');
      assert(oss.slice(1).map(x=>x.id).join(',')==='royal-ossuary-bone-armor,royal-ossuary-many-limbs,royal-ossuary-arsenal','Ossuary King supports must be Bone Armor, Many Limbs, and Royal Arsenal only');
      assert(this.necropolisEvents?.events?.length===123&&new Set(this.necropolisEvents.events.map(e=>e.id)).size===123,'Necropolis event catalogue must contain 123 unique definitions');
      assert(this.necropolisEvents?.rules?.mirrorRemainsWithCultLeader===true,'The cult leader must keep the Mirror while escaping Necropolis');
      assert(this.necropolisCrafting?.materials?.length===20,'Necropolis must contain 20 regional materials');
      assert(this.necropolisCrafting?.sets?.length===4&&this.necropolisCrafting.sets.every(x=>x.pieceIds?.length===4),'Necropolis must contain four four-piece armor sets');
      assert(this.necropolisCrafting?.recipes?.length===42&&this.necropolisCrafting.recipes.filter(x=>x.rarity==='SoulFire').length===10,'Necropolis must contain 42 recipes including 10 SoulFire recipes');
      assert((this.tavernServices?.regionalRaceUnlocks?.necropolis||[]).length===0,'Necropolis must not add a regional race unlock');
      assert((this.tavernServices?.keptImpressionShop?.offers||[]).filter(o=>o.region==='necropolis').length===12,'Necropolis must expose 12 regional Kept Impression purchases');
    }

    const finalRegion=this.regions?.regions?.find(region=>region.id==='shadow-infused-dark-woods');
    assert(finalRegion?.depthCount===3&&finalRegion?.combatStructure?.minibossDepths?.join(',')==='2'&&finalRegion?.combatStructure?.bossDepth===3,'Shadow Infused Dark Woods must be a three-Depth finale with combats at 2 and 3');
    assert(finalRegion?.eventStructure?.depth1FullHealCampsite===true&&finalRegion?.regionalMechanic==null,'Final Region Depth 1 must be a full-heal campsite with no regional meter');
    if(this.finalRegionEnemies){
      assert(this.finalRegionEnemies?.cultLeader?.fixedDepth===2&&this.finalRegionEnemies?.cultLeader?.actors?.length===1,'Final Region Depth 2 must contain the cult leader fight');
      assert(this.finalRegionEnemies?.boss?.fixedDepth===3&&this.finalRegionEnemies?.boss?.baseActor?.id==='broken-mirror','Final Region Depth 3 must contain the Broken Mirror');
      assert(this.finalRegionEnemies?.boss?.forms?.map(x=>x.id).join(',')==='heartwood-sovereign,crazed-witch-mira,bandit-king-jack,divine-lich,tenairah,serevakh-greed,quentaliaus-devanpierus,ossuary-king','Broken Mirror must use the approved prior-boss sequence ending in Ossuary King');
      assert(this.finalRegionEnemies?.boss?.forms?.find(x=>x.id==='serevakh-greed')?.name?.includes('Greed'),'The Serevakh Mirror form must always be Greed');
      assert(this.finalRegionEnemies?.boss?.shadowCloneRules?.copyEquipment===false&&this.finalRegionEnemies?.boss?.shadowCloneRules?.copyKeptImpressions===false,'Mirror party clones must not copy equipment or Kept Impressions');
    }

    assert(this.combatRules?.energy?.combatStart === 0, 'combat Energy must start at 0');
    assert(this.combatRules?.energy?.naturalStartOfTurnGain === 1, 'natural turn Energy must be exactly +1');
    assert(this.combatRules?.energy?.naturalGainUsesEnergyGainPercent === false, 'natural +1 Energy must not roll Energy Gain %');
    assert(this.combatRules?.playerTurn?.actionsPerTurn === 1, 'player turns must use exactly one action');
    assert(this.combatRules?.guard?.dodgeResolvesBeforeGuardBlock === true, 'Dodge must resolve before Guard block');
    assert(this.combatRules?.energy?.maximumEnergy === 7, 'Base Maximum Energy must be 7');
    assert(this.combatRules?.defense?.dodgeChanceCapPct === 85 && this.combatRules?.defense?.blockChanceCapPct === 85, 'Dodge and Block caps must both be 85%');
    assert(this.combatRules?.cooldowns?.newCooldownTicksOnApplicationTurn === false, 'new cooldowns must not tick on their application turn');
    assert(this.baseAbilities?.count === 55 && this.baseAbilities?.abilities?.length === 55, 'expected 55 approved base-class abilities');
    assert(new Set(this.baseAbilities.abilities.map(a => a.id)).size === 55, 'base ability ids must be unique');
    for (const ability of this.baseAbilities.abilities) assert(this.getBaseClasses().includes(ability.baseClass), `unknown base ability class ${ability.baseClass}`);
    assert(this.subclassAbilities?.count === 132 && this.subclassAbilities?.subclassCount === 33 && this.subclassAbilities?.abilities?.length === 132, 'expected 132 approved subclass abilities across 33 subclasses');
    assert(new Set(this.subclassAbilities.abilities.map(a=>a.id)).size === 132, 'subclass ability ids must be unique');
    const subclassNames=new Set(this.authority.class_families.flatMap(f=>(f.entities||[]).filter(e=>e.name!==f.base_class).map(e=>e.name)));
    assert(subclassNames.size===33,'expected 33 approved subclasses');
    for(const subclass of subclassNames){const abilities=this.subclassAbilities.abilities.filter(a=>a.subclass===subclass).sort((a,b)=>a.slot-b.slot);assert(abilities.length===4,`${subclass} must have four subclass abilities`);assert(abilities.map(a=>a.level).join(',')==='3,5,7,9',`${subclass} subclass abilities must unlock at Levels 3/5/7/9`);}
    const scaling=this.forestEnemies?.rules?.bossMinibossPartyScaling||{};
    assert(Number(scaling['1']?.maxHpMultiplier)===1&&Number(scaling['1']?.damageMultiplier)===1,'solo boss scaling mismatch');
    assert(Number(scaling['2']?.maxHpMultiplier)===1.55&&Number(scaling['2']?.damageMultiplier)===1.15,'two-person boss scaling mismatch');
    assert(Number(scaling['3']?.maxHpMultiplier)===2.10&&Number(scaling['3']?.damageMultiplier)===1.30,'three-person boss scaling mismatch');
    assert(Number(scaling['4']?.maxHpMultiplier)===2.65&&Number(scaling['4']?.damageMultiplier)===1.45,'four-person boss scaling mismatch');
    assert(Object.keys(this.baseResources?.resources || {}).length === 11, 'expected 11 base-class resource definitions');
    assert(Array.isArray(this.forestEnemies?.regularEnemies) && this.forestEnemies.regularEnemies.length === 12, 'expected 12 regular Forest enemy types');
    assert(this.forestEnemies?.miniboss?.fixedDepth === 15, 'Forest miniboss must be fixed at Depth 15');
    assert(this.forestEnemies?.boss?.fixedDepth === 30, 'Forest boss must be fixed at Depth 30');
    assert(this.forestEnemies?.rules?.enemiesUseConsumables === false, 'enemies must never use consumables');
    assert(this.forestEnemies?.rules?.enemiesCanGuard === false, 'enemies cannot Guard');
    assert(this.forestEnemies?.rules?.enemyHasBasicAttack === true && this.forestEnemies?.rules?.enemyCanCharge === true, 'enemies need Basic Attack and Charge');
    assert(this.characterProgression?.baseMaxHp === 10 && this.characterProgression?.hpPerCon === 2 && this.characterProgression?.hpPerLevelAfterFirst === 3, 'I9 HP progression constants mismatch');
    assert(this.characterProgression?.chroniclePerOnyxDivisor === 25, 'Chronicle Progress must derive from Onyx at 1/25 rate');
    assert(Array.isArray(this.tavernAdventurers?.entries) && this.tavernAdventurers.entries.length === 13, 'expected 13 preserved Tavern Adventurer profiles');
    assert(new Set(this.tavernAdventurers.entries.map(e=>e.id)).size === 13, 'Tavern Adventurer ids must be unique');
    assert(this.tavernAdventurers.entries.every(e=>typeof e.race==='string'&&e.race.trim().length>0), 'every Tavern Adventurer must expose an approved race identity label');
    assert(this.tavernAdventurers?.rules?.raceDisplay==='approved-portrait-card-identity-only-no-racial-mechanics', 'Tavern Adventurer race identity must remain display-only');

    const i14Events=this.forestEvents;
    assert(i14Events?.rules?.noDefinitionRepeatsWithinCampaign===true,'I14 Forest event definitions must never repeat within a campaign');
    assert(i14Events?.rules?.nonTrainerNoncombatUsesSingleCoreStatCheck===true,'I14 non-Trainer noncombat events must use singular core-stat checks');
    assert(Array.isArray(i14Events?.events)&&i14Events.events.length>=140,'I14 requires a large unique Forest event catalogue');
    assert(new Set(i14Events.events.map(e=>e.id)).size===i14Events.events.length,'I14 Forest event ids must be unique');
    for(const e of i14Events.events.filter(e=>e.kind!=='combat')) assert(e.check&&['STR','DEX','CON','INT','FTH','CHA','LCK'].includes(e.check.stat),'every I14 non-Trainer event must define one core-stat check');
    const i14Trainers=this.forestTrainers;
    assert(i14Trainers?.count===22&&i14Trainers?.entries?.length===22,'Forest must contain exactly 22 Trainers');
    assert(Number(i14Trainers?.rules?.matchingBaseClassAnchorChancePct)===95,'I14 matching base-class Trainer anchor must be 95%');
    assert(Number(i14Trainers?.rules?.activeRosterMin)===9&&Number(i14Trainers?.rules?.activeRosterMax)===11,'Active Forest Trainer roster must contain 9–11 Trainers');
    assert(new Set(i14Trainers.entries.map(t=>t.id)).size===22,'Forest Trainer ids must be unique');
    assert(i14Trainers.entries.every(t=>Array.isArray(t.soulfireItemIds)&&t.soulfireItemIds.length===3),'each I14 Trainer must own exactly three SoulFire craftables');

    const i12=this.equipmentConsumablesStatus;
    assert(i12?.rules?.armorMitigationPct?.Light===0&&i12?.rules?.armorMitigationPct?.Medium===5&&i12?.rules?.armorMitigationPct?.Heavy===10,'I12 armor mitigation must be 0/5/10');
    assert(Number(i12?.rules?.heavyChestInitiativePenalty)===-2,'Heavy Chest must impose -2 Initiative');
    assert(i12?.rules?.weaponBaseDamage===false&&i12?.rules?.dualWieldAddsAttacks===false,'weapons must not add Base Damage or extra attacks');
    assert(Number(i12?.rules?.baseConsumableEquipCapacity)===1&&Number(i12?.rules?.usesPerBattle)===1,'I12 base consumable equip/use limits must both be one');
    assert(Array.isArray(i12?.equipment)&&i12.equipment.length>=10,'I12 starter equipment catalogue is missing');
    assert(Array.isArray(i12?.consumables)&&i12.consumables.length>=6&&i12.consumables.filter(x=>x.subtype==='Food').length>=6,'I12 consumables should be predominantly fantasy Food');
    for(const id of ['Burn','Poison','Bleed']){const st=i12.statuses?.find(x=>x.id===id);assert(st?.periodic===true&&st?.canCrit===true&&st?.tickTiming==='owner-turn-start'&&st?.dodgeableTick===false&&st?.blockableTick===false,`${id} I12 periodic status rules mismatch`);}

    const i13=this.forestCrafting;
    assert(i13?.rules?.location==='Campsite'&&i13?.rules?.enemyEquipmentDrops===false,'I13 crafting must be Campsite-only with no enemy equipment drops');
    assert(Array.isArray(i13?.sets)&&i13.sets.length===14,'I13 must define 14 Forest armor sets');
    assert(i13.sets.every(s=>s.pieceIds?.length===4&&s.bonuses?.map(b=>b.pieces).join(',')==='2,3,4'&&s.definingThreshold===3),'I13 sets must be four pieces with 2/3/4 bonuses and defining 3-piece threshold');
    assert(i13?.catalogueSummary?.armorPieces===56&&i13?.catalogueSummary?.sourceWeapons===28,'I13 major Forest equipment count mismatch');
    assert(i13?.catalogueSummary?.charms===30,'I13 Forest charm catalogue must contain 30 craftable charms');
    assert(i13?.rules?.soulfireCoreDeterministic===true,'SoulfireCore drops must be deterministic');
    assert(i13?.rules?.normalMaterialDropByRealPartySize?.['1']?.join(',')==='1,3'&&i13?.rules?.normalMaterialDropByRealPartySize?.['4']?.join(',')==='4,5','I13 normal material drop ranges mismatch');
    assert(this.equipmentConsumablesStatus?.rules?.rarities?.join(',')==='Normal,SoulFire','I13 supports only Normal and SoulFire rarity');
    assert(i13?.rules?.trainerSoulfireHookStatus==='live-22-trainer-roster'&&i13?.catalogueSummary?.trainerSoulfireItems===66,'Trainer SoulFire crafting authority mismatch');
    assert(this.tavernServices?.mara?.offersAtATime===3&&this.tavernServices?.mara?.activeQuestLimit===1,'I15 Mara quest offer/active limits mismatch');
    assert(this.tavernServices?.tavernAdventurerRecruitment?.freeStarterIds?.length===6,'I15 requires six free Tavern Adventurers');
    assert(this.tutorialsHelp?.mandatoryStarter?.reward?.keptImpressionTokens===2&&this.tutorialsHelp?.mandatoryStarter?.reward?.maxSlotCost===3,'I18 starter reward must be exactly two 3-slot-or-lower KI tokens');
    assert(this.tutorialsHelp?.mandatoryStarter?.skipAllowed===true,'I18 starter tutorial must grant its reward even when skipped');
    assert(this.tutorialsHelp?.tutorials?.length===8,'I18 must retain exactly eight replayable named tutorials');
    assert(this.tutorialsHelp?.helpEntries?.length>=20,'I18 Help Codex must cover the current core systems');
    if (this.contentPortraits) {
      const summary=this.contentPortraits.summary||{};
      assert(Number(summary.enemyTargets)===14,'content portrait inventory must contain 14 Forest enemy targets');
      assert(Number(summary.forestEventTargets)===143,'content portrait inventory must contain 143 Forest event targets');
      assert(Number(summary.trainerCardTargets)===22,'content portrait inventory must contain 22 Trainer-card targets');
      assert(Number(summary.eventCardTargets)===165&&Number(summary.totalNewContentTargets)===179,'content portrait inventory totals mismatch');
      assert(this.contentPortraits.rules?.runtimePrimaryFormat==='AVIF'&&this.contentPortraits.rules?.runtimeFallbackFormat==='WebP','content portraits must use AVIF primary with WebP fallback');
      assert(this.contentPortraits.rules?.installTimePortraitPrecache===false,'content portraits must remain outside install-time precache');
      assert(this.contentPortraits.rules?.saveMigrationRequired===false,'content portrait framework must not require save migration');
    }

    if (this.portraitSystem) {
      const portrait = this.portraitSystem.vesselPortraits || {};
      const subclassCount = this.authority.class_families.reduce((sum,family)=>sum+(family.entities||[]).filter(entity=>entity.name!==family.base_class).length,0);
      assert(portrait.oneBasePortraitPerRaceGenderSubclass===true,'portrait system must use one base portrait per Race × Gender × Subclass');
      assert(Number(portrait.targetRaceCount)===this.authority.races.count,'portrait race target must match canon');
      assert(Number(portrait.targetSubclassCount)===subclassCount,'portrait subclass target must match canon');
      assert(Number(portrait.targetGenderCount)===(portrait.genders||[]).length,'portrait gender target must match configured genders');
      assert(Number(portrait.targetBasePortraitCount)===this.authority.races.count*subclassCount*(portrait.genders||[]).length,'portrait base target count mismatch');
      assert(portrait.colorCustomization===false,'static portrait system must not use recolor customization');
      assert(portrait.maskSystem===false,'static portrait system must not require recolor masks');
      assert(this.portraitSystem.tavernAdventurers?.limitedAlternates===true,'Tavern Adventurers must support limited canonical alternates');
    }
  }

  getBaseClasses() { return this.authority.class_families.map(f => f.base_class); }

  getBaseClassDetails() {
    return this.authority.class_families.map(family => {
      const base = family.entities.find(entity => entity.name === family.base_class);
      return { name: family.base_class, role: base?.role || '', scalingIdentity: [...(base?.scaling_identity || [])] };
    });
  }

  getRaces() { return [...this.authority.races.names]; }

  getSubclassesForBase(baseClass) {
    const family = this.authority.class_families.find(f => f.base_class === baseClass);
    if (!family) return [];
    return family.entities.filter(entity => entity.name !== baseClass).map(entity => entity.name);
  }

  getClassFamily(baseClass) {
    return this.authority.class_families.find(f => f.base_class === baseClass) || null;
  }

  getChronicleSummary() { return this.authority.chronicle; }
  getChronicleTrees() { return this.chronicleTrees; }
  getKeptImpressions() { return this.keptImpressions.entries; }
  getKeptImpression(id) { const entry = this.keptIndex.get(id); return entry ? { ...entry } : null; }
  getKeptImpressionRuntime() { return this.keptImpressionRuntime; }
  getRegions() { return this.regions; }
  getBaseAbilities() { return this.baseAbilities; }
  getBaseAbility(id) { const entry = this.baseAbilityIndex.get(id); return entry ? (typeof structuredClone === 'function' ? structuredClone(entry) : JSON.parse(JSON.stringify(entry))) : null; }
  getSubclassAbilities() { return this.subclassAbilities; }
  getSubclassAbility(id) { const entry=this.subclassAbilityIndex.get(id); return entry ? (typeof structuredClone === 'function' ? structuredClone(entry) : JSON.parse(JSON.stringify(entry))) : null; }
  getBaseResources() { return this.baseResources; }
  getForestEvents() { return this.forestEvents; }
  getForestTrainers() { return this.forestTrainers; }
  getForestEnemies() { return this.forestEnemies; }
  getBogEvents() { return this.bogEvents; }
  getBogTrainers() { return this.bogTrainers; }
  getBogEnemies() { return this.bogEnemies; }
  getTowerEvents() { return this.towerEvents; }
  getTowerEnemies() { return this.towerEnemies; }
  getPlainsEvents() { return this.plainsEvents; }
  getPlainsEnemies() { return this.plainsEnemies; }
  getHellEvents() { return this.hellEvents; }
  getHellEnemies() { return this.hellEnemies; }
  getDragonEvents() { return this.dragonEvents; }
  getDragonEnemies() { return this.dragonEnemies; }
  getNecropolisEvents() { return this.necropolisEvents; }
  getNecropolisEnemies() { return this.necropolisEnemies; }
  getFinalRegionEnemies() { return this.finalRegionEnemies; }
  getCharacterProgression() { return this.characterProgression; }
  getTavernAdventurers() { return this.tavernAdventurers; }
  getForestCrafting() { return this.forestCrafting; }
  getBogCrafting() { return this.bogCrafting; }
  getTowerCrafting() { return this.towerCrafting; }
  getPlainsCrafting() { return this.plainsCrafting; }
  getHellCrafting() { return this.hellCrafting; }
  getDragonCrafting() { return this.dragonCrafting; }
  getNecropolisCrafting() { return this.necropolisCrafting; }
  getEquipmentConsumablesStatus() { return this.equipmentConsumablesStatus; }
  getCombatRules() { return this.combatRules; }
  getRacialConfigurations() { return this.racialConfigurations; }
  getTavernServices() { return this.tavernServices; }
  getTutorialsHelp() { return this.tutorialsHelp; }
  getPortraitSystem() { return this.portraitSystem; }
  getContentPortraits() { return this.contentPortraits; }
  getAccountBootstrap() { return this.accountBootstrap; }
}
