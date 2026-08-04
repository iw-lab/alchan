/**
 * Vite 설정 — CRA(react-scripts) 대체.
 *
 * 이 앱은 1년 넘게 CRA 위에서 자라서, 옮길 때 걸리는 지점이 세 곳이다. 셋 다
 * **소스를 안 고치고** 설정에서 흡수한다. 이식이 아니라 기반 교체이므로, 코드가
 * 안 바뀔수록 "돌던 게 그대로 도는지"를 확인하기 쉽다.
 */
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode, command }) => {
  // ① 환경변수: 소스 17곳이 `process.env.REACT_APP_*` 를 쓴다.
  //    이름을 VITE_* 로 바꾸면 소스 17곳 + .env + 배포 설정을 동시에 건드려야 해서,
  //    기반 교체와 이름 변경이라는 별개의 두 변경이 한 커밋에 섞인다. 여기서는
  //    빌드 시점에 값을 그대로 박아 넣어(define) CRA 와 **동일한 결과**를 만든다.
  //    ⚠️ 이건 호환 계층이다. 나중에 이름을 정리하려면 이 블록을 지우고 소스를
  //       `import.meta.env.VITE_*` 로 바꾸면 된다 — 그때는 그 변경만 하면 된다.
  const env = loadEnv(mode, process.cwd(), "REACT_APP_");
  const define = Object.fromEntries(
    Object.keys(env)
      .filter((k) => k.startsWith("REACT_APP_"))
      .map((k) => [`process.env.${k}`, JSON.stringify(env[k])]),
  );
  // 소스 65곳이 참조한다. Vite 도 넣어주지만 명시해 두면 값이 예상과 어긋날 일이 없다.
  // ⚠️ `mode` 가 아니라 `command` 로 판단한다. mode 로 하면 `vite build --mode staging`
  //    처럼 기본이 아닌 모드로 빌드했을 때 **프로덕션 산출물인데 NODE_ENV=development**
  //    가 박힌다. 이 앱에서 그건 단순한 라벨 문제가 아니라, 소스가 그 값으로
  //    Firebase 에뮬레이터(127.0.0.1) 연결 여부를 가르기 때문에 실제 접속처가 바뀐다.
  define["process.env.NODE_ENV"] = JSON.stringify(
    command === "build" ? "production" : "development",
  );

  // ⚠️ 값이 비어도 빌드는 성공한다 — 그리고 앱은 배포된 뒤 흰 화면으로 죽는다.
  //    CRA 도 이걸 안 막아줬다. 여기서 막는다: 빠진 게 있으면 빌드를 세운다.
  //    (이 목록은 소스에서 실제로 참조하는 것 중 없으면 앱이 못 뜨는 것들이다.
  //     RECAPTCHA·YOUTUBE 는 없어도 해당 기능만 죽으므로 뺐다.)
  const REQUIRED = [
    "REACT_APP_FIREBASE_API_KEY",
    "REACT_APP_FIREBASE_AUTH_DOMAIN",
    "REACT_APP_FIREBASE_PROJECT_ID",
    "REACT_APP_FIREBASE_STORAGE_BUCKET",
    "REACT_APP_FIREBASE_MESSAGING_SENDER_ID",
    "REACT_APP_FIREBASE_APP_ID",
  ];
  //    ⚠️ 단, **CI 에서는 세우면 안 된다.** `.env` 는 gitignore 대상이라 GitHub Actions
  //       체크아웃엔 없다. 이 가드를 무조건 던지게 두면 머지하는 순간 CI 가 영구 적색이
  //       되고(실측: exit 1), "CI 는 원래 빨간 것"이 되는 순간 진짜 회귀도 안 보인다.
  //       그리고 CI 를 세울 이유도 없다 — 배포되는 건 CI 의 산출물이 아니라 **로컬에서
  //       빌드해 커밋한 build/** 다(deploy.yml). 즉 이 가드가 지켜야 할 지점은
  //       개발자 machine 이고, CI 의 빌드는 "컴파일 되는가"를 보는 것이다.
  //       그래서 CI 는 ALLOW_MISSING_ENV=1 로 명시적으로 빠져나간다 —
  //       자동 CI 감지가 아니라 ci.yml 에 적힌 한 줄이라, 읽으면 보이고 grep 도 된다.
  const missing = REQUIRED.filter((k) => !env[k]);
  if (missing.length > 0 && command === "build") {
    const message = `환경변수 누락: ${missing.join(", ")}`;
    if (process.env.ALLOW_MISSING_ENV === "1") {
      console.warn(
        `\n⚠️  ${message}\n` +
          `   ALLOW_MISSING_ENV=1 이라 빌드를 계속합니다(컴파일 검사용).\n` +
          `   ⛔ 이 산출물은 배포하면 안 됩니다 — 실행하면 흰 화면입니다.\n`,
      );
    } else {
      throw new Error(
        `${message}\n` +
          `.env 파일을 확인하세요. 이대로 빌드하면 배포 후 흰 화면이 됩니다.\n` +
          `(컴파일만 확인하려면 ALLOW_MISSING_ENV=1)`,
      );
    }
  }

  return {
    plugins: [
      // ② JSX 가 `.js` 확장자에 들어 있다 — src 의 161개 중 **100개**가 그렇다.
      //    Vite 기본값은 `.js` 를 순수 JS 로 읽어 `<div>` 에서 파싱 에러를 낸다.
      //    파일 100개를 `.jsx` 로 rename 하는 방법도 있지만, 기반 교체와 무관한
      //    대량 변경이 섞이고 git 이력이 끊긴다. 플러그인에 확장자를 알려주는 쪽을 택했다.
      react({ include: /\.(jsx?|tsx?)$/ }),
    ],
    // esbuild 도 같은 사실을 알아야 한다(플러그인 전/후 단계가 갈린다).
    esbuild: { loader: "jsx", include: /src\/.*\.jsx?$/, exclude: [] },
    optimizeDeps: {
      esbuildOptions: { loader: { ".js": "jsx" } },
    },
    define,
    build: {
      // ③ 출력 경로는 반드시 `build/` — CRA 기본값이자, 이 저장소가 그 폴더를
      //    **git 에 커밋해서** GitHub Actions 가 배포한다(deploy.yml 이 build/** 변경에
      //    반응하고 폴더 존재를 확인한다). firebase.json 의 "public": "build" 도 같다.
      //    `dist` 로 바꾸면 빌드는 되는데 배포가 조용히 옛 파일을 계속 올린다.
      outDir: "build",
      // ④ 문법 하한선. Vite 기본값은 Safari 16 근방을 전제하는데, CRA 는 이 저장소의
      //    browserslist(`>0.2%, not dead`)를 읽어 **ios_saf 11 까지** 낮춰 내보내고 있었다.
      //    실측으로 확인한 차이(라이브 번들 vs 새 번들):
      //        ?. ??      구앱 변환됨 / 신앱 그대로  → Safari 13.1+ 필요
      //        ??= ||=    구앱 변환됨 / 신앱 그대로  → Safari 14+ 필요
      //    학생 기기 82대의 사양을 알 수 없고, 이 구문은 **파싱 단계에서 죽는다** —
      //    한 줄도 실행되기 전에 화면이 하얗게 남고, 로그인조차 못 간다. 에러도 안 뜬다.
      //    낮춰 잡는 비용은 실측 gzip +1.3 kB(첫 방문 0.5%)뿐이라 안 살 이유가 없다.
      //    ⚠️ Vite 는 CRA 와 달리 package.json 의 browserslist 를 **안 읽는다.** 여기서
      //       명시하지 않으면 그 설정은 있으나 마나다.
      target: ["es2019", "safari13", "chrome80", "firefox78", "edge88"],
      // 비운다. 확인해 보니 build/ 는 `public/ 전체 + CRA 산출물(static·asset-manifest·
      // index.html)` 로만 이루어져 있고, public/ 은 Vite 가 그대로 다시 복사한다.
      // 안 비우면 CRA 시절 번들(static/js/main.*.js)이 남아 계속 배포된다 —
      // 아무도 안 쓰는 파일을 Hosting 이 계속 보관하게 되는데, 이 프로젝트에서 비용
      // 1위가 Hosting 저장소였다.
      emptyOutDir: true,
      // 소스맵을 배포하지 않는다. CRA 기본값은 만들어서 배포했고, 실제로 라이브에서
      // main.js.map 이 4.3 MB 로 내려받아졌다 = 앱 전체 원본이 공개 상태였다.
      // (디버깅이 필요하면 로컬에서 true 로 바꿔 빌드하면 된다)
      sourcemap: false,
      // 기본값(esbuild)보다 terser 가 이 번들에서 gzip 기준 6.6 kB(2.4%) 작았다 — 실측.
      // 빌드가 2.5초 → 4.7초로 느려지지만 CRA 의 수십 초에 비하면 무시할 만하다.
      minify: "terser",
      terserOptions: { compress: { passes: 2 } },
      rollupOptions: {
        output: {
          // 벤더를 갈라 둔다. **총 바이트는 줄지 않는다** — 줄이는 건 재방문 비용이다.
          // 한 덩어리면 화면 코드 한 줄만 고쳐도 해시가 바뀌어 학생이 Firebase 500 kB 를
          // 통째로 다시 받는다. 갈라 두면 배포마다 바뀌는 건 작은 앱 청크뿐이고,
          // 벤더는 브라우저 캐시에 그대로 남는다(자산은 1년 immutable 로 서빙된다).
          manualChunks(id) {
            if (!id.includes("node_modules")) return;
            const m = id.match(/node_modules\/(@[^/]+\/[^/]+|[^/]+)/);
            const pkg = m && m[1];
            if (!pkg) return;
            // Firebase 가 이 앱 번들의 최대 덩어리다(firestore 297 + 나머지 ≈ 484 kB).
            if (pkg === "firebase" || pkg.startsWith("@firebase")) return "vendor-firebase";
            // 라우터는 @remix-run/router 를 끌고 온다 — 같이 묶어야 갈라지지 않는다.
            if (["react", "react-dom", "react-router", "react-router-dom", "scheduler"].includes(pkg) ||
                pkg.startsWith("@remix-run")) return "vendor-react";
          },
        },
      },
    },
    server: { port: 3000 },
    preview: { port: 3000 },
  };
});
