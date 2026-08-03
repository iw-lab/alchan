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
  define["process.env.NODE_ENV"] = JSON.stringify(
    mode === "production" ? "production" : "development",
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
  const missing = REQUIRED.filter((k) => !env[k]);
  if (missing.length > 0 && command === "build") {
    throw new Error(
      `환경변수 누락으로 빌드를 중단합니다: ${missing.join(", ")}\n` +
        `.env 파일을 확인하세요. 이대로 빌드하면 배포 후 흰 화면이 됩니다.`,
    );
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
      // 비운다. 확인해 보니 build/ 는 `public/ 전체 + CRA 산출물(static·asset-manifest·
      // index.html)` 로만 이루어져 있고, public/ 은 Vite 가 그대로 다시 복사한다.
      // 안 비우면 CRA 시절 번들(static/js/main.*.js)이 남아 계속 배포된다 —
      // 아무도 안 쓰는 파일을 Hosting 이 계속 보관하게 되는데, 이 프로젝트에서 비용
      // 1위가 Hosting 저장소였다.
      emptyOutDir: true,
      sourcemap: false,
    },
    server: { port: 3000 },
    preview: { port: 3000 },
  };
});
