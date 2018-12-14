
/**

This file is responsible for handling authentication tools to be used on all subpages requiring authentication.

*/

export async function getPlayerList(){
	if(localStorage.playerListCache){
		let playerListCache = localStorage.playerListCache;
		if(Date.now() - playerListCache.timestamp < 5*60*1000){
			console.log("Serving cached playerlist");
			return playerListCache.data;
		} else {
			// cache is outdated, invalidate and refresh it
			delete localStorage.playerListCache;
			return getPlayerList();
		}
	} else {
		console.log("Getting playerlist");
		// get new playerList and cache it
		let playerList = await getJSON("/api/playerManager/playerList");
		
		localStorage.playerListCache = JSON.stringify({
			timestamp: Date.now(),
			data: playerList,
		});
		return playerList;
	}
}
export async function getUserFromPlayer(player){
	let table = await getPlayerToUserTable();
	console.log(table);
	
	return table[player];
}
async function getPlayerToUserTable(){
	if(localStorage.userFromPlayerCache){
		let cache = JSON.parse(localStorage.userFromPlayerCache);
		if(Date.now() - cache.timestamp < 10000){
			console.log("Serving cached playerToUserTable");
			return cache.data;
		} else {
			delete localStorage.userFromPlayerCache;
			return getPlayerToUserTable();
		}
	} else {
		console.log("Getting playerToUserTable");
		let playerToUserTable = await getJSON("/api/playerManager/usernamesByPlayer");
		
		localStorage.userFromPlayerCache = JSON.stringify({
			timestamp: Date.now(),
			data: playerToUserTable,
		});
		return playerToUserTable;
	}
}
export async function getUserData(name, token = getToken()){
	let userData = await postJSON("/api/playerManager/getUserData", {name, token});
	return userData;
}
export function getToken(){
	return getSession() ? getSession().token : "";
}
export function getSession(){
	try {
		let session = JSON.parse(localStorage.session);
		return session;
	} catch(e){
		console.log("No session found in localStorage!");
		return
	}
}
export function arrayRemoveDuplicates(array){
	let newArray = [];
	array.forEach(value => {
		if(!newArray.includes(value)) newArray.push(value);
	});
	return newArray;
}
