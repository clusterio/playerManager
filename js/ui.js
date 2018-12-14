module.exports.ui = {
    sidebar: [
        {
            name: "playerManager",
            getHtml: () => `
    <div class="nav-item mr-1">
        <a class="nav-link align-middle" href="/playerManager">Players</a>
    </div>`,
        }, {
            name: "whitelist",
            getHtml: () => `
    <div class="nav-item mr-1">
        <a class="nav-link align-middle" href="/playerManager/whitelist">Whitelist</a>
    </div>
			`
        }
    ]
};
