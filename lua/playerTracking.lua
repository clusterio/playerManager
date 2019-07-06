local function deserialize_grid(grid, data)
	grid.clear()
	local names, energy, shield, xs, ys = data.names, data.energy, data.shield, data.xs, data.ys
	for i = 1, #names do
		local equipment = grid.put({
			name = names[i],
			position = {xs[i], ys[i]}
		})

		if equipment then
			if shield[i] > 0 then
				equipment.shield = shield[i]
			end
			if energy[i] > 0 then
				equipment.energy = energy[i]
			end
		end
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
		-- We got a crash on line 1 of this IF statement with AAI programmable vehicles's unit-remote-control item where label = {allow_manual_label_change = true}
		-- we attempt to fix this by checking slot.is_item_with_label, but we have no idea if this property is set properly. Label syncing might be broken.
        if label and slot.is_item_with_label then
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

-- functions for exporting a players data
--[[Misc functions for serializing stuff]]
local inventory_types = {}
do
    local map = {}
    for _, inventory_type in pairs(defines.inventory) do
        map[inventory_type] = true
    end
    for t in pairs(map) do
        inventory_types[#inventory_types + 1] = t
    end
    table.sort(inventory_types)
end
local function serialize_equipment_grid(grid)
	local names, energy, shield, xs, ys = {}, {}, {}, {}, {}

	local position = {0,0}
	local width, height = grid.width, grid.height
	local processed = {}
	for y = 0, height - 1 do
		for x = 0, width - 1 do
			local base = (y + 1) * width + x + 1
			if not processed[base] then
				position[1], position[2] = x, y
				local equipment = grid.get(position)
				if equipment ~= nil then
					local shape = equipment.shape
					for j = 0, shape.height - 1 do
						for i = 0, shape.width - 1 do
							processed[base + j * width + i] = true
						end
					end

					local idx = #names + 1
					names[idx] = equipment.name
					energy[idx] = equipment.energy
					shield[idx] = equipment.shield
					xs[idx] = x
					ys[idx] = y
				end
			end
		end
	end
	return {
		names = names,
		energy = energy,
		shield = shield,
		xs = xs,
		ys = ys,
	}
end
--[[ serialize an inventory ]]
local function serialize_inventory(inventory)
	local filters
	if inventory.supports_filters() then
		filters = {}
		for i = 1, #inventory do
			filters[i] = inventory.get_filter(i)
		end
	end
	local item_names, item_counts, item_durabilities,
	item_ammos, item_exports, item_labels, item_grids
	= {}, {}, {}, {}, {}, {}, {}

	for i = 1, #inventory do
		local slot = inventory[i]
		if slot.valid_for_read then
			if slot.is_item_with_inventory then
				print("sending items with inventory is not allowed")
			elseif slot.is_blueprint or slot.is_blueprint_book
					or slot.is_deconstruction_item or slot.is_item_with_tags then
				local success, export = pcall(slot.export_stack)
				if not success then
					print("failed to export item")
				else
					item_exports[i] = export
				end
			else
				item_names[i] = slot.name
				item_counts[i] = slot.count
				local durability = slot.durability
				if durability ~= nil then
					item_durabilities[i] = durability
				end
				if slot.type == "ammo" then
					item_ammos[i] = slot.ammo
				end
				if slot.is_item_with_label then
					item_labels[i] = {
						label = slot.label,
						label_color = slot.label_color,
						allow_manual_label_change = slot.allow_manual_label_change,
					}
				end

				local grid = slot.grid
				if grid then
					item_grids[i] = serialize_equipment_grid(grid)
				end
			end
		end
	end

	return {
		filters = filters,
		item_names = item_names,
		item_counts = item_counts,
		item_durabilities = item_durabilities,
		item_ammos = item_ammos,
		item_exports = item_exports,
		item_labels = item_labels,
		item_grids = item_grids,
	}
end

local function serialize_player(player)
	local seed = game.surfaces[1].map_gen_settings.seed
	local playerData = ""
	--[[ Collect info about the player for identification ]]
	playerData = playerData .. "|name:"..player.name.."~index:"..player.index.."~connected:"..tostring(player.connected)
	playerData = playerData .. "~r:"..tostring(player.color.r).."~g:"..tostring(player.color.g).."~b:"..tostring(player.color.b).."~a:"..tostring(player.color.a)
	playerData = playerData .. "~cr:"..tostring(player.chat_color.r).."~cg:"..tostring(player.chat_color.g).."~cb:"..tostring(player.chat_color.b).."~ca:"..tostring(player.chat_color.a)
	playerData = playerData .. "~tag:"..tostring(player.tag)
	--[[ Collect players system information ]]
	playerData = playerData .. "~displayWidth:"..player.display_resolution.width.."~displayHeight:"..player.display_resolution.height.."~displayScale:"..player.display_scale
	
	--[[ Collect game/tool specific information from player ]]
	playerData = playerData .. "~afkTime"..seed..":"..player.afk_time.."~onlineTime"..seed..":"..player.online_time.."~admin:"..tostring(player.admin).."~spectator:"..tostring(player.spectator)
	playerData = playerData .. "~forceName:"..player.force.name
	
	local inventories = {}
	for _, inventory_type in pairs(inventory_types) do
		local inventory = player.get_inventory(inventory_type)
		if inventory then
			inventories[inventory_type] = serialize_inventory(inventory)
		end
	end
	playerData = playerData .. "~inventory:"..serpent.line(inventories)
	
	return playerData
end

-- Register and handle events
script.on_event(defines.events.on_tick, function()
	if game.tick % 600 then
		-- Do stuff once a second
		
	end
end)

script.on_init(function()
	global.playersToImport = {}
	global.playersToExport = ""
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
	player.print("Registered you joining the game, preparing profile sync...")
end)

script.on_event(defines.events.on_player_left_game, function(event)
	local player = game.players[event.player_index]
	global.playersToExport = global.playersToExport .. serialize_player(player)
	game.print("Registered "..player.name.." leaving the game, preparing for upload...")
end)

remote.remove_interface("playerManager")
remote.add_interface("playerManager", {
	getImportTask = function()
		if #global.playersToImport >= 1 then
			local playerName = table.remove(global.playersToImport, 1)
			rcon.print(playerName)
			game.print("Downloading account for "..playerName.."...")
		end
	end,
	importInventory = function(playerName, invData, forceName, spectator, admin, color, chat_color, tag)
		local player = game.players[playerName]
		if player then
			player.ticks_to_respawn = nil
			local ok, invTable = serpent.load(invData)
			
			-- sync misc details
			player.force = forceName
			player.spectator = spectator
			player.admin = admin
			player.color = color
			player.chat_color = chat_color
			player.tag = tag
			
			-- Clear old inventories
			--player_quickbar no longer an inventory
			--player.get_inventory(defines.inventory.player_quickbar).clear()
			player.get_inventory(defines.inventory.character_guns).clear()
			player.get_inventory(defines.inventory.character_ammo).clear()
			-- pickaxe no longer exists
			--player.get_inventory(defines.inventory.player_tools).clear()
			player.get_inventory(defines.inventory.character_trash).clear()
			player.get_inventory(defines.inventory.character_main).clear()
			-- clear armor last to avoid inventory spilling
			player.get_inventory(defines.inventory.character_armor).clear()
			
			-- 2: wooden chest, iron chest. (quickbar)
			--player_quickbar no longer an inventory
			--deserialize_inventory(player.get_inventory(defines.inventory.player_quickbar), invTable[2])
			-- 3: pistol.
			deserialize_inventory(player.get_inventory(defines.inventory.character_guns), invTable[3])
			-- 4: Ammo.
			deserialize_inventory(player.get_inventory(defines.inventory.character_ammo), invTable[4])
			-- 5: armor.
			deserialize_inventory(player.get_inventory(defines.inventory.character_armor), invTable[5])
			-- 6: pickaxe.
			-- pickaxe no longer exists
			--deserialize_inventory(player.get_inventory(defines.inventory.player_tools), invTable[6])
			-- 7: nil.
			-- 8: express-transport-belt (trash slots)
			deserialize_inventory(player.get_inventory(defines.inventory.character_trash), invTable[8])
			-- 1: Main inventory (do that AFTER armor, otherwise there won't be space)
			deserialize_inventory(player.get_inventory(defines.inventory.character_main), invTable[1])
			
			player.print("Inventory synchronized.")
		else
			game.print("Player "..playerName.." left before they could get their inventory!")
		end
	end,
	resetInvImportQueue = function()
		global.playersToImport = {}
	end,
	exportPlayers = function()
		rcon.print(global.playersToExport)
		if global.playersToExport and string.len(global.playersToExport) > 10 then
			game.print("Exported player profiles")
		end
		global.playersToExport = ""
	end
})


