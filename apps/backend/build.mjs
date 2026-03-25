import { build } from "esbuild";

build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.js",
  bundle: true,
  platform: "node",
  target: "node18",
  format: "esm",
  sourcemap: true,

  // Required so Prisma Client is NOT bundled (it will break otherwise)
  external: ["@prisma/client", ".prisma/client", "pg-native", "@repo/db"],
})
  .then(() => {
    console.log("Backend bundled successfully!");
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
