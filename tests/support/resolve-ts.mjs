// node --test 用：拡張子なしの相対 import（Vite 流）を .ts に解決する。追加依存なし。
// これでゲームの純粋ロジック（Babylon・DOM を実行時に読まないもの）をそのままテストできる。
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (e) {
      if (/^\.\.?\//.test(specifier) && !/\.[cm]?[jt]s$/.test(specifier)) return next(`${specifier}.ts`, context);
      throw e;
    }
  },
});
