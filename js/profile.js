// 플레이어 프로필: 임의 닉네임과 비공개 식별자
'use strict';

// ── 닉네임 = 맛·감각 꾸밈말 + 성격 꾸밈말 + 사물, 모두 3음절.
// 세 묶음이 서로 다른 영역이라 어떻게 뽑아도 어울리지 않는다("바삭한 우울한 냉장고"). 약 47×48×70 ≈ 15만 가지
const NICK_A = ['뜨거운','차가운','바삭한','촉촉한','매콤한','달콤한','짭짤한','시큼한','느끼한','쫄깃한',
  '눅눅한','끈적한','보송한','푹신한','딱딱한','말랑한','미끈한','까칠한','축축한','따끈한',
  '시원한','얼얼한','고소한','텁텁한','싱거운','새콤한','쌉쌀한','상큼한','담백한','걸쭉한',
  '묵직한','가벼운','투명한','동그란','네모난','뾰족한','납작한','길쭉한','뭉툭한','거대한',
  '조그만','무거운','기다란','반질한','매끈한','향긋한','구수한'];
const NICK_B = ['우울한','공손한','수상한','비겁한','용감한','소심한','거만한','다정한','엄숙한','수줍은',
  '성실한','게으른','느긋한','예민한','대담한','겸손한','무례한','고독한','명랑한','침착한',
  '엉뚱한','교활한','순진한','당당한','얌전한','사나운','상냥한','냉정한','정직한','신중한',
  '외로운','서러운','배고픈','심심한','억울한','황당한','뿌듯한','설레는','초조한','태연한',
  '근엄한','다급한','비장한','의젓한','산만한','기특한','우아한','뻔뻔한'];
const NICK_C = ['청바지','냉장고','세탁기','다리미','가습기','선풍기','계산기','지우개','볼링공','주전자',
  '우체통','소화기','신호등','자전거','손수건','운동화','슬리퍼','보온병','도시락','가로등',
  '망원경','현미경','컴퓨터','키보드','스피커','숟가락','젓가락','고무줄','빗자루','휴지통',
  '손전등','나침반','자명종','오르골','탬버린','리코더','피아노','바나나','토마토','감자칩',
  '단무지','떡볶이','붕어빵','옥수수','고구마','양배추','소시지','마카롱','칼국수','비빔밥',
  '줄넘기','형광펜','책가방','목도리','귀마개','머리띠','허리띠','카메라','라디오','냉동실',
  '비행기','잠수함','트랙터','지게차','굴착기','킥보드','소쿠리','항아리','수족관','우편함'];
// 닉네임은 기록 서버로 가는 값이라 게임 결과와 무관하다. 시드 RNG가 아니라 Math.random을 쓴다
const makeNickname = () => [NICK_A, NICK_B, NICK_C].map(a => a[Math.floor(Math.random() * a.length)]).join(' ');

// file://에서도 돌아야 해서 randomUUID가 없을 때를 대비한다
function uuid(){
  try { if (crypto.randomUUID) return crypto.randomUUID(); } catch(e){}
  const h = [...Array(32)].map(() => Math.floor(Math.random() * 16).toString(16));
  h[12] = '4'; h[16] = (8 + Math.floor(Math.random() * 4)).toString(16);
  return h.join('').replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
}

// ── 프로필 저장. id는 기록을 올릴 때 쓰는 비밀 열쇠라 화면·랭킹에 내보내지 않는다
// queue: 아직 서버에 못 올린 원정 기록(오프라인·서버 오류). 다음에 다시 보낸다
const PROFILE_KEY = 'brickquest:profile:v1';
let PROFILE = null;
function loadProfile(){
  try {
    const p = JSON.parse(localStorage.getItem(PROFILE_KEY));
    if (p && typeof p.id === 'string' && typeof p.name === 'string'){
      // queue:null 같은 값이 기본값을 덮으면 원정 종료 처리(recordRun)가 멈춘다. 형식이 맞는 기록만 남긴다
      const queue = Array.isArray(p.queue) ? p.queue.filter(q => q && typeof q.rid === 'string' && typeof q.progress === 'number') : [];
      return Object.assign({}, p, { registered:p.registered === true, queue });
    }
  } catch(e){}
  return null;
}
function saveProfile(){ try { localStorage.setItem(PROFILE_KEY, JSON.stringify(PROFILE)); } catch(e){} }
// 메인 화면에 처음 들어올 때 한 번 만든다. 이후로는 바꾸지 않는다
function ensureProfile(){
  if (!PROFILE) PROFILE = loadProfile();
  if (!PROFILE){ PROFILE = { id:uuid(), name:makeNickname(), registered:false, queue:[] }; saveProfile(); }
  return PROFILE;
}
// 원정에서 끝까지 완료한 칸 수(1세션 보스까지 = 5). 랭킹 단위다.
// 심연은 본편 25칸 위에 이어 센다: 본편을 깨야 들어갈 수 있으니 심연 기록은 언제나 본편 완주보다 높다
const runCells = r => r ? r.s * 5 + (r.pos ? r.pos.r + 1 : 0) : 0;
const runProgress = r => r ? (r.abyss ? MAIN_CELLS : 0) + runCells(r) : 0;
