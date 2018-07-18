const fs = require("fs-extra");
const path = require("path");
const Express = require("express");
const ejs = require("ejs");
const bcrypt = require("bcrypt-promise");
const crypto = require('crypto');
const base64url = require('base64url');
const sanitizer = require('sanitizer');

const pmSockets = [];

class masterPlugin {
	constructor({config, pluginConfig, pluginPath, socketio, express}){
		this.config = config;
		this.pluginConfig = pluginConfig;
		this.pluginPath = pluginPath;
		this.io = socketio;
		this.app = express;
		
		// load databases
		const database = getDatabaseSync("database/playerManager.json");
		this.whitelist = getDatabaseSync("database/whitelist.json").whitelist || [];
		this.banlist = getDatabaseSync("database/banlist.json").banlist || [];
		this.managedPlayers = database.managedPlayers || [];
		this.users = database.users || [];
		
		this.clients = {};
		this.slaves = {};
		
		// initialize web API
		require("./js/api-endpoints.js")(this);
		
		// expose UI elements embedded in the master
		this.ui = require("./js/ui.js").ui;
		
		this.io.on("connection", socket => {
			let instanceID = "unknown";
			socket.on("registerSlave", data => {
				if(data.instanceID && !isNaN(Number(data.instanceID))){
					instanceID = data.instanceID;
					this.slaves[instanceID] = socket;
				}
			});
			socket.on("registerPlayerManager", () => {
				console.log("Registered playerManager socket")
				pmSockets.push(socket);
				this.pollForPlayers(socket, instanceID);
				
				socket.on("playerManagerSetPlayerdata", data => {
					let parsedData = this.parseData(data, {instanceID});
					this.handlePlayerdata(parsedData);
				});
				
				socket.on("disconnect", function () {
					let i = pmSockets.indexOf(socket);
					console.log("playerManager "+(i+1)+" disconnected, "+(pmSockets.length-1)+" left");
					pmSockets.splice(i, 1);
				});
			});
			socket.on("gameChat", async data => {
				let chatLine = data.data.replace(/(\r\n\t|\n|\r\t)/gm, "").replace("\r", "");
				if(typeof chatLine == "string") this.handleChatLine(chatLine, instanceID);
			});
		});
		
		// I can't seem to get express static pages + ejs rendering to work properly, so I write my own thing.
		let pages = [
			{
				addr: "/playerManager/index.html",
				path: path.join(__dirname,"static/index.html"),
				render: ejs
			},{
				addr: "/playerManager",
				path: path.join(__dirname,"static/index.html"),
				render: ejs
			},{
				addr: "/playerManager/whitelist",
				path: path.join(__dirname,"static/whitelist.html"),
				render: ejs
			},{
				addr: "/playerManager/register",
				path: path.join(__dirname,"static/register.html"),
				render: ejs
			},{
				addr: "/playerManager/login",
				path: path.join(__dirname,"static/login.html"),
				render: ejs
			},{
				addr: "/playerManager/profile",
				path: path.join(__dirname,"static/profile.html"),
				render: ejs
			},{
				addr: "/playerManager/account",
				path: path.join(__dirname,"static/account.html"),
				render: ejs
			},
		]
		pages.forEach(page => {
			this.app.get(page.addr, async (req,res) => {
				if(page.render){
					page.render.renderFile(page.path, (err, str) => {
						if(err) console.log(err);
						res.send(str);
					});
				} else {
					res.send(await fs.readFile(page.path));
				}
			});
		});
		this.app.use('/playerManager', Express.static(path.join(__dirname, 'static')));
	}
	async broadcastCommand(command){
		let returnValues = [];
		for(let instanceID in this.slaves){
			let slave = this.slaves[instanceID];
			slave.emit("runCommand", {
				// commandID:Math.random(),
				command,
			});
		};
		return returnValues;
	}
	findInArray(key, value, array){
		let indexes = [];
		for(let i in array){
			if(array[i][key] && array[i][key] === value) indexes.push(i);
		}
		return indexes;
	}
	async getPermissions(token, users){
		let permissions = {
			all:{
				read: [
					"name",
					"factorioName",
					"admin",
					"description",
				],
				write: [],
			},
			user:{
				
			},
			cluster:[],
			instance:{
				
			},
		};
		for(let i in users){
			let user = users[i];
			for(let o in user.sessions){
				let session = user.sessions[o];
				
				if(session.token === token
				&& Date.now() < session.expiryDate){
					permissions.user[user.name] = {
						read: [
							"email",
							"factorioLinkToken",
						],
						write: [
							"password",
							"email",
							"description",
						],
					};
					if(user.admin){
						permissions.all.read.push("email");
						permissions.all.write.push("email");
						permissions.all.write.push("password");
						permissions.all.write.push("admin");
						permissions.cluster.push("whitelist");
						permissions.cluster.push("removeWhitelist");
						permissions.cluster.push("banlist");
						permissions.cluster.push("removeBanlist");
					}
				} else if(Date.now() > session.expiryDate){
					// remove expired session
					console.log(`Removed session on timeout: ${session.token}`);
					user.sessions.splice(o, 1);
				}
			}
		}
		return permissions;
	}
	async onExit(){
		await saveDatabase("database/playerManager.json", {
			managedPlayers: this.managedPlayers,
			users: this.users,
		});
		await saveDatabase("database/whitelist.json", {whitelist: this.whitelist});
		await saveDatabase("database/banlist.json", {banlist: this.banlist});
		return;
	}
	pollForPlayers(socket, instanceID){
		// console.log("Polling for players")
		socket.emit("playerManagerGetPlayers");
		setTimeout(() => this.pollForPlayers(socket, instanceID), this.getPlayerPollingTime(instanceID));
	}
	getPlayerPollingTime(instanceID){
		if(!this.managedPlayers.length) return 10000;
		
		let playersOnThisInstance = 0;
		for(let i in this.managedPlayers){
			if(this.managedPlayers[i].connected === "true" && this.managedPlayers[i].instanceID == instanceID){
				++playersOnThisInstance;
			}
		}
		if(playersOnThisInstance > 0){
			return 1000;
		} else return 10000;
	}
	parseData(data, sharedData){
		let parsedData = [];
		data = data.split("|");
		data.forEach(player => {
			if(player){
				let playerData = {};
				player = player.split(`~`);
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
					console.log("New player joined! "+player.name);
					// we didn't find this player, a new person must have joined!
					this.managedPlayers.push({name: player.name});
				}
				if(this.managedPlayers[i].name == player.name){
					for(let key in player){
						this.managedPlayers[i][key] = player[key];
					}
					if(player.connected === "false"){
						if(this.managedPlayers[i].onlineTimeTotal == undefined) this.managedPlayers.onlineTimeTotal = 0;
						this.managedPlayers[i].onlineTimeTotal = (Number(this.managedPlayers[i].onlineTimeTotal) || 0) + (Number(player.onlineTime) || 0);
						// player.onlineTime will be reset by Lua on next reconnect by this player, but we force it now to make it easier to get an accurate count of playtime
						this.managedPlayers[i].onlineTime = 0;
					}
					break;
				}
			}
		});
	}
	async handleChatLine(line, instanceID){
		console.log(line.indexOf("!playerManager"))
		// chat lines are handled by ./commandHandler.js
		let cmdHandler = require("./commandHandler.js");
		let commandHandler = new cmdHandler(this, (command, instanceID) => {
			if(this.slaves[instanceID] && command && typeof command === "string"){
				console.log(command)
				this.slaves[instanceID].emit("runCommand", {command});
			}
		});
		if(line.indexOf("!playerManager")){
			let parsedMessage = line.substr(line.indexOf("!playerManager")).split(" ");
			if(commandHandler[parsedMessage[1]]){
				commandHandler[parsedMessage[1]](parsedMessage, instanceID, line);
			}
		}
	}
}
module.exports = masterPlugin;

function arrayRemoveDuplicates(array){
	let newArray = [];
	array.forEach(value => {
		if(!newArray.includes(value)) newArray.push(value);
	});
	return newArray;
}
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
