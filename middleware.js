
class middleware{
	constructor({getUsers}){
		this.getUsers = getUsers;
	}
}
async function authenticate(req, res, next){
	if(req.body.token
	&& typeof req.body.token === "string"){
		
	} else {
		res.send({
			ok:false,
			msg:"Token authentication failed, please send {token}. Get your session token from /api/playerManager/login",
		})
	}
}
module.exports = {};
