local function deserialize_grid(grid, data)
    grid.clear()
    local names, xs, ys = data.names, data.xs, data.ys
    for i = 1, #names do
        grid.put({
            name = names[i],
            position = {xs[i], ys[i]}
        })
    end
end

local function deserialize_inventory(inventory, data)
    local item_names, item_counts, item_durabilities,
    item_ammos, item_exports, item_labels, item_grids
    = data.item_names, data.item_counts, data.item_durabilities,
    data.item_ammos, data.item_exports, data.item_labels, data.item_grids
    for idx, name in pairs(item_names) do
        local slot = inventory[idx]
        slot.set_stack({
            name = name,
            count = item_counts[idx]
        })
        if item_durabilities[idx] ~= nil then
            slot.durability = item_durabilities[idx]
        end
        if item_ammos[idx] ~= nil then
            slot.ammo = item_ammos[idx]
        end
        local label = item_labels[idx]
        if label then
            slot.label = label.label
            slot.label_color = label.label_color
            slot.allow_manual_label_change = label.allow_manual_label_change
        end

        local grid = item_grids[idx]
        if grid then
            deserialize_grid(slot.grid, grid)
        end
    end
    for idx, str in pairs(item_exports) do
        inventory[idx].import_stack(str)
    end
    if data.filters then
        for idx, filter in pairs(data.filters) do
            inventory.set_filter(idx, filter)
        end
    end
end
script.on_event(defines.events.on_tick, function()
	if game.tick % 600 then
		-- Do stuff once a second
		
	end
end)

script.on_init(function()
	global.playersToImport = {}
	global.inventory_types = {}
	do
		local map = {}
		for _, inventory_type in pairs(defines.inventory) do
			map[inventory_type] = true
		end
		for t in pairs(map) do
			global.inventory_types[#global.inventory_types + 1] = t
		end
		table.sort(global.inventory_types)
	end
end)

script.on_event(defines.events.on_player_joined_game, function(event)
	local player = game.players[event.player_index]
	table.insert(global.playersToImport, player.name)
	player.print("Registered you joining the game, syncing account now...")
end)

-- Register and handle events
remote.remove_interface("playerManager")
remote.add_interface("playerManager", {
	getImportTask = function()
		if #global.playersToImport >= 1 then
			local playerName = table.remove(global.playersToImport, 1)
			-- rcon.print(playerName)
			game.print("Downloading account for "..playerName.."...")
		end
	end,
	importInventory = function(playerName, invData)
		local player = game.players[playerName]
		if player then
			local ok, invTable = serpent.load(invData)
			
			-- 1: Main inventory
			deserialize_inventory(player.get_inventory(defines.inventory.player_main), invTable[1])
			-- 2: wooden chest, iron chest. (quickbar)
			deserialize_inventory(player.get_inventory(defines.inventory.player_quickbar), invTable[2])
			-- 3: pistol.
			deserialize_inventory(player.get_inventory(defines.inventory.player_guns), invTable[3])
			-- 4: Ammo.
			deserialize_inventory(player.get_inventory(defines.inventory.player_ammo), invTable[4])
			-- 5: armor.
			deserialize_inventory(player.get_inventory(defines.inventory.player_armor), invTable[5])
			-- 6: pickaxe.
			deserialize_inventory(player.get_inventory(defines.inventory.player_tools), invTable[6])
			-- 7: nil.
			-- 8: express-transport-belt (trash slots)
			deserialize_inventory(player.get_inventory(defines.inventory.player_trash), invTable[8])
			
			player.print("Inventory synchronized.")
		else
			game.print("Player "..playerName.." left before they could get their inventory!")
		end
	end,
	resetInvImportQueue = function()
		global.playersToImport = {}
	end
})
