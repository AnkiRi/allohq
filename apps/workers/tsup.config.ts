import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs"],
  outDir: "dist",
  splitting: false,
  noExternal: [/@allohq\/.*/],
  external: ["mjml", "mjml-core", "uglify-js", "html-minifier", "sharp", "@prisma/client"],
});
