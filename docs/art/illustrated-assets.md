# 일러스트 픽셀 에셋 — 2026-10-06

첨부한 던전 배경·구슬 컬렉션과 같은 질감으로 플레이어 1종, 기존 몬스터 5종을 디자인했다. 이 묶음은 **정적 디자인 원본**이며 현재 게임 렌더러에 자동 적용되지 않는다. 애니메이션 프레임이나 180×340 캔버스용 최종 스프라이트는 별도 제작이 필요하다.

## 원본

- [던전 배경](../../assets/illustrated/dungeon.png): 사용자 제공 PNG를 그대로 보존.
- [구슬·벽돌·UI 컬렉션](../../assets/illustrated/collection.png): 사용자 제공 PNG를 그대로 보존. 불규칙한 배치이므로 균등 격자 아틀라스로 취급하지 않는다.
- 캐릭터: 내장 imagegen으로 생성한 투명 배경 PNG. 생성 프롬프트는 [prompts.json](../../assets/illustrated/prompts.json), 크기·알파·체크섬은 [manifest.json](../../assets/illustrated/manifest.json)에 기록한다.

![던전 배경](../../assets/illustrated/dungeon.png)
![구슬 컬렉션](../../assets/illustrated/collection.png)

## 캐릭터

| 게임 식별자 | 역할과 디자인 | 미리보기 |
|---|---|---|
| `knight` | 플레이어. 상아색 갑옷, 황동 문양, 진주 구슬과 방패 | <img src="../../assets/illustrated/characters/knight.png" width="200" alt="기사"> |
| `slime` | 금속 파편을 삼킨 반투명 슬라임 | <img src="../../assets/illustrated/characters/slime.png" width="200" alt="슬라임"> |
| `bat` | 짙은 날개와 붉은 눈으로 공격성을 표현한 박쥐 | <img src="../../assets/illustrated/characters/bat.png" width="200" alt="박쥐"> |
| `golem` | 던전 석조 구조를 이어받은 육중한 골렘 | <img src="../../assets/illustrated/characters/golem.png" width="200" alt="골렘"> |
| `shroom` | 붉은 독성 무늬와 뿌리 발을 가진 독버섯 | <img src="../../assets/illustrated/characters/shroom.png" width="200" alt="독버섯"> |
| `boss` | 성당형 왕관과 철퇴를 가진 탑의 주인 | <img src="../../assets/illustrated/characters/boss.png" width="200" alt="탑의 주인"> |

## 적용 기준

- 밝은 상아·베이지, 짙은 먹색, 낡은 황동의 명암으로 입체감을 만든다. 붉은색은 몬스터의 위험 신호에 사용한다.
- 투명 알파를 보존한다. 투명 영역이 검게 보이는 뷰어에서도 검정 배경이 실제로 포함된 것은 아니다.
- 캐릭터는 각각 독립 파일이며 프레임 시트가 아니다. 정예·피격·공격·사망 프레임을 포함하지 않는다.
- 현재 `js/sprites.js`의 절차적 도트 및 `docs/assets/light`, `docs/assets/dark`의 자동 생성 파일을 대체하지 않는다.
- 향후 적용 시 캐릭터별 실제 표시 크기에서 가독성을 확인하고, 다크 모드 명암·로딩 실패 폴백·`file://` 동작을 함께 검증한다. 원본의 세밀한 질감은 현재 저해상도 캔버스에서 그대로 보존되지 않는다.
- 게임 수치, 충돌 판정, 저장 구조에는 변경이 없다.

## 검증

- 기존 JS 전체 `node --check` 통과.
- `node tools/sim.mjs 60`: 1세션 돌파 25/60(42%), 보스 격파 시 남은 체력 중앙값 33%, 발사당 벽돌 파괴 0.52·천장 타격 0.82. 무작위 표본이며 목표치 달성이나 밸런스 변경의 증거로 해석하지 않는다.
- PNG 형식·크기·알파 채널·사용자 제공 원본 체크섬과 문서 내 파일 링크를 검사한다.
- 런타임 변경이 없어 브라우저 플레이 검증은 수행하지 않았다.
