module.exports.ui = {
	sidebar: [
		{
			name:"playerManager",
			getHtml: () => `
			<a href="/playerManager">
				<div id="playerManager-menu" class="button-black menuItem">
					<p>Players</p>
				</div>
			</a>`,
		},{
			name:"whitelist",
			getHtml: () => `
			<a href="/playerManager/whitelist">
				<div id="playerManager-whitelist-menu" class="button-black menuItem">
					<p>Whitelist</p>
				</div>
			</a>
			`
		}
	]
}
