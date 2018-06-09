document.querySelector("#registerSubmit").onclick = async function(){
	let name = document.querySelector("#registerName").value;
	let email = document.querySelector("#registerEmail").value;
	let password = document.querySelector("#registerPass").value;
	let passwordConfirmation = document.querySelector("#registerPass2").value;
	
	try{
		let resp = await postJSON("/api/playerManager/register", {
			name,
			email,
			password,
			passwordConfirmation,
		});
		
		console.log(resp);
		if(resp.msg) document.querySelector("#registerStatus").innerHTML = resp.msg;
		if(resp.ok){
			setTimeout(()=>{
				document.location = "/playerManager/login"
			},3000);
		}
	}catch(e){console.error(e)}
}
