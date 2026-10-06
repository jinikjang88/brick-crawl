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
const rnd = n => Math.floor(Math.random() * n);
const pickOne = a => a[rnd(a.length)];
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--){ const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const rowY = r => BT + 4 + r * ROWH;
function pickW(w){ let x = Math.random() * Object.values(w).reduce((a, b) => a + b, 0); for (const k in w){ x -= w[k]; if (x < 0) return k; } return Object.keys(w)[0]; }

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
