/**
 * HanDiGotchi — client UI + REST API bridge
 * Game state and tick logic live on the Spring Boot server.
 */

const API_BASE = 'https://handigotchi-backend.onrender.com/api';

const STAGES = ['egg', 'baby', 'teen', 'adult'];
const STATUS_POLL_MS = 2000;
const PARTICLE_DURATION_MS = 5500;
const MEALS = [
  { id: 'onigiri', src: 'prop_meal_onigiri.PNG', hunger: 20, energy: 5 },
  { id: 'dumpling', src: 'prop_meal_dumpling.PNG', hunger: 35, energy: 10 },
  { id: 'burger', src: 'prop_meal_burger.PNG', hunger: 50, energy: 15 },
  { id: 'omurice', src: 'prop_meal_omurice.PNG', hunger: 80, energy: 25 },
];
const SNACKS = [
  { id: 'pudding', name: 'Pudding', src: 'prop_snack_pudding.PNG', happy: 15, overload: 5 },
  { id: 'cookie', src: 'prop_snack_cookie.PNG', happy: 30, overload: 3 },
  { id: 'cake', src: 'prop_snack_cake.PNG', happy: 50, overload: 2 },
];

const COPY_HAPPY_ENDING =
  "I'm finally grown!\nThank you for always keeping my tummy full and cleaning my room.\nYou're my absolute favorite person!\nThank you for loving me.\nPlease take good care of yourself too!\nI'll always be right here for you ( ˶ˆ꒳ˆ˵ )💖";

  const COPY_NORMAL_ENDING =
  "I've grown up!\nEven though I got sick a few times, I became much stronger.\nThank you for taking care of me!\nIt's time for me to go out and adventure in the big wide world.\nDon't worry about me!\nByebye~✨";

const COPY_FAREWELL =
  'See you next time...\nI will miss you!!\n( ˘•̥⧿•̥˘ )';

const CINEMATIC_DURATION_MS = 3500;
const ANIM_FRAME_MS = 500;
const HAPPY_ANIM_FRAME_MS = 600;
const CINEMATIC_FRAME_MS = HAPPY_ANIM_FRAME_MS;

const PLAYLIST = [
  './assets/bgm_1.mp3',
  './assets/bgm_2.mp3',
  './assets/bgm_3.mp3'
];
let currentTrack = -1;
let isMusicStarted = false;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const els = {
  screenCanvas: $('#screen-canvas'),
  regionHeader: $('#region-header'),
  regionMenu: $('#region-menu'),
  regionStage: $('#region-stage'),
  barHunger: $('#bar-hunger'),
  barHappy: $('#bar-happy'),
  barEnergy: $('#bar-energy'),
  statBars: $$('.stat-bar'),
  petSprite: $('#pet-sprite'),
  petWrap: $('#pet-wrap'),
  skullOrbit: $('#skull-orbit'),
  poopLayer: $('#poop-layer'),
  foodLayer: $('#food-layer'),
  particleLayer: $('#particle-layer'),
  feedChoices: $('#feed-choices'),
  feedSubmenuSlot: $('#feed-submenu-slot'),
  mealRow: $('#meal-row'),
  snackRow: $('#snack-row'),
  feedIconsCancelRow: $('#feed-icons-cancel-row'),
  feedCancel: $('#feed-cancel'),
  playRow: $('#play-row'),
  playSubmenuSlot: $('#play-submenu-slot'),
  playIconsCancelRow: $('#play-icons-cancel-row'),
  menuDefault: $('#menu-default'),
  menuFeedSubmenu: $('#menu-feed-submenu'),
  narrativeOverlay: $('#narrative-overlay'),
  narrativeText: $('#narrative-text'),
  farewellOverlay: $('#farewell-overlay'),
  farewellText: $('#farewell-text'),
  endingOverlay: $('#ending-overlay'),
  endingText: $('#ending-text'),
  endingStayBtn: $('#ending-stay-btn'),
  endingRestartBtn: $('#ending-restart-btn'),
  restartPrompt: $('#restart-prompt'),
  closeBtn: $('#close-btn'),
  gameAudio: $('#game-audio'),
  characterSelectOverlay: $('#character-select-overlay'),
  selectH: $('#select-h'),
  selectD: $('#select-d'),
  stageEntities: $('#stage-entities'),
  greetingText: $('#greeting-text'),
};

let animTimer = null;
let statusPollTimer = null;
let cinematicFrameTimer = null;
let timers = [];
let lastPoopCount = 0;
let eggClickInFlight = false;
let endingCinematicPlaying = false;
/** True from first ending trigger until Stay / Restart (blocks status poll + disruptive sync). */
let endingSequenceActive = false;
/** Prevents re-running the pre-ending cinematic on every status poll. */
let endingCinematicPlayed = false;

