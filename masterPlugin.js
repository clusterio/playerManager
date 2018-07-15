const fs = require("fs-extra");
const path = require("path");
const Express = require("express");
const ejs = require("ejs");
const bcrypt = require("bcrypt-promise");
const crypto = require('crypto');
const base64url = require('base64url');
const sanitizer = require('sanitizer');

const pmSockets = [];
const database = getDatabaseSync("database/playerManager.json");
database.whitelist = getDatabaseSync("database/whitelist.json").whitelist || [];
database.banlist = getDatabaseSync("database/banlist.json").banlist || [];

class masterPlugin {
	constructor({config, pluginConfig, pluginPath, socketio, express}){
		this.config = config;
		this.pluginConfig = pluginConfig;
		this.pluginPath = pluginPath;
		this.io = socketio;
		this.app = express;
		
		this.ui = {
			sidebar: [
				{
					name:"playerManager",
					getHtml: () => `
					<a href="/playerManager">
						<div id="playerManager-menu" class="button-black menuItem">
							<p>Players</p>
						</div>
					</a>`,
				},{
					name:"whitelist",
					getHtml: () => `
					<a href="/playerManager/whitelist">
						<div id="playerManager-whitelist-menu" class="button-black menuItem">
							<p>Whitelist</p>
						</div>
					</a>
					`
				}
			]
		}
		
		this.whitelist = database.whitelist || [];
		this.banlist = database.banlist || [];
		this.managedPlayers = database.managedPlayers || [];
		this.users = database.users || [];
		this.clients = {};
		this.slaves = {};
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
		this.app.get("/api/playerManager/playerList", (req,res) => {
			res.send(this.managedPlayers);
		});
		// manage web interface users
		this.app.post("/api/playerManager/register", async (req,res) => {
			// do some basic input sanitization, not that its worth much
			["name","email","password","passwordConfirmation"].forEach(property => {
				if(req.body[property]) req.body[property] = req.body[property].trim().replace(/[";]/g, " ").replace(/[']/g,"").replace(/\r?\n|\r/g,'');
			});
			if(req.body
			&& req.body.name
			&& req.body.password
			&& req.body.passwordConfirmation){
				if(req.body.password !== req.body.passwordConfirmation){
					res.send({
						ok:false,
						msg:"Passwords do not match",
					});
				} else {
					let startTime = Date.now();
					let hash = await bcrypt.hash(req.body.password, 12);
					console.log("Hashed password for new user '"+req.body.name+"' in "+(Date.now()-startTime)+"ms");
					
					let user = {
						_id: base64url(crypto.randomBytes(64)), // 64 character random string
						name:req.body.name,
						email:req.body.email,
						password:hash,
						sessions: [],
					}
					this.users.push(user);
					res.send({
						ok:true,
						msg:"Account created",
					})
				}
			} else {
				res.send({
					ok:false,
					msg:"Invalid parameters; please send {name, [email], password, passwordConfirmation}",
				});
			}
		});
		this.app.post("/api/playerManager/login", async (req,res) => {
			// check this users username and password against database and return a temporary auth token
			if(req.body
			&& req.body.name
			&& req.body.password){
				for(let i in this.users){
					let user = this.users[i];
					if(user.name === req.body.name){
						// check password
						let result = await bcrypt.compare(req.body.password, user.password);
						console.log(user.name+" attempted login in: "+result);
						if(result){
							let session = {
								token: base64url(crypto.randomBytes(64)),
								startDate: Date.now(),
								expiryDate: Date.now() + 1000*60*60*24,
								name: user.name,
							}
							this.users[i].sessions.push(session);
							res.send({
								ok:true,
								msg:"Successfully logged in",
								session,
							});
						} else {
							res.send({
								ok:false,
								msg:"Authentication failed, wrong password",
							});
						}
					}
				}
			} else {
				res.send({
					ok:false,
					msg:"Invalid parameters; please send {name, password}",
				});
			}
		});
		this.app.post("/api/playerManager/getUserData", async (req,res) => {
			if(req.body
			&& req.body.name){
				// get permissions depending on token and other permission systems
				let permissions = await this.getPermissions(req.body.token, this.users);
				
				let user = this.users[this.findInArray("name",req.body.name,this.users)];
				if(user){
					let response = {
						ok:true,
						msg:"Successfully gathered user data",
						userData: {},
						permissions,
					};
					// add stuff everyone has permission to
					permissions.all.read.forEach(property => {
						response.userData[property] = user[property];
					});
					
					// add more private stuff
					if(permissions.user[req.body.name]){
						let userPerms = permissions.user[req.body.name];
						user.factorioLinkToken = base64url(crypto.randomBytes(8));
						if(userPerms) userPerms.read.forEach(property => {
							response.userData[property] = user[property];
						});
					}
					res.send(response);
				} else {
					console.log(req.body)
					res.send({
						ok:false,
						msg:"User not found",
					});
				}
			} else {
				res.send({
					ok:false,
					msg:"Invalid paramaters. Please run with {name, [token]}",
				});
			}
		});
		this.app.post("/api/playerManager/editUserData", async (req,res) => {
			if(req.body
			&& typeof req.body.token === "string"
			&& typeof req.body.name === "string"
			&& typeof req.body.fieldName === "string"
			&& req.body.fieldValue){
				let permissions = await this.getPermissions(req.body.token, this.users);
				
				try{// this statement fails whenever we request a modification to a user we don't have any explicit permissions to
				var writePermissions = arrayRemoveDuplicates(permissions.all.write.concat(permissions.user[req.body.name].write))} catch(e){}
				if(writePermissions.includes(req.body.fieldName)){
					let userIndex = this.findInArray("name", req.body.name, this.users);
					if(req.body.fieldName === "password"){
						let startTime = Date.now()
						let hash = await bcrypt.hash(req.body.fieldValue, 12);
						console.log("Hashed password for new user '"+req.body.name+"' in "+(Date.now()-startTime)+"ms");
						this.users[userIndex][req.body.fieldName] = hash;
						res.send({
							ok:true,
							msg:`Updated value for field "password"`,
						});
					} else {
						this.users[userIndex][req.body.fieldName] = sanitizer.sanitize(req.body.fieldValue);
						res.send({
							ok:true,
							msg:`Updated value for field "${sanitizer.sanitize(req.body.fieldName)}"`,
						});
					}
				} else {
					res.send({
						ok:false,
						msg:"Insufficient privileges",
					});
				}
			} else {
				res.send({
					ok:false,
					msg:"Invalid parameters. Expected {token, name, fieldName, fieldValue}",
				});
			}
		});
		this.app.post("/api/playerManager/deleteUser", async (req,res) => {
			if(req.body
			&& req.body.name
			&& req.body.password
			&& req.body.passwordConfirmation){
				if(req.body.password !== req.body.passwordConfirmation){
					res.send({
						ok:false,
						msg:"Passwords do not match",
					});
				} else {
					let userIndex = this.findInArray("name", req.body.name, this.users);
					let user = this.users[userIndex];
					if(await bcrypt.compare(req.body.password, user.password)){
						let deletedData = this.users.splice(userIndex, 1);
						res.send({
							ok:true,
							msg:"Account permanently deleted, it cannot be restored.",
							data:deletedData,
						});
					} else {
						res.send({
							ok:false,
							msg:"Authentication failed",
						});
					}
				}
			} else {
				res.send({
					ok:false,
					msg:"Invalid parameters, please send {name, password, passwordConfirmation}",
				});
			}
		});
		// Manage whitelist/banlist
		this.app.get("/api/playerManager/whitelistedPlayers", async (req,res) => {
			res.send(this.whitelist);
		});
		this.app.get("/api/playerManager/bannedPlayers", async (req,res) => {
			res.send(this.banlist);
		});
		this.app.post("/api/playerManager/whitelist", async (req,res) => {
			if(req.body
			&& typeof req.body.factorioName == "string"
			&& typeof req.body.action == "string"
			&& (req.body.action == "add" || req.body.action == "remove")
			&& typeof req.body.token == "string"){
				let permissions = await this.getPermissions(req.body.token, this.users);

				if(req.body.action == "add" && permissions.cluster.includes("whitelist")){
					if(!this.whitelist.includes(req.body.factorioName)){
						this.whitelist.push(req.body.factorioName);
						this.broadcastCommand(`/whitelist add ${req.body.factorioName}`);
						res.send({
							ok:true,
							msg:`Added player ${req.body.factorioName} to whitelist`,
						});
					}
					
				} else if(req.body.action == "remove" && permissions.cluster.includes("removeWhitelist")){
					this.whitelist.splice(this.whitelist.indexOf(req.body.factorioName), 1);
					this.broadcastCommand(`/whitelist remove ${req.body.factorioName}`);
					res.send({
						ok:true,
						msg:`Player ${req.body.factorioName} removed from whitelist`,
					});
				} else {
					res.send({
						ok:false,
						msg:"Insufficient permissions, make sure you have permissions.cluster.whitelist and/or permissions.cluster.removeWhitelist",
					});
				}
			} else {
				console.log("nok")
				res.send({
					ok:false,
					msg:"Invalid parameters, please send {factorioName, action[add|remove], token}",
				});
			}
		});
		this.app.post("/api/playerManager/banlist", async (req,res) => {
			if(req.body
			&& typeof req.body.factorioName == "string"
			&& typeof req.body.action == "string"
			&& ((req.body.action == "add" && typeof req.body.reason == "string") || req.body.action == "remove")
			&& typeof req.body.token == "string"){
				let permissions = await this.getPermissions(req.body.token, this.users);
				if(req.body.action == "add" && permissions.cluster.includes("banlist")){
					let indexes = this.findInArray("factorioName", req.body.factorioName, this.banlist);
					if(indexes.length == 1){
						// update an existing ban
						this.banlist[indexes[0]].reason = req.body.reason;
						this.broadcastCommand(`/banlist remove ${req.body.factorioName}`);
						var msg = `Updated ban for user ${req.body.factorioName} for ${req.body.reason}`;
					} else {
						// ban a new player
						this.banlist.push({
							factorioName: req.body.factorioName,
							reason: req.body.reason,
						});
						var msg = `Banned ${req.body.factorioName} for ${req.body.reason}`;
					}
					// Perform the ban
					setTimeout(()=>{
						this.broadcastCommand(`/ban ${req.body.factorioName} ${req.body.reason}`);
						res.send({
							ok:true,
							msg,
						});
					},1000);
				} else if(req.body.action == "remove" && permissions.cluster.includes("removeBanlist")){
					let indexes = this.findInArray("factorioName", req.body.factorioName, this.banlist)
					let pardonedPlayers = [];
					indexes.forEach(i => {
						let ban = this.banlist[i];
						this.broadcastCommand(`/unban ${ban.factorioName}`);
						pardonedPlayers.push(ban.factorioName);
						this.banlist.splice(i, 1)
					});
					res.send({
						ok:true,
						msg:`Pardoned player(s) ${pardonedPlayers.join(", ")}`,
					});
					console.log(`Pardoned player(s) ${pardonedPlayers.join(", ")}`);
				}
			} else {
				res.send({
					ok:false,
					msg:"Invalid parameters, please send {factorioName, action[add|remove], token, [reason]}",
				});
			}
		});
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
		database.managedPlayers = this.managedPlayers;
		database.users = this.users;
		await saveDatabase("database/playerManager.json", database);
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
