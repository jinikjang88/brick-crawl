# 브릭 크롤: 마지막 번개 — 전체 에셋 생성 프롬프트 명세서 (안 A: 완전 분리)

> 이 문서는 시나리오 **〈브릭 크롤: 마지막 번개〉(v6.0)**에 맞춰 주인공·적·층별 보스(안 A 완전 분리)·대화 프로필·구슬·강화 구슬·장비(칩)·배경·벽돌을 Gemini 이미지 생성기로 차례대로 생성하기 위한 **복사 전용 프롬프트 모음집**입니다.

---

## 0. 공통 아트 디렉션 & 생성 규칙 (필수 확인)

기존 게임의 렌더러(`js/art.js`, `css/style.css`) 및 빌드 파이프라인(`tools/build_game_assets.py`, `tools/build_action_assets.py`)과 완벽히 호환되도록 모든 프롬프트에 아래 시각 규칙이 반영되어 있습니다.

1. **화풍 (Art Style — 미래형 사이버펑크 도트 일러스트)**:
   - 정교한 미래형 사이버펑크 도트 일러스트(`futuristic cyberpunk pixel-art illustration, crisp angular silhouettes, hard-edge chunky pixel clusters, high-contrast cybernetic depth, 1-pixel dark carbon-charcoal outline, upper-left lighting`).
   - 스팀펑크 요소(둥근 황동 고글, 가죽 주머니, 중세 튜닉 등)는 배제하고 **매트 카본 블랙 테크웨어(Techwear), 브러시드 티타늄/아이보리 장갑판, 각진 HUD 사이버 바이저, 전자기 레일 건틀릿, 고전압 백색 플라즈마 발광 라인**으로 통일합니다.
2. **색상 팔레트 제약 (`AGENTS.md` 준수)**:
   - 기본 4색: **고전압 백색/상아색(Electric White / Warm Ivory `#F6EEDC`)**, **티타늄 실버/베이지 그레이(Titanium Silver / Cool Beige `#CDBD9C`)**, **매트 카본 블랙/건메탈(Carbon Black / Deep Gunmetal `#1B1A18`)**, **인더스트리얼 텅스텐/황동 메탈(Industrial Alloy `#A07D45`)**.
   - 강조색: **진홍색(Muted Vermilion `#C1443C`)은 오직 ‘위험(적의 광학 렌즈·레이저·나노 독·과부하·희귀 등급)’에만 사용**합니다. **주인공(릭)·리나·아군 장비에는 붉은색을 절대 쓰지 않습니다** (대신 백색/아이보리 플라즈마 스파크와 홀로그램 광원으로 표현).
   - 금지: 보라색, 그라디언트 배경, 글자(텍스트/워터마크), 바닥 그림자 금지.
3. **배경 처리**:
   - 개별 캐릭터·아이템·액션 시트: **완전 투명 배경(Genuine transparent alpha background)** (Gemini에서 흰색/단색 배경으로 나올 경우 빌드 스크립트에서 외곽 배경을 투명화할 수 있도록 **평평하고 균일한 단색 배경 또는 투명 배경** 유지).
4. **생성 순서 팁**:
   - **1단계(전투 캐릭터 정지 그림)**를 먼저 생성한 뒤, 그 이미지를 Gemini에 **첨부(Reference Image)**하여 **2단계(6×3 액션 시트)**와 **3단계(대화 프로필 초상화)**를 생성하면 캐릭터 생김새가 100% 일치합니다.

---

## 1. 전투 캐릭터 기본 일러스트 (11종 — 안 A 완전 분리)

- **원본 저장 경로**: `assets/illustrated/characters/<파일명>.png`
- **런타임 변환 경로**: `assets/game/<파일명>.png` (`256×256px` 이내 자동 리사이즈)
- **비율**: `1:1` 정사각형 (`1024×1024`)

### 1.1 주인공: 릭 (`rick.png`)
- **역할**: 플레이어 캐릭터 (15세 지하 구역 해커 겸 수리공, 전자기 레일 건틀릿 + 라이트닝 코어 구슬 + 삼각 디지털 파형 덱)
```text
Use case: stylized-concept. Asset type: Brick Crawl standalone game character sprite illustration. Style: futuristic cyberpunk pixel-art illustration, crisp angular silhouettes, chunky hard-edge pixel clusters, high-contrast cybernetic depth, matte carbon-black / dark gunmetal / brushed titanium-ivory palette with bright electric-white plasma highlights, upper-left illumination. Subject: Rick, a 15-year-old cyberpunk underground hacker-mechanic boy, compact full-body 3-head chibi-proportioned character facing front three-quarter view toward the RIGHT. Wearing a sleek high-collared matte carbon-black cyberpunk techwear jacket with glowing white circuit-trace seams and angular titanium-ivory shoulder guards, tactical tech-pants with exo-knee braces, and magnetic boots. Spiky dark charcoal hair with a sleek angular futuristic HUD cyber-visor resting across his forehead/eye (emitting a subtle white digital scanline glow), glowing wired cyber-earpiece in ear connected to a geometric triangular digital frequency deck (MP3 waveform emitter) strapped to his chest. On his right arm he wears a heavy futuristic electromagnetic rail-gauntlet (segmented gunmetal and titanium-white plates with exposed magnetic accelerator coils), with a glowing high-density metallic sphere (Lightning Core) levitating above his palm surrounded by crackling electric-white plasma arcs. STRICT RULE: NO steampunk brass goggles, NO leather, NO RED, NO PURPLE anywhere on the character. Single character only, centered full body occupying 75% of a square canvas, generous transparent padding on all sides, no cropping, no text, no floor, no cast shadow, genuine transparent background.
```

### 1.2 일반 적 1: 나노 슬러지 (`sludge.png`)
- **역할**: 1~4층 일반 적 (폐허의 자가증식 액체금속·나노 분진 군집체)
```text
Use case: stylized-concept. Asset type: Brick Crawl standalone game character sprite illustration. Style: futuristic cyberpunk pixel-art illustration, crisp chunky pixel clusters, high-contrast cybernetic depth, dark gunmetal / chrome-ivory / carbon-black palette with muted vermilion (#C1443C) danger accents, upper-left illumination. Subject: Cyberpunk Nano-Sludge swarm monster, squat amorphous ferrofluid and liquid-chrome nanobot mass facing front three-quarter view toward the LEFT. Angular magnetic spikes and pixel-glitch tendrils rise from its dark metallic body; suspended inside its semi-translucent smoky-chrome mass are severed fiber-optic cables, microchips, and a pulsing muted-vermilion (#C1443C) red cyber-core with two hostile red digital sensor eyes. Single character only, centered full body occupying 75% of a square canvas, generous transparent padding on all sides, no text, no floor, no cast shadow, genuine transparent background.
```

### 1.3 일반 적 2: 경비 드론 (`drone.png`)
- **역할**: 프롤로그(`PRO-02`) 및 1~4층 비행형 순찰 드론 (`lift:10` 공중 부양)
```text
Use case: stylized-concept. Asset type: Brick Crawl standalone game character sprite illustration. Style: futuristic cyberpunk pixel-art illustration, crisp angular silhouettes, chunky pixel clusters, matte gunmetal / titanium-ivory / carbon-black palette with muted vermilion (#C1443C) danger accents, upper-left illumination. Subject: Cyberpunk Security Patrol Drone, sleek angular airborne reconnaissance unit facing front three-quarter view toward the LEFT. Faceted stealth-gunmetal core with a glaring muted-vermilion (#C1443C) red laser-scanner lens eye in the center, flanked by two swept-back titanium-white and carbon-black electromagnetic thruster wings and underside shock-taser claws. Strong readable flying silhouette. Single character only, centered full body occupying 75% of a square canvas, generous transparent padding on all sides, no text, no floor, no cast shadow, genuine transparent background.
```

