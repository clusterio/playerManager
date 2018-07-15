(async function(){
	console.log(await getPlayerList())
	let playerlistDisplayContainer = document.querySelector("#playerlistDisplayContainer");
	playerlistDisplayContainer.innerHTML = await renderPlayerlist(await getPlayerList());
	

})();

async function getPlayerList(){
	let playerListCache
	try {
		playerListCache = JSON.parse(localStorage.playerListCache);
	} catch(e){}
	if(playerListCache){
		if(Date.now() - playerListCache.timestamp < 5*60*1000){
			console.log("Serving cached playerlist");
			return playerListCache.data;
		} else {
			// cache is outdated, invalidate and refresh it
			delete localStorage.playerListCache;
			return getPlayerList();
		}
	} else {
		console.log("Getting playerlist")
		// get new playerList and cache it
		let playerList = await getJSON("/api/playerManager/playerList");
		
		localStorage.playerListCache = JSON.stringify({
			timestamp: Date.now(),
			data: playerList,
		});
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
