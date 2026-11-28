# 그림 에셋 현황

2026-11-27 기준. 화면의 모든 그림(런타임 에셋 130종 + 앱 아이콘 5종 + 동작 시트 700프레임)은 **모노크롬 서브컬처 셀화(Cel-Shading) 사이버펑크**(카본 블랙·건메탈·티타늄 실버·상아/순백 발광 + 위험 표시용 화 `#C1443C`) 화풍으로 통일했다.
과거 참조되지 않던 구버전 에셋(`docs/assets/*` 250종, `tools/export_assets.py`, `assets/illustrated/actions/sentinel.png`, 미참조 구슬 `orb_bounce`·`orb_time`·`orb_crown`)과 블록 도트 에셋은 모두 교체·제거했다.

## 어디서 오는가

| 종류 | 게임 파일(`assets/game`) | 만드는 법 |
|---|---|---|
| 캐릭터 14종 | `rick`·`sludge`·`drone`·`compiler`·`holo`·`arm`·`guardian`·`disperser`·`sentinel`·`codex`·`gemini`·`claude`·`omnis`·`zero` | 2배 슈퍼샘플링 벡터 셀화(`tools/draw_cel_characters.py`) → `tools/build_game_assets.py` |
| 동작 시트 14종 | `*_actions.png` (50프레임 × 14 = 700프레임, 10열×5행) | `tools/build_cyber_actions.py` ([action-frames.md](action-frames.md)) |
| 대화 초상 14종 | `portrait_*.png` (192px) | 3배 슈퍼샘플링 벡터 셀화(`tools/draw_cel_characters.py`) → `tools/build_game_assets.py` |
| 배경 | `chasm.png` (720×1360) | `tools/draw_cyber_assets.py` (1440×2720 슈퍼샘플링 셀화 수직 갱도) → `tools/build_game_assets.py` |
| 구슬 코어·회로 22종 | `orb_*.png` (96px, 코어 7·회로 15) | `tools/draw_item_assets.py` (384×384 슈퍼샘플링 셀화 벡터 일러스트) |
| 구슬 레벨 테두리 4종 | `orb_lv_2`~`5.png` (96px) | `tools/draw_item_assets.py` — HUD 슬롯·현재 구슬·발사대·차고 오버레이 연결 |
| 공명 문양 6종 | `res_*.png` (96px) | `tools/draw_item_assets.py` — 아카이브 공명·선택 카드 연결 |
| 칩 40종 | `relic_*.png` (96px) | `tools/draw_item_assets.py` (384×384 슈퍼샘플링 16핀 IC 셀화 일러스트) |
| 벽돌 6종 | `brick_*.png` (88×48) | `tools/draw_item_assets.py` (352×192 슈퍼샘플링 셀화 블록) |
| 크레딧·불꽃·파편·히터·단말기 | `coin`·`spark`·`rubble`·`campfire`·`merchant` | `tools/draw_item_assets.py` (플라즈마 인덕션 히터 3프레임 포함) |
| HUD 판·꺾쇠·주사선 | `ui_bar`·`ui_panel`·`ui_frame`·`scan` | `tools/draw_cyber_assets.py` (9-slice CSS 규격 고정, 사선 셀 반사광 포함) |
| 앱 아이콘 5종 | `icons/*.png` | `tools/draw_cel_characters.py` (`assets/illustrated/icon.png`) → `build_game_assets.py` |

새 AI 일러스트(흰색 단색 또는 체커보드 배경 JPG/PNG 포함)는 `tools/import_ai_assets.py`로 배경 투명화·팔레트 정규화 후 `assets/illustrated/`에 넣고, `build_game_assets.py` → `build_cyber_actions.py`를 돌리면 같은 이름의 도트 폴백을 자동으로 덮어쓴다. 프롬프트는 [`docs/ASSET_PROMPTS.md`](../ASSET_PROMPTS.md).

## 한눈에 구분되는 규칙

- **실루엣이 종류를 말한다**: 구 = 코어(전투에서 날아가는 몸체), 아래에 단자가 달린 카트리지 = 회로, 네 변에 다리가 난 IC·하드웨어 모듈 = 칩, 둥근 배지 = 공명 문양, 가운데가 빈 링 = 구슬 레벨 테두리.
- **붉은색은 위험**: 기체를 해치거나(독·피해) 대가가 있는 효과·기체 광학 렌즈에만 쓴다. 지키기·회복·아군 장비는 백색·상아 발광만.
- **팔레트 정규화**: `build_game_assets.py`의 `clamp_item_palette`가 축소 시 생길 수 있는 미세 채도 번짐을 무채색(`mx - mn <= 36`) + 화(`#C1443C`) 범위로 맞춰 `check_assets.py` 기준을 보장한다.

## 검사

```bash
python3 tools/check_assets.py     # 목록·흰 배경 잔여물·떠 있는 조각·대기 포즈 이음매·프레임 연속성·좌우 표식·팔레트
node tools/shots.cjs <폴더>       # 실제 게임 화면 캡처(다크·라이트) + 9개 화면비 넘침 검사
```

## 추후 확장 여지

- **4~5층 변종 기체·정예 7종**: `stone`·`keeper`·`hardener`·`royal`·`observer`·`tower`·`lens`는 현재 역할이 대응하는 기본 기체 스프라이트(`guardian`·`drone`·`sentinel`·`omnis`)를 공유한다. 필요 시 `tools/draw_cel_characters.py`에 고유 실루엣을 추가해 확장할 수 있다.