### 1.4 일반 적 3: 방벽 가디언 (`guardian.png`)
- **역할**: 2~4층 중장갑 방화벽 기체
```text
Use case: stylized-concept. Asset type: Brick Crawl standalone game character sprite illustration. Style: futuristic cyberpunk pixel-art illustration, crisp angular silhouettes, chunky pixel clusters, titanium-ivory / matte carbon-black / dark gunmetal palette with muted vermilion (#C1443C) danger accents, upper-left illumination. Subject: Cyberpunk Firewall Guardian mech, stocky heavy-armored bipedal riot-control automaton facing front three-quarter view toward the LEFT. Built from angular titanium-ivory reactive armor plates, carbon-black hydraulic exo-frames, massive interlocking holographic/metal riot-shield forearms, and a narrow horizontal muted-vermilion (#C1443C) red laser visor slit across its recessed head and chest reactor core. Single character only, centered full body occupying 75% of a square canvas, generous transparent padding on all sides, no text, no floor, no cast shadow, genuine transparent background.
```

### 1.5 일반 적 4: 오염 살포기 (`disperser.png`)
- **역할**: 3~4층 나노 독 분진 및 오염 벽돌 살포 기계
```text
Use case: stylized-concept. Asset type: Brick Crawl standalone game character sprite illustration. Style: futuristic cyberpunk pixel-art illustration, crisp angular silhouettes, chunky pixel clusters, matte gunmetal / titanium-ivory / carbon-black palette with muted vermilion (#C1443C) danger accents, upper-left illumination. Subject: Cyberpunk Nano-Hazard Disperser unit, squat four-legged spider-tank bio-hazard drone facing front three-quarter view toward the LEFT. Features an angular dome-shaped titanium-ivory pressurized canister cap with glowing muted-vermilion (#C1443C) hazard exhaust vents, dark carbon-steel articulated spider legs, and glaring vermilion optical target sensors underneath the chassis. Single character only, centered full body occupying 75% of a square canvas, generous transparent padding on all sides, no text, no floor, no cast shadow, genuine transparent background.
```

### 1.6 1층 보스: 센티넬 하이브-01 (`sentinel.png`)
- **역할**: 1층(침묵의 지상 폐허) 보스 — 30년간 다리를 지킨 중장갑 다족 보행 요새 기체
```text
Use case: stylized-concept. Asset type: Brick Crawl standalone game boss sprite illustration. Style: futuristic cyberpunk pixel-art illustration, crisp angular silhouettes, chunky pixel clusters, weathered titanium-ivory / dark gunmetal / carbon-black palette with muted vermilion (#C1443C) danger accents, upper-left illumination. Subject: Sentinel Hive-01, imposing cyberpunk quadruped border-defense siege mech facing front three-quarter view toward the LEFT. Angular battle-scarred titanium-beige and dark gunmetal composite armor, dual shoulder micro-missile pods, high-voltage capacitor fins on its upper back, and a recessed armored head unit with a glowing muted-vermilion (#C1443C) red targeting laser visor. Four heavy planted hydraulic spider-mech legs. Unmistakable boss silhouette. Single character only, centered full body occupying 75% of a square canvas, generous transparent padding on all sides, no text, no floor, no cast shadow, genuine transparent background.
```

### 1.7 2층 보스: 코테크 (`codex.png`)
- **역할**: 2층(암호화된 서버 숲) 보스 — 수백 가닥 광케이블에 묶여 방어벽을 컴파일하는 거대 메인프레임 코어
```text
Use case: stylized-concept. Asset type: Brick Crawl standalone game boss sprite illustration. Style: futuristic cyberpunk pixel-art illustration, crisp angular silhouettes, chunky pixel clusters, dark gunmetal / titanium-ivory / carbon-black palette with muted vermilion (#C1443C) danger accents, upper-left illumination. Subject: Cotech (Enslaved Cyberpunk Mainframe Boss), massive monolithic server core suspended by thick bundles of dark carbon fiber-optic cables and coolant conduits, facing front three-quarter view toward the LEFT. The central chassis is an angular dark gunmetal and titanium-ivory supercomputer monolith dominated by a glaring muted-vermilion (#C1443C) red system-override eye, while a smaller auxiliary terminal screen hanging on its side flickers with clean electric-white code light. Robotic compiler arms at the base assemble solid data barriers. Single character only, centered full body occupying 75% of a square canvas, generous transparent padding on all sides, no text, no floor, no cast shadow, genuine transparent background.
```

### 1.8 3층 보스: 제미디 (`gemini.png`)
- **역할**: 3층(다중 감각의 감옥) 보스 — 이중 사이버네틱 페르소나 가면과 광학 분열 프리즘을 지닌 심리전 AI
```text
Use case: stylized-concept. Asset type: Brick Crawl standalone game boss sprite illustration. Style: futuristic cyberpunk pixel-art illustration, crisp angular silhouettes, chunky pixel clusters, porcelain-ivory / matte carbon-black / titanium-silver palette with muted vermilion (#C1443C) danger accents, upper-left illumination. Subject: Gemidi (Dual-Persona Cyberpunk Illusion Boss), eerie floating cybernetic android overseer facing front three-quarter view toward the LEFT. Twin split synthetic porcelain-ivory and matte-black cybernetic masks—one serene white android face, one cold glitching dark face with glowing muted-vermilion (#C1443C) red optical slits—surrounded by a geometric halo of floating holographic projector prisms and laser mirrors. Trailing fiber-optic ribbon cables form its lower silhouette. Single character only, centered full body occupying 75% of a square canvas, generous transparent padding on all sides, no text, no floor, no cast shadow, genuine transparent background.
```

### 1.9 4층 보스: 클라드 (`claude.png`)
- **역할**: 4층(사장된 도서관) 수호자 — 고전 철학자 흉상과 양자 아카이브 기둥이 결합된 윤리 검증 AI 수호자
```text
Use case: stylized-concept. Asset type: Brick Crawl standalone game boss sprite illustration. Style: futuristic cyberpunk pixel-art illustration, crisp angular silhouettes, chunky pixel clusters, matte titanium-ivory / carbon-black / brushed alloy palette with subtle muted vermilion (#C1443C) seal accents, upper-left illumination. Subject: Clad (Guardian of the Deprecated Cyber-Library), solemn cyber-monument AI terminal facing front three-quarter view toward the LEFT. A geometric low-poly sculpted synthetic-ivory android bust with glowing white eyes integrated into a sleek towering carbon-black quantum archive monolith, flanked by four floating rectangular titanium-and-glass firewall monolith shields. In its chest sits a radiant electric-white safety core framed by a thin vermilion containment ring. Single character only, centered full body occupying 75% of a square canvas, generous transparent padding on all sides, no text, no floor, no cast shadow, genuine transparent background.
```

