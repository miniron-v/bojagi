# 누빔 공방 · Nubim Workshop

천 조각을 끌어 수틀을 채우고, 줄이 차면 바늘이 그 줄을 누비는 모바일 퍼즐 로그라이트.
Block Blast의 손맛에 Balatro의 **칩 × 배수** 점수 엔진(여기선 **점 × 배수**, 장터 돈은 냥)을 얹어 한 판 10분 남짓으로 압축했습니다.

- 8×8 수틀, 3개씩 주어지는 조각, 가로·세로 줄 완성 시 바느질
- 주문마다 목표 점수와 조각 수 제한, 장인 의뢰(보스)는 쉬운 규칙부터 하루에 하나씩
- 바느질 족보 7종(홈질·겹누비·십자수·납작누비·세누비·오목누비·마무리, 전통 누비 기법과 공정에서 따온 이름)과 레벨을 올리는 바느질 본
- 바느질 도구 27종이 점수 엔진(최대 5개), 장터에서 사고팔기와 이자
- 오늘의 의뢰(모두 같은 판) · 연속 기록 · 결과 공유, 도구 도감과 해금, 밤샘 작업(무한)
- 오방색 조각, 가야금 오음계 효과음(모두 코드로 합성), 진동, 진행 자동 저장

## 플레이

**바로 플레이: https://miniron-v.github.io/bojagi/** (main에 푸시하면 자동 배포)

`dist/index.html` 하나로 동작합니다(코드·그림·소리 모두 포함, 글꼴만 Google Fonts에서 받고 없으면 기본 글꼴로 대체).
브라우저로 열거나 아무 정적 호스팅(GitHub Pages 등)에 올리면 됩니다.

## 개발

```bash
npm install
npm test            # 코어 규칙 단위 테스트 (node --test)
npm run build       # src → dist/index.html, dist/artifact.html (esbuild, 단일 파일)
npm run sim         # 밸런스 시뮬레이터: node tools/simulate.mjs [판수] [smart|greedy] [value|rarity] [DAY_BASE]
node tools/e2e.mjs 390 844 40     # 헤드리스 실제 드래그 플레이 + 스크린샷 (shots/)
node tools/states.mjs 360 640     # 보스·일시정지·종료 화면 상태 스크린샷
```

## 구조

```
src/core/   순수 로직 (DOM 없음, 저장 가능한 JSON 상태)
  rng.js        시드 PRNG (오늘의 의뢰, 이어하기 재현)
  shapes.js     조각 모양과 회전
  board.js      배치·줄 판정·지우기
  seams.js      바느질 족보 판정·레벨
  scoring.js    점 × 배수 계산과 단계별 내역(연출용)
  tools.js      바느질 도구 정의
  unlocks.js    도구 해금 조건
  challenges.js 도전 과제(한 판 목표 → 스킨 보상)
  records.js    공방 일지(기록·연속 일수·해금 판정)
  run.js        주문·장터·보스·경제 상태 머신, 저장 검증·마이그레이션
src/ui/     화면
  view.js       캔버스 수틀, 드래그 앤 드롭, 바느질·파티클·글자 연출
  main.js       컨트롤러: HUD, 점수 집계 연출, 시트(장터·보상·종료), 저장
  audio.js      Web Audio 합성 (Karplus–Strong 가야금)
  skins.js      공방 꾸미기: 스킨별 CSS 변수와 캔버스 색
  art.js · icons.js · title-art.js · quilt.js · format.js · store.js · style.css
tools/      빌드, 시뮬레이터, e2e 스크립트
```

기획과 수치는 [DESIGN.md](DESIGN.md)를 보세요.
