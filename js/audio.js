// 사운드: Web Audio로 칩튠 효과음·BGM을 즉석 합성한다
'use strict';

// 음원 파일 없이 코드로 만든다. 이유: 저장소 밖 리소스 금지, file://에서 fetch가 막힘, 도트 그래픽과 질감을 맞추려고.
// 브라우저는 사용자 입력 전에는 소리를 막으므로, 첫 탭/키 입력에서 AudioContext를 만든다(unlockAudio).
// 시뮬레이터(Node)에는 AudioContext가 없어 모든 함수가 아무 일도 하지 않는다.

// ── 설정: BGM과 효과음을 따로 끈다(음악만 끄고 타격감은 남길 수 있게)
const AUDIO_KEY = 'brickquest:audio:v1';
let AUDIO = { bgm:true, sfx:true };
try { const a = JSON.parse(localStorage.getItem(AUDIO_KEY)); if (a && typeof a.bgm === 'boolean' && typeof a.sfx === 'boolean') AUDIO = a; } catch(e){}
function saveAudio(){ try { localStorage.setItem(AUDIO_KEY, JSON.stringify(AUDIO)); } catch(e){} }

let actx = null, master = null, bgmBus = null, sfxBus = null, noiseBuf = null;
function unlockAudio(){
  if (actx){ if (actx.state === 'suspended') actx.resume().catch(() => {}); return; }
  const AC = typeof AudioContext !== 'undefined' ? AudioContext : typeof webkitAudioContext !== 'undefined' ? webkitAudioContext : null;
  if (!AC) return;
  try {
    actx = new AC();
    // 분열 구슬처럼 소리가 겹칠 때 찢어지지 않게 마지막에 압축기를 둔다
    const comp = actx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 6; comp.connect(actx.destination);
    master = actx.createGain(); master.gain.value = 0.8; master.connect(comp);
    bgmBus = actx.createGain(); bgmBus.gain.value = AUDIO.bgm ? 0.32 : 0; bgmBus.connect(master);
    sfxBus = actx.createGain(); sfxBus.gain.value = AUDIO.sfx ? 0.6 : 0; sfxBus.connect(master);
    noiseBuf = actx.createBuffer(1, actx.sampleRate, actx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    if (bgmWant) startSong(bgmWant);
  } catch(e){ actx = null; }
}
function setAudio(k, on){
  AUDIO[k] = on; saveAudio();
  if (!actx) return;
  const bus = k === 'bgm' ? bgmBus : sfxBus, v = on ? (k === 'bgm' ? 0.32 : 0.6) : 0;
  bus.gain.setTargetAtTime(v, actx.currentTime, 0.05);
}
// 탭이 숨으면 멈춘다(배터리·다른 탭 소리와 겹침 방지)
try { document.addEventListener('visibilitychange', () => { if (!actx) return; document.hidden ? actx.suspend().catch(() => {}) : actx.resume().catch(() => {}); }); } catch(e){}

// ── 합성 기본기
const midiHz = n => 440 * Math.pow(2, (n - 69) / 12);
// 음 하나: 짧게 올라갔다가 지수적으로 사라진다. slide가 있으면 끝 주파수로 미끄러진다
function tone(dest, t, { f, wave = 'square', dur = 0.1, vol = 0.3, slide = 0, a = 0.004 }){
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = wave; o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.02);
}
// 잡음: 터짐·바삭함·북. filter로 높낮이를 정한다
function noise(dest, t, { dur = 0.08, vol = 0.3, type = 'highpass', freq = 1000, sweep = 0 }){
  const s = actx.createBufferSource(), fl = actx.createBiquadFilter(), g = actx.createGain();
  s.buffer = noiseBuf; fl.type = type; fl.frequency.setValueAtTime(freq, t);
  if (sweep) fl.frequency.exponentialRampToValueAtTime(sweep, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl); fl.connect(g); g.connect(dest); s.start(t); s.stop(t + dur + 0.02);
}
const arp = (dest, t, notes, step, o) => notes.forEach((n, i) => tone(dest, t + i * step, Object.assign({ f:midiHz(n) }, o)));