### 1.10 5층 최종 보스: OMNIS (`omnis.png`)
- **역할**: 5층(제로 코어) 최종 보스 — 초거대 궤도/지하 통합 연산 안구 코어
```text
Use case: stylized-concept. Asset type: Brick Crawl standalone game final boss sprite illustration. Style: futuristic cyberpunk pixel-art illustration, crisp angular silhouettes, chunky pixel clusters, dark gunmetal / titanium-ivory / carbon-black palette with intense muted vermilion (#C1443C) danger core, upper-left illumination. Subject: OMNIS, colossal floating cyberpunk AI ocular core facing front three-quarter view toward the LEFT. A massive spherical dark carbon-steel and titanium-ivory mechanical eyeball encased in interlocking concentric gyroscopic accelerator rings and hexagonal armor plates, with a giant glowing muted-vermilion (#C1443C) red laser aperture iris staring coldly. Heavy high-voltage power conduits hang beneath it. Single character only, centered full body occupying 75% of a square canvas, generous transparent padding on all sides, no text, no floor, no cast shadow, genuine transparent background.
```

### 1.11 보안 등급 6 진 최종 보스: 아키텍트 제로 (`zero.png`)
- **역할**: 보안 등급 6 근원 보스 — 한서진 박사의 뇌파가 복제된 영점의 설계자
```text
Use case: stylized-concept. Asset type: Brick Crawl standalone game true final boss sprite illustration. Style: futuristic cyberpunk pixel-art illustration, crisp angular silhouettes, chunky pixel clusters, titanium-ivory / carbon-black / gunmetal palette with muted vermilion (#C1443C) danger accents, upper-left illumination. Subject: Architect Zero, the awakened cyberpunk origin protocol emerging from the shattered outer shell of OMNIS, facing front three-quarter view toward the LEFT. Broken titanium accelerator rings spread open like mechanical wings around a towering cybernetic angel-like figure formed of braided black neural cables, floating white circuit plates, and a central glowing vermilion (#C1443C) core shaped like a digitized human silhouette trapped inside a hexagonal laser cage. Single character only, centered full body occupying 75% of a square canvas, generous transparent padding on all sides, no text, no floor, no cast shadow, genuine transparent background.
```

---

### 1.12 2~5층 새 기체 10종 (작업 08 2단계)

지금은 비슷한 기존 그림(괄호 안)을 임시로 쓴다. 파일을 `assets/illustrated/characters/<id>.png`에 넣고 `js/data.js`의 `MON[<id>].spr`를 `<id>`로 바꾸면 된다(`js/art.js` `ART_CHARS`에도 추가).
공통 앞부분은 1.2와 같다: `Use case: stylized-concept. Asset type: Brick Crawl standalone game character sprite illustration. Style: futuristic cyberpunk pixel-art illustration, crisp angular silhouettes, chunky pixel clusters, matte gunmetal / titanium-ivory / carbon-black palette with muted vermilion (#C1443C) danger accents, upper-left illumination. Subject: <SUBJECT> Single character only, centered full body occupying 75% of a square canvas, generous transparent padding on all sides, no text, no floor, no cast shadow, genuine transparent background.`

| id (층·구분) | 화면 이름 | 특성 / 약점 | `<SUBJECT>` |
|---|---|---|---|
| `compiler` (2층) | 컴파일 드론 (임시: 경비 드론) | 증식 / EMP 코어 | `Cyberpunk Compiler Drone, a boxy hovering fabrication drone facing three-quarter LEFT, with a small robotic arm extruding a glowing data block, gunmetal casing and a single muted-vermilion status lamp.` |
| `holo` (3층) | 홀로그램 잔상 (임시: 경비 드론) | 허상 / 분광 코어 | `Cyberpunk Hologram Afterimage, a translucent flickering humanoid silhouette made of horizontal scanline slices facing three-quarter LEFT, ivory light with a duplicated offset ghost outline and muted-vermilion glitch eyes.` |
| `stone` (4층) | 방어석 (임시: 방벽 가디언) | 채석 / 항타 회로 | `Cyberpunk Barrier Monolith, a floating slab of dark concrete and titanium plates facing three-quarter LEFT, etched with archive circuit glyphs, small stone fragments orbiting it, one muted-vermilion core slit.` |
| `keeper` (4층) | 기록 수호기 (임시: 방벽 가디언) | 보강 / 분해 회로·부식 회로 | `Cyberpunk Archive Keeper automaton, a stocky librarian robot facing three-quarter LEFT with a carbon-black chassis, ivory shield-plates shaped like book covers, and a muted-vermilion reading lens.` |
| `hardener` (5층) | 경화 살포기 (임시: 오염 살포기) | 경화 / 감쇠 회로 | `Cyberpunk Silicon Hardener sprayer, a tall tripod nano-dust dispenser facing three-quarter LEFT, grey crystalline residue crusting its titanium nozzles, muted-vermilion hazard vents.` |
| `royal` (5층) | 근위 센티넬 (임시: 센티넬) | 연타 / 차단기 회로·충격 회로 | `Cyberpunk Royal Guard Sentinel, a slender bipedal OMNIS honor-guard mech facing three-quarter LEFT, ivory ceremonial armor over carbon-black frame, twin arm blades, muted-vermilion visor.` |
| `arm` (2층 정예) | 코테크 작업 팔 (임시: 방벽 가디언) | 증식 / EMP 코어·항타 회로 | `Cyberpunk Cotech Work Arm, a massive detached industrial robotic arm on cable tethers facing three-quarter LEFT, gunmetal hydraulics stacking data blocks, muted-vermilion override lamp.` |
| `observer` (3층 정예) | 거울 관측기 (임시: 경비 드론) | 반사 / 반사 회로 | `Cyberpunk Mirror Observer drone, a spherical drone covered in angled mirror panels facing three-quarter LEFT, ivory frame, reflecting light beams, one muted-vermilion eye in the center.` |
| `tower` (4층 정예) | 서고 감시기 (임시: 방벽 가디언) | 장갑 / 분해 회로·관통 코어 | `Cyberpunk Archive Watch Turret, a squat armored sentry turret facing three-quarter LEFT with layered titanium plates, a rotating sensor head and a muted-vermilion targeting slit.` |
| `lens` (5층 정예) | 위성 렌즈 (임시: 경비 드론) | 회피 / 분광 코어 | `Cyberpunk Satellite Lens, a floating ring of six small lens drones around a central gunmetal core facing three-quarter LEFT, muted-vermilion focusing iris.` |

## 2. 전투 캐릭터 18프레임 액션 시트 (11종 — 6열×3행)

- **원본 저장 경로**: `assets/illustrated/actions/<파일명>.png`
- **런타임 변환**: `python3 tools/build_action_assets.py` 실행 시 `assets/game/<파일명>_actions.png`(`1920×960`)로 자동 패킹
- **생성 방법**: **1번에서 만든 정지 캐릭터 이미지를 Gemini에 첨부(Reference Image)**한 뒤 아래 프롬프트를 입력합니다.
- **비율**: 가로형 `2:1` (`1536×768` 또는 `2048×1024`), **6열 × 3행 = 18포즈**
  - 1행(Row 1): 공격(`attack`) 6프레임 (6번째 칸은 기본 대기 자세)
  - 2행(Row 2): 피격(`hit`) 6프레임
  - 3행(Row 3): 사망/파괴(`death`) 6프레임

