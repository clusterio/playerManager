const needle = require("needle");
const fs = require("fs-extra");

const pluginConfig = require("./config");
const COMPRESS_LUA = false;

module.exports = class remoteCommands {
	constructor(mergedConfig, messageInterface, extras){
		this.messageInterface = messageInterface;
		this.config = mergedConfig;
		this.socket = extras.socket;
		
		this.socket.on("hello", () => {
			this.socket.emit("registerPlayerManager");
		});
		this.socket.on("playerManagerGetPlayers", async data => {
			if(this.hotpatchStatus){
				try {
					// let command = await this.getCommand("sharedPlugins/playerManager/lua/getPlayerData.lua");
					// let playerData = await this.messageInterface("/silent-command "+command);
					let playerData = await this.messageInterface(`/silent-command remote.call("playerManager", "exportPlayers")`);
					/// this log statement is broken; playerData might be blank but still true (or something)
					// if(playerData) messageInterface("Exported players leaving the server")
					this.socket.emit("playerManagerSetPlayerdata", playerData.replace(/(\r\n\t|\n|\r\t)/gm, ""));
				} catch(e){
					console.log(e);
				}
			}
		});
		
		
		(async ()=>{
			let hotpatchInstallStatus = await this.checkHotpatchInstallation();
			this.hotpatchStatus = hotpatchInstallStatus;
			this.messageInterface("Hotpach installation status: "+hotpatchInstallStatus);
			if(hotpatchInstallStatus){
				let mainCode = await this.getSafeLua("sharedPlugins/playerManager/lua/playerTracking.lua");
				if(mainCode) var returnValue = await messageInterface(`/silent-command remote.call('hotpatch', 'update', '${pluginConfig.name}', '${pluginConfig.version}', '${mainCode}')`);
				if(returnValue) console.log(returnValue);
				this.messageInterface(`/silent-command remote.call("playerManager", "resetInvImportQueue")`);
				
				let syncInventory = async ()=>{
					let playerName = await messageInterface(`/silent-command remote.call("playerManager", "getImportTask")`);
					playerName = playerName.trim();
					if(playerName){
						messageInterface(`Downloading ${playerName}'s inventory`);
						// set inventory
						let playerData = (await needle("get", `${this.config.masterIP}:${this.config.masterPort}/api/playerManager/playerList`)).body;
						playerData.forEach(player => {
							if(player.name == playerName){
								if(player.inventory){
									messageInterface(`/silent-command remote.call("playerManager", "importInventory", "${player.name}", '${player.inventory}', '${player.forceName}', ${player.spectator}, ${player.admin}, {r=${player.r}, g=${player.g}, b=${player.b}, a=${player.a}}, {r=${player.cr}, g=${player.cg}, b=${player.cb}, a=${player.ca}}, "${player.tag || ""}")`);
								}
							}
						});
					}
				}
				setInterval(syncInventory, 2000);
			}
			
			// sync whitelist/bans with master
			let bans = await needle("get", `${this.config.masterIP}:${this.config.masterPort}/api/playerManager/bannedPlayers`);
			let whitelist = await needle("get", `${this.config.masterIP}:${this.config.masterPort}/api/playerManager/whitelistedPlayers`);
			if(!bans || !bans.body || !bans.body.forEach || !whitelist || !whitelist.body || !whitelist.body.forEach){
				console.error(new Error("ERROR: PLAYERMANAGER NOT FOUND ON SERVER, NOT IMPORTING WHITELIST AND BANLIST. THIS CONFIGURATION IS UNSUPPORTED AND WILL CAUSE TROUBLE"))
				return false;
			}
			
			messageInterface("/whitelist clear");
			messageInterface("/banlist clear");
			messageInterface("/silent-command game.print('Cleared whitelist and banlist')");
			console.log("/log Cleared whitelist and banlist");
			
			await sleep(5);
			
			bans.body.forEach(ban => {
				messageInterface(`/ban ${ban.factorioName} ${ban.reason}`);
			});
			whitelist.body.forEach(name => {
				let cmd = `/whitelist add ${name}`
				messageInterface(cmd);
				console.log(cmd);
			});
		})().catch(e => console.log(e));
	}
	async getCommand(file){
		this.commandCache = this.commandCache || {};
		if(!this.commandCache[file]){
			try{
				let command = (await fs.readFile(file)).toString();
				this.commandCache[file] = command.replace(/(\r\n\t|\n|\r\t)/gm, " "); // remove newlines
				return this.commandCache[file];
			} catch(e){
				console.log("Unable to get command from file!");
				console.log(e)
			}
		} else if(typeof this.commandCache[file] == "string"){
			return this.commandCache[file];
		} else {
			throw new Error("Command not found");
		}
	}
	async factorioOutput(data){
		try{ // these filters might not be good enough. Investigate whether it is possible for a non-admin user to write things that still goes through.
		this.messageInterface(data)
		if(data.includes("[BAN]")
		&& data.includes("was banned by")
		&& !data.includes("[CHAT]")
		&& !data.includes("/c") && !data.includes("/silent-command")
		// Try to weed out things that can lead to RCE vulnearabilities
		&& !data.includes('"') && !data.includes("\\")){
			// data = "2018-11-17 14:05:27 [BAN] James (not on map) was banned by Zr4g0n [Totally not a dragon!]. Reason: being lame."
			let bannedName = data.split("[BAN] ")[1].split(" ")[0];
			let banner = data.split("was banned by ")[1].split(" ")[0];
			let reason = `${banner} banned ${bannedName} for ${data.split("Reason: ")[data.split("Reason: ").length-1]}`;
			this.messageInterface(bannedName)
			this.messageInterface(banner)
			this.messageInterface(reason)
			this.messageInterface("Im OK")
			let banlist = (await needle("get", this.config.masterIP+":"+this.config.masterPort+"/api/playerManager/bannedPlayers")).body;
			
			// avoid banning players who are already banned
			let playerIsAlreadyBannned = false;
			console.log(banlist)
			banlist.forEach(ban => {
				if(ban.factorioName == bannedName) playerIsAlreadyBannned = true;
			});
			if(playerIsAlreadyBannned) return true;
			
			needle.post(this.config.masterIP+":"+this.config.masterPort+"/api/playerManager/banlist", {
				factorioName: bannedName,
				action: "add",
				reason,
				token: this.config.masterAuthToken,
			}, (err, response) => {
				if(err){
					console.error(err);
				} else if(response.statusCode != 200){
					console.error(`Got code ${response.statusCode} when posting to /api/playerManager/banlist`);
				} else {
					if(response.ok){
						this.messageInterface(`/c game.print("${reason}")`);
						this.messageInterface(reason);
					}
					this.messageInterface(response.msg);
				}
			});
		}} catch(e){console.log(e)}
	}
	getInstanceName(instanceID){
		return new Promise((resolve, reject) => {
			let instance = this.instances[instanceID];
			if(!instance){
				needle.get(this.config.masterIP+":"+this.config.masterPort+ '/api/slaves', (err, response) => {
					if(err || response.statusCode != 200) {
						console.log("Unable to get JSON master/api/slaves, master might be unaccessible");
					} else if (response && response.body) {	
						if(Buffer.isBuffer(response.body)) {console.log(response.body.toString("utf-8")); throw new Error();}
							try {
								for (let index in response.body)
									this.instances[index] = response.body[index].instanceName;
							} catch (e){
								console.log(e);
								return null;
							}
						instance = this.instances[instanceID] 							
						if (!instance) instance = instanceID;  //somehow the master doesn't know the instance	
						resolve(instance);
					}
				});
			} else {
				resolve(instance);
			}
		});
	}
	async getSafeLua(filePath){
		return new Promise((resolve, reject) => {
			fs.readFile(filePath, "utf8", (err, contents) => {
				if(err){
					reject(err);
				} else {
                    // split content into lines
					contents = contents.split(/\r?\n/);

					// join those lines after making them safe again
					contents = contents.reduce((acc, val) => {
                        val = val.replace(/\\/g ,'\\\\');
                        // remove leading and trailing spaces
					    val = val.trim();
                        // escape single quotes
					    val = val.replace(/'/g ,'\\\'');

					    // remove single line comments
                        let singleLineCommentPosition = val.indexOf("--");
                        let multiLineCommentPosition = val.indexOf("--[[");

						if(multiLineCommentPosition === -1 && singleLineCommentPosition !== -1) {
							val = val.substr(0, singleLineCommentPosition);
						}

                        return acc + val + '\\n';
					}, ""); // need the "" or it will not process the first row, potentially leaving a single line comment in that disables the whole code

					// console.log(contents);

					// this takes about 46 ms to minify train_stop_tracking.lua in my tests on an i3
					if(COMPRESS_LUA) contents = require("luamin").minify(contents);
					
					resolve(contents);
				}
			});
		});
	}
	async checkHotpatchInstallation(){
		let yn = await this.messageInterface("/silent-command if remote.interfaces['hotpatch'] then rcon.print('true') else rcon.print('false') end");
		yn = yn.replace(/(\r\n\t|\n|\r\t)/gm, "");
		if(yn == "true"){
			return true;
		} else if(yn == "false"){
			return false;
		}
	}
}
async function sleep(s){
	return new Promise((resolve, reject) => {
		setTimeout(resolve, s*1000);
	});
}
