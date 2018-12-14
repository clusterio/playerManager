async function processForm(e) {
    if (e.preventDefault) e.preventDefault();
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
        if(resp.msg) showError(resp.msg);
        if(resp.ok){
            setTimeout(()=>{
                document.location = "/playerManager/login"
            },3000);
        }
    }catch(e){console.error(e)}
    return false;
}

function showError(msg) {
	$('#registerAlert').removeClass('d-none');
    $('#registerAlert').html(msg);
}

var form = document.getElementById('register-form');
if (form.attachEvent) {
    form.attachEvent("submit", processForm);
} else {
    form.addEventListener("submit", processForm);
}