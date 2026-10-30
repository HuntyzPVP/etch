import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [react()],
	build: {
		outDir: "dist/web",
		// Libraries go in their own files so no single file grows past the 500 kB warning, and they stay cached
		// between builds of the app's own code.
		rolldownOptions: {
			output: {
				codeSplitting: {
					// Otherwise a group also swallows everything its modules import, e.g. the languages taking the editor core.
					includeDependenciesRecursively: false,
					groups: [
						{
							name: "code-languages",
							test: /node_modules[\\/](@codemirror[\\/](lang-|legacy-modes)|@lezer[\\/](?!common|highlight|lr)[^\\/]+[\\/])/,
						},
						{ name: "editor", test: /node_modules[\\/](@codemirror|@lezer|@uiw|codemirror)/ },
						{ name: "react", test: /node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/ },
						{ name: "vendor", test: /node_modules/ },
					],
				},
			},
		},
	},
	server: {
		proxy: { "/api": `http://localhost:${process.env.PORT ?? 8787}` },
	},
});
