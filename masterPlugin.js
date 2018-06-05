const fs = require("fs-extra");

const pmSockets = [];
const players = getDatabaseSync("database/playerManager.json");

class masterPlugin {
	constructor({config, pluginConfig, path, socketio, express}){
		this.config = config;
		this.pluginConfig = pluginConfig;
		this.pluginPath = path;
		this.io = socketio;
		this.express = express;
		
		this.clients = {};
		this.io.on("connection", socket => {
			socket.on("registerPlayerManager", () => {
				pmSockets.push(socket);
				
				setInterval(() => socket.emit("playerManagerGetPlayers"), 10000);
				socket.on("playerManagerSetPlayerdata", data => {
					
				});
				
				socket.on("disconnect", function () {
					let i = pmSockets.indexOf(socket);
					console.log("playerManager "+(i+1)+" disconnected, "+(pmSockets.length-1)+" left");
					pmSockets.splice(i, 1);
				});
			});
		});
	}
}
module.exports = masterPlugin;

function getDatabaseSync(path){
	let db;
	try {
		db = JSON.parse(fs.readFileSync(path, "utf8"));
	} catch(e){
		db = {};
	}
	return db;
}
async function saveDatabase(path, database){
	if(!path){
		throw new Error("No path provided!");
	} else if(!database){
		throw new Error("No database provided!");
	} else {
		try {
			await fs.writeFile(path, JSON.stringify(database, null, 4));
		} catch(e){
			throw new Error("Unable to write to database! "+path);
		}
	}
}