// ── 효과음
// 같은 소리가 한 프레임에 몰리면(분열·폭탄) 시끄럽기만 하다. 이름별로 최소 간격을 둔다
const sfxLast = {};
function sfx(name, opt){
  if (!actx || !AUDIO.sfx || !SFX[name]) return;
  const now = actx.currentTime;
  if (now - (sfxLast[name] || 0) < (SFX_GAP[name] || 0.025)) return;
  sfxLast[name] = now;
  try { SFX[name](sfxBus, now, opt || {}); } catch(e){}
}
const SFX_GAP = { brick:0.03, crack:0.03, mhit:0.05 };
// 구슬별 손맛: 벽돌에 부딪는 소리(파형·높이)와 천장 타격 소리가 다르다
const ORB_SND = {
  basic: { wave:'square',   base:72 },
  bomb:  { wave:'square',   base:64 },
  drill: { wave:'sawtooth', base:76 },
  guard: { wave:'triangle', base:84 },
  split: { wave:'triangle', base:79 },
  venom: { wave:'sine',     base:70 },
  heavy: { wave:'square',   base:55 },
};
const SFX = {
  // 발사: 짧게 올라가는 "퓽"
  fire:(d, t, { orb }) => { const s = ORB_SND[orb] || ORB_SND.basic; tone(d, t, { f:midiHz(s.base - 12), slide:midiHz(s.base + 5), wave:s.wave, dur:0.09, vol:0.18 }); },
  // 벽돌 충돌: 같은 구슬이 연달아 맞힐수록 반음씩 올라가 콤보가 귀로 들린다(최대 한 옥타브)
  brick:(d, t, { orb, combo = 0, broke }) => {
    const s = ORB_SND[orb] || ORB_SND.basic, n = s.base + Math.min(12, combo);
    if (orb === 'drill'){ tone(d, t, { f:midiHz(n + 7), slide:midiHz(n - 12), wave:'sawtooth', dur:0.07, vol:0.16 }); noise(d, t, { dur:0.05, vol:0.12, freq:3000 }); return; }
    if (orb === 'venom'){ tone(d, t, { f:midiHz(n), slide:midiHz(n - 9), wave:'sine', dur:0.09, vol:0.32 }); tone(d, t + 0.04, { f:midiHz(n + 5), slide:midiHz(n - 4), wave:'sine', dur:0.06, vol:0.2 }); }
    else if (orb === 'heavy'){ tone(d, t, { f:midiHz(n), slide:midiHz(n - 12), wave:'square', dur:0.12, vol:0.26 }); noise(d, t, { dur:0.07, vol:0.18, type:'lowpass', freq:900 }); }
    else if (orb === 'guard'){ tone(d, t, { f:midiHz(n), wave:'triangle', dur:0.14, vol:0.3 }); tone(d, t, { f:midiHz(n + 19), wave:'sine', dur:0.1, vol:0.08 }); }
    else tone(d, t, { f:midiHz(n), wave:s.wave, dur:0.06, vol:0.2 });
    if (broke) noise(d, t + 0.01, { dur:0.06, vol:0.14, type:'bandpass', freq:2200 });
  },
  // 단단한 돌: 둔탁하게
  stone:(d, t) => { tone(d, t, { f:110, slide:70, wave:'square', dur:0.08, vol:0.2 }); noise(d, t, { dur:0.05, vol:0.15, type:'lowpass', freq:600 }); },
  // 폭탄: 낮은 "쿵" + 걸러지며 사라지는 폭발 잡음
  boom:(d, t) => { tone(d, t, { f:140, slide:35, wave:'sine', dur:0.35, vol:0.6 }); noise(d, t, { dur:0.4, vol:0.45, type:'lowpass', freq:3000, sweep:200 }); },
  // 천장 타격: 이 게임의 핵심 손맛이라 가장 밝고 크게. 구슬마다 화음이 다르다
  ceil:(d, t, { orb, n = 0 }) => {
    const up = n * 2;   // 같은 구슬의 2·3번째 타격은 한 음씩 높게
    if (orb === 'heavy'){ arp(d, t, [55 + up, 62 + up, 67 + up], 0.045, { wave:'square', dur:0.16, vol:0.3 }); tone(d, t, { f:90, slide:40, wave:'sine', dur:0.3, vol:0.55 }); noise(d, t, { dur:0.15, vol:0.25, type:'lowpass', freq:1500 }); return; }
    if (orb === 'venom'){ arp(d, t, [67 + up, 70 + up, 74 + up], 0.04, { wave:'square', dur:0.1, vol:0.3 }); tone(d, t + 0.1, { f:midiHz(86), slide:midiHz(70), wave:'sine', dur:0.18, vol:0.25 }); return; }
    const s = ORB_SND[orb] || ORB_SND.basic;
    arp(d, t, [72 + up, 76 + up, 79 + up, 84 + up], 0.035, { wave:s.wave === 'sawtooth' ? 'square' : s.wave, dur:0.11, vol:0.34 });
    noise(d, t, { dur:0.05, vol:0.16, freq:5000 });
  },
  // 몬스터가 맞음 / 쓰러짐
  mhit:(d, t, { big }) => { noise(d, t, { dur:big ? 0.14 : 0.08, vol:big ? 0.35 : 0.22, type:'bandpass', freq:big ? 700 : 1200 }); tone(d, t, { f:big ? 160 : 220, slide:80, wave:'square', dur:0.08, vol:0.15 }); },
  kill:(d, t) => { arp(d, t, [76, 72, 67, 60, 55], 0.06, { wave:'square', dur:0.12, vol:0.24 }); noise(d, t + 0.1, { dur:0.4, vol:0.3, type:'lowpass', freq:2000, sweep:150 }); },
  // 기사가 맞음: 낮고 거친 소리(위험)
  hurt:(d, t) => { tone(d, t, { f:180, slide:60, wave:'sawtooth', dur:0.18, vol:0.3 }); noise(d, t, { dur:0.12, vol:0.25, type:'lowpass', freq:1200 }); },
  block:(d, t) => tone(d, t, { f:midiHz(88), wave:'triangle', dur:0.12, vol:0.22 }),
  // 강화 벽돌이 기사에게 도착: 공격·방어·체력·독이 각각 다르게
  pickup:(d, t, { kind }) => {
    if (kind === 'atk') arp(d, t, [72, 79], 0.05, { wave:'square', dur:0.08, vol:0.18 });
    else if (kind === 'def') arp(d, t, [76, 83], 0.05, { wave:'triangle', dur:0.1, vol:0.24 });
    else if (kind === 'heal') arp(d, t, [72, 76, 79, 84], 0.04, { wave:'sine', dur:0.12, vol:0.24 });
    else tone(d, t, { f:midiHz(62), slide:midiHz(50), wave:'sine', dur:0.2, vol:0.3 });
  },
  // 성벽 하강·붕괴
  wall:(d, t) => { tone(d, t, { f:75, slide:50, wave:'sine', dur:0.22, vol:0.35 }); noise(d, t, { dur:0.2, vol:0.3, type:'lowpass', freq:600 }); },
  crumble:(d, t) => { noise(d, t, { dur:0.35, vol:0.35, type:'lowpass', freq:900, sweep:120 }); tone(d, t, { f:90, slide:45, wave:'square', dur:0.25, vol:0.2 }); },
  // 보스 등장: 낮은 울림 위로 반음씩 내려오는 불길한 음. 분노(2페이즈)는 더 높고 날카롭게
  boss:(d, t) => {
    tone(d, t, { f:midiHz(26), wave:'sawtooth', dur:1.4, vol:0.35, a:0.2 });
    tone(d, t, { f:midiHz(33), wave:'sawtooth', dur:1.4, vol:0.2, a:0.2 });
    arp(d, t + 0.15, [62, 61, 60, 59, 50], 0.18, { wave:'square', dur:0.22, vol:0.22 });
    noise(d, t, { dur:1.2, vol:0.12, type:'lowpass', freq:300 });
  },
  rage:(d, t) => { arp(d, t, [50, 56, 62, 68, 74], 0.05, { wave:'sawtooth', dur:0.14, vol:0.22 }); noise(d, t, { dur:0.5, vol:0.25, type:'bandpass', freq:500, sweep:3000 }); },
  // 승리·패배
  win:(d, t) => arp(d, t, [72, 76, 79, 84, 79, 84], 0.08, { wave:'square', dur:0.14, vol:0.22 }),
  lose:(d, t) => arp(d, t, [67, 63, 60, 55, 51], 0.16, { wave:'triangle', dur:0.3, vol:0.3 }),
  // 상점: 문 종 + 동전 / 구매: "찰랑"
  shop:(d, t) => { arp(d, t, [84, 88, 91], 0.07, { wave:'triangle', dur:0.25, vol:0.22 }); arp(d, t + 0.25, [96, 100], 0.05, { wave:'square', dur:0.08, vol:0.1 }); },
  coin:(d, t) => arp(d, t, [88, 95], 0.06, { wave:'square', dur:0.12, vol:0.16 }),
  // 휴식: 모닥불이 타닥이고 따뜻한 화음 / 회복: 올라가는 화음
  rest:(d, t) => {
    arp(d, t, [60, 64, 67, 72], 0.12, { wave:'triangle', dur:0.6, vol:0.18, a:0.03 });
    for (let k = 0; k < 7; k++) noise(d, t + 0.05 + k * 0.11 + Math.random() * 0.05, { dur:0.03, vol:0.12, type:'bandpass', freq:2500 + Math.random() * 2000 });
  },
  heal:(d, t) => arp(d, t, [64, 67, 72, 76, 79], 0.07, { wave:'sine', dur:0.25, vol:0.26 }),
  // UI: 고르기
  pick:(d, t) => tone(d, t, { f:midiHz(79), wave:'square', dur:0.05, vol:0.12 }),
};

