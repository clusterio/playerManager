local playerData = ""
for index, player in pairs(game.players) do
	--[[ Collect info about the player for identification ]]
	playerData = playerData .. "|name:"..player.name..",index:"..index..",connected:"..tostring(player.connected)..",r:"..tostring(player.color.r)..",g:"..tostring(player.color.g)..",b:"..tostring(player.color.b)..",a:"..tostring(player.color.a)
	
	--[[ Collect players system information ]]
	playerData = playerData .. ",displayWidth:"..player.display_resolution.width..",displayHeight:"..player.display_resolution.height..",displayScale:"..player.display_scale
	
	--[[ Collect game/tool specific information from player ]]
	playerData = playerData .. ",afkTime:"..player.afk_time..",onlineTime:"..player.online_time..",admin:"..tostring(player.admin)..",spectator:"..tostring(player.spectator)
	playerData = playerData .. ",forceName:"..player.force.name
end
game.remove_offline_players()
rcon.print(playerData)
