import initAsyncSyncProject from "./type/async-sync/init.mjs"
import initPackageLikeProject from "./type/package-like/init.mjs"
import preprocessTypescriptFiles from "./preprocessTypescriptFiles.mjs"
import checkSourceFiles from "./checkSourceFiles.mjs"
import initProjectFn from "./initProject.mjs"
import checkProjectFiles from "./checkProjectFiles.mjs"

export async function getIntegrationAPIVersion() {
	return 0
}

//
// this function is called when -init-project was specified on the CLI
//
export async function initProject(fourtune_session, writeFile) {
	await initProjectFn(fourtune_session, writeFile)
}

export async function initializeTarget(fourtune_session) {
	const project_config = fourtune_session.getProjectConfig()

	await checkProjectFiles(fourtune_session)

	//
	// convert all .mts files to .mjs files
	//
	fourtune_session.hooks.register(
		"preprocess_file", preprocessTypescriptFiles
	)

	fourtune_session.hooks.register(
		"distributables.pre", checkSourceFiles
	)

	switch (project_config.type) {
		case "package": {
			await initPackageLikeProject(fourtune_session)
		} break

		//
		// special kind of package:
		// project/package with only one function that is async+sync
		//
		case "async-sync": {
			await initAsyncSyncProject(fourtune_session)
			await initPackageLikeProject(fourtune_session)
		} break

		/*
		case "app": {
			//await initAppProject(context)
		} break

		case "class": {
			//await initClassProject(context)
		} break
		*/

		default: {
			throw new Error(
				`Unknown target type '${project_config.type}'.`
			)
		}
	}
}