// ── BGM: 16분음표 단위 시퀀서. 악보는 토큰 문자열: 음이름(A4·C#5·Bb1) = 새 음, '-' = 늘임, '.' = 쉼
// 드럼은 k(킥)·s(스네어)·h(하이햇)
function score(str){
  const toks = str.trim().split(/\s+/), ev = [];
  const NAME = { C:0, D:2, E:4, F:5, G:7, A:9, B:11 };
  toks.forEach((tk, i) => {
    if (tk === '-'){ if (ev.length && ev[ev.length - 1].end === i) ev[ev.length - 1].end = i + 1; return; }
    if (tk === '.') return;
    const m = /^([A-G])([#b]?)(-?\d)$/.exec(tk);
    if (m) ev.push({ at:i, end:i + 1, n:NAME[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (+m[3] + 1) * 12 });
    else ev.push({ at:i, end:i + 1, drum:tk });
  });
  return { len:toks.length, ev };
}
// 메인·지도: 느긋한 가단조. 드럼 없이
// 전투: 경쾌한 가단조, 킥·스네어
// 보스: 빠르고 낮은 라단조, 톱니파 베이스와 몰아치는 북
const SONGS = {
  calm:{ bpm:84, parts:[
    { wave:'triangle', vol:0.22, s:score(`
      A4 - - - C5 - E5 - D5 - C5 - - - . .   A4 - - - F4 - A4 - C5 - - - . . . .
      G4 - - - E4 - G4 - C5 - D5 - E5 - - -   D5 - - - B4 - G4 - . . . . . . . .`) },
    { wave:'sine', vol:0.3, s:score(`
      A2 - - - - - - - E2 - - - - - - -   F2 - - - - - - - C3 - - - - - - -
      C3 - - - - - - - G2 - - - - - - -   G2 - - - - - - - D3 - - - - - - -`) },
  ]},
  battle:{ bpm:132, parts:[
    { wave:'square', vol:0.12, s:score(`
      A4 . A4 . C5 . A4 . E5 - D5 - C5 . B4 .   A4 . A4 . C5 . E5 . G5 - E5 - D5 - . .
      F5 . E5 . D5 . C5 . D5 - C5 - B4 . G4 .   A4 - - - E4 - - - A4 . B4 . C5 - E5 -`) },
    { wave:'triangle', vol:0.3, s:score(`
      A2 . A3 . A2 . A3 . A2 . A3 . A2 . A3 .   C3 . C4 . C3 . C4 . G2 . G3 . G2 . G3 .
      F2 . F3 . F2 . F3 . G2 . G3 . G2 . G3 .   E2 . E3 . E2 . E3 . E2 . E3 . G#2 . G#3 .`) },
    { drum:true, vol:0.5, s:score(`
      k . h . s . h . k . h k s . h .   k . h . s . h . k . h k s . h .
      k . h . s . h . k . h k s . h .   k . h . s . h . k . h k s s h s`) },
  ]},
  boss:{ bpm:150, parts:[
    { wave:'square', vol:0.12, s:score(`
      D5 - - - . . D5 . F5 - E5 - D5 - C#5 -   D5 - - - . . A4 . Bb4 - A4 - G4 - A4 -
      D5 - - - . . D5 . F5 - G5 - A5 - Bb5 -   A5 - - - G5 - F5 - E5 - C#5 - A4 - - -`) },
    { wave:'sawtooth', vol:0.16, s:score(`
      D2 . D2 . D3 . D2 . D2 . D2 . D3 . D2 .   Bb1 . Bb1 . Bb2 . Bb1 . C2 . C2 . C3 . C2 .
      D2 . D2 . D3 . D2 . D2 . D2 . D3 . D2 .   A1 . A1 . A2 . A1 . A1 . C#2 . E2 . A2 .`) },
    { drum:true, vol:0.55, s:score(`
      k . h k s . h . k k h . s . h s   k . h k s . h . k k h . s . h s
      k . h k s . h . k k h . s . h s   k . k . s . k . k k s . s s s s`) },
  ]},
};
function drum(dest, t, kind, vol){
  if (kind === 'k') tone(dest, t, { f:130, slide:40, wave:'sine', dur:0.13, vol:vol });
  else if (kind === 's') noise(dest, t, { dur:0.1, vol:vol * 0.5, type:'bandpass', freq:1800 });
  else if (kind === 'h') noise(dest, t, { dur:0.03, vol:vol * 0.25, freq:7000 });
}

// 재생 중인 곡: 앞을 조금씩 내다보며 음을 예약한다(setInterval은 부정확해서 실제 시각은 AudioContext 기준)
let bgmWant = null, song = null;
function bgm(name){
  if (bgmWant === name) return;
  bgmWant = name;
  if (actx) startSong(name);
}
function startSong(name){
  if (song){
    const old = song; clearInterval(old.timer);
    old.gain.gain.setTargetAtTime(0.0001, actx.currentTime, 0.12);
    setTimeout(() => { try { old.gain.disconnect(); } catch(e){} }, 800);
    song = null;
  }
  const def = SONGS[name]; if (!def) return;
  const g = actx.createGain(); g.gain.value = 1; g.connect(bgmBus);
  const s = { def, gain:g, step:0, next:actx.currentTime + 0.08, spb:60 / def.bpm / 4 };
  s.timer = setInterval(() => schedule(s), 25);
  song = s; schedule(s);
}
function schedule(s){
  if (!actx || actx.state !== 'running') { if (actx) s.next = Math.max(s.next, actx.currentTime + 0.05); return; }
  while (s.next < actx.currentTime + 0.12){
    for (const p of s.def.parts){
      const i = s.step % p.s.len;
      for (const e of p.s.ev) if (e.at === i){
        if (p.drum) drum(s.gain, s.next, e.drum, p.vol);
        else tone(s.gain, s.next, { f:midiHz(e.n), wave:p.wave, dur:(e.end - e.at) * s.spb * 0.95, vol:p.vol, a:0.01 });
      }
    }
    s.step++; s.next += s.spb;
  }
}