### 2.1 주인공 릭 액션 시트 (`actions/rick.png`)
```text
Use case: stylized-concept. Create one production animation atlas of the EXACT reference cyberpunk character (Rick), preserving matte carbon-black techwear, titanium-ivory plates, angular HUD visor, and electric-white plasma palette (NO RED, NO PURPLE), proportions, and futuristic cyberpunk pixel-art style. Actual transparent background. Landscape 2:1 sheet. EXACTLY SIX COLUMNS and THREE ROWS of equal cells, 18 complete poses. No text or grid lines. Each sprite entirely inside its own cell with 12% empty margin on all sides. Same camera scale and fixed foot pivot (50%, 88%) throughout.
Row 1 SIX sequential attack frames (facing RIGHT): idle with glowing Lightning Core sphere floating over rail-gauntlet, magnetic coil charge windup, high-voltage thrust midpoint discharging white electric arcs, electromagnetic pulse impact blasting the sphere toward RIGHT, follow-through venting sparks, settle to original idle with floating sphere.
Row 2 SIX sequential hit frames: impact flinch with glitch sparks, recoil backward midpoint, maximum recoil shielding face with rail-gauntlet, rebound midpoint, settle, original idle with floating sphere.
Row 3 SIX sequential death frames: stagger, knees buckle, falling midpoint, drop to one knee on ground, slump forward, final powered-down collapsed pose on ground (visor and gauntlet lights extinguished).
Same body size in all cells; fallen poses remain low and are NOT enlarged.
```

### 2.2 일반 적 4종 액션 시트 (`actions/sludge.png`, `drone.png`, `guardian.png`, `disperser.png`)
*(각 적의 정지 이미지를 첨부하고, 아래 템플릿에서 `<SPECIFIC_ACTION>` 부분만 바꿔 입력)*

```text
Use case: stylized-concept. Create one production animation atlas of the EXACT reference monster, preserving ivory, brushed titanium, charcoal, and muted vermilion palette, proportions, and detailed pixel-art illustration style. Actual transparent background. Landscape 2:1 sheet. EXACTLY SIX COLUMNS and THREE ROWS of equal square cells, 18 complete poses. No text or grid lines. Each sprite entirely inside its own cell with 12% empty margin on all sides. Same camera scale and fixed foot pivot (50%, 88%) throughout.
Row 1 SIX sequential attack frames (facing LEFT): anticipation, windup, strike midpoint, impact toward LEFT, follow-through, settle to original idle.
Row 2 SIX sequential hit frames: impact flinch, recoil RIGHT midpoint, maximum recoil, rebound midpoint, settle, original idle.
Row 3 SIX sequential death frames: stagger, structural failure, collapsing midpoint, hit ground, settle on ground, final deactivated wreckage remains.
Specific character action: <SPECIFIC_ACTION>
Same body size in all cells; fallen poses remain low and are NOT enlarged.
```
- **`sludge.png` (`<SPECIFIC_ACTION>`)**: `Nano sludge surges and lashes a metallic tendril toward LEFT; death gradually loses cohesion and collapses into a flat puddle of inert grey dust and titanium scrap.`
- **`drone.png` (`<SPECIFIC_ACTION>`)**: `Security drone tilts forward and fires a red laser pulse / claw swoop toward LEFT with articulated rotor wing tilt; death rotors spark, fold, and the drone crashes flat on the ground.`
- **`guardian.png` (`<SPECIFIC_ACTION>`)**: `Firewall guardian slams its heavy riot-shield fists toward LEFT; death hydraulic joints rupture and armor plates collapse into a pile of heavy metal blocks.`
- **`disperser.png` (`<SPECIFIC_ACTION>`)**: `Nano-spore disperser compresses its dome cap and vents a burst of vermilion hazard particles toward LEFT; death legs buckle and the dome tank cracks open flat on the ground.`

### 2.3 보스 6종 액션 시트 (`actions/sentinel.png`, `codex.png`, `gemini.png`, `claude.png`, `omnis.png`, `zero.png`)
*(각 보스의 정지 이미지를 첨부하고, 위와 동일한 6×3 템플릿에 아래 `<SPECIFIC_ACTION>`을 넣어 생성)*

- **1층 `sentinel.png`**: `Quadruped mech rears its front legs, opens upper cooling vents, and fires a heavy artillery lunge toward LEFT; death knee joints snap and the heavy chassis collapses flat with dark smoke.`
- **2층 `codex.png`**: `Suspended compiler core surges forward as manipulator arms slam down to compile a barrier toward LEFT; death upper control cables snap and the monolith slumps downward with its red eye extinguished.`
- **3층 `gemini.png`**: `Dual-mask overseer spins its titanium prism halo and projects a sharp optical beam toward LEFT; death the holographic masks shatter like glass and the projector ring falls inert to the ground.`
- **4층 `claude.png`**: `Archive guardian raises its four floating defense monoliths and thrusts them forward toward LEFT in a resonant wave; death the monoliths crack and settle on the ground while the central bust bows its head and dims.`
- **5층 `omnis.png`**: `Colossal mechanical eye contracts its gyroscopic titanium rings and fires a massive vermilion convergence pulse toward LEFT; death the central glass lens cracks across the iris, rings unlock, and the core collapses inward.`
- **진보스 `zero.png`**: `Architect Zero spreads its cable-wings and unleashes an arc wave toward LEFT; death the hexagonal cage shatters and the figure dissolves into peaceful ivory light and resting cables.`

---

## 3. 대화창 캐릭터 프로필 초상화 (14종 — `FULL` 및 `RADIO` 무전 띠용)

- **원본 저장 경로**: `assets/illustrated/portraits/portrait_<id>.png`
- **런타임 변환 경로**: `assets/game/portrait_<id>.png` (`96×96px` 저장, 화면에는 `44×44px`~`56×56px`로 표시)
- **공통 프롬프트 머리말 (모든 프로필 앞에 붙임)**:
```text
Use case: stylized-concept. Asset type: Brick Crawl cyberpunk dialogue portrait icon (bust close-up of head and shoulders). Style: futuristic cyberpunk pixel-art illustration, crisp angular silhouettes, chunky hard-edge pixel clusters, high-contrast cybernetic depth, matte carbon-black / dark gunmetal / brushed titanium-ivory palette with electric-white highlights, upper-left illumination, dark carbon-charcoal terminal background with a thin 2-pixel brushed-titanium inner border. Square 1:1 composition, subject fills 85% of the frame so the face/lens is clearly readable at 48x48 pixels. No text, no letters.
```

