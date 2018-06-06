const fs = require("fs-extra");

const pmSockets = [];
const database = getDatabaseSync("database/playerManager.json");

class masterPlugin {
	constructor({config, pluginConfig, path, socketio, express}){
		this.config = config;
		this.pluginConfig = pluginConfig;
		this.pluginPath = path;
		this.io = socketio;
		this.express = express;
		
		this.managedPlayers = database.managedPlayers || [];
		this.clients = {};
		this.io.on("connection", socket => {
			let instanceID = "unknown";
			socket.on("registerSlave", data => {
				if(data.instanceID) instanceID = data.instanceID;
			});
			socket.on("registerPlayerManager", () => {
				console.log("Registered playerManager socket")
				pmSockets.push(socket);
				this.pollForPlayers(socket, instanceID);
				
				socket.on("playerManagerSetPlayerdata", data => {
					let parsedData = this.parseData(data, {instanceID});
					// console.log(parsedData);
					console.log(this.managedPlayers)
					this.handlePlayerdata(parsedData);
				});
				
				socket.on("disconnect", function () {
					let i = pmSockets.indexOf(socket);
					console.log("playerManager "+(i+1)+" disconnected, "+(pmSockets.length-1)+" left");
					pmSockets.splice(i, 1);
				});
			});
		});
	}
	async onExit(){
		database.managedPlayers = this.managedPlayers;
		await saveDatabase("database/playerManager.json", database);
		return;
	}
	pollForPlayers(socket, instanceID){
		console.log("Polling for players")
		socket.emit("playerManagerGetPlayers");
		setTimeout(() => this.pollForPlayers(socket, instanceID), this.getPlayerPollingTime(instanceID));
	}
	getPlayerPollingTime(instanceID){
		if(!this.managedPlayers.length) return 10000;
		let playersOnThisInstance = this.managedPlayers.reduce((acc, curr) => {
			if(curr.connected === "true" && curr.instanceID == instanceID){
				return ++acc;
			} else return acc;
		});
		if(playersOnThisInstance){
			return 1000;
		} else return 10000;
	}
	parseData(data, sharedData){
		let parsedData = [];
		data = data.split("|");
		data.forEach(player => {
			if(player){
				let playerData = {};
				player = player.split(",");
				player.forEach(kv => {
					kv = kv.split(":");
					playerData[kv[0]] = kv[1].trim();
				});
				for(let k in sharedData){
					playerData[k] = sharedData[k];
				}
				parsedData.push(playerData);
			}
		});
		return parsedData;
	}
	handlePlayerdata(playerData){
		playerData.forEach(player => {
			for(let i = 0; i <= this.managedPlayers.length; i++){
				if(i == this.managedPlayers.length){
					console.log("New player joined! "+player.name)
					// we didn't find this player, a new person must have joined!
					this.managedPlayers.push({name: player.name});
				}
				if(this.managedPlayers[i].name == player.name){
					for(let key in player){
						this.managedPlayers[i][key] = player[key];
					}
					if(player.connected === "false"){
						if(this.managedPlayers[i].onlineTimeTotal == undefined) this.managedPlayers.onlineTimeTotal = 0;
						this.managedPlayers[i].onlineTimeTotal += player.onlineTime; // player.onlineTime will be reset by Lua on next reconnect by this player
					}
					break;
				}
			}
		});
		// this.managedPlayers = playerData;
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
