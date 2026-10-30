// 이야기 보여 주기: 대사 장면(FULL, 한 줄씩 넘김)과 무전 띠(RADIO, 전투를 막지 않음). 데이터는 js/story.js
'use strict';

// ── 대사 장면: 화면 전체를 덮고 한 줄씩 넘긴다. 건너뛰기는 늘 보이는 버튼(길게 누르기 같은 숨은 조작은 아무도 모른다, 리뷰 S9)
// TALK = { ids:[장면들], k:지금 장면, i:지금 줄, next:끝나면 부를 것, lock:이 시각 전에는 넘기지 않음 }
let TALK = null;
const LOG_KEEP = 3;   // 위로 흐리게 남기는 앞 줄 수: 앞뒤 맥락은 남기되 한 화면에 다 들어오게
const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
// 연출은 소리·움직임만 바꾼다(게임 결과와 무관)
function talkCue(cue, el){
  if (!cue) return;
  if (cue.sfx) sfx(cue.sfx);
  if (cue.bgm) bgm(cue.bgm === 'off' ? null : cue.bgm);
  if (cue.wait) TALK.lock = nowMs() + cue.wait * 1000;
  if (cue.lcd){ const l = $('tLcd'); l.hidden = false; l.textContent = '';
    cue.lcd.forEach(s => { const sp = document.createElement('span'); sp.textContent = s || ' '; l.append(sp); }); }
  if (el && el.classList){
    if (cue.flash){ el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
    if (cue.shake){ el.classList.remove('quake'); void el.offsetWidth; el.classList.add('quake'); }
  }
}
// 한 줄을 DOM으로: 초상(있으면) + 이름 + 대사. 적대(hot)는 붉은 테로만 표시한다(붉은 글자는 다크 모드 대비가 AA에 못 미친다)
function lineEl(line, tag = 'li'){
  const [who, text, emo] = line, sp = SPEAKER[who] || SPEAKER.note;
  const li = document.createElement(tag);
  li.className = 'tLine' + (who === 'note' ? ' note' : '') + (sp.mono ? ' mono' : '') + (sp.hot ? ' hot' : '') + (emo ? ' e-' + emo : '');
  if (sp.face){
    const im = document.createElement('img'); im.className = 'face'; im.alt = ''; im.setAttribute('aria-hidden', 'true');
    im.src = 'assets/game/face_' + sp.face + '.png'; im.onerror = () => im.remove(); li.append(im);
  }
  const body = document.createElement('div');
  if (sp.name){ const b = document.createElement('b'); b.textContent = sp.name; body.append(b); }
  const p = document.createElement('p'); p.textContent = text; body.append(p);
  li.append(body);
  return li;
}
function talkShow(){
  const sc = SCRIPT[TALK.ids[TALK.k]], line = sc.lines[TALK.i];
  $('tTitle').textContent = sc.title || '';
  const log = $('tLog');
  if (TALK.i === 0){ log.textContent = ''; $('tLcd').hidden = true; }
  const el = lineEl(line);
  log.append(el);
  while (log.removeChild && log.children && log.children.length > LOG_KEEP + 1) log.removeChild(log.children[0]);
  // 울컥: 마지막 어절에서 잠깐 멈춘다(바로 넘기지 못하게)
  TALK.lock = line[2] === 'choke' ? nowMs() + 300 : 0;
  if (line[2] === 'noise') sfx('radio_static');
  talkCue(line[3], $('ovTalk'));
  const last = TALK.i === sc.lines.length - 1 && TALK.k === TALK.ids.length - 1;
  $('tNext').textContent = last ? '계속' : '다음';
}
// 장면 여러 개를 이어서. 이미 본 장면도 그대로 다시 보여 준다(보여 줄지는 storyOnce가 정한다)
function playScenes(ids, next){
  ids = ids.filter(id => hasKey(SCRIPT, id) && !SCRIPT[id].radio);
  if (!ids.length) return next();
  radioClear();
  TALK = { ids, k:0, i:0, next, lock:0 };
  setHeader('', '');
  setMode('story', 'ovTalk');
  talkShow();
  $('tNext').focus();
}
function talkNext(){
  if (!TALK || mode !== 'story' || nowMs() < TALK.lock) return;
  const sc = SCRIPT[TALK.ids[TALK.k]];
  if (++TALK.i < sc.lines.length) return talkShow();
  if (++TALK.k < TALK.ids.length){ TALK.i = 0; return talkShow(); }
  talkEnd();
}
// 건너뛰기는 이어진 장면 전체를 건너뛴다(한 번 눌러 바로 게임으로)
function talkEnd(){
  if (!TALK) return;
  const next = TALK.next; TALK = null; next();
}
$('tNext').onclick = e => { if (e && e.stopPropagation) e.stopPropagation(); talkNext(); };
$('tSkip').onclick = e => { if (e && e.stopPropagation) e.stopPropagation(); if (mode === 'story') talkEnd(); };
// 화면 어디를 눌러도 다음 줄(버튼은 위에서 전파를 막는다)
$('ovTalk').onclick = () => talkNext();

// 처음 한 번만 대사 장면으로, 이미 봤으면 다시 왔을 때의 짧은 무전(again)만 흘리고 바로 다음으로
function storyOnce(ids, next){
  ids = [].concat(ids);
  const fresh = ids.filter(id => !META.story[id]);
  for (const id of ids) if (META.story[id] && SCRIPT[id] && SCRIPT[id].again) radioSay(SCRIPT[id].again);
  if (!fresh.length) return next();
  for (const id of fresh) META.story[id] = 1;
  saveMeta();
  playScenes(fresh, next);
}
// 무전 장면(radio:true): 처음 한 번은 전부, 다음부터는 again만(없으면 조용히)
function radioOnce(id){
  const sc = SCRIPT[id]; if (!sc) return;
  if (!META.story[id]){ META.story[id] = 1; saveMeta(); radioSay(sc.lines); }
  else if (sc.again) radioSay(sc.again);
}
// 아카이브에 다시 읽기용 글: 이름: 대사를 이어 붙인다
const sceneText = id => SCRIPT[id].lines.map(([who, t]) => (SPEAKER[who] && SPEAKER[who].name ? SPEAKER[who].name + ': ' : '') + t).join(' ');

// ── 무전 띠: 구슬 줄 위에 겹쳐 뜬다(전투판의 천장·버그 예고를 가리지 않게, 리뷰 S7). 입력을 막지 않고 저절로 넘어간다
const RADIO = { q:[], h:0 };
const RADIO_MS = 2600;
function radioSay(lines){
  if (!lines || !lines.length) return;
  RADIO.q.push(...lines);
  if (!RADIO.h) radioStep();
}
function radioStep(){
  clearTimeout(RADIO.h); RADIO.h = 0;
  const box = $('radio'); if (!box) return;
  const line = RADIO.q.shift();
  if (!line){ box.hidden = true; box.textContent = ''; return; }
  box.textContent = ''; box.append(lineEl(line, 'div')); box.hidden = false;
  if (line[2] === 'noise') sfx('radio_static');
  RADIO.h = setTimeout(radioStep, RADIO_MS) || 1;
}
function radioClear(){ RADIO.q = []; clearTimeout(RADIO.h); RADIO.h = 0; const box = $('radio'); if (box){ box.hidden = true; box.textContent = ''; } }
$('radio').onclick = () => radioStep();
// 반복 풀에서 하나. 연출이라 Math.random(게임 난수 흐름을 쓰지 않는다)
const barkPick = a => a[Math.floor(Math.random() * a.length)];
