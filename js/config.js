// 전역 상수·공용 유틸·색 토큰
'use strict';

// ── 레이아웃: 위 110px는 전투, 아래는 벽돌판. 저해상도로 그린 뒤 CSS로 키워 도트 느낌을 낸다
const W = 180, H = 340, BT = 110, FLOOR = 330;
const COLS = 7, CW = 24, OX = 6, RIGHT = OX + COLS * CW, ROWH = 14, BRH = 12, MAXROW = 11;
const CRASH_Y = BT + 4 + MAXROW * ROWH - 1;
const PX = 44, MX = 136, BALL_SPEED = 300;
const AIM_MIN = -Math.PI + 0.22, AIM_MAX = -0.22;   // 너무 눕힌 각도는 벽만 타므로 뺀다
const $ = id => document.getElementById(id);
const cv = $('cv'), ctx = cv.getContext('2d');
// 백버퍼는 RES배: 게임 좌표·판정은 180×340 그대로 두고, 일러스트(assets/game)만 세밀하게 그리려고 늘렸다.
// 도트 글자·아이콘은 논리 좌표에 반올림해 그리므로 RES배 블록으로 찍힌다.
// RES를 고정하면 화면 폭에 따라 확대 배율이 1.4배처럼 정수가 아니게 되고, 최근접 확대에서 도트 굵기가 칸마다 달라진다.
// 그래서 표시 크기(기기 픽셀)를 덮는 가장 작은 정수배로 맞추고, 남는 1배 미만은 부드럽게 축소해 굵기를 고르게 한다
let RES = 4;
function fitCanvas(){
  const dpr = (typeof devicePixelRatio === 'number' && devicePixelRatio > 0) ? devicePixelRatio : 1;
  const px = (cv.clientWidth || W) * dpr;
  // 0.05 여유: 테두리 반올림으로 6.01배처럼 살짝 넘칠 때 한 단계 큰 배율(=더 많이 축소)로 튀지 않게
  const n = clamp(Math.ceil(px / W - 0.05), 2, 8);
  if (n !== RES || cv.width !== W * n){ RES = n; cv.width = W * n; cv.height = H * n; }
}
cv.width = W * RES; cv.height = H * RES;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// ── 난수. 게임 결과를 바꾸는 뽑기는 원정 시드에서 나온 흐름(s)을 쓴다:
//   'map'    세션 지도(genMap 안에서만, 시드·세션으로 정해진다)
//   'reward' 보상·상점·강화·코인(원정 내내 이어지고 RUN.rng에 저장된다. 새로고침으로 다시 뽑지 못하게)
//   'battle' 전투(전투마다 시드·세션·칸으로 새로 정한다. 새로고침해도 같은 판, 앞 전투의 구슬 물리가 다음 판을 바꾸지 않게)
// s를 주지 않으면 Math.random: 파티클·흔들림 같은 연출용. 연출을 바꿔도 지도·보상·전투 결과가 그대로여야 한다
const RNG = { map:null };
function mulberry(o, k){
  let t = o[k] = (o[k] + 0x6D2B79F5) >>> 0;
  t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61);
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
}
function rand(s){
  // 흐름 상태가 없으면(시드 없는 원정이 될 수 없는 경로의 방어) Math.random으로 대신한다
  const o = s === 'reward' ? RUN && RUN.rng : s === 'battle' ? G : s === 'map' ? RNG : null, k = s === 'battle' ? 'rs' : s;
  return o && typeof o[k] === 'number' ? mulberry(o, k) : Math.random();
}
// 시드와 위치(흐름 이름·세션·칸)를 섞어 흐름의 시작값을 만든다(FNV-1a)
const seedOf = (...xs) => { let h = 0x811C9DC5; for (const ch of xs.join(':')) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0; return h; };
const rnd = (n, s) => Math.floor(rand(s) * n);
const pickOne = (a, s) => a[rnd(a.length, s)];
const shuffle = (a, s) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--){ const j = rnd(i + 1, s); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const rowY = r => BT + 4 + r * ROWH;
function pickW(w, s){ let x = rand(s) * Object.values(w).reduce((a, b) => a + b, 0); for (const k in w){ x -= w[k]; if (x < 0) return k; } return Object.keys(w)[0]; }

// 화면 테마: 자동(기기 설정)·밝게·어둡게. CSS는 html[data-theme]로 토큰을 바꾸므로, 색을 읽기 전에 먼저 붙인다
const THEME_KEY = 'brickquest:theme:v1', THEMES = ['auto', 'light', 'dark'];
let THEME = 'auto';
try { const t = localStorage.getItem(THEME_KEY); if (THEMES.includes(t)) THEME = t; } catch(e){}
function applyTheme(){
  const el = document.documentElement;
  if (!el || !el.setAttribute) return;   // 시뮬레이터의 가짜 DOM
  if (THEME === 'auto') el.removeAttribute('data-theme'); else el.setAttribute('data-theme', THEME);
}
applyTheme();

const C = {};
function readColors(){
  const s = getComputedStyle(document.documentElement);
  ['bg','panel','field','ink','ink2','ink3','line','accent'].forEach(k => C[k] = s.getPropertyValue('--' + k).trim());
}
readColors();
try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', readColors); } catch(e){}
