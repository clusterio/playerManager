import {getUserFromPlayer, getPlayerList, getUserData, getSession, getToken, arrayRemoveDuplicates} from "./playerManager.js"

(async function(){
	console.log(await getPlayerList())
	let playerlistDisplayContainer = document.querySelector("#playerlistDisplayContainer");
	playerlistDisplayContainer.innerHTML = await renderPlayerlist(await getPlayerList());

})();

async function renderPlayerlist(playerList){
	let html = "";
	for(let player in playerList){
		player = playerList[player];
		html += "<div>";
		// check if this player has a profile
		let username = await getUserFromPlayer(player.name);
		console.log(username)
		if(username){
			html += `<a href="/playerManager/profile?username=${username}"><h2>${player.name}</h2></a>`
		} else {
			html += "<h2>"+player.name+"</h2>";
		}
		if(player.connected === "true"){
			html += "<p>Online on "+await getInstanceName(player.instanceID)+"</p>";
			html += "<p>Playtime: "+(Math.floor((Number(player.onlineTime)+(Number(player.onlineTimeTotal)||0))/60/60/60*10)/10)+" hours</p>";
		} else {
			html += "<p>Offline</p>";
			html += "<p>Playtime: "+(Math.floor(((Number(player.onlineTimeTotal)||0))/60/60/60*10)/10)+" hours</p>";
		}
		html += "</div>";
	}
	console.log(html)
	return html;
}
