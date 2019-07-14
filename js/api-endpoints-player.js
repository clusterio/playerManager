const util = require("./util.js");

module.exports = masterPlugin => {
    masterPlugin.app.get("/api/playerManager/playerList", (req,res) => {
		res.send(masterPlugin.managedPlayers);
	});
	masterPlugin.app.post("/api/playerManager/getPlayer", async (req,res) => {
		if(req.body
			&& req.body.name
			&& typeof req.body.name == "string"
			&& req.body.token
			&& typeof req.body.token == "string"){
				res.send({
					ok:true,
					player:masterPlugin.managedPlayers.find(user => user.name === req.body.name)
				});
		} else {
			res.send({
				ok:false,
				msg:"Invalid parameters, please send {name, token}",
			});
		}
	});
    masterPlugin.app.post("/api/playerManager/deletePlayer", async (req,res) => {
		if(req.body
		&& req.body.name
		&& typeof req.body.name == "string"
		&& req.body.token
		&& typeof req.body.token == "string"){
			let permissions = await masterPlugin.getPermissions(req.body.token, masterPlugin.users);
			if(!permissions.cluster.includes("deletePlayer")){
				res.send({
					ok:false,
					msg:"You do not have cluster.deletePlayer permission",
				});
			} else {
				let playerIndex = util.findInArray("name", req.body.name, masterPlugin.managedPlayers);
				let deletedData = masterPlugin.managedPlayers.splice(playerIndex, 1);
				res.send({
					ok:true,
					msg:"Account permanently deleted, it cannot be restored.",
					data:deletedData,
				});
			}
		} else {
			res.send({
				ok:false,
				msg:"Invalid parameters, please send {name, token}",
			});
		}
	});
	masterPlugin.app.post("/api/playerManager/isPlayerWhitelisted", async (req,res) => {
		if(req.body
			&& typeof req.body.factorioName == "string"
			&& typeof req.body.token == "string"){
				let permissions = await masterPlugin.getPermissions(req.body.token, masterPlugin.users);
	
				if(!permissions.cluster.includes("whitelist")) {
					res.send({
						ok:false,
						msg:"Insufficient permissions, make sure you have permissions.cluster.whitelist",
					});
					return;
				}

				res.send({
					ok:true,
					msg:masterPlugin.whitelist.includes(req.body.factorioName),
				});				
		} else {
			console.log("nok")
			res.send({
				ok:false,
				msg:"Invalid parameters, please send {factorioName, token}",
			});
		}
	});
	masterPlugin.app.post("/api/playerManager/isPlayerBanned", async (req,res) => {
		if(req.body
			&& typeof req.body.factorioName == "string"
			&& typeof req.body.token == "string"){
				let permissions = await masterPlugin.getPermissions(req.body.token, masterPlugin.users);
	
				if(!permissions.cluster.includes("banlist")) {
					res.send({
						ok:false,
						msg:"Insufficient permissions, make sure you have permissions.cluster.banlist",
					});
					return;
				}

				let isBanned = util.findInArray("factorioName", req.body.factorioName, masterPlugin.banlist).length === 1;		
				res.send({
					ok:true,
					msg:isBanned,
				});				
		} else {
			console.log("nok")
			res.send({
				ok:false,
				msg:"Invalid parameters, please send {factorioName, token}",
			});
		}
	});
	// Manage whitelist/banlist
	masterPlugin.app.get("/api/playerManager/whitelistedPlayers", async (req,res) => {
		res.send(masterPlugin.whitelist);
	});
	masterPlugin.app.get("/api/playerManager/bannedPlayers", async (req,res) => {
		res.send(masterPlugin.banlist);
	});
	masterPlugin.app.post("/api/playerManager/whitelist", async (req,res) => {
		if(req.body
		&& typeof req.body.factorioName == "string"
		&& typeof req.body.action == "string"
		&& (req.body.action == "add" || req.body.action == "remove")
		&& typeof req.body.token == "string"){
			let permissions = await masterPlugin.getPermissions(req.body.token, masterPlugin.users);

			if(req.body.action == "add" && permissions.cluster.includes("whitelist")){
				if(!masterPlugin.whitelist.includes(req.body.factorioName)){
					masterPlugin.whitelist.push(req.body.factorioName);
					masterPlugin.broadcastCommand(`/silent-command remote.call("playerManager", "setPlayerPermissionGroup", "${req.body.factorioName}", "Standard")`);
					res.send({
						ok:true,
						msg:`Added player ${req.body.factorioName} to whitelist`,
					});
				}
				
			} else if(req.body.action == "remove" && permissions.cluster.includes("removeWhitelist")){
				masterPlugin.whitelist.splice(masterPlugin.whitelist.indexOf(req.body.factorioName), 1);
				// Adding the player back into the default 
				masterPlugin.broadcastCommand(`/silent-command remote.call("playerManager", "setPlayerPermissionGroup", "${req.body.factorioName}", "Default")`);
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
	masterPlugin.app.post("/api/playerManager/banlist", async (req,res) => {
		if(req.body
		&& typeof req.body.factorioName == "string"
		&& typeof req.body.action == "string"
		&& ((req.body.action == "add" && typeof req.body.reason == "string") || req.body.action == "remove")
		&& typeof req.body.token == "string"){
			let permissions = await masterPlugin.getPermissions(req.body.token, masterPlugin.users);
			if(req.body.action == "add" && permissions.cluster.includes("banlist")){
				let indexes = util.findInArray("factorioName", req.body.factorioName, masterPlugin.banlist);
				if(indexes.length == 1){
					// update an existing ban
					masterPlugin.banlist[indexes[0]].reason = req.body.reason;
					masterPlugin.broadcastCommand(`/banlist remove ${req.body.factorioName}`);
					var msg = `Updated ban for user ${req.body.factorioName} for ${req.body.reason}`;
				} else {
					// ban a new player
					masterPlugin.banlist.push({
						factorioName: req.body.factorioName,
						reason: req.body.reason,
					});
					var msg = `Banned ${req.body.factorioName} for ${req.body.reason}`;
				}
				// Perform the ban
				setTimeout(()=>{
					masterPlugin.broadcastCommand(`/ban ${req.body.factorioName} ${req.body.reason}`);
					res.send({
						ok:true,
						msg,
					});
				},1000);
			} else if(req.body.action == "remove" && permissions.cluster.includes("removeBanlist")){
				let indexes = util.findInArray("factorioName", req.body.factorioName, masterPlugin.banlist)
				let pardonedPlayers = [];
				indexes.forEach(i => {
					let ban = masterPlugin.banlist[i];
					masterPlugin.broadcastCommand(`/unban ${ban.factorioName}`);
					pardonedPlayers.push(ban.factorioName);
					masterPlugin.banlist.splice(i, 1)
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