/** Server-authoritative state (synced via REST) */
const game = {
  petType: null,
  stage: 'egg',
  hunger: 100,
  happy: 100,
  energy: 100,
  sleeping: false,
  sick: false,
  dead: false,
  ended: false,
  survivalSeconds: 0,
  lifetimeSickCount: 0,
  endingActive: false,
  endingType: null,
  /** True only after Happy Ending → [Stay with me]; freezes server decay/sick/poop. */
  endlessMode: false,
  sickSeconds: 0,
  eggClickCount: 0,
  poopCount: 0,
  /** Client-only presentation */
  animAction: 'idle',
  animFrame: 1,
  submenu: null,
  poops: [],
  tempAnimUntil: 0,
  playAnimUntil: 0,
  eatAnimUntil: 0,
  petHappyUntil: 0,
};

async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`, { method: 'GET', mode: 'cors' });
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}

async function apiPost(path, body) {
  const options = { method: 'POST', mode: 'cors' };
  if (body !== undefined && body !== null) {
    options.headers = { 'Content-Type': 'application/json' };
    options.body = JSON.stringify(body);
  }
  const res = await fetch(`${API_BASE}${path}`, options);
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
  return res.json();
}

function asset(name) {
  return `./assets/${name}`;
}

// function playNextTrack() {
//   // 增加判断：如果播放器不存在，直接跳出，不让它报错
//   if (!els.gameAudio) return; 

//   els.gameAudio.src = PLAYLIST[currentTrack];
//   els.gameAudio.play().catch(e => console.log("等待玩家点击后播放音乐"));
//   currentTrack = (currentTrack + 1) % PLAYLIST.length; 
// }

function playNextTrack() {
  if (!els.gameAudio) return; 

  let randomIndex;
  // 核心魔法：随机抽数字 (0, 1, 或 2)。如果抽到的和上一首一样，就重新抽！
  do {
    randomIndex = Math.floor(Math.random() * PLAYLIST.length);
  } while (randomIndex === currentTrack && PLAYLIST.length > 1);

  // 把抽中的新歌记录下来
  currentTrack = randomIndex; 

  console.log("🎵 随机切歌啦！正在尝试播放:", PLAYLIST[currentTrack]);

  els.gameAudio.src = PLAYLIST[currentTrack];
  els.gameAudio.play()
    .then(() => {
      console.log("🎵 播放成功啦！");
    })
    .catch(e => {
      console.error("❌ 播放失败，原因是:", e);
    });
}

function schedule(fn, ms) {
  const id = setTimeout(fn, ms);
  timers.push(id);
  return id;
}

function clearCinematicTimer() {
  if (cinematicFrameTimer != null) {
    clearInterval(cinematicFrameTimer);
    cinematicFrameTimer = null;
  }
}

function pauseStatusPolling() {
  if (statusPollTimer) {
    clearInterval(statusPollTimer);
    statusPollTimer = null;
  }
}

function resumeStatusPolling() {
  if (!statusPollTimer) {
    statusPollTimer = setInterval(refreshStatus, STATUS_POLL_MS);
  }
}

function clearAllTimers() {
  timers.forEach((id) => {
    clearTimeout(id);
    clearInterval(id);
  });
  timers = [];
  clearCinematicTimer();
  stopAnimFrameLoop();
  pauseStatusPolling();
}

function stopAnimFrameLoop() {
  if (animTimer != null) {
    clearTimeout(animTimer);
    clearInterval(animTimer);
    animTimer = null;
  }
}

function getAnimFrameIntervalMs() {
  return game.animAction === 'happy' ? HAPPY_ANIM_FRAME_MS : ANIM_FRAME_MS;
}

function scheduleAnimFrameLoop() {
  stopAnimFrameLoop();
  const tick = () => {
    toggleAnimFrame();
    animTimer = setTimeout(tick, getAnimFrameIntervalMs());
  };
  animTimer = setTimeout(tick, getAnimFrameIntervalMs());
}

function resetEndingSequenceState() {
  endingCinematicPlaying = false;
  endingSequenceActive = false;
  endingCinematicPlayed = false;
  clearCinematicTimer();
}

function show(el) {
  if (el) el.hidden = false;
}
function hide(el) {
  if (el) el.hidden = true;
}

/** Force #ending-overlay visible above all layers ([hidden] + CSS safe). */
function revealEndingOverlay() {
  const overlay = els.endingOverlay;
  if (!overlay) {
    console.error('[ending] #ending-overlay not found — check index.html vs els.endingOverlay');
    return false;
  }
  overlay.removeAttribute('hidden');
  overlay.hidden = false;
  overlay.style.display = 'flex';
  overlay.style.zIndex = '9999';
  overlay.style.visibility = 'visible';
  overlay.style.opacity = '1';
  overlay.style.pointerEvents = 'auto';
  return true;
}

function concealEndingOverlay() {
  const overlay = els.endingOverlay;
  if (!overlay) return;
  overlay.hidden = true;
  overlay.setAttribute('hidden', '');
  overlay.style.display = 'none';
}

function applyOverlayMessages() {
  if (els.farewellText) els.farewellText.innerHTML = COPY_FAREWELL;
}

function updateRegionMenuVisibility() {
  const isEgg = game.stage === 'egg';
  const hideMenu = isEgg || (game.endingActive && !game.endlessMode);
  els.regionMenu.classList.toggle('hidden', hideMenu);
  if (hideMenu) hide(els.regionMenu);
  else show(els.regionMenu);
}

function updateRegionHeaderVisibility() {
  const hideHeader = game.stage === 'egg' || !game.petType;
  els.regionHeader.classList.toggle('hidden', hideHeader);
  if (hideHeader) hide(els.regionHeader);
  else show(els.regionHeader);
}

function updateEggVisual() {
  els.petWrap.classList.toggle('is-egg', game.stage === 'egg');
}

function hidePetNameText() {
  if (!els.greetingText) return;
  els.greetingText.textContent = '';
  els.greetingText.classList.remove('visible');
  hide(els.greetingText);
}

function updateCharacterSelectOverlay() {
  if (!els.characterSelectOverlay) return;
  const selecting = !game.petType;
  if (selecting) {
    show(els.characterSelectOverlay);
    if (els.stageEntities) hide(els.stageEntities);
    hidePetNameText();
    if (els.petSprite) {
      els.petSprite.classList.remove('egg-shake');
      els.petSprite.removeAttribute('src');
      els.petSprite.alt = '';
    }
    return;
  }

  hide(els.characterSelectOverlay);
  if (els.stageEntities) show(els.stageEntities);
  hidePetNameText();
  if (game.stage === 'egg' && els.petSprite) {
    els.petSprite.classList.add('egg-shake');
  }
}

function updateUI() {
  updateBars();
  updateRegionHeaderVisibility();
  updateRegionMenuVisibility();
  updateSleepMenuLock();
  updateEggVisual();
  updateCharacterSelectOverlay();
}

function setFinalLoveBars(active) {
  els.statBars.forEach((bar) => bar.classList.toggle('final-love', active));
}

/** Dim and disable all dock actions except Sleep while the pet is sleeping. */
function updateSleepMenuLock() {
  const sleeping = game.sleeping;
  els.menuDefault.querySelectorAll('.menu-btn[data-action]').forEach((btn) => {
    const isSleepBtn = btn.dataset.action === 'sleep';
    btn.classList.toggle('lights-out-locked', sleeping && !isSleepBtn);
  });
  if (sleeping && game.submenu) cancelSubmenu();
}

function setFeedBranchButtonsVisible(visible) {
  els.feedChoices.querySelectorAll('.feed-branch').forEach((btn) => {
    btn.hidden = !visible;
  });
}

function setSubmenu(mode) {
  game.submenu = mode;
  hide(els.menuDefault);
  hide(els.menuFeedSubmenu);
  hide(els.feedChoices);
  hide(els.feedSubmenuSlot);
  hide(els.mealRow);
  hide(els.snackRow);
  hide(els.feedIconsCancelRow);
  hide(els.playSubmenuSlot);
  hide(els.playRow);
  hide(els.playIconsCancelRow);

  if (!mode) {
    if (game.stage !== 'egg') show(els.menuDefault);
    return;
  }
  if (mode === 'feed') {
    show(els.feedChoices);
    setFeedBranchButtonsVisible(true);
  } else if (mode === 'feed-meal') {
    show(els.feedSubmenuSlot);
    show(els.mealRow);
    show(els.feedIconsCancelRow);
  } else if (mode === 'feed-snack') {
    show(els.feedSubmenuSlot);
    show(els.snackRow);
    show(els.feedIconsCancelRow);
  } else if (mode === 'play') {
    show(els.playSubmenuSlot);
    show(els.playRow);
    show(els.playIconsCancelRow);
  }
}

function cancelSubmenu() {
  if (!game.submenu) return;
  setSubmenu(null);
}

function greetingForHour(h) {
  if (h >= 6 && h < 12) return 'Good morning!( ☀️ ▽ ☀️ )';
  if (h >= 23 || h < 6) return "It's late...\nyou should rest soon!\n( ˘•̥⧿•̥˘ )";
  const normalFaces = [
    ' ˶˚ᗜ˚˶ 𑁤', 
    '(ㅅ´˘`)♪', 
    'Σ(°꒳° * )ﾊ', 
    '( ｰ̀ ֊ ｰ́ )',
  ];

  const randomIndex = Math.floor(Math.random() * normalFaces.length);
  return normalFaces[randomIndex];
}

