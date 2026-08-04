module.exports = {
  // ⚠️ 이게 없으면 ESLint 가 상위 폴더로 올라가 저장소 루트의 `.eslintrc.json` 을 읽는다.
  //    그 파일은 CRA 시절 잔재로 `@typescript-eslint/parser` 를 선언하는데, functions 에는
  //    그 패키지가 없다 → `npm run lint` 가 **코드를 한 줄도 못 보고 죽는다.**
  //    (실측: "Failed to load parser '@typescript-eslint/parser'", exit 2)
  //    즉 이 폴더의 린트는 꺼져 있던 게 아니라 **고장 나 있었다.**
  root: true,
  env: {
    es6: true,
    node: true,
  },
  parserOptions: {
    // 런타임은 Node 22 인데 2018 로 묶여 있었다. `?.`·`??` 같은 문법이 실제 코드에
    // 있으면 린트가 **파싱 단계에서** 죽는다 — 버그를 못 잡는 게 아니라 아예 안 돈다.
    ecmaVersion: 2022,
  },
  extends: [
    "eslint:recommended",
  ],
  rules: {
    "no-restricted-globals": ["error", "name", "length"],
    "prefer-arrow-callback": "error",
    "quotes": ["error", "double", {"allowTemplateLiterals": true}],
    "require-atomic-updates": "error",
    "eqeqeq": ["error", "smart"],
    "no-unsafe-optional-chaining": "error",
    "no-promise-executor-return": "error",
    // async 인데 await 이 없는 함수. 프런트에서 `await confirmDialog()` 누락을 찾던 것의
    // 거울상이다 — 여기선 "비동기인 척하는데 실제로 안 기다리는" 코드를 잡는다.
    "require-await": "error",
    "no-var": "error",
    // 문자열을 throw 하면 HttpsError 코드가 안 붙어 클라이언트가 원인을 구분 못 한다.
    "no-throw-literal": "error",
    // ⚠️ `no-return-await` 는 넣었다가 뺐다 — ESLint 8.46+ 에서 deprecated 다
    //    (V8 이 이미 최적화해서 규칙 실효성이 없다).
    // ⚠️ `consistent-return`·`prefer-const` 도 검토했지만 뺐다. 셋 다 실제 버그가
    //    아니라 스타일이었다: cors 콜백의 express 관례, 그리고 트랜잭션 콜백은
    //    호출부가 이미 `if (result && result.processed)` 로 막고 있다(직접 확인).
    //    금융 코드를 스타일 때문에 건드리지 않는다.
  },
  overrides: [
    {
      files: ["**/*.spec.*"],
      env: {
        mocha: true,
      },
      rules: {},
    },
  ],
  globals: {},
};
