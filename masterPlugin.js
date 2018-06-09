const fs = require("fs-extra");
const path = require("path");
const Express = require("express");
const ejs = require("ejs");
const bcrypt = require("bcrypt-promise");
const crypto = require('crypto');
const base64url = require('base64url');

const pmSockets = [];
const database = getDatabaseSync("database/playerManager.json");

class masterPlugin {
	constructor({config, pluginConfig, pluginPath, socketio, express}){
		this.config = config;
		this.pluginConfig = pluginConfig;
		this.pluginPath = pluginPath;
		this.io = socketio;
		this.app = express;
		
		this.managedPlayers = database.managedPlayers || [];
		this.users = database.users || [];
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
					this.handlePlayerdata(parsedData);
				});
				
				socket.on("disconnect", function () {
					let i = pmSockets.indexOf(socket);
					console.log("playerManager "+(i+1)+" disconnected, "+(pmSockets.length-1)+" left");
					pmSockets.splice(i, 1);
				});
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
					let startTime = Date.now()
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
								msg:"Authentication failed, wrong password/i",
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
					"admin",
				],
				write: [],
			},
			user:{
				
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
						],
						write: [
							"password",
							"email",
						],
					};
					if(user.admin){
						permissions.all.read.push("email");
						permissions.all.write.push("email");
						permissions.all.write.push("password");
						permissions.all.write.push("admin");
					}
				} else if(Date.now() > session.expiryDate){
					// remove expired session
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
						this.managedPlayers[i].onlineTimeTotal = (Number(this.managedPlayers[i].onlineTimeTotal) || 0) + (Number(player.onlineTime) || 0);
						// player.onlineTime will be reset by Lua on next reconnect by this player, but we force it now to make it easier to get an accurate count of playtime
						this.managedPlayers[i].onlineTime = 0;
					}
					break;
				}
			}
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
