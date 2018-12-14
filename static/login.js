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

async function processForm(e) {
    if (e.preventDefault) e.preventDefault();
    let name = document.querySelector("#loginName").value;
    let password = document.querySelector("#loginPass").value;

    try{
        let resp = await postJSON("/api/playerManager/login", {
            name,
            password,
        });

        console.log(resp);
        document.querySelector("#loginStatus").innerHTML = resp.msg;
        if(resp.ok){
            localStorage.session = JSON.stringify(resp.session);
            setTimeout(afterLogin, 1000);
        }
    }catch(e){
        console.error(e);
        document.querySelector("#loginStatus").innerHTML = e
    }
    return false;
}

function afterLogin(){
	document.location = "/playermanager";
}

var form = document.getElementById('login-form');
if (form.attachEvent) {
    form.attachEvent("submit", processForm);
} else {
    form.addEventListener("submit", processForm);
}