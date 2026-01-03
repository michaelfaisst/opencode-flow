import { defineConfig } from "tsup";
import { tsconfigPathsPlugin } from "esbuild-plugin-tsconfig-paths";

export default defineConfig({
	entry: ["src/index.ts"],
	outDir: "dist",
	format: ["esm"],
	target: "node20",
	clean: true,
	dts: true,
	sourcemap: true,
	splitting: false,
	banner: {
		js: "#!/usr/bin/env node",
	},
	esbuildPlugins: [tsconfigPathsPlugin({})],
});
