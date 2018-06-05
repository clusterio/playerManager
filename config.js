/*
	Clusterio plugin to allow for chat between instances.
*/
module.exports = {
	// Name of package. For display somewhere I guess.
	name: "playerManager",
	version: "1.0.0",
	binary: "nodePackage",
	description: "The clusterio player management tool aims to track players, their statistics and (possibly) their permissions on the cluster.",
	masterPlugin: "masterPlugin.js",
}
