let token;
try{
	let session = JSON.parse(localStorage.session);
	if(session.expiryDate > Date.now()){
		token = session.token;
		afterLogin();
	}
}catch(e){
	// we haven't logged in yet, stay on the page
	document.querySelector("#loginStatus").innerHTML = "Session expired, please login again";
}

document.querySelector("#loginSubmit").onclick = async function(){
	let name = document.querySelector("#loginName").value;
	let password = document.querySelector("#loginPass").value;
	
	try{
		let resp = await postJSON("/api/playerManager/login", {
			name,
			password,
		});
		
		console.log(resp);
		if(resp.ok) localStorage.session = JSON.stringify(resp.session);
	}catch(e){console.error(e)}
}
function afterLogin(){
	document.location = "/playermanager";
}
