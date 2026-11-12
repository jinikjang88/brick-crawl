# 그림 에셋 현황

2026-11-12 기준. 화면의 모든 그림은 **모노크롬 사이버펑크**(카본 블랙·건메탈·티타늄·상아 + 위험 표시용 화 #C1443C) 한 가지 규칙을 따른다.
옛 중세 그림(상아·황동·석재: 기사·슬라임·구슬 컬렉션·양피지 패널)은 모두 걷어 냈다.

## 어디서 오는가

| 종류 | 게임 파일(`assets/game`) | 만드는 법 |
|---|---|---|
| 캐릭터 9종 | `rick`·`sludge`·`drone`·`guardian`·`disperser`·`sentinel`·`gemini`·`claude`·`omnis` | AI 일러스트 원본 `assets/illustrated/characters` → `tools/clean_matte.py` → `tools/build_game_assets.py` |
| 동작 시트 9종 | `*_actions.png` | `tools/build_cyber_actions.py` ([action-frames.md](action-frames.md)) |
| 대화 초상 14종 | `portrait_*.png` (96px) | AI 일러스트 원본 `assets/illustrated/portraits`. 제미디 2종·OMNIS·제로는 캐릭터 그림을 잘라 만든 것 |
| 구슬 부품 26종 | `orb_*.png` (96px) | `tools/draw_item_assets.py` — 코어 7(구)·회로 16(카트리지)·공명 효과 3(배지) |
| 칩 40종 | `relic_*.png` (96px) | `tools/draw_item_assets.py` — IC 실루엣 + 11×11 문양 |
| 벽돌 6종 | `brick_*.png` (176×96) | `tools/draw_item_assets.py` |
| 크레딧·불꽃·파편·히터·단말기 | `coin`·`spark`·`rubble`·`campfire`·`merchant` | `tools/draw_item_assets.py` (파일 이름은 코드가 찾는 옛 이름 그대로) |
| 배경·HUD 판·꺾쇠·주사선 | `chasm`·`ui_bar`·`ui_panel`·`ui_frame`·`scan` | `tools/draw_cyber_assets.py` |
| 앱 아이콘 5종 | `icons/*.png` | `tools/draw_item_assets.py` |

AI 일러스트 원본(`assets/illustrated/items/*.png`, `bricks.png`, `icon.png`, `chasm.png`)을 넣으면 `build_game_assets.py`가 같은 이름의
도트 그림을 덮어쓴다. 그래서 `draw_*.py`를 먼저, `build_game_assets.py`를 나중에 돌린다. 프롬프트는 [`docs/ASSET_PROMPTS.md`](../ASSET_PROMPTS.md).

## 한눈에 구분되는 규칙

- **실루엣이 종류를 말한다**: 구 = 코어(전투에서 날아가는 몸체), 아래에 단자가 달린 카트리지 = 회로, 네 변에 다리가 난 IC = 칩, 둥근 배지 = 공명 효과.
- **문양이 효과를 말한다**: 가운데 11×11 도트 문양(십자 = 회복, 육각 방패 = 방어, 방울 = 독 …).
- **붉은색은 위험**: 기체를 해치거나(독·피해) 대가가 있는 효과에만 쓴다. 지키기·회복은 상아 발광만.
- **벽돌**: 일반 = 티타늄 판, 강화 = 리벳 박힌 어두운 장갑판, 효과(⚔·방어·회복) = 상아 판 + 먹색 문양, 오염 = 어두운 판 + 붉은 방울.
- 광원은 왼쪽 위, 바깥 1px 먹색 외곽선, 32칸 격자를 정수배로 확대(도트 굵기를 캐릭터 그림과 맞춘다).
- 그림 위의 색은 테마와 무관한 고정색이다. 다크·라이트 양쪽 배경에서 읽히는지 캡처로 확인한다.

## 검사

```bash
python3 tools/check_assets.py     # 목록·흰 배경 잔여물·떠 있는 조각·대기 포즈 이음매·프레임 연속성·좌우 표식·팔레트
node tools/shots.cjs <폴더>       # 실제 게임 화면 캡처(다크·라이트) + 9개 화면비 넘침 검사
```

## 아직 없는 그림

- 코테크·아키텍트 제로의 전투 그림과 동작 시트(센티넬·OMNIS로 대신한다).
- 구슬 레벨 테두리(`orb_lv_*`)·공명 문양(`res_*`): 코드에 연결되지 않았다(ASSET_PROMPTS 4.3·4.4).
- 구슬 부품·칩·벽돌의 AI 일러스트판: 지금은 도트 아이콘이다. 캐릭터 그림만큼 세밀한 그림을 원하면 ASSET_PROMPTS 4~6절로 생성해 `assets/illustrated`에 넣는다.