const PETTING_FACES = [
  '(⸝⸝⸝ ╸▵╺ ⸝⸝⸝)',
  '( ߹꒳​߹ )',
  '⌯ᐢᗜᐢ⌯ಣ',
  '( ,,•ω•,,)♡'
];

function getRandomPettingFace() {
  const randomIndex = Math.floor(Math.random() * PETTING_FACES.length);
  return PETTING_FACES[randomIndex];
}

function pickPettingResponse() {
  const roll = Math.random();
  if (roll < 0.1) {
    return { type: 'greeting', text: greetingForHour(new Date().getHours()) };
  }
  if (roll < 0.55) return { type: 'hearts' };
  return { type: 'face', text: getRandomPettingFace() }; 
}

function clearPetParticles() {
  els.particleLayer.innerHTML = '';
  els.regionStage.querySelectorAll('.pet-particle').forEach((el) => el.remove());
}

function randomStageParticleTop() {
  return 2 + Math.random() * 10;
}

function spawnPetParticle(text, { offsetX = 0, animDelay = 0, topPercent, duration = PARTICLE_DURATION_MS, extraClass = '', html = false } = {}) {
  const p = document.createElement('div');
  p.className = ['pet-particle', extraClass].filter(Boolean).join(' ');
  if (html) p.innerHTML = text;
  else p.textContent = text;
  p.style.top = `${topPercent ?? randomStageParticleTop()}%`;
  if (offsetX) p.style.marginLeft = `${offsetX}px`;
  if (animDelay) p.style.animationDelay = `${animDelay}ms`;
  els.particleLayer.appendChild(p);
  schedule(() => p.remove(), duration + animDelay);
}

