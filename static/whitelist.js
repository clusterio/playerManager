(async function(){
	
	console.log(await getWhitelist());
	console.log(await getBanlist());
	let whitelistDisplayContainer = document.querySelector("#whitelistDisplayContainer");
	let banlistDisplayContainer = document.querySelector("#banlistDisplayContainer");
	banlistDisplayContainer.innerHTML = await renderStructuredlist(await getBanlist());
	whitelistDisplayContainer.innerHTML = await renderStringArray(await getWhitelist());
})();

async function getBanlist(){
	if(localStorage.banlistCache){
		let banlistCache = localStorage.banlistCache;
		if(Date.now() - banlistCache.timestamp < 5*60*1000){
			console.log("Serving cached banlist");
			return banlistCache.data;
		} else {
			// cache is outdated, invalidate and refresh it
			delete localStorage.banlistCache;
			return getBanlist();
		}
	} else {
		console.log("Getting banlist")
		let banlist = await getJSON("/api/playerManager/bannedPlayers");
		
		localStorage.banlistCache = {
			timestamp: Date.now(),
			data: banlist,
		}
		return banlist;
	}
}
async function getWhitelist(){
	if(localStorage.whitelistCache){
		let whitelistCache = localStorage.whitelistCache;
		if(Date.now() - whitelistCache.timestamp < 5*60*1000){
			console.log("Serving cached whitelist");
			return whitelistCache.data;
		} else {
			// cache is outdated, invalidate and refresh it
			delete localStorage.whitelistCache;
			return getWhitelist();
		}
	} else {
		console.log("Getting whitelist")
		let whitelist = await getJSON("/api/playerManager/whitelistedPlayers");
		
		localStorage.whitelistCache = {
			timestamp: Date.now(),
			data: whitelist,
		}
		return whitelist;
	}
}
async function getPlayerList(){
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
async function renderStructuredlist(list){
	let cols = [];
	list.forEach((obj, i) => {
		for(let k in obj){
			if(!cols.includes(k)) cols.push(k);
		}
	});
	let html = "<table><tr>";
	cols.forEach(col => {
		html += `<td>${col}</td>`;
	});
	html += "</tr>"
	list.forEach(obj => {
		html += `<tr>`;
		cols.forEach(col => {
			html += `<td>${k}</td>`;
		});
		html += "</tr>";
	});

	html += "</table>";
	console.log(html)
	return html;
}
async function renderStringArray(data, {tableClass, trClass, tdClass} = {}){
	let html = `<table class="${tableClass || ""}"><tr class="${trClass || ""}>`;
	data.forEach(elem => {
		html += `<td class="${tdClass || ""}> ${elem} </td>`;
	});
	return html + "</tr></table>";
}
