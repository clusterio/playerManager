import {getPlayerList, getUserData, getToken, arrayRemoveDuplicates} from "./playerManager.js"

(async function(){
	let data = await getUserData(getParameterByName("username"));
	console.log(data);
	document.querySelector("#profileContainer").innerHTML = formatUserData(data.userData);
})();

function formatUserData(userData){
	let html = `<h1>${userData.name}</h1>`;
	
	if(userData.description) html += `<p>${userData.description}</p><br>`;
	
	["factorioName", "email", "admin", "factorioLinkToken"].forEach(prop => {
		if(userData[prop] !== undefined){
			html += `<p>${prop}: ${userData[prop]}</p>`
		}
	});
	
	return html;
}