function spawnEggLaunchGreeting() {
  clearPetParticles();
  spawnPetParticle('Eh?!<br>What is this...(・_・ヾ)', {
    topPercent: 10,
    duration: PARTICLE_DURATION_MS,
    extraClass: 'egg-greeting',
    html: true,
  });
}

function spawnHeartCluster() {
  for (let i = 0; i < 3; i++) {
    const offsetX = (Math.random() - 0.5) * 28;
    const animDelay = Math.floor(Math.random() * 200);
    spawnPetParticle('❤', { offsetX, animDelay });
  }
}

function updateBars() {
  els.barHunger.style.width = `${game.hunger}%`;
  els.barHappy.style.width = `${game.happy}%`;
  els.barEnergy.style.width = `${game.energy}%`;

  const map = [
    ['hunger', game.hunger],
    ['happy', game.happy],
    ['energy', game.energy],
  ];
  els.statBars.forEach((bar) => {
    const stat = bar.dataset.stat;
    const val = map.find((m) => m[0] === stat)[1];
    bar.classList.toggle('at-max', val >= 100);
  });
}

function petImagePath() {
  if (!game.petType) return null;
  if (game.dead) return asset('prop_ghost.PNG');
  if (game.stage === 'egg') return asset(`${game.petType}_egg.PNG`);

  const stage = game.stage;
  let action = game.animAction;

  if (game.sick) action = 'sick';
  else if (game.sleeping) action = 'sleep';
  else if (Date.now() < game.eatAnimUntil) action = 'eat';
  else if (Date.now() < game.playAnimUntil || Date.now() < game.petHappyUntil) action = 'happy';
  else if (Date.now() < game.tempAnimUntil) action = 'happy';

  if (stage === 'baby' && action === 'eat') action = 'happy';

  const frame = game.animFrame;
  return asset(`${game.petType}_${stage}_${action}_${frame}.PNG`);
}

function refreshPetSprite() {
  const path = petImagePath();
  if (path) els.petSprite.src = path;
}

function toggleAnimFrame() {
  if (game.stage === 'egg' || game.dead) return;
  game.animFrame = game.animFrame === 1 ? 2 : 1;
  refreshPetSprite();
}

function handleHatchUI() {
  hidePetNameText();
  els.petSprite.classList.remove('egg-shake');
  updateEggVisual();
  updateRegionHeaderVisibility();
  updateRegionMenuVisibility();
  game.animAction = 'idle';
  updateBars();
  refreshPetSprite();
}

function showEndingOverlay(endingType) {
  console.log('[ending] showEndingOverlay — type:', endingType);
  const isHappy = endingType === 'happy';
  endingSequenceActive = true;
  els.screenCanvas.classList.add('cinematic-mode');

  if (els.endingText) {
    els.endingText.textContent = isHappy ? COPY_HAPPY_ENDING : COPY_NORMAL_ENDING;
  }
  if (els.endingStayBtn) els.endingStayBtn.hidden = !isHappy;
  if (els.endingRestartBtn) els.endingRestartBtn.hidden = false;

  const shown = revealEndingOverlay();
  console.log('[ending] overlay revealed:', shown, 'hidden=', els.endingOverlay?.hidden);

  if (!isHappy) {
    els.petWrap.classList.remove('pet-exit');
    void els.petWrap.offsetWidth;
    els.petWrap.classList.add('pet-exit');
  }
}

function ensureEndingOverlayVisible() {
  if (!game.endingActive || game.endlessMode || endingCinematicPlaying) return;
  showEndingOverlay(game.endingType || 'normal');
}

