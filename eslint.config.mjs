import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Supabase CLI 런타임 산출물 (edge runtime 번들). 우리 코드가 아니다.
    "supabase/.temp/**",
    // supabase gen types 생성물
    "lib/database.types.ts",
  ]),
]);

export default eslintConfig;
