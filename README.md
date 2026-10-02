# 브릭 크롤 (Brick Crawl)

벽돌깨기 + 턴제 전투 + 덱빌딩 로그라이크. 빌드 없이 브라우저에서 바로 돌고, 오프라인(`file://`)에서도 열린다.

- 플레이: 저장소 폴더째 받아 `index.html`을 브라우저로 연다. (`index.html`만 따로 옮기면 CSS·JS를 못 찾는다)
- 배포: 폴더 그대로 정적 호스팅(Cloudflare Pages 등)에 올린다.
- 규칙·수치: `docs/GAME_DESIGN.md`
- 작업 지시서: `docs/tasks/`
- 밸런스 시뮬레이션: `node tools/sim.mjs 60` (Node.js 18 이상)
- 개발 규칙(파일 구조, 검증 방법): `CLAUDE.md`

## 파일 구조
```
index.html        DOM 골격 + 스크립트 로드 순서
css/style.css     색 토큰(라이트/다크)과 레이아웃
js/config.js      화면 상수·공용 유틸·색 읽기
js/data.js        몬스터·성벽·구슬·유물 데이터
js/sprites.js     도트 스프라이트·아이콘·숫자 폰트
js/save.js        localStorage 저장
js/map.js         원정 상태·갈림길 지도
js/battle.js      전투(벽돌·구슬 물리·턴·몬스터 행동)
js/render.js      캔버스 렌더·HUD
js/screens.js     화면 전환·메인·지도·전투 시작/종료
js/rewards.js     보상·휴식·상점
js/main.js        메뉴·입력·메인 루프
tools/sim.mjs     헤드리스 밸런스 시뮬레이터
```
JS는 ES 모듈이 아니라 일반 `<script>`로 순서대로 불러온다(`file://`에서 모듈이 막히기 때문). 파일들은 전역 스코프를 공유한다.