function runPreEndingCinematic(endingType) {
  if (endingCinematicPlaying) return;
  console.log('[ending] cinematic START — type:', endingType, `(${CINEMATIC_DURATION_MS}ms)`);
  endingCinematicPlaying = true;
  pauseStatusPolling();
  clearCinematicTimer();
  stopAnimFrameLoop();
  concealEndingOverlay();
  cancelSubmenu();
  els.screenCanvas.classList.add('cinematic-mode');

  game.animAction = 'happy';
  game.animFrame = 1;
  refreshPetSprite();

  let elapsed = 0;
  cinematicFrameTimer = setInterval(() => {
    game.animFrame = game.animFrame === 1 ? 2 : 1;
    refreshPetSprite();
    elapsed += CINEMATIC_FRAME_MS;
    if (elapsed >= CINEMATIC_DURATION_MS) {
      clearCinematicTimer();
      console.log('[ending] cinematic END — calling showEndingOverlay');
      game.animAction = 'idle';
      game.animFrame = 1;
      refreshPetSprite();
      endingCinematicPlaying = false;
      scheduleAnimFrameLoop();
      showEndingOverlay(endingType);
    }
  }, CINEMATIC_FRAME_MS);
}

function startEndingSequence(endingType) {
  console.log('[ending] startEndingSequence — type:', endingType);
  if (endingCinematicPlayed || endingSequenceActive) {
    ensureEndingOverlayVisible();
    return;
  }
  endingCinematicPlayed = true;
  endingSequenceActive = true;
  runPreEndingCinematic(endingType);
}

function exitEndingSequence({ resumePolling = true } = {}) {
  resetEndingSequenceState();
  if (resumePolling) resumeStatusPolling();
}

function handleDeathUI() {
  game.sick = false;
  clearSkulls();
  els.screenCanvas.classList.add('overflow-visible');
  els.petSprite.classList.add('ghost-ascend');
  refreshPetSprite();

  schedule(() => {
    showNarrative("I'm going to the star world... don't forget me! ( ˘•̥⧿•̥˘ )", false);
    schedule(showRestartPrompt, 5000);
  }, 4200);
}

/* Stage-local %; top is the sprite's top-left corner (see .poop-sprite width/height).
   Cap topMax low so top + ~10% sprite height stays above feed/menu zones. */
const POOP_SAFE = {
  leftMin: 10,
  leftMax: 80,
  topMin: 20,
  topMax: 38,
};

function randomPoopPosition() {
  const w = POOP_SAFE.leftMax - POOP_SAFE.leftMin;
  const h = POOP_SAFE.topMax - POOP_SAFE.topMin;
  return {
    left: POOP_SAFE.leftMin + Math.random() * w,
    top: POOP_SAFE.topMin + Math.random() * h,
  };
}

function spawnPoopVisual() {
  if (game.poops.length >= 5 || game.dead || game.stage === 'egg') return;
  const pos = randomPoopPosition();
  const img = document.createElement('img');
  img.className = 'poop-sprite';
  img.src = asset('prop_poop.PNG');
  img.draggable = false;
  img.style.left = `${pos.left}%`;
  img.style.top = `${pos.top}%`;
  els.poopLayer.appendChild(img);
  game.poops.push(img);
}

function removeOldestPoopVisual() {
  if (!game.poops.length) return;
  const poop = game.poops.shift();
  const rect = poop.getBoundingClientRect();
  const layerRect = els.poopLayer.getBoundingClientRect();
  const left = ((rect.left - layerRect.left) / layerRect.width) * 100;
  const top = ((rect.top - layerRect.top) / layerRect.height) * 100;
  poop.remove();

  const bubble = document.createElement('img');
  bubble.className = 'bubble-clean';
  bubble.src = asset('prop_bubble.PNG');
  bubble.draggable = false;
  bubble.style.left = `${left}%`;
  bubble.style.top = `${top}%`;
  els.poopLayer.appendChild(bubble);

  schedule(() => {
    bubble.style.transform = 'scale(1.35)';
    bubble.style.opacity = '0';
  }, 50);
  schedule(() => bubble.remove(), 2100);
}

function syncPoopVisuals(targetCount) {
  while (game.poops.length < targetCount) spawnPoopVisual();
  while (game.poops.length > targetCount) {
    const poop = game.poops.pop();
    if (poop) poop.remove();
  }
}

