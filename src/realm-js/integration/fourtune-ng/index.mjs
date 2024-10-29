import path from "node:path"
import fs from "node:fs/promises"
import {getTypeScriptDefinitions} from "./lib/getTypeScriptDefinitions.mjs"
import {initPackageLikeProject} from "./lib/init/initPackageLikeProject.mjs"

export async function getIntegrationAPIVersion() {
	return 0
}

async function stripTypes(fourtune_session, code, file_path) {
	const {tsStripTypesFromCode, jsResolveImportAliases} = await fourtune_session.getDependency(
		"@fourtune/base-realm-js-and-web"
	)

	code = (await tsStripTypesFromCode(code, {
		filename: file_path,
		replace_import_extensions: true
	})).code

	if (!file_path.startsWith("src/")) {
		return code
	}

	const levels = file_path.split(path.sep).length

	const aliases = {
		"#": "./" + ("../".repeat(levels - 2)) + "/",
		"##": "./" + ("../".repeat(levels - 1)) + "/auto/src/",
		"&": "./" + ("../".repeat(levels - 1)) + "/assets/tsmodule/",
		// todo: add &&/
	}

	return (await jsResolveImportAliases(
		code, {
			aliases
		}
	)).code
}

async function handleInputFile(fourtune_session, input_file) {
	const absolute_path = path.join(
		fourtune_session.getProjectRoot(), ".fourtune", "v0",
		"build", input_file.source
	)

	if (input_file.name.endsWith(".d.mts")) {
		fourtune_session.objects.addObject(
			input_file.source, async () => {
				const code = (await fs.readFile(
					absolute_path
				)).toString()

				return code
			}
		)
	} else if (input_file.name.endsWith(".mts")) {
		const extensionless_file_path = input_file.source.slice(0, -4)

		fourtune_session.objects.addObject(
			`${extensionless_file_path}.mjs`, async () => {
				const code = (await fs.readFile(
					absolute_path
				)).toString()

				return await stripTypes(
					fourtune_session, code, input_file.source
				)
			}
		)

		fourtune_session.objects.addObject(
			`${extensionless_file_path}.d.mts`, async (fourtune_session, file_path) => {
				const key = `.fourtune/v0/build/${file_path}`

				if (fourtune_session.user_data.tsc_definitions.has(key)) {
					return fourtune_session.user_data.tsc_definitions.get(key)
				}

				return ""
			}
		)
	} else {
		fourtune_session.emitWarning(
			"src.unsupported_file", {
				relative_path: input_file.source
			}
		)
	}
}

export async function initialize(
	fourtune_session,
	target_configuration,
	assets,
	source_files
) {
	const project_config = fourtune_session.getProjectConfig()

	const input_files_for_tsc = []

	//
	// this applies to every realm-js package:
	//
	// - create .d.mts and .mjs file for every .mts file
	// - copy d.mts files as they are
	//
	for (const source_file of source_files) {
		await handleInputFile(fourtune_session, source_file)

		if (source_file.name.endsWith(".mjs")) continue

		input_files_for_tsc.push(source_file.source)
	}

	for (const asset of assets) {
		if (!asset.relative_path.startsWith("tsmodule/")) continue

		await handleInputFile(fourtune_session, asset)

		input_files_for_tsc.push(asset.source)
	}

	fourtune_session.hooks.register(
		"createObjectFiles.pre", async () => {
			fourtune_session.user_data.tsc_definitions = await getTypeScriptDefinitions(
				fourtune_session, input_files_for_tsc.map(file => {
					return path.join(
						fourtune_session.getProjectRoot(), ".fourtune", "v0",
						"build", file
					)
				})
			)
		}
	)

	fourtune_session.autogenerate.addFile(
		`cfg/tsconfig.base.json`, function() {
			return JSON.stringify({
				"compilerOptions": {
					"allowImportingTsExtensions": true,
					"allowSyntheticDefaultImports": true,
					"types": ["node"],
					"skipLibCheck": false,
					"strict": true,
					"target": "esnext",
					"module": "nodenext",
					"moduleResolution": "nodenext",
					"isolatedModules": true,
					"baseUrl": "../../"
				}
			}, null, 4) + "\n"
		}
	)

	fourtune_session.autogenerate.addFile(
		`cfg/tsconfig.src.json`, function() {
			return JSON.stringify({
				"extends": "./tsconfig.base.json",
				"compilerOptions": {
					"paths": {
						"#/*": ["./src/*"],
						"##/*": ["./auto/src/*"],
						"&/*": ["./assets/tsmodule/*"],
						"&&/*": ["./auto/assets/tsmodule/*"]
					}
				},
				"include": ["../../src/**/*"]
			}, null, 4) + "\n"
		}
	)

	fourtune_session.autogenerate.addFile(
		`cfg/tsconfig.assets.json`, function() {
			return JSON.stringify({
				"extends": "./tsconfig.base.json",
				"compilerOptions": {
					"paths": {}
				},
				"include": ["../../assets/tsmodule/**/*"]
			}, null, 4) + "\n"
		}
	)

	switch (project_config.type) {
		case "package": {
			await initPackageLikeProject(fourtune_session)
		} break

		//
		// special kind of package:
		// project/package with only one function that is async+sync
		//
		case "package:async/sync": {
			await initAsyncSyncProject(fourtune_session)
			await initPackageLikeProject(fourtune_session)
		} break

//		case "app": {
//			await initAppProject(context)
//		} break

//		case "class": {
//			await initClassProject(context)
//		} break

		default: {
			throw new Error(
				`Unknown target type '${project_config.type}'.`
			)
		}
	}
}