(async function(){
	console.log("hi")
	console.log(await getPlayerList())
	
	console.log(await getUserData("Danielv123"));
})();

async function getUserData(name, token){
	if(!token){
		try {
			token = JSON.parse(localStorage.session).token;
		} catch(e){
			console.log("No token found in localStorage!");
		}
	}
	let userData = await postJSON("/api/playerManager/getUserData", {name, token});
	return userData;
}
async function getPlayerList(){
	if(localStorage.playerListCache){
		let playerListCache = localStorage.playerListCache;
		if(Date.now() - playerListCache.timestamp < 5/**60*1000*/){
			console.log("Serving cached playerlist")
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
		
		localStorage.playerListCache = {
			timestamp: Date.now(),
			data: playerList,
		}
		return playerList;
	}
}