function applyServerState(dto, { skipPoopSync = false, allowDuringEnding = false } = {}) {
  const prevStage = game.stage;
  const prevDead = game.dead;
  const prevEndingActive = game.endingActive;
  const prevSick = game.sick;
  const lockedInEnding = endingCinematicPlaying || (endingSequenceActive && !allowDuringEnding);

  game.stage = dto.stage;
  game.hunger = dto.hunger;
  game.happy = dto.happy;
  game.energy = dto.energy;
  game.sleeping = dto.sleeping;
  game.sick = dto.sick;
  game.dead = dto.dead;
  game.ended = dto.ended;
  game.survivalSeconds = dto.survivalSeconds ?? 0;
  game.lifetimeSickCount = dto.lifetimeSickCount ?? 0;
  game.endingActive = dto.endingActive ?? false;
  game.endingType = dto.endingType ?? null;
  game.endlessMode = dto.endlessMode ?? dto.isEndlessMode ?? false;
  game.sickSeconds = dto.sickSeconds;
  game.eggClickCount = dto.eggClickCount;
  game.poopCount = dto.poopCount;
  game.petType = dto.petType ?? null;

  if (!skipPoopSync && dto.poopCount !== lastPoopCount && !lockedInEnding) {
    syncPoopVisuals(dto.poopCount);
    lastPoopCount = dto.poopCount;
  }

  if (game.endingActive && !prevEndingActive && !endingCinematicPlayed) {
    startEndingSequence(game.endingType || 'normal');
    return;
  }

  if (lockedInEnding) {
    if (game.dead && !prevDead) {
      exitEndingSequence({ resumePolling: false });
      concealEndingOverlay();
      els.screenCanvas.classList.remove('cinematic-mode');
      handleDeathUI();
      return;
    }
    if (game.endingActive && endingCinematicPlayed && !endingCinematicPlaying) {
      ensureEndingOverlayVisible();
    }
    return;
  }

  updateBars();
  updateRegionHeaderVisibility();
  updateRegionMenuVisibility();
  updateSleepMenuLock();
  updateEggVisual();
  updateCharacterSelectOverlay();

  if (game.sick && !prevSick) {
    game.animAction = 'sick';
    showSkulls();
  } else if (!game.sick && prevSick) {
    game.animAction = 'idle';
    clearSkulls();
  }

  if (prevStage === 'egg' && game.stage === 'baby') {
    handleHatchUI();
  }

  if (game.endingActive && endingCinematicPlayed) {
    ensureEndingOverlayVisible();
  }

  if (game.dead && !prevDead) {
    handleDeathUI();
  }

  if (dto.message) {
    spawnPetParticle(dto.message, { topPercent: 4 });
  }

  refreshPetSprite();

  const showHappyEndingBars =
    game.endlessMode || (game.endingActive && game.endingType === 'happy');
  setFinalLoveBars(showHappyEndingBars);

  // === 宝藏功能：Baby阶段隐藏睡眠和吃药按钮 ===
  // 1. 抓取网页上的睡觉按钮和吃药按钮（根据你HTML里的data-action属性来找）
  const sleepBtn = document.querySelector('[data-action="sleep"]');
  // 把原来抓取 medicineBtn 的那行改成这样：
  const medicineBtn = document.querySelector('[data-action="med"]');

  // 2. 判断当前是不是 baby 阶段
  if (game.stage === 'baby') {
    // 如果是婴儿期，直接拔掉网线，彻底隐藏
    if (sleepBtn) sleepBtn.style.display = 'none';
    if (medicineBtn) medicineBtn.style.display = 'none';
  } else {
    // 关键：如果退出了baby阶段（变成了teen或adult），一定要记得把它们放出来！
    if (sleepBtn) sleepBtn.style.display = '';
    if (medicineBtn) medicineBtn.style.display = '';
  }
  
}

async function refreshStatus() {
  try {
    const dto = await apiGet('/status');
    applyServerState(dto);
  } catch (err) {
    console.error('Failed to sync status:', err);
  }
}

function buildSubmenuRows() {
  els.mealRow.innerHTML = '';
  MEALS.forEach((m) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'menu-btn';
    btn.dataset.meal = m.id;
    const img = document.createElement('img');
    img.src = asset(m.src);
    img.alt = m.id;
    img.draggable = false;
    btn.appendChild(img);
    btn.addEventListener('click', () => onMealSelected(m));
    els.mealRow.appendChild(btn);
  });

  els.snackRow.innerHTML = '';
  SNACKS.forEach((s) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'menu-btn';
    btn.dataset.snack = s.id;
    const img = document.createElement('img');
    img.src = asset(s.src);
    img.alt = s.name || s.id;
    img.draggable = false;
    btn.appendChild(img);
    btn.addEventListener('click', () => onSnackSelected(s));
    els.snackRow.appendChild(btn);
  });
}

function spawnFallingFood(src, onLand) {
  const img = document.createElement('img');
  img.className = 'food-falling';
  img.src = asset(src);
  img.draggable = false;
  const stageRect = els.regionStage.getBoundingClientRect();
  const startTop = stageRect.height * 0.01;
  const mouthTop = stageRect.height * 0.2;
  const mouthLeft = stageRect.width * 0.42;
  img.style.left = `${mouthLeft}px`;
  img.style.top = `${startTop}px`;
  els.foodLayer.appendChild(img);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      img.style.top = `${mouthTop}px`;
    });
  });

  schedule(() => {
    img.remove();
    if (onLand) onLand();
  }, 900);
}

