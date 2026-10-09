# 수집품 일러스트 — 2026-10-09

`docs/GAME_DESIGN.md`, `docs/tasks/03-collection.md`, `js/data.js`를 대조해 구슬 24종·유물 40종의 그림을 맞췄다. 기존 구슬 7종은 유지하고 구슬 17종·유물 40종을 추가한다.

## 산출물

- [검수 페이지](items-preview.html): 64종 전체, 밝게/어둡게 전환과 96px/32px 비교. `file://`로 열 수 있다.
- [원본](../../assets/illustrated/items/): 내장 `image_gen`으로 개별 생성한 투명 PNG 57개.
- [프롬프트](../../assets/illustrated/items/prompts.json): 실제 생성 프롬프트와 참조 원본 경로.
- [매니페스트](../../assets/illustrated/items/manifest.json): 게임 식별자·한글 이름·원본 크기·알파 범위·게임 파일 SHA-256.
- [게임용 이미지](../../assets/game/): `orb_<id>.png`, `relic_<id>.png`, 각각 96×96.

## 화풍과 구분

기존 `assets/illustrated/collection.png`를 화풍 참조로 사용했다. 상아색 하이라이트, 먹색 윤곽, 낡은 황동, 좌상단 광원과 도트 질감을 유지한다. 구슬은 구형 몸체에 기능 문양을 새기고, 유물은 도구·갑옷·장신구 등 독립적인 실루엣으로 구분한다. 독·흡혈·위험 문양에만 붉은색을 쓴다. 강화 단계와 등급은 기존 DOM 표시를 사용한다.

## 적용과 재생성

`js/art.js`가 `ORBS`·`RELICS`의 식별자로 이미지를 읽는다. 구슬은 전투·HUD·보상·상점·도감의 기존 그림 경로를 사용한다. 유물은 보상·상점·도감·보유 유물 줄에 그림을 추가했다. 미발견 도감 항목은 기존 숨김 표시를 유지한다. 이미지 실패 시 구슬은 기존 도트, 유물은 도트 아이콘과 이름을 사용한다.

```sh
python tools/build_game_assets.py
python tools/build_item_preview.py
```

이미지 변환은 개발 시에만 실행한다. 게임 실행에는 빌드·외부 라이브러리·네트워크가 필요 없다. 게임 규칙·난수·저장 구조는 변경하지 않았다.

## 검증

- 전체 게임 JavaScript `node --check` 통과.
- `node tools/test-art.mjs` 통과: 프레임·폴백·동작 줄이기.
- `node tools/sim.mjs 60`, 시드 `20261006`: 1세션 돌파 **15/60 (25%)**, 보스 격파 시 남은 체력 중앙값 **46%**, 원정 완주 **0/60**. 발사당 벽돌 파괴 0.51, 천장 타격 0.74. 밸런스 목표와 차이가 있으나 이 에셋 작업에서 수치를 조정하지 않았다.
- 실제 브라우저 검증: Playwright가 설치된 개발 환경에서 `node tools/test-items-browser.cjs`.
