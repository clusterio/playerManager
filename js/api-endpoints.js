
const bcrypt = require("bcrypt-promise");
const crypto = require("crypto");
const base64url = require('base64url');
const sanitizer = require('sanitizer');

const util = require("./util.js");

module.exports = masterPlugin =>{
	masterPlugin.app.get("/api/playerManager/playerList", (req,res) => {
		res.send(masterPlugin.managedPlayers);
	});
	masterPlugin.app.get("/api/playerManager/usernamesByPlayer", (req,res) => {
		let usernamesByPlayer = {};
		for(let i in masterPlugin.users){
			let user = masterPlugin.users[i];
			if(user.factorioName){
				usernamesByPlayer[user.factorioName] = user.name;
			}
		}
		res.send(usernamesByPlayer);
	});
	// manage web interface users
	masterPlugin.app.post("/api/playerManager/register", async (req,res) => {
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
				masterPlugin.users.push(user);
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
	masterPlugin.app.post("/api/playerManager/login", async (req,res) => {
		// check this users username and password against database and return a temporary auth token
		if(req.body
		&& req.body.name
		&& req.body.password){
			for(let i in masterPlugin.users){
				let user = masterPlugin.users[i];
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
						masterPlugin.users[i].sessions.push(session);
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
	masterPlugin.app.post("/api/playerManager/getUserData", async (req,res) => {
		if(req.body
		&& req.body.name){
			// get permissions depending on token and other permission systems
			let permissions = await masterPlugin.getPermissions(req.body.token, masterPlugin.users);
			
			let user = masterPlugin.users[util.findInArray("name",req.body.name,masterPlugin.users)];
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
	masterPlugin.app.post("/api/playerManager/editUserData", async (req,res) => {
		if(req.body
		&& typeof req.body.token === "string"
		&& typeof req.body.name === "string"
		&& typeof req.body.fieldName === "string"
		&& req.body.fieldValue){
			let permissions = await masterPlugin.getPermissions(req.body.token, masterPlugin.users);

			try{// this statement fails whenever we request a modification to a user we don't have any explicit permissions to
				var writePermissions = util.arrayRemoveDuplicates(permissions.all.write.concat(permissions.user[req.body.name].write))
			} catch(e){console.log(e)}
			if(writePermissions.includes(req.body.fieldName)){
				let userIndex = util.findInArray("name", req.body.name, masterPlugin.users);
				if(req.body.fieldName === "password"){
					let startTime = Date.now()
					let hash = await bcrypt.hash(req.body.fieldValue, 12);
					console.log("Hashed password for new user '"+req.body.name+"' in "+(Date.now()-startTime)+"ms");
					masterPlugin.users[userIndex][req.body.fieldName] = hash;
					res.send({
						ok:true,
						msg:`Updated value for field "password"`,
					});
				} else {
					masterPlugin.users[userIndex][req.body.fieldName] = sanitizer.sanitize(req.body.fieldValue);
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
	masterPlugin.app.post("/api/playerManager/deleteUser", async (req,res) => {
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
				let userIndex = util.findInArray("name", req.body.name, masterPlugin.users);
				let user = masterPlugin.users[userIndex];
				if(await bcrypt.compare(req.body.password, user.password)){
					let deletedData = masterPlugin.users.splice(userIndex, 1);
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
					masterPlugin.broadcastCommand(`/whitelist add ${req.body.factorioName}`);
					res.send({
						ok:true,
						msg:`Added player ${req.body.factorioName} to whitelist`,
					});
				}
				
			} else if(req.body.action == "remove" && permissions.cluster.includes("removeWhitelist")){
				masterPlugin.whitelist.splice(masterPlugin.whitelist.indexOf(req.body.factorioName), 1);
				masterPlugin.broadcastCommand(`/whitelist remove ${req.body.factorioName}`);
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