async function onMealSelected(meal) {
  if (game.ended || game.dead || game.stage === 'egg'
      || (game.endingActive && !game.endlessMode)) return;
  cancelSubmenu();

  spawnFallingFood(meal.src, async () => {
    game.eatAnimUntil = Date.now() + 2000;
    if (game.stage === 'baby') game.tempAnimUntil = Date.now() + 1500;
    refreshPetSprite();
    try {
      const dto = await apiPost('/feed/meal', { id: meal.id });
      applyServerState(dto);
    } catch (err) {
      console.error(err);
    }
  });
}

async function onSnackSelected(snack) {
  if (game.ended || game.dead || game.stage === 'egg'
      || (game.endingActive && !game.endlessMode)) return;
  cancelSubmenu();

  spawnFallingFood(snack.src, async () => {
    game.eatAnimUntil = Date.now() + 2000;
    if (game.stage === 'baby') game.tempAnimUntil = Date.now() + 1500;
    refreshPetSprite();
    try {
      const dto = await apiPost('/feed/snack', { id: snack.id });
      applyServerState(dto);
    } catch (err) {
      console.error(err);
    }
  });
}

async function onPlaySelected() {
  if (game.ended || game.dead || game.stage === 'egg' || game.sick
      || (game.endingActive && !game.endlessMode)) return;
  cancelSubmenu();

  try {
    const dto = await apiPost('/play');
    if (dto.message) {
      applyServerState(dto);
      return;
    }
    game.playAnimUntil = Date.now() + 2500;
    if (game.stage === 'baby') game.tempAnimUntil = Date.now() + 1500;
    applyServerState(dto);
  } catch (err) {
    console.error(err);
  }
}

function clearSkulls() {
  els.skullOrbit.innerHTML = '';
  els.skullOrbit.hidden = true;
}

function showSkulls() {
  els.skullOrbit.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    const img = document.createElement('img');
    img.className = 'skull';
    img.src = asset('prop_skull.PNG');
    img.alt = '';
    img.draggable = false;
    els.skullOrbit.appendChild(img);
  }
  els.skullOrbit.hidden = false;
}

function showNarrative(text, shine) {
  els.narrativeText.textContent = text;
  els.narrativeOverlay.hidden = false;
  els.narrativeOverlay.classList.toggle('shine', !!shine);
}

function hideNarrative() {
  els.narrativeOverlay.hidden = true;
  els.narrativeOverlay.classList.remove('shine');
}

function showRestartPrompt() {
  hideNarrative();
  els.restartPrompt.hidden = false;
}

function prepareFreshEggUI() {
  clearAllTimers();
  hideNarrative();
  concealEndingOverlay();
  els.restartPrompt.hidden = true;
  els.screenCanvas.classList.remove('overflow-visible', 'cinematic-mode');
  els.petWrap.classList.remove('pet-exit');
  resetEndingSequenceState();
  els.petSprite.className = 'pet-sprite';
  els.poopLayer.innerHTML = '';
  game.poops = [];
  lastPoopCount = 0;
  els.particleLayer.innerHTML = '';
  els.regionStage.querySelectorAll('.pet-particle').forEach((el) => el.remove());
  clearSkulls();
  cancelSubmenu();
  setFinalLoveBars(false);

  game.animAction = 'idle';
  game.animFrame = 1;
  game.submenu = null;
  game.tempAnimUntil = 0;
  game.playAnimUntil = 0;
  game.eatAnimUntil = 0;
  game.petHappyUntil = 0;

  updateEggVisual();
  updateRegionMenuVisibility();
  updateCharacterSelectOverlay();
}

async function restartGame() {
  prepareFreshEggUI();

  try {
    const dto = await apiPost('/restart');
    applyServerState(dto, { skipPoopSync: true });
    startLoops();
  } catch (err) {
    console.error(err);
  }
}

async function onEggClick(e) {
  e.stopPropagation();

  if (!isMusicStarted) {
    isMusicStarted = true;
    playNextTrack();
  }

  if (eggClickInFlight || game.dead || game.ended || game.endingActive || game.stage !== 'egg') return;
  eggClickInFlight = true;
  clearPetParticles();

  try {
    const dto = await apiPost('/egg/click');
    applyServerState(dto);

    if (dto.stage === 'baby') {
      spawnPetParticle('It hatched! ˶˚ᗜ˚˶', { topPercent: 10 });
    } else {
      const remaining = Math.max(0, 3 - (dto.eggClickCount || 0));
      if (remaining > 0) {
        spawnPetParticle(`Tap ${remaining} more…`, { topPercent: 10, duration: 2000 });
      }
    }
  } catch (err) {
    console.error('Egg click failed:', err);
    spawnPetParticle('Waking up the cloud server, please wait a moment... ☁️', { topPercent: 4 });
  } finally {
    eggClickInFlight = false;
  }
}

async function pettingFeedback(e) {
  e.stopPropagation();
  if (game.dead || game.ended || (game.endingActive && !game.endlessMode) || game.sick) return;

  if (game.stage === 'egg') {
    await onEggClick(e);
    return;
  }

  game.petHappyUntil = Date.now() + 1000;
  clearPetParticles();

  const response = pickPettingResponse();
  if (response.type === 'hearts') spawnHeartCluster();
  else spawnPetParticle(response.text);
  refreshPetSprite();
}