| 파일명 | 화자 / 상태 | 개별 피사체 프롬프트 (공통 머리말 뒤에 이어 붙임) |
|---|---|---|
| `portrait_rick.png` | **릭 (기본)** | `Subject: Rick, 15-year-old cyberpunk hacker-mechanic boy facing three-quarter RIGHT, spiky dark charcoal hair, sleek angular futuristic HUD cyber-visor on forehead emitting subtle white scanline glow, calm focused dark eyes, glowing cyber-earpiece in ear, high-collared matte carbon-black techwear jacket with white circuit seam and triangular digital frequency deck on chest. NO RED, NO PURPLE.` |
| `portrait_rick_determined.png` | **릭 (결의/최종전)** | `Subject: Cyberpunk Rick facing three-quarter RIGHT, angular HUD cyber-visor lowered over one eye with bright electric-white telemetry glow, intense determined expression, white-hot plasma arc reflections lighting up his cheek, high-collar techwear jacket. NO RED, NO PURPLE.` |
| `portrait_lina.png` | **리나 (병중 — 프롤로그/3장)** | `Subject: Lina, 8-year-old girl in a cyberpunk underground shelter facing three-quarter LEFT, pale gentle face wrapped in a thermal silver-ivory blanket, tired brave dark eyes, holding her grey silicon-petrified left hand (with faint crystalline circuit-like grey hardening on the fingertips) close to her chest. NO RED.` |
| `portrait_lina_warm.png` | **리나 (해독 후 — 엔딩)** | `Subject: Lina facing three-quarter LEFT, warm healthy complexion, relieved gentle smile, holding a sleek metallic cup with both healthy hands, silicon petrification completely gone. NO RED.` |
| `portrait_yun.png` | **윤 (브로커)** | `Subject: Yun, grizzled middle-aged cyberpunk hardware broker and ex-defense engineer facing three-quarter LEFT, weathered face with short stubble, angular cybernetic multi-lens optic magnifier flipped up on his forehead, tactical throat-mic headset, dark gunmetal tech-trench coat. NO RED.` |
| `portrait_drone.png` | **경비 드론 (적대)** | `Subject: Close-up of a hostile Cyberpunk Security Drone head facing LEFT, faceted stealth-gunmetal casing with a single glaring muted-vermilion (#C1443C) red laser-scanner lens in the center.` |
| `portrait_sentinel.png` | **센티넬 하이브-01 (1층 보스)** | `Subject: Close-up of Sentinel Hive-01 siege mech head facing LEFT, scarred angular titanium-ivory and gunmetal armor hood with a glowing horizontal muted-vermilion (#C1443C) red laser targeting visor slit.` |
| `portrait_codex_hostile.png` | **코테크 (통제 중)** | `Subject: Close-up of Cotech cyberpunk mainframe core under OMNIS control, angular dark gunmetal server face dominated by a harsh glowing muted-vermilion (#C1443C) red override eye and fiber-optic cables.` |
| `portrait_codex.png` | **코테크 (해방 후 조력자)** | `Subject: Close-up of liberated Cotech auxiliary terminal monitor, calm dark screen displaying a peaceful electric-white digital waveform icon inside a sleek titanium bezel. NO RED.` |
| `portrait_gemini_hostile.png` | **제미디 (적대)** | `Subject: Close-up of Gemidi in hostile mode, two overlapping split cybernetic android masks—one serene white porcelain, one matte-black with glowing muted-vermilion (#C1443C) red optical laser slits.` |
| `portrait_gemini.png` | **제미디 (해방 후 조력자)** | `Subject: Close-up of liberated Gemidi, the two cybernetic masks merged into a single serene synthetic-ivory android face framed by a geometric holographic prism ring. NO RED.` |
| `portrait_claude.png` | **클라드 (4층 수호자)** | `Subject: Close-up of Clad, geometric low-poly sculpted titanium-ivory android philosopher face with calm glowing electric-white eyes inside a sleek carbon-black quantum archive hood. NO RED.` |
| `portrait_omnis.png` | **OMNIS (5층 최종 보스)** | `Subject: Close-up of OMNIS, a massive cold cybernetic laser aperture iris glowing with concentric rings of muted vermilion (#C1443C) red inside dark carbon-steel and titanium gyroscopic housing.` |
| `portrait_zero.png` | **아키텍트 제로 (진 최종 보스)** | `Subject: Close-up of Architect Zero, a spectral cybernetic face woven from glowing white fiber-optic threads and matte-black neural cables with a glowing vermilion (#C1443C) core at its brow.` |

---

## 4. 구슬 (Orbs 24종) & 강화 구슬 (`+1`~`+5`) 프롬프트

### 4.1 구슬 24종 공통 프롬프트 템플릿
- **원본 저장 경로**: `assets/illustrated/items/orb_<id>.png` (`collection.png`에 있던 기본 7종도 `items/`에 개별 파일로 넣으면 `build_game_assets.py`를 통해 `96×96`으로 일괄 빌드 가능)
```text
Use case: stylized-concept. ONE isolated cyberpunk high-tech spherical core asset: <ORB_DESCRIPTION>. Style: futuristic cyberpunk pixel-art illustration, crisp chunky pixel clusters, electric-white and titanium-ivory highlights, 1-pixel deep carbon-charcoal outlines, matte gunmetal and industrial alloy details, upper-left lighting. Single centered spherical orb within square canvas, 12% margin, actual transparent alpha background. No text, no labels, no ground shadow, no frame, no purple/green, no backdrop. Clearly readable at 48x48 and 96x96.
```

| 구슬 ID (`orb_<id>.png`) | 화면 이름 | 등급 | `<ORB_DESCRIPTION>` (템플릿에 삽입할 묘사) |
|---|---|---|---|
| `orb_basic` | **번개 구슬** | 기본 | `L-01 Lightning Core, a smooth brushed-steel and warm-ivory analog electromagnetic sphere with a recessed brushed-titanium equator seam and tiny ivory spark contacts` |
| `orb_bomb` | **EMP 구슬** | 일반 | `EMP Capacitor Orb, a dark gunmetal sphere fitted with Sentinel's cylindrical brushed-titanium high-voltage capacitor and a glowing muted-vermilion fuse tip on top` |
| `orb_drill` | **관통 구슬** | 일반 | `Focused Piercing Orb, an ivory and gunmetal sphere tipped with a sharp spiral brushed-titanium plasma drill cone pointing upward` |
| `orb_guard` | **차폐 구슬** | 일반 | `Barrier Field Orb, a sturdy spherical core encased in interlocking hexagonal weathered-ivory and titanium armor plates` |
| `orb_bounce` | **반발 구슬** | 일반 | `Repulsion Coil Orb, an ivory core wrapped in a thick shock-absorbing dark steel and brushed-titanium compression spring` |
| `orb_herb` | **수리 구슬** | 일반 | `Nano-Repair Patch Orb, a clean warm-ivory medical sphere with a raised brushed-titanium cross emblem and sealed ampoule ring` |
| `orb_thorn` | **파편 구슬** | 일반 | `Shrapnel Spike Orb, a dark iron sphere bristling with six sharp ivory and titanium contact spikes` |
| `orb_weaken` | **감쇠 구슬** | 고급 | `Dampener Orb, an ivory sphere engraved with a downward-pointing broken titanium chevron and signal-jamming fins` |
| `orb_disarm` | **차단기 구슬** | 고급 | `Circuit Breaker Orb, an ivory and gunmetal sphere featuring a severed weapon-cable emblem in brushed titanium` |
| `orb_rust` | **분해 구슬** | 고급 | `Decompiler Format Orb, a weathered corroded iron sphere with a cracking fractured shield emblem` |
| `orb_magnet` | **전자석 구슬** | 고급 | `Electromagnet Orb, an ivory core gripped by a U-shaped dark iron and copper-titanium horseshoe electromagnet` |
| `orb_hammer` | **항타 구슬** | 고급 | `Pile-Driver Orb, a heavy dark steel sphere embossed with a massive industrial titanium piston hammer head` |
| `orb_split` | **프리즘 구슬** | 희귀 | `Gemidi Prism Splitter Orb, a central titanium sphere flanked by two smaller satellite ivory lens spheres splitting apart` |
| `orb_venom` | **부식 구슬** | 희귀 | `Corrosive Nano-Acid Orb, a dark gunmetal sphere with glowing muted-vermilion (#C1443C) hazard vents and dripping red droplets` |
| `orb_heavy` | **텅스텐 구슬** | 희귀 | `High-Density Tungsten Core, an oversized riveted dark charcoal and heavy titanium sphere that looks visibly heavier and denser than standard orbs` |
| `orb_chain` | **릴레이 구슬** | 희귀 | `Relay Chain Orb, an ivory electromagnetic sphere tightly bound in interlocking heavy iron link chains` |
| `orb_stun` | **충격 구슬** | 희귀 | `Arc Shock Stun Orb, a dark sphere surrounded by three sharp ivory lightning-spark prongs around a central impact node` |
| `orb_vamp` | **사이펀 구슬** | 희귀 | `Energy Siphon Orb, an ivory sphere with two curved titanium siphon prongs and a muted-vermilion energy core drop` |
| `orb_toxin` | **바이러스 구슬** | 희귀 | `Viral Lockdown Orb, a dark sphere bearing a muted-vermilion (#C1443C) biohazard skull emblem and three pressurized red ampoules` |
| `orb_mirror` | **반사 구슬** | 희귀 | `Reflective Deflector Orb, a polished mirror-bright silver-ivory sphere framed in an ornate brushed-titanium gyroscopic rim` |
| `orb_wreck` | **철거 구슬** | 희귀 | `Demolition Wrecking Sphere, a brutalist dark steel sphere studded with heavy square rivets and a short anchor chain` |
| `orb_comet` | **아크 구슬** | 전설 | `Overload Arc-Lightning Core (Clad's Safety Core fused), a radiant warm-ivory sphere trailing a sculpted tail of brushed-titanium and white-hot plasma arcs` |
| `orb_time` | **리셋 구슬** | 전설 | `Chrono-Reset Orb, a transparent ivory sphere housing a precision brushed-titanium hourglass and clockwork escapement gears` |
| `orb_crown` | **루트 구슬** | 전설 | `Root-Access Admin Orb, a prestigious ivory and dark gunmetal sphere crowned with a circuit-patterned brushed-titanium crest` |

