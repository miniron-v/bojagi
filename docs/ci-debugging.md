# CI(배포)가 실패했는데 로그를 못 볼 때

이 작업 환경(Claude 클라우드 세션)에서 확인된 사실과, 원인을 찾는 방법을 정리한다.
CI의 UI 감사가 실패한 일을 직접 겪은 적은 없다. 아래 방법은 이 환경에서 무엇이 되고 안 되는지 확인한 사실에 기반한다.

## 이 환경에서 되는 것 / 안 되는 것
| 동작 | 결과 |
|---|---|
| `gh run list`, `gh run view <run> --json status,conclusion` | 됨 (api.github.com) |
| `gh api repos/miniron-v/bojagi/actions/runs/<run>/jobs` | 됨 → job id를 얻을 수 있음 |
| `gh run view --log`, `--log-failed`, job logs API | **안 됨**: 로그 zip이 `results-receiver.actions.githubusercontent.com`에 있고 프록시가 403으로 막음 |
| Actions artifact 내려받기 | 같은 저장소 계열(blob)이라 막힐 가능성이 큼 (미확인) |
| `git fetch` / `git push` (github.com) | 됨 |

## 방법 1 — 주석(annotation)으로 문제 목록 받기 (가장 빠름)
`tools/ui-audit.mjs`는 CI에서 문제마다 `::error title=UI audit::…` 줄을 찍는다(커밋 f220c87). 이 줄은 주석이 되고, 주석은 API로 읽힌다.

```sh
RUN=<실패한 run id>            # gh run list -L 5
JOB=$(gh api repos/miniron-v/bojagi/actions/runs/$RUN/jobs --jq '.jobs[0].id')
gh api repos/miniron-v/bojagi/check-runs/$JOB/annotations --jq '.[] | .message'
```
- 주의: GitHub는 단계(step)당 error 주석을 **10개**, 작업(job)당 **50개**까지만 보관한다.
  같은 원인이 화면 크기마다 반복되면 앞 10개만 보인다. 그래서 감사가 **문제 종류별 요약 1줄**을 먼저 찍게 해 두면 좋다
  (예: `[aim] layout shift ×7 sizes`).
- "exit code 1"만 보이면 감사 주석 줄이 찍히기 전에 죽은 것이다. 예를 들면 브라우저 실행 실패나 페이지 오류가 원인이다. 이때는 방법 2로 간다.

## 방법 2 — 실패 보고서를 git 브랜치로 받아 오기 (로그가 전혀 없을 때)
git은 프록시를 통과하므로, CI가 실패 시 보고서와 스크린샷을 별도 브랜치에 push하게 하면 로컬에서 `git fetch`로 받을 수 있다.

워크플로 감사 단계를 다음처럼 바꾼다(`continue-on-error` 대신 실패 후 보고서를 올리고 다시 실패시킨다):
```yaml
      - name: UI audit
        run: npm run audit:ui -- --shots 2>&1 | tee audit.log
      - name: Publish audit report on failure
        if: failure()
        run: |
          mkdir report && cp audit.log report/ && cp -r shots/audit report/shots 2>/dev/null || true
          cd report && git init -q -b ci-audit
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add -A && git commit -qm "audit ${GITHUB_SHA::7}"
          git push -f "https://x-access-token:${{ secrets.GITHUB_TOKEN }}@github.com/${{ github.repository }}.git" ci-audit
```
(`tee`를 쓰면 파이프 때문에 종료 코드가 사라지므로, 단계에 `shell: bash` + `set -o pipefail`를 함께 둔다.)

로컬에서:
```sh
git fetch -q origin ci-audit && git show origin/ci-audit:audit.log | tail -60
git worktree add /tmp/ci-audit origin/ci-audit   # 스크린샷까지 열어 보려면
```

## 방법 3 — CI 조건을 로컬에서 흉내 내기
CI와 로컬의 차이:
1. **브라우저**: 로컬은 `/opt/pw-browsers/chromium-1194`, CI는 `npx playwright-core install` 버전이다. 버전이 다르면 글자 너비가 조금 다를 수 있다.
2. **폰트**: `tools/fonts-route.mjs`는 Hahmlet만 로컬 파일로 넣는다. 그 밖의 글리프(기호·이모지 등)는 CI 러너의 시스템 폰트로 대체된다.
   러너엔 한글 시스템 폰트가 없다. Hahmlet에 없는 글자가 있으면 너비가 달라진다.
3. **속도**: CI 러너는 느리다. 감사는 고정 대기(`waitForTimeout` 200~700ms)로 애니메이션·폰트 로딩이 끝났다고 가정한다.
   느린 환경에선 측정 시점에 전환이 덜 끝나 "조준 전후 레이아웃 불변" 같은 비교 검사가 거짓 실패할 수 있다.

로컬에서 느린 CI를 흉내 내기 (CDP로 CPU 4~6배 감속):
```js
const cdp = await page.context().newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
```
이 상태로 감사를 돌려 같은 실패가 재현되면 타이밍 문제다. 고정 대기를 **조건 대기**로 바꾼다:
- 폰트: `await page.evaluate(() => document.fonts.ready)`
- 전환·애니메이션: `await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)))`
- 비교 검사: 측정 전 두 번의 `requestAnimationFrame`을 기다리고, 레이아웃이 1~2px 흔들리는 것은 허용 오차로 둔다.

폰트 차이를 의심하면 감사가 측정한 요소의 `document.fonts.check('16px Hahmlet')` 결과와 실제 렌더 폰트를 주석으로 함께 찍는다.

## 정리: 순서
1. `gh run list`로 실패 run을 찾는다 → 방법 1로 주석을 읽는다.
2. 주석이 없거나 잘렸으면 방법 2(보고서 브랜치)를 붙이고 다시 돌린다.
3. 로컬에서 방법 3으로 재현해 원인을 타이밍/폰트/진짜 레이아웃 중 하나로 가른다.
4. 진짜 레이아웃 문제면 고친다. 타이밍 문제면 감사를 조건 대기로 고친다. **감사 관문을 끄거나 우회하지 않는다.**
