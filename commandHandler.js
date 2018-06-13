module.exports = class commandHandler{
	constructor(master, sendCommand){
		this.master = master;
		this.sendCommand = sendCommand;
	}
	register(msg, instanceID, rawData){
		msg.shift();
		msg.shift();
		
		let factorioName = rawData.split(" ")[3].replace(":","");
		let code = msg[0];
		
		// find this factorioLinkToken in users
		let userLinked;
		this.master.users.forEach(user => {
			if(user.factorioLinkToken == code){
				console.log(`Linking ${user.name} with ${factorioName}!`);
				user.factorioName = factorioName;
				this.sendCommand(`/silent-command game.print('Linking ${user.name} with ${factorioName}!')`, instanceID);
				userLinked = true;
			}
		});
		if(!userLinked){
			this.sendCommand(`/silent-command game.print("Unable to link ${factorioName} : Invalid factorioLinkToken")`, instanceID);
		}
	}
	help(msg, instanceID){
		[
			"!playerManager help",
			" - Displays this help page",
			"!playerManager register PNT10am1Wjo",
			" - Links your factorio account to your clusterio account (see playerManager/profile for your link token)",
		].forEach((line, i) => {
			setTimeout(() => this.sendCommand("/silent-command game.print('"+line+"')", instanceID), i*50);
		});
	}
}