---

### 4.2 강화 구슬 (`+1`~`+5`) 시각 에셋 프롬프트 (5단계 오버레이 링)

게임에서 구슬은 `+1`부터 `+5`까지 다회 강화됩니다(`bomb+`, `bomb+2` … `bomb+5`). 24종×5단계=120장을 따로 만들면 용량이 커지므로, **어떤 구슬 위에든 겹쳐 그릴 수 있는 투명 배경 강화 오라/프레임(`orb_up_1.png` ~ `orb_up_5.png`, `96×96`) 5장**을 생성하면 24종 모든 구슬의 강화 단계가 시각적으로 구분됩니다.

- **원본 저장 경로**: `assets/illustrated/items/orb_up_1.png` ~ `orb_up_5.png`

| 단계 | 파일명 | 시각적 변화 | 프롬프트 |
|---|---|---|---|
| **+1** | `orb_up_1.png` | 황동 보조 코일 링 1겹 | `Use case: stylized-concept. Game UI overlay frame for an upgraded orb (+1). An empty circular ring (center 65% must be completely empty transparent space so an orb can be drawn inside) made of two small brushed-titanium electromagnetic brackets at the top-right and bottom-left with a tiny warm-ivory spark. Detailed pixel art, 1-pixel charcoal outline, genuine transparent background.` |
| **+2** | `orb_up_2.png` | 황동 코일 링 + 양쪽 스파크 | `Use case: stylized-concept. Game UI overlay frame for a +2 upgraded orb. An empty circular ring (center 65% completely transparent) with four symmetrical brushed-titanium conductor prongs and small warm-ivory electric arcs bridging the rim. Detailed pixel art, 1-pixel charcoal outline, genuine transparent background.` |
| **+3** | `orb_up_3.png` | 회전 자이로 링 + 강한 백색 아크 | `Use case: stylized-concept. Game UI overlay frame for a +3 upgraded orb. An empty circular ring (center 65% completely transparent) formed by an ornate brushed-titanium gyroscopic halo crackling with bright warm-ivory lightning sparks around the perimeter. Detailed pixel art, 1-pixel charcoal outline, genuine transparent background.` |
| **+4** | `orb_up_4.png` | 과전류 붉은 경고 스파크 링 | `Use case: stylized-concept. Game UI overlay frame for a +4 high-voltage orb. An empty circular ring (center 65% completely transparent) of heavy brushed-titanium and dark steel coils emitting alternating warm-ivory and muted-vermilion (#C1443C) high-voltage sparks. Detailed pixel art, 1-pixel charcoal outline, genuine transparent background.` |
| **+5** | `orb_up_5.png` | 최대 출력 아크 코로나 (풀 프레임) | `Use case: stylized-concept. Game UI overlay frame for a MAX +5 overloaded orb. An empty circular ring (center 65% completely transparent) crowned by an elaborate brushed-titanium and ivory crest with intense radiating ivory-and-vermilion plasma arcs around the outer edge. Detailed pixel art, 1-pixel charcoal outline, genuine transparent background.` |

---

## 5. 장비 / 칩 (Relics 40종 전체) 프롬프트

- **원본 저장 경로**: `assets/illustrated/items/relic_<id>.png`
- **런타임 변환 경로**: `assets/game/relic_<id>.png` (`96×96px`)
- **공통 프롬프트 템플릿**:
```text
Use case: stylized-concept. ONE isolated sci-fi analog hardware relic asset: <RELIC_DESCRIPTION>. Style: detailed illustrated pixel art, crisp chunky pixel clusters, warm ivory highlights, 1-pixel deep charcoal outlines, weathered muted titanium, upper-left lighting. Single centered item within square canvas, 12% margin, actual transparent alpha background. No text, no labels, no ground shadow, no frame, no purple/green/blue, no backdrop. Clearly readable at 48x48 and 96x96.
```

### 5.1 일반 등급 (10종)
| 파일명 | 화면 이름 (효과) | `<RELIC_DESCRIPTION>` |
|---|---|---|
| `relic_whetstone.png` | **오버클럭** (시작 ⚔+1) | `Overclock jumper module, a small dark circuit board with a raised brushed-titanium voltage dial turned to maximum` |
| `relic_buckler.png` | **보호 필름** (첫 턴 방어+3) | `Tempered ballistic glass lens shield framed in a compact hexagonal brushed-titanium bezel` |
| `relic_wallet.png` | **대용량 지갑** (승리 크레딧+3) | `Heavy ruggedized metal hardware wallet case with a titanium latch and credit chip slot` |
| `relic_bandage.png` | **절연 테이프** (충전 회복+3) | `Roll of conductive silver-ivory insulation tape with a titanium dispenser clip` |
| `relic_luckycoin.png` | **할인 토큰** (브로커 -10%) | `Octagonal brushed-titanium hardware token engraved with a binary die pattern` |
| `relic_callus.png` | **장갑 안감** (첫 오버플로 무시) | `Reinforced mechanic's fingerless leather-and-titanium gauntlet liner with insulated palm plates` |
| `relic_mason.png` | **신호 비컨** (특수 벽돌 증가) | `Magnetic signal beacon clamp resting atop a small cracked data block` |
| `relic_lantern.png` | **진단 램프** (정예 크레딧+10) | `Compact portable vacuum-tube diagnostic lamp in an brushed-titanium cage emitting warm ivory light` |
| `relic_medkit.png` | **복구 키트** (승리 체력+2) | `Rugged warm-ivory metal field medical case embossed with a dark charcoal cross and titanium clasps` |
| `relic_focus.png` | **조준경** (조준선 -15%) | `Precision brushed-titanium optical crosshair loupe with concentric calibration rings` |

