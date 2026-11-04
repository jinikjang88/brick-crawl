# 작업 07 — 사이버펑크 화면 정리 (터미널·배경·UI 프레임)

상태: **기획 결정 대기**(2026-11-04 검토). 아래 "결정할 것"이 정해지기 전에는 코드·에셋을 바꾸지 않는다.

시나리오 v6.0(〈브릭 크롤: 마지막 번개〉, [`docs/SCENARIO.md`](../SCENARIO.md))과 #45의 사이버펑크 캐릭터·보스·초상화는 들어왔지만,
터미널(첫 화면)과 공용 배경·UI 프레임은 2026-10-06(#10) 중세 던전 에셋 그대로라 화면 톤이 어긋난다.

## 1. 검토 결과 (main `c98f358`, 390×844 라이트·다크 캡처)

| # | 요소 | 현재 | 쓰는 곳 |
|---|---|---|---|
| 1 | 공용 배경 `assets/game/dungeon.png` | 고딕 성당 아치·코린트 기둥·석판 바닥(#10 이후 그대로) | 전투 `drawBgArt()`(`js/art.js`), 브로커·충전소 `js/scene.js`, 지도 `.ovMap::before`, 일시정지·순위표·모듈·선택·아카이브 `::before` |
| 2 | 터미널 화면(`.ovMain`) | 배경 그림 없음. 베이지 `--field` + `6px double` 이중 테두리 = 고문서 느낌 | `css/style.css` `.ovMain` |
| 3 | 버튼·패널 프레임 | `ui_bar.png` 금박 장식 프레임("새 접속"), `ui_panel.png` 양피지, `ui_frame.png` | `.btn.primary`·`.btn.hero`·`.banner .b2`·`.rCard`·`.board li`·`.orbCurrent` |
| 4 | 터미널 구슬 진열 5종 | `drill`·`guard`·`basic`·`bomb`·`heavy`는 옛 `collection.png`(황동·방패 문장·도화선 폭탄) | `showMain()`(`js/screens.js`) |
| 5 | 프롬프트 | 6.1 전투 배경(`chasm.png`)은 아직 생성 전이고, 프롬프트 자체가 `aged brass, weathered concrete beige … no neon colors`라 폐허 벙커가 나온다. 4.1 구슬·6.2 벽돌·6.3 브로커·6.4 히터·6.5 아이콘에도 `aged brass`가 남아 있다 | `docs/ASSET_PROMPTS.md` |
| 6 | 다크 토큰 | `--bg:#1D1B18` 등 따뜻한 갈색 무채색 → 세피아로 읽힌다 | `css/style.css` `:root` |

로고(도트 BRICK CRAWL + 회색 벽돌)는 장르 중립이라 문제 아님.

## 2. 결정할 것 (소유자)

프로젝트 색 규칙(배경 베이지, 강조색 화 #C1443C 하나, 보라 금지)과 전형적인 사이버펑크(밤 + 네온 여러 색)가 부딪친다.

| 안 | 내용 | 장점 | 단점 |
|---|---|---|---|
| A. 규칙 유지 + 모티프 | 베이지 기본 유지. 배경 재생성, 각진 HUD 브래킷 프레임(CSS), 스캔라인, 터미널 커서, 고정폭 라벨 | 규칙 변경 없음 | 밝은 베이지에선 "하이테크 연구소" 정도로 약함 |
| **B. 모노크롬 사이버펑크(검토자 추천)** | 터미널·지도·전투를 카본 블랙 + 백색 발광 + 화(위험)로. 다크 기본, 라이트는 선택 | #45 캐릭터 프롬프트 팔레트(`carbon-black / titanium-ivory / electric-white`)와 일치. 강조색 1개·보라 금지 유지 | AGENTS.md "배경 베이지" 규칙에 예외 필요. 9개 화면비·대비 재검수 |
| C. 네온 도입 | 시안 등 두 번째 강조색 | 장르감 최강 | 강조색 1개·"붉은색 = 위험" 체계가 깨짐. 비추천 |

또 하나: 에셋 재생성보다 **CSS 정리(브래킷 프레임·토큰·진열 구슬 교체)를 먼저** 할지.

## 3. 결정 뒤 할 일 (안 B 기준 초안)

1. 프롬프트 개정(`docs/ASSET_PROMPTS.md`): 6.1에서 `aged brass`·`beige`·`no neon` 제거, `carbon-black megastructure server shaft, cable bundles, white data-light seams, faint #C1443C warning lamps`. 터미널 전용 세로 9:17 배경 한 장 추가. 4.1 기본 구슬 7종·6.2~6.5와 `ui_bar`·`ui_panel`·`ui_frame`에서 brass 제거.
2. 코드: `.ovMain` 이중 테두리 → HUD 코너 브래킷, 터미널 배경 레이어 + 은은한 스캔라인(`prefers-reduced-motion`에서 끔), 다크 토큰 차가운 무채색, 시작 버튼 프레임을 CSS 각진 테두리로, 진열 구슬을 새 구슬로.
3. 규칙: AGENTS.md UI 규칙·README 시각 규칙에 결정 내용 기록.
4. 검증: 9개 화면비 캡처(라이트·다크), `node --check`, `node tools/regress.mjs`.

## 4. 시나리오 v6.0과 현재 구현의 차이 (함께 정리할 것)

문서 최신화(2026-11-04) 중 확인한 것. 코드는 아직 고치지 않았다.

- **남은 옛 이름(화면 문구)**: 트로피 `수요일 아침` 설명(`js/data.js` `BADGES` root)이 "화요일의 알고리즘", 결과 화면 부제(`victory()`, `js/screens.js`)가 "화요일의 알고리즘을 / 관리자 프로세스를 종료시켰다". 결과 제목 "알고리즘이 멈췄다"도 v6.0에 맞는지 결정 필요. 고친 뒤 `tools/regress.mjs`의 `BANNED`에 옛 보스 이름을 넣는다.
- **D2 디버거 라벨**: 주인공은 릭인데 화면 라벨·말투는 아직 "디버거"(터미널·HUD·GLOSSARY). 순위표용 이름으로만 남길지 정리 필요.
- **D3 이야기 보상 = 해금 장치**: 보스 첫 처치 시 보상 풀 해금은 미구현.
- **D5 전투 중 무전 띠(RADIO)**: 지도 아래 무전 줄(`mapRadio`, `STORY_RADIO`)만 있고 전투판 위 비차단 무전 띠는 미구현. LCD 위젯도 미구현.
- **이야기 데이터 차이**: `STORY.a1`~`a5`·`end1`·`end` 제목·내용이 SCENARIO.md 4장 끝 표(로그 #01 전쟁 고아 … 완전한 아침)와 다르다. 4층 클라드는 D4(기존 보스전)인데 `b3` 대사는 `side:'ally'`로 표시된다. 어느 쪽을 정본으로 할지 정한다.
- **없는 에셋(폴백 중)**: 캐릭터 `codex`·`claude`·`zero`(→ `ART_FALLBACK`), 액션 시트는 `rick`·`sentinel`만, 기본 구슬 7종, 브로커 윤(`yun`)·충전소 히터(`heater`), 벽돌 6종(#33 상아·황동판), 앱 아이콘(기사).
