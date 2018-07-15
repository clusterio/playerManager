import {getPlayerList, getUserData, getToken, arrayRemoveDuplicates} from "./playerManager.js"

(async function(){
	let data = await getUserData(getParameterByName("username"));
	console.log(data);
	if(data.ok)	document.querySelector("#accountContainer").innerHTML += formatUserData(data.userData);
	
	new accountEditor({
		data,
		name:getParameterByName("username"),
		selector:"#accountEditor",
		token: getToken(),
	});
})();

function formatUserData(userData){
	let html = `<div><h1>${userData.name}</h1>`;
	
	// ["email", "admin"].forEach(prop => {
		// if(userData[prop] !== undefined){
			// html += `<p>${prop}: ${userData[prop]}</p>`
		// }
	// });
	
	return html + "</div>";
}
class accountEditor{
	constructor({data, name, selector, token}){
		let writePermissions = arrayRemoveDuplicates(data.permissions.all.write.concat(data.permissions.user[name] ? data.permissions.user[name].write : []));
		
		let html = "<div id='editor' style='position:relative;'>";
		writePermissions.forEach(perm => {
			html += `<div class="accountEditorField ${perm}" style="height:50px;"><span>
				<p style="font-size:18px;width:150px; transform: translateY(18px);">${perm}: </p>
				<input style="position:absolute; transform: translateY(-20px); left:150px;" class="textInput" type="text" value="${data.userData[perm] || "\"placeholder=\"New "+perm+"\""}">
			</span></div>`;
		});
		html += `</div><h3 id="STATUS"></h3>`
		document.querySelector(selector).innerHTML += html;
		
		// register events
		writePermissions.forEach(perm => {
			let elem = document.querySelector(`.accountEditorField.${perm} > span > input`);
			console.log(elem)
			elem.onkeyup = async function(e){
				let value = elem.value;
				console.log(e.keyCode)
				if(e.keyCode == 13 /*enter*/){
					let resp = await postJSON("/api/playerManager/editUserData", {
						name,
						token,
						fieldName: perm,
						fieldValue: value,
					});
					document.querySelector("#STATUS").innerHTML = resp.msg
					setInterval(()=>document.querySelector("#STATUS").innerHTML = "", 4000)
				}
			}
		});
	}
}
