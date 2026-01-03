import { defineConfig } from "tsup";
import { tsconfigPathsPlugin } from "esbuild-plugin-tsconfig-paths";
import { cp } from "node:fs/promises";

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
	async onSuccess() {
		// Copy templates to dist folder for runtime access
		await cp("templates", "dist/templates", { recursive: true });
		console.log("CLI Copied templates to dist/templates");
	},
});