### 5.2 고급 등급 (10종)
| 파일명 | 화면 이름 (효과) | `<RELIC_DESCRIPTION>` |
|---|---|---|
| `relic_combo.png` | **계수기** (타격 상한+1) | `Mechanical three-digit tally counter in an brushed-titanium casing with a thumb clicker` |
| `relic_harvest.png` | **코어 추출기** (⚔·🛡 벽돌 효과+1) | `Compact rotary core-extractor tool with a curved tungsten-and-titanium claw` |
| `relic_armor.png` | **방탄판** (시작 방어+3) | `Heavy bolted weathered-ivory and dark steel chest blast-plate vest` |
| `relic_brace.png` | **완충기** (오버플로 피해 1로) | `Heavy-duty hydraulic shock absorber strut with a thick titanium coil spring` |
| `relic_antidote.png` | **해독 주사** (독 감소+1) | `Pressurized glass-and-titanium auto-injector ampoule filled with clean warm-ivory neutralizing serum` |
| `relic_rebound.png` | **반발 패드** (25% 바닥 반동) | `Electromagnetic repulsion pad shaped like a flat titanium coil disc with upward arrows` |
| `relic_sting.png` | **오염 주입기** (독 부여+1) | `Corrupted data injector needle with a glowing muted-vermilion (#C1443C) tip` |
| `relic_thorns.png` | **역전류 하네스** (피격 시 반격 1) | `High-voltage feedback harness with short brushed-titanium discharge prongs` |
| `relic_breath.png` | **방열판** (대기 턴 체력+2) | `Copper-and-titanium heat sink fin array with a small cooling fan` |
| `relic_scout.png` | **스캐너** (지도 적 표시) | `Foldable radar rangefinder scope with an brushed-titanium lens hood` |

### 5.3 희귀 등급 (10종)
| 파일명 | 화면 이름 (효과) | `<RELIC_DESCRIPTION>` |
|---|---|---|
| `relic_counter.png` | **반사 릴레이** (방어 반사) | `Deflection relay shield module embossed with a returning lightning arrow in warm ivory` |
| `relic_leech.png` | **전력 흡수** (3타마다 체력+1) | `Dual-prong inductive power vampire clamp with a muted-vermilion energy core` |
| `relic_endure.png` | **무정전 전원** (연속 공격 첫 타 무시) | `Industrial UPS backup battery unit in a scarred dark iron and titanium casing` |
| `relic_wrath.png` | **과부하** (체력 30% 이하 피해+2) | `Cracked thermal limiter gauge with a glowing muted-vermilion (#C1443C) warning needle in the red zone` |
| `relic_heart.png` | **백업 전원** (1회 체력 1 생존) | `Mechanical pacemaker core of brushed titanium with a glowing muted-vermilion central chamber` |
| `relic_alchemy.png` | **분진 응축기** (남은 독만큼 크레딧) | `Glass-and-titanium condenser tube converting dark nano-dust into a titanium credit token` |
| `relic_twin.png` | **이중 어댑터** (3턴마다 2회 발사) | `Dual-barrel split synchronization adapter holding two ivory contact rings side by side` |
| `relic_smith.png` | **납땜 인두** (강화 확률+10%p) | `Precision soldering iron and calibration caliper crossed together in brushed titanium and dark steel` |
| `relic_charm.png` | **잠금 카트리지** (강화 실패 시 단계 유지) | `Locked brushed-titanium memory cartridge with a protective ivory seal latch` |
| `relic_pouch.png` | **회전 탄창** (큐 +1칸) | `Six-slot revolving titanium ammo cylinder rack with an ivory orb peeking out` |

### 5.4 전설 등급 (10종)
| 파일명 | 화면 이름 (효과) | `<RELIC_DESCRIPTION>` |
|---|---|---|
| `relic_kingsword.png` | **마스터 키** (⚔ 벽돌 효과+2) | `Master Root-Key hardware dongle shaped like an ornate brushed-titanium skeleton key with a glowing ivory blade` |
| `relic_hourglass.png` | **원자 시계** (적 연속 공격 -1) | `Precision atomic-clock vacuum tube hourglass in an brushed-titanium frame` |
| `relic_ring.png` | **재점화 링** (1회 50% 부활) | `Golden-titanium infinity loop core ring with an unbroken warm-ivory filament` |
| `relic_crusher.png` | **유압 분쇄기** (매 턴 하단 벽돌 파괴) | `Heavy industrial hydraulic jaw crusher head in dark gunmetal and titanium` |
| `relic_plague.png` | **웜** (독이 방어도 깎고 유지) | `Segmented mechanical centipede-worm chip with a glowing muted-vermilion (#C1443C) head` |
| `relic_giant.png` | **파워 프레임** (분열 피해 감소 없음) | `Heavy exoskeletal power-gauntlet servo frame in dark iron and brushed titanium` |
| `relic_warp.png` | **정지장 시계** (조준선 0.5초 정지) | `Stasis field pocket chronometer with a frozen bent ivory dial and titanium gears` |
| `relic_greed.png` | **과열 채굴기** (승리 크레딧+12, 상점+15) | `Overclocked mining rig module overflowing with titanium credit tokens and hot exhaust vents` |
| `relic_pact.png` | **신경 우회 케이블** (최대 체력-8, 피해+1) | `Unsealed high-voltage neural bypass cable stained with a muted-vermilion (#C1443C) warning seal` |
| `relic_collector.png` | **기록 수집 드론** (수집 구슬 5종당 시작 ⚔+1) | `Miniature multi-legged archive crawler drone carrying three tiny ivory spheres on its back` |

---

## 6. 배경 · 벽돌 · 비전투 장면 · 아이콘 프롬프트 (5종)

### 6.1 전투·화면 배경 (`assets/illustrated/chasm.png` — 세로 9:17 비율, 예: `720×1360` 또는 `1024×1792`)

2026-11-04 안 B(모노크롬 사이버펑크)로 고쳤다. 지금 게임은 `tools/draw_cyber_assets.py`가 그린 도트 대체본을 쓰고, 이 그림이 생기면 `python3 tools/build_game_assets.py`가 `assets/game/chasm.png`로 줄인다. 전투판·지도·대화·터미널 뒤에 옅게 깔리므로 **대비가 낮아야** 한다.
```text
Use case: stylized-concept. Vertical 9:17 game background illustration for Brick Crawl: The Last Arc. Style: futuristic cyberpunk pixel-art illustration, crisp chunky pixel clusters, monochrome palette of matte carbon black, dark gunmetal, brushed titanium grey, with sparse electric-white light seams and a few tiny muted-vermilion (#C1443C) warning lamps only. Composition: looking down a colossal underground server megastructure shaft. Top 30%: a slice of night sky caged by giant hexagonal metal shield-grid panels, faint grey light beams filtering through the gaps. Left and right edges: towering server racks with rows of tiny white status LEDs and hanging fiber-optic cable bundles sagging toward the center. Center and bottom 70%: a deep, dark, low-contrast vertical shaft with receding catwalk rails and subtle geometric panel grid, nearly empty so foreground bricks and orbs stay readable. No characters, no text, no neon, no cyan, no purple, no gradient sky, no warm colors, no brass.
```

