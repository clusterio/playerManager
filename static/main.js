import {getSession} from "./playerManager.js"

/**

This file is responsible for logging us out when our token is old and ugly.

*/

(async () => {
	// check if token is still valid
	let session = getSession();
	if(session && session.expiryDate < Date.now()){
		// token has expired
		console.log("Logged out due to: Session expired");
		delete localStorage.session;
	}
})();
