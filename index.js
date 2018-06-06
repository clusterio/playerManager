const needle = require("needle");
const fs = require("fs-extra");

module.exports = class remoteCommands {
	constructor(mergedConfig, messageInterface, extras){
		this.messageInterface = messageInterface;
		this.config = mergedConfig;
		this.socket = extras.socket;
		
		this.socket.on("hello", () => {
			this.socket.emit("registerPlayerManager");
		});
		this.socket.on("playerManagerGetPlayers", async data => {
			try {
				let command = await this.getCommand("sharedPlugins/playerManager/lua/getPlayerData.lua");
				let playerData = await this.messageInterface("/silent-command "+command);
				this.socket.emit("playerManagerSetPlayerdata", playerData.replace(/(\r\n\t|\n|\r\t)/gm, ""));
			} catch(e){
				console.log(e);
			}
		});
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
}