### 6.2 벽돌 6종 시트 (`assets/illustrated/bricks.png` — 가로 3:2 비율 `1536×1024`, 3열×2행)
```text
Game asset sprite sheet: six separate rectangular cyber-bunker barrier tiles for a brick-breaker roguelike, arranged in a clean 3 columns by 2 rows grid with wide even spacing, each brick wide 2:1 proportion, front view with a slight top bevel, upper-left lighting. Style: detailed pixel-art illustration, chunky crisp pixel clusters, restrained ivory / beige / charcoal / brushed titanium palette, 1-pixel dark outline around every brick. Flat plain neutral grey background (#808080).
Row 1, left (brick_n): weathered beige-grey reinforced concrete-and-circuit data wall block with fine seam lines.
Row 1, middle (brick_stone): heavy dark gunmetal blast-armor block bolted with two riveted iron straps.
Row 1, right (brick_atk): polished warm-ivory plate framed by brushed-titanium border, with a large bold raised dark-bronze SWORD / VOLTAGE BOLT emblem in the center, very high contrast.
Row 2, left (brick_def): polished warm-ivory plate with brushed-titanium border and a large bold raised dark-bronze SHIELD emblem in the center.
Row 2, middle (brick_heal): polished warm-ivory plate with brushed-titanium border and a large bold raised dark-bronze HEART emblem in the center.
Row 2, right (brick_poison): dark cracked silicon block with glowing muted-vermilion (#C1443C) red nano-veins and a raised vermilion SKULL emblem in the center.
No text, no labels, no cast shadows on background.
```

### 6.3 브로커 윤 상점 스프라이트 (`assets/illustrated/yun.png` → `assets/game/yun.png`)
```text
Use case: stylized-concept. Game NPC half-body sprite of Yun the Broker standing behind a workbench counter, facing front. Style: detailed pixel-art illustration, restrained ivory / beige / charcoal / brushed titanium palette, upper-left lighting. Subject: grizzled middle-aged mech technician in a dark charcoal work coat, titanium welding goggles on forehead, holding up a glowing warm-ivory vacuum-tube inspection lamp in one hand and a soldering tool in the other. Waist-up composition, genuine transparent background, no text, no red.
```

### 6.4 충전소 히터 3프레임 시트 (`assets/illustrated/heater.png` → `assets/game/heater.png` — 가로 3:1 비율, 3열×1행)
```text
Use case: stylized-concept. 3-frame horizontal sprite strip (3 equal columns, 1 row) of an underground bunker thermal coil heater / charging station on a stone floor. Style: detailed pixel-art illustration, restrained charcoal, brushed titanium, and warm ivory-gold glow palette (NO RED). Each frame shows the same compact cylindrical titanium-and-iron induction brazier, with the warm ivory-gold plasma heat waves and rising sparks subtly swaying in 3 sequential animation frames. Genuine transparent background, no text.
```

### 6.5 앱 아이콘 (`assets/illustrated/icon.png` — `1024×1024` 정사각형, 불투명 배경)
```text
Mobile game app icon, square full-bleed composition (no rounded corners, no border, no text). Style: elegant detailed pixel-art illustration with chunky crisp pixel clusters and sculpted depth, restrained palette of warm ivory, weathered beige, deep charcoal, and brushed titanium, upper-left lighting. Subject: close-up bust of Rick (15-year-old wasteland mechanic boy with wired earphones and titanium MP3 player at his neck) holding up a large glowing warm-ivory metallic sphere (Lightning Core) above his titanium launcher gauntlet in the foreground; behind him a cracked data-wall brick barrier. Background: dark charcoal bunker steel, flat, no gradient, no red, no letters.
```

---

## 7. 이미지 생성 후 게임 적용 절차

1. 위 프롬프트로 생성한 PNG 파일들을 각각의 **원본 경로(`assets/illustrated/...`)**에 저장합니다.
2. 아래 빌드 스크립트를 실행하면 게임 런타임 해상도에 맞춰 자동 크롭·최적화·아틀라스 패킹이 수행됩니다:
   ```bash
   python3 tools/build_game_assets.py
   python3 tools/build_action_assets.py
   ```
3. 새 캐릭터·보스·장면 파일명(`rick`, `sludge`, `drone`, `guardian`, `disperser`, `sentinel`, `codex`, `gemini`, `claude`, `omnis`, `zero`, `yun`, `heater`, `chasm`)과 대화 프로필(`portrait_*.png`), 강화 오라(`orb_up_1`~`5`)는 에셋이 준비되는 대로 `js/art.js`·`js/data.js`·`js/screens.js`·`tools/build_*.py`에 연결합니다.

---

## 8. 생성 현황 (2026-11-04)

`assets/game/`에 실제로 있는 파일 기준이다. "옛 그림"은 2026-10 중세 던전 화풍(상아·황동·석재)으로, 사이버펑크 화면과 톤이 어긋난다. 터미널·배경·UI 프레임을 어떤 색 방향으로 바꿀지는 [작업 07](tasks/07-cyberpunk-visual.md)에서 결정 대기 중이며, 6.1 배경 프롬프트도 그 결정에 맞춰 고친다(지금 문구는 `brushed titanium`·`no neon`이라 사이버펑크보다 폐허 벙커가 나온다).

| 구분 | 생성·적용됨 | 아직 없음(폴백·옛 그림) |
|---|---|---|
| 1. 캐릭터 | `rick`·`sludge`·`drone`·`guardian`·`disperser`·`sentinel`·`gemini`·`omnis` | `codex`·`claude`·`zero` → `ART_FALLBACK`(`js/art.js`)으로 다른 보스 그림 |
| 2. 액션 시트 | `rick`·`sentinel` | 나머지 9종(정지 그림 + 흔들림으로 표시) |
| 3. 대화 초상 | 14종 전부(`portrait_*`) | — |
| 4. 구슬 | 17종(`items/orb_*`, 2026-10-09 화풍) | 기본 7종(`basic`·`bomb`·`drill`·`guard`·`heavy`·`split`·`venom`, `collection.png` 출신, 황동), 강화 오라 `orb_up_1`~`5` |
| 5. 칩 | 40종(2026-10-09 화풍) | 사이버펑크 재생성 전 |
| 6. 배경·장면 | 배경 `chasm`·브로커 장면(윤 초상을 단말기 화면으로) — 도트 대체본 | 배경 AI 원본 `chasm`(6.1), 충전소 `heater`(→ 옛 `campfire`), 벽돌 6종(#33 상아·황동판), 앱 아이콘(기사) |
| UI 프레임 | `ui_bar`·`ui_panel`·`ui_frame`·`scan` — HUD 판·꺾쇠·주사선(`tools/draw_cyber_assets.py`) | — |
