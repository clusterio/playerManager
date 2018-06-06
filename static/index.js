(async function(){
	console.log("hi")
	console.log(await getPlayerList())
	let playerlistDisplayContainer = document.querySelector("#playerlistDisplayContainer");
	playerlistDisplayContainer.innerHTML = await renderPlayerlist(await getPlayerList());
	

})();

async function getPlayerList(){
	if(localStorage.playerListCache){
		let playerListCache = localStorage.playerListCache;
		if(Date.now() - playerListCache.timestamp < 5*60*1000){
			return playerListCache.data;
		} else {
			// cache is outdated, invalidate and refresh it
			delete localStorage.playerListCache;
			return getPlayerList();
		}
	} else {
		console.log("Gettinn pøayerlist")
		// get new playerList and cache it
		let playerList = await getJSON("/api/playerManager/playerList");
		
		localStorage.playerListCache = {
			timestamp: Date.now(),
			data: playerList,
		}
		return playerList;
	}
}
async function renderPlayerlist(playerList){
	let html = "";
	for(let player in playerList){
		player = playerList[player];
		html += "<div>";
		html += "<h2>"+player.name+"</h2>"
		if(player.connected === "true"){
			html += "<p>Online on "+await getInstanceName(player.instanceID)+"</p>";
		} else html += "<p>Offline</p>";
		html += "<p>Playtime: "+(Math.floor((Number(player.onlineTime)+(Number(player.onlineTimeTotal)||0))/60/60/60*10)/10)+" hours</p>";
		html += "</div>";
	}
	console.log(html)
	return html;
}