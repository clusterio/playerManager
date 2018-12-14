(async function(){
	console.log(await getWhitelist());
	console.log(await getBanlist());
	
	let whitelistDisplayContainer = document.querySelector("#whitelistDisplayContainer");
	let banlistDisplayContainer = document.querySelector("#banlistDisplayContainer");
	banlistDisplayContainer.innerHTML = await renderStructuredlist(await getBanlist());
	whitelistDisplayContainer.innerHTML = await renderStringArray(await getWhitelist());
	
	let submitWhitelist = document.querySelector("#submitWhitelist");
	let submitBan = document.querySelector("#submitBan");
	
	submitWhitelist.onclick = async () => {
		let names = getUsernames("#userActionField > textarea");
		let action = document.querySelector("#removeSlider").checked ? "add" : "remove" ;
		let token = JSON.parse(localStorage.session).token;
		
		let responses = [];
		for(let i in names) {
			let factorioName = names[i];
			responses.push(await postJSON("/api/playerManager/whitelist", {
				factorioName,
				action,
				token,
			}));
			console.log(responses[i]);
			if(i == names.length-1){
				// clear cache since its now updated
				delete localStorage.whitelistCache;
				whitelistDisplayContainer.innerHTML = await renderStringArray(await getWhitelist());
			}
		};
		
		// clear cache since its now updated
		delete localStorage.whitelistCache;
		whitelistDisplayContainer.innerHTML = await renderStringArray(await getWhitelist());
	}
	submitBan.onclick = async () => {
		let names = getUsernames("#userActionField > textarea");
		let reason = document.querySelector("#banReason").value;
		let action = document.querySelector("#removeSlider").checked ?  "add" : "remove";
		let token = JSON.parse(localStorage.session).token;
		
		let responses = [];
		for(let i in names){
			let factorioName = names[i];
			responses.push(await postJSON("/api/playerManager/banlist", {
				factorioName,
				reason,
				action,
				token,
			}));
			console.log(responses[i]);
			if(i == names.length-1){
				// clear cache since its now updated
				delete localStorage.banlistCache;
				banlistDisplayContainer.innerHTML = await renderStructuredlist(await getBanlist());
			}
		};
	}
})();

function getUsernames(selector){
	let names = [];
	// split names by , then \n then trim away whitespace, strip names with spaces in em, add to array
	document.querySelector(selector).value.split(",").forEach(name => name.trim().split("\n").forEach(name => ((name = name.trim()) && !name.includes(" ")) ? names.push(name) : ""));
	// console.log(names);
	return names;
}
async function getBanlist(){
	let banlistCache;
	try{
		banlistCache = JSON.parse(localStorage.banlistCache);
	}catch(e){}
	if(banlistCache){
		if(Date.now() - banlistCache.timestamp < 30*1000){ // cache for 30 seconds
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
		
		localStorage.banlistCache = JSON.stringify({
			timestamp: Date.now(),
			data: banlist,
		});
		return banlist;
	}
}
async function getWhitelist(){
	let whitelistCache;
	try{
		whitelistCache = JSON.parse(localStorage.whitelistCache);
	}catch(e){}
	if(whitelistCache){
		if(Date.now() - whitelistCache.timestamp < 30*1000){ // cache for 30 seconds
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
		
		localStorage.whitelistCache = JSON.stringify({
			timestamp: Date.now(),
			data: whitelist,
		});
		return whitelist;
	}
}
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
async function renderStructuredlist(list, {tableClass, trClass, tdClass} = {}){
	let cols = [];
	list.forEach((obj, i) => {
		for(let k in obj){
			if(!cols.includes(k)) cols.push(k);
		}
	});
	let html = `<table class="${tableClass || ""}"><tr class="${trClass || ""}">`;
	cols.forEach(col => {
		html += `<td class="${tdClass || ""}">${col}</td>`;
	});
	html += "</tr>"
	list.forEach(obj => {
		html += `<tr class="${trClass || ""}">`;
		cols.forEach(col => {
			html += `<td class="${tdClass || ""}">${obj[col]}</td>`;
		});
		html += "</tr>";
	});

	html += "</table>";
	return html;
}
async function renderStringArray(data, {tableClass, trClass, tdClass} = {}){
	let html = `<table class="${tableClass || ""}"><tr class="${trClass || ""}"><td class="${trClass || ""}">Name</td></tr>`;
	data.forEach(elem => {
		html += `<tr class="${trClass || ""}"><td class="${tdClass || ""}"> ${elem} </td></tr>`;
	});
	return html + "</table>";
}
