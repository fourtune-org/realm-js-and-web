import {loadRealmDependencies} from "../../../auto/base-realm.mjs"
import fourtuneRollupPlugin from "../../../auto/plugin.mjs"

export default async function(fourtune_session, options) {
	const project_root = fourtune_session.getProjectRoot()
	const {getDependency} = await loadRealmDependencies(
		project_root, "realm-js"
	)

	const jsBundler = getDependency("@fourtune/js-bundler")
	const additional_rollup_plugins = []

	if (options.entry_file_type === "mjs") {
		additional_rollup_plugins.push({
			when: "pre",
			plugin: await fourtuneRollupPlugin(project_root)
		})
	}

	return await jsBundler(
		project_root, options.entry, {
			file_type: options.entry_file_type === "d.mts" ? "dts" : "mjs",
			minify: options.minified === true,
			additional_rollup_plugins,
			on_rollup_log_fn(level, {message}) {
				fourtune_session.addWarning("rollup", {message: `[${level}] rollup says ${message}`})
			}
		}
	)
}