function onStageBackgroundClick(e) {
  if (e.target.closest('.pet-sprite, .text-choice, .submenu-row button')) return;
  if (game.sleeping) apiPost('/sleep').then(applyServerState).catch(console.error);
  cancelSubmenu();
}

function startLoops() {
  scheduleAnimFrameLoop();
  if (!endingSequenceActive && !endingCinematicPlaying) {
    resumeStatusPolling();
  }
}

async function init() {
  if (!els.endingOverlay) {
    console.error('[ending] #ending-overlay missing — index.html must match els.endingOverlay');
  } else {
    console.log('[ending] overlay wired:', els.endingOverlay.id, els.endingOverlay === document.getElementById('ending-overlay'));
  }

  buildSubmenuRows();
  applyOverlayMessages();
  prepareFreshEggUI();
  updateCharacterSelectOverlay();

  if (els.gameAudio) {
    els.gameAudio.addEventListener('ended', playNextTrack);
  }
  
  try {
    const dto = await apiPost('/reset');
    applyServerState(dto, { skipPoopSync: true });
    lastPoopCount = dto.poopCount;
    startLoops();
  } catch (err) {
    console.error('Cloud server not reachable. It might be waking up from sleep.', err);
    spawnPetParticle('Server offline! Start Spring Boot.', { topPercent: 4 });
  }

  $$('.menu-btn[data-action]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const action = btn.dataset.action;
      if (game.ended || game.dead || (game.endingActive && !game.endlessMode) || game.stage === 'egg') return;

      if (action === 'feed') {
        setSubmenu('feed');
      } else if (action === 'play') {
        setSubmenu('play');
      } else if (action === 'sleep') {
        try {
          const dto = await apiPost('/sleep');
          game.animAction = dto.sleeping ? 'sleep' : 'idle';
          applyServerState(dto);
        } catch (err) {
          console.error(err);
        }
      } else if (action === 'med' && game.sick) {
        try {
          const dto = await apiPost('/med');
          game.animAction = 'idle';
          applyServerState(dto);
        } catch (err) {
          console.error(err);
        }
      } else if (action === 'clean') {
        try {
          const dto = await apiPost('/clean');
          removeOldestPoopVisual();
          applyServerState(dto, { skipPoopSync: true });
          lastPoopCount = dto.poopCount;
        } catch (err) {
          console.error(err);
        }
      }
    });
  });

  $$('[data-feed-branch]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const branch = btn.dataset.feedBranch;
      if (branch === 'meal') setSubmenu('feed-meal');
      else setSubmenu('feed-snack');
    });
  });

  els.feedCancel.addEventListener('click', cancelSubmenu);
  $('#feed-icons-cancel').addEventListener('click', cancelSubmenu);
  $('#play-icons-cancel').addEventListener('click', cancelSubmenu);

  $$('.play-choice').forEach((btn) => {
    btn.addEventListener('click', onPlaySelected);
  });

  els.regionStage.addEventListener('click', onStageBackgroundClick);
  els.petSprite.addEventListener('click', pettingFeedback);
  els.petWrap.addEventListener('click', (e) => {
    if (game.stage !== 'egg' || e.target.closest('.pet-sprite')) return;
    onEggClick(e);
  });
  els.restartPrompt.addEventListener('click', restartGame);

  els.endingStayBtn.addEventListener('click', async () => {
    concealEndingOverlay();
    els.screenCanvas.classList.remove('cinematic-mode');
    exitEndingSequence({ resumePolling: false });
    game.animAction = 'idle';
    game.animFrame = 1;
    refreshPetSprite();
    try {
      const dto = await apiPost('/happy-ending/continue');
      applyServerState(dto, { allowDuringEnding: true });
      updateRegionMenuVisibility();
      resumeStatusPolling();
    } catch (err) {
      console.error(err);
      resumeStatusPolling();
    }
  });

  els.endingRestartBtn.addEventListener('click', async () => {
    concealEndingOverlay();
    exitEndingSequence({ resumePolling: false });
    await restartGame();
  });

  els.closeBtn.addEventListener('click', () => {
    els.farewellOverlay.hidden = false;
    schedule(() => window.close(), 1500);
  });

  function onCharacterSelected(type) {
    game.petType = type;
    apiPost('/select-character', { type: game.petType })
      .then(() => {
        updateUI();
        refreshPetSprite();
        spawnEggLaunchGreeting();
      })
      .catch((err) => {
        console.error('Character selection failed:', err);
        updateUI();
        refreshPetSprite();
        spawnEggLaunchGreeting();
      });
  }

  els.selectH?.addEventListener('click', () => onCharacterSelected('h'));
  els.selectD?.addEventListener('click', () => onCharacterSelected('d'));
}

document.addEventListener('DOMContentLoaded', init);
