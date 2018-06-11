export async function getPlayerList(){
	if(localStorage.playerListCache){
		let playerListCache = localStorage.playerListCache;
		if(Date.now() - playerListCache.timestamp < 5*60*1000){
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
export async function getUserData(name, token){
	if(!token){
		try {
			token = JSON.parse(localStorage.session).token;
		} catch(e){
			console.error("No token found in localStorage!");
		}
	}
	let userData = await postJSON("/api/playerManager/getUserData", {name, token});
	return userData;
}
export function getToken(){
	try {
		token = JSON.parse(localStorage.session).token;
		return token;
	} catch(e){
		console.error("No token found in localStorage!");
	}
}
export function arrayRemoveDuplicates(array){
	let newArray = [];
	array.forEach(value => {
		if(!newArray.includes(value)) newArray.push(value);
	});
	return newArray;
}
