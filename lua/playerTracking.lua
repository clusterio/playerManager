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
	local names, xs, ys = {}, {}, {}

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
					xs[idx] = x
					ys[idx] = y
				end
			end
		end
	end
	return {
		names = names,
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
	end,
	setPlayerPermissionGroup = function(playerName, permissionGroupName)
		-- if player is admin, dont change group. This is to stop the whitelist
		-- from overwriting the admin list.
		local player = game.permissions.get_group("Admin").players[playerName]
		if not player then
			log('Adding '..playerName..' to group '..permissionGroupName)
			game.permissions.get_group(permissionGroupName).add_player(playerName)
			if permissionGroupName == "Admin" then
				game.players[playerName].admin = true
			end
		end
	end,
	-- Creates permission group definitions.
	createPermissionGroups = function()
		log('Loading Permission Group Default...')
		permission_group = game.permissions.get_group('Default')
		permission_group.set_allows_action(defines.input_action.activate_copy,true)
		permission_group.set_allows_action(defines.input_action.activate_cut,false)
		permission_group.set_allows_action(defines.input_action.activate_paste,true)
		permission_group.set_allows_action(defines.input_action.add_permission_group,false)
		permission_group.set_allows_action(defines.input_action.add_train_station,false)
		permission_group.set_allows_action(defines.input_action.admin_action,false)
		permission_group.set_allows_action(defines.input_action.alt_select_area,false)
		permission_group.set_allows_action(defines.input_action.alt_select_blueprint_entities,false)
		permission_group.set_allows_action(defines.input_action.alternative_copy,false)
		permission_group.set_allows_action(defines.input_action.begin_mining,true)
		permission_group.set_allows_action(defines.input_action.begin_mining_terrain,true)
		permission_group.set_allows_action(defines.input_action.build_item,true)
		permission_group.set_allows_action(defines.input_action.build_rail,true)
		permission_group.set_allows_action(defines.input_action.build_terrain,false)
		permission_group.set_allows_action(defines.input_action.cancel_craft,true)
		permission_group.set_allows_action(defines.input_action.cancel_deconstruct,true)
		permission_group.set_allows_action(defines.input_action.cancel_new_blueprint,true)
		permission_group.set_allows_action(defines.input_action.cancel_research,false)
		permission_group.set_allows_action(defines.input_action.cancel_upgrade,true)
		permission_group.set_allows_action(defines.input_action.change_active_item_group_for_crafting,true)
		permission_group.set_allows_action(defines.input_action.change_active_item_group_for_filters,true)
		permission_group.set_allows_action(defines.input_action.change_active_quick_bar,true)
		permission_group.set_allows_action(defines.input_action.change_arithmetic_combinator_parameters,false)
		permission_group.set_allows_action(defines.input_action.change_blueprint_book_record_label,false)
		permission_group.set_allows_action(defines.input_action.change_decider_combinator_parameters,false)
		permission_group.set_allows_action(defines.input_action.change_item_label,false)
		permission_group.set_allows_action(defines.input_action.change_multiplayer_config,false)
		permission_group.set_allows_action(defines.input_action.change_picking_state,true)
		permission_group.set_allows_action(defines.input_action.change_programmable_speaker_alert_parameters,false)
		permission_group.set_allows_action(defines.input_action.change_programmable_speaker_circuit_parameters,false)
		permission_group.set_allows_action(defines.input_action.change_programmable_speaker_parameters,false)
		permission_group.set_allows_action(defines.input_action.change_riding_state,true)
		permission_group.set_allows_action(defines.input_action.change_shooting_state,true)
		permission_group.set_allows_action(defines.input_action.change_single_blueprint_record_label,false)
		permission_group.set_allows_action(defines.input_action.change_train_stop_station,false)
		permission_group.set_allows_action(defines.input_action.change_train_wait_condition,false)
		permission_group.set_allows_action(defines.input_action.change_train_wait_condition_data,false)
		permission_group.set_allows_action(defines.input_action.clean_cursor_stack,true)
		permission_group.set_allows_action(defines.input_action.clear_selected_blueprint,false)
		permission_group.set_allows_action(defines.input_action.clear_selected_deconstruction_item,false)
		permission_group.set_allows_action(defines.input_action.clear_selected_upgrade_item,false)
		permission_group.set_allows_action(defines.input_action.connect_rolling_stock,false)
		permission_group.set_allows_action(defines.input_action.copy,true)
		permission_group.set_allows_action(defines.input_action.copy_entity_settings,true)
		permission_group.set_allows_action(defines.input_action.craft,true)
		permission_group.set_allows_action(defines.input_action.create_blueprint_like,false)
		permission_group.set_allows_action(defines.input_action.cursor_split,true)
		permission_group.set_allows_action(defines.input_action.cursor_transfer,true)
		permission_group.set_allows_action(defines.input_action.custom_input,false)
		permission_group.set_allows_action(defines.input_action.cycle_blueprint_book_backwards,false)
		permission_group.set_allows_action(defines.input_action.cycle_blueprint_book_forwards,false)
		permission_group.set_allows_action(defines.input_action.deconstruct,false)
		permission_group.set_allows_action(defines.input_action.delete_blueprint_library,false)
		permission_group.set_allows_action(defines.input_action.delete_blueprint_record,false)
		permission_group.set_allows_action(defines.input_action.delete_custom_tag,false)
		permission_group.set_allows_action(defines.input_action.delete_permission_group,false)
		permission_group.set_allows_action(defines.input_action.destroy_opened_item,false)
		permission_group.set_allows_action(defines.input_action.disconnect_rolling_stock,false)
		permission_group.set_allows_action(defines.input_action.drag_train_schedule,false)
		permission_group.set_allows_action(defines.input_action.drag_train_wait_condition,false)
		permission_group.set_allows_action(defines.input_action.drop_blueprint_record,false)
		permission_group.set_allows_action(defines.input_action.drop_item,false)
		permission_group.set_allows_action(defines.input_action.drop_to_blueprint_book,false)
		permission_group.set_allows_action(defines.input_action.edit_custom_tag,false)
		permission_group.set_allows_action(defines.input_action.edit_permission_group,false)
		permission_group.set_allows_action(defines.input_action.export_blueprint,false)
		permission_group.set_allows_action(defines.input_action.fast_entity_split,true)
		permission_group.set_allows_action(defines.input_action.fast_entity_transfer,true)
		permission_group.set_allows_action(defines.input_action.go_to_train_station,true)
		permission_group.set_allows_action(defines.input_action.grab_blueprint_record,false)
		permission_group.set_allows_action(defines.input_action.gui_checked_state_changed,true)
		permission_group.set_allows_action(defines.input_action.gui_click,true)
		permission_group.set_allows_action(defines.input_action.gui_elem_changed,true)
		permission_group.set_allows_action(defines.input_action.gui_selection_state_changed,true)
		permission_group.set_allows_action(defines.input_action.gui_text_changed,true)
		permission_group.set_allows_action(defines.input_action.gui_value_changed,true)
		permission_group.set_allows_action(defines.input_action.import_blueprint,false)
		permission_group.set_allows_action(defines.input_action.import_blueprint_string,false)
		permission_group.set_allows_action(defines.input_action.import_permissions_string,false)
		permission_group.set_allows_action(defines.input_action.inventory_split,true)
		permission_group.set_allows_action(defines.input_action.inventory_transfer,true)
		permission_group.set_allows_action(defines.input_action.launch_rocket,false)
		permission_group.set_allows_action(defines.input_action.lua_shortcut,false)
		permission_group.set_allows_action(defines.input_action.map_editor_action,false)
		permission_group.set_allows_action(defines.input_action.market_offer,false)
		permission_group.set_allows_action(defines.input_action.mod_settings_changed,false)
		permission_group.set_allows_action(defines.input_action.open_achievements_gui,true)
		permission_group.set_allows_action(defines.input_action.open_blueprint_library_gui,false)
		permission_group.set_allows_action(defines.input_action.open_blueprint_record,false)
		permission_group.set_allows_action(defines.input_action.open_bonus_gui,false)
		permission_group.set_allows_action(defines.input_action.open_character_gui,true)
		permission_group.set_allows_action(defines.input_action.open_equipment,true)
		permission_group.set_allows_action(defines.input_action.open_gui,true)
		permission_group.set_allows_action(defines.input_action.open_item,true)
		permission_group.set_allows_action(defines.input_action.open_kills_gui,true)
		permission_group.set_allows_action(defines.input_action.open_logistic_gui,true)
		permission_group.set_allows_action(defines.input_action.open_mod_item,true)
		permission_group.set_allows_action(defines.input_action.open_production_gui,true)
		permission_group.set_allows_action(defines.input_action.open_technology_gui,true)
		permission_group.set_allows_action(defines.input_action.open_train_gui,true)
		permission_group.set_allows_action(defines.input_action.open_train_station_gui,true)
		permission_group.set_allows_action(defines.input_action.open_trains_gui,true)
		permission_group.set_allows_action(defines.input_action.open_tutorials_gui,false)
		permission_group.set_allows_action(defines.input_action.paste_entity_settings,false)
		permission_group.set_allows_action(defines.input_action.place_equipment,true)
		permission_group.set_allows_action(defines.input_action.quick_bar_pick_slot,true)
		permission_group.set_allows_action(defines.input_action.quick_bar_set_selected_page,true)
		permission_group.set_allows_action(defines.input_action.quick_bar_set_slot,true)
		permission_group.set_allows_action(defines.input_action.remove_cables,false)
		permission_group.set_allows_action(defines.input_action.remove_train_station,false)
		permission_group.set_allows_action(defines.input_action.reset_assembling_machine,false)
		permission_group.set_allows_action(defines.input_action.rotate_entity,true)
		permission_group.set_allows_action(defines.input_action.select_area,true)
		permission_group.set_allows_action(defines.input_action.select_blueprint_entities,false)
		permission_group.set_allows_action(defines.input_action.select_entity_slot,true)
		permission_group.set_allows_action(defines.input_action.select_item,true)
		permission_group.set_allows_action(defines.input_action.select_mapper_slot,true)
		permission_group.set_allows_action(defines.input_action.select_next_valid_gun,true)
		permission_group.set_allows_action(defines.input_action.select_tile_slot,true)
		permission_group.set_allows_action(defines.input_action.set_auto_launch_rocket,false)
		permission_group.set_allows_action(defines.input_action.set_autosort_inventory,false)
		permission_group.set_allows_action(defines.input_action.set_behavior_mode,false)
		permission_group.set_allows_action(defines.input_action.set_car_weapons_control,true)
		permission_group.set_allows_action(defines.input_action.set_circuit_condition,false)
		permission_group.set_allows_action(defines.input_action.set_circuit_mode_of_operation,false)
		permission_group.set_allows_action(defines.input_action.set_deconstruction_item_tile_selection_mode,false)
		permission_group.set_allows_action(defines.input_action.set_deconstruction_item_trees_and_rocks_only,false)
		permission_group.set_allows_action(defines.input_action.set_entity_color,true)
		permission_group.set_allows_action(defines.input_action.set_entity_energy_property,false)
		permission_group.set_allows_action(defines.input_action.set_filter,true)
		permission_group.set_allows_action(defines.input_action.set_heat_interface_mode,false)
		permission_group.set_allows_action(defines.input_action.set_heat_interface_temperature,false)
		permission_group.set_allows_action(defines.input_action.set_infinity_container_filter_item,false)
		permission_group.set_allows_action(defines.input_action.set_infinity_container_remove_unfiltered_items,false)
		permission_group.set_allows_action(defines.input_action.set_infinity_pipe_filter,false)
		permission_group.set_allows_action(defines.input_action.set_inserter_max_stack_size,false)
		permission_group.set_allows_action(defines.input_action.set_inventory_bar,true)
		permission_group.set_allows_action(defines.input_action.set_logistic_filter_item,true)
		permission_group.set_allows_action(defines.input_action.set_logistic_filter_signal,true)
		permission_group.set_allows_action(defines.input_action.set_logistic_trash_filter_item,true)
		permission_group.set_allows_action(defines.input_action.set_request_from_buffers,true)
		permission_group.set_allows_action(defines.input_action.set_research_finished_stops_game,false)
		permission_group.set_allows_action(defines.input_action.set_signal,true)
		permission_group.set_allows_action(defines.input_action.set_single_blueprint_record_icon,false)
		permission_group.set_allows_action(defines.input_action.set_splitter_priority,true)
		permission_group.set_allows_action(defines.input_action.set_train_stopped,false)
		permission_group.set_allows_action(defines.input_action.setup_assembling_machine,true)
		permission_group.set_allows_action(defines.input_action.setup_blueprint,false)
		permission_group.set_allows_action(defines.input_action.setup_single_blueprint_record,false)
		permission_group.set_allows_action(defines.input_action.smart_pipette,true)
		permission_group.set_allows_action(defines.input_action.stack_split,true)
		permission_group.set_allows_action(defines.input_action.stack_transfer,true)
		permission_group.set_allows_action(defines.input_action.start_repair,true)
		permission_group.set_allows_action(defines.input_action.start_research,false)
		permission_group.set_allows_action(defines.input_action.start_walking,true)
		permission_group.set_allows_action(defines.input_action.stop_building_by_moving,true)
		permission_group.set_allows_action(defines.input_action.switch_connect_to_logistic_network,false)
		permission_group.set_allows_action(defines.input_action.switch_constant_combinator_state,false)
		permission_group.set_allows_action(defines.input_action.switch_inserter_filter_mode_state,false)
		permission_group.set_allows_action(defines.input_action.switch_power_switch_state,false)
		permission_group.set_allows_action(defines.input_action.switch_to_rename_stop_gui,false)
		permission_group.set_allows_action(defines.input_action.take_equipment,true)
		permission_group.set_allows_action(defines.input_action.toggle_deconstruction_item_entity_filter_mode,false)
		permission_group.set_allows_action(defines.input_action.toggle_deconstruction_item_tile_filter_mode,false)
		permission_group.set_allows_action(defines.input_action.toggle_driving,true)
		permission_group.set_allows_action(defines.input_action.toggle_enable_vehicle_logistics_while_moving,true)
		permission_group.set_allows_action(defines.input_action.toggle_equipment_movement_bonus,true)
		permission_group.set_allows_action(defines.input_action.toggle_map_editor,false)
		permission_group.set_allows_action(defines.input_action.toggle_personal_roboport,true)
		permission_group.set_allows_action(defines.input_action.toggle_show_entity_info,true)
		permission_group.set_allows_action(defines.input_action.undo,true)
		permission_group.set_allows_action(defines.input_action.upgrade,false)
		permission_group.set_allows_action(defines.input_action.upgrade_opened_blueprint,false)
		permission_group.set_allows_action(defines.input_action.use_artillery_remote,false)
		permission_group.set_allows_action(defines.input_action.use_item,true)
		permission_group.set_allows_action(defines.input_action.wire_dragging,true)
		permission_group.set_allows_action(defines.input_action.write_to_console,true)
	
	
	
	
	
	
		log('Loading Permission Group Admin...')
		permissions_group = game.permissions.get_group('Admin') 
		if not permissions_group then 
			permission_group = game.permissions.create_group('Admin')
		end
	
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.activate_copy,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.activate_cut,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.activate_paste,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.add_permission_group,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.add_train_station,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.admin_action,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.alt_select_area,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.alt_select_blueprint_entities,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.alternative_copy,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.begin_mining,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.begin_mining_terrain,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.build_item,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.build_rail,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.build_terrain,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.cancel_craft,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.cancel_deconstruct,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.cancel_new_blueprint,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.cancel_research,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.cancel_upgrade,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.change_active_item_group_for_crafting,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.change_active_item_group_for_filters,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.change_active_quick_bar,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.change_arithmetic_combinator_parameters,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.change_blueprint_book_record_label,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.change_decider_combinator_parameters,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.change_item_label,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.change_multiplayer_config,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.change_picking_state,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.change_programmable_speaker_alert_parameters,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.change_programmable_speaker_circuit_parameters,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.change_programmable_speaker_parameters,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.change_riding_state,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.change_shooting_state,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.change_single_blueprint_record_label,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.change_train_stop_station,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.change_train_wait_condition,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.change_train_wait_condition_data,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.clean_cursor_stack,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.clear_selected_blueprint,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.clear_selected_deconstruction_item,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.clear_selected_upgrade_item,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.connect_rolling_stock,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.copy,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.copy_entity_settings,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.craft,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.create_blueprint_like,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.cursor_split,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.cursor_transfer,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.custom_input,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.cycle_blueprint_book_backwards,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.cycle_blueprint_book_forwards,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.deconstruct,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.delete_blueprint_library,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.delete_blueprint_record,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.delete_custom_tag,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.delete_permission_group,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.destroy_opened_item,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.disconnect_rolling_stock,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.drag_train_schedule,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.drag_train_wait_condition,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.drop_blueprint_record,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.drop_item,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.drop_to_blueprint_book,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.edit_custom_tag,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.edit_permission_group,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.export_blueprint,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.fast_entity_split,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.fast_entity_transfer,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.go_to_train_station,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.grab_blueprint_record,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.gui_checked_state_changed,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.gui_click,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.gui_elem_changed,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.gui_selection_state_changed,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.gui_text_changed,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.gui_value_changed,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.import_blueprint,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.import_blueprint_string,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.import_permissions_string,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.inventory_split,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.inventory_transfer,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.launch_rocket,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.lua_shortcut,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.map_editor_action,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.market_offer,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.mod_settings_changed,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.open_achievements_gui,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.open_blueprint_library_gui,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.open_blueprint_record,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.open_bonus_gui,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.open_character_gui,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.open_equipment,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.open_gui,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.open_item,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.open_kills_gui,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.open_logistic_gui,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.open_mod_item,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.open_production_gui,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.open_technology_gui,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.open_train_gui,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.open_train_station_gui,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.open_trains_gui,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.open_tutorials_gui,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.paste_entity_settings,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.place_equipment,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.quick_bar_pick_slot,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.quick_bar_set_selected_page,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.quick_bar_set_slot,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.remove_cables,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.remove_train_station,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.reset_assembling_machine,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.rotate_entity,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.select_area,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.select_blueprint_entities,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.select_entity_slot,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.select_item,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.select_mapper_slot,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.select_next_valid_gun,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.select_tile_slot,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.set_auto_launch_rocket,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.set_autosort_inventory,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.set_behavior_mode,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.set_car_weapons_control,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.set_circuit_condition,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.set_circuit_mode_of_operation,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.set_deconstruction_item_tile_selection_mode,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.set_deconstruction_item_trees_and_rocks_only,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.set_entity_color,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.set_entity_energy_property,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.set_filter,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.set_heat_interface_mode,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.set_heat_interface_temperature,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.set_infinity_container_filter_item,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.set_infinity_container_remove_unfiltered_items,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.set_infinity_pipe_filter,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.set_inserter_max_stack_size,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.set_inventory_bar,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.set_logistic_filter_item,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.set_logistic_filter_signal,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.set_logistic_trash_filter_item,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.set_request_from_buffers,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.set_research_finished_stops_game,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.set_signal,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.set_single_blueprint_record_icon,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.set_splitter_priority,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.set_train_stopped,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.setup_assembling_machine,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.setup_blueprint,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.setup_single_blueprint_record,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.smart_pipette,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.stack_split,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.stack_transfer,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.start_repair,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.start_research,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.start_walking,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.stop_building_by_moving,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.switch_connect_to_logistic_network,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.switch_constant_combinator_state,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.switch_inserter_filter_mode_state,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.switch_power_switch_state,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.switch_to_rename_stop_gui,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.take_equipment,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.toggle_deconstruction_item_entity_filter_mode,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.toggle_deconstruction_item_tile_filter_mode,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.toggle_driving,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.toggle_enable_vehicle_logistics_while_moving,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.toggle_equipment_movement_bonus,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.toggle_map_editor,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.toggle_personal_roboport,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.toggle_show_entity_info,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.undo,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.upgrade,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.upgrade_opened_blueprint,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.use_artillery_remote,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.use_item,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.wire_dragging,true)
		game.permissions.get_group('Admin').set_allows_action(defines.input_action.write_to_console,true)
	
	
	
	
		log('Loading Permission Group Standard...')
		permissions_group = game.permissions.get_group('Standard') 
		if not permissions_group then 
			permission_group = game.permissions.create_group('Standard') 
		end
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.activate_copy,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.activate_cut,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.activate_paste,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.add_permission_group,false)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.add_train_station,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.admin_action,false)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.alt_select_area,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.alt_select_blueprint_entities,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.alternative_copy,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.begin_mining,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.begin_mining_terrain,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.build_item,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.build_rail,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.build_terrain,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.cancel_craft,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.cancel_deconstruct,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.cancel_new_blueprint,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.cancel_research,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.cancel_upgrade,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.change_active_item_group_for_crafting,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.change_active_item_group_for_filters,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.change_active_quick_bar,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.change_arithmetic_combinator_parameters,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.change_blueprint_book_record_label,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.change_decider_combinator_parameters,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.change_item_label,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.change_multiplayer_config,false)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.change_picking_state,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.change_programmable_speaker_alert_parameters,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.change_programmable_speaker_circuit_parameters,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.change_programmable_speaker_parameters,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.change_riding_state,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.change_shooting_state,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.change_single_blueprint_record_label,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.change_train_stop_station,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.change_train_wait_condition,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.change_train_wait_condition_data,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.clean_cursor_stack,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.clear_selected_blueprint,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.clear_selected_deconstruction_item,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.clear_selected_upgrade_item,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.connect_rolling_stock,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.copy,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.copy_entity_settings,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.craft,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.create_blueprint_like,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.cursor_split,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.cursor_transfer,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.custom_input,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.cycle_blueprint_book_backwards,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.cycle_blueprint_book_forwards,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.deconstruct,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.delete_blueprint_library,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.delete_blueprint_record,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.delete_custom_tag,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.delete_permission_group,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.destroy_opened_item,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.disconnect_rolling_stock,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.drag_train_schedule,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.drag_train_wait_condition,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.drop_blueprint_record,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.drop_item,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.drop_to_blueprint_book,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.edit_custom_tag,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.edit_permission_group,false)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.export_blueprint,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.fast_entity_split,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.fast_entity_transfer,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.go_to_train_station,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.grab_blueprint_record,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.gui_checked_state_changed,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.gui_click,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.gui_elem_changed,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.gui_selection_state_changed,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.gui_text_changed,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.gui_value_changed,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.import_blueprint,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.import_blueprint_string,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.import_permissions_string,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.inventory_split,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.inventory_transfer,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.launch_rocket,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.lua_shortcut,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.map_editor_action,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.market_offer,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.mod_settings_changed,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.open_achievements_gui,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.open_blueprint_library_gui,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.open_blueprint_record,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.open_bonus_gui,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.open_character_gui,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.open_equipment,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.open_gui,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.open_item,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.open_kills_gui,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.open_logistic_gui,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.open_mod_item,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.open_production_gui,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.open_technology_gui,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.open_train_gui,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.open_train_station_gui,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.open_trains_gui,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.open_tutorials_gui,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.paste_entity_settings,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.place_equipment,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.quick_bar_pick_slot,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.quick_bar_set_selected_page,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.quick_bar_set_slot,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.remove_cables,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.remove_train_station,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.reset_assembling_machine,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.rotate_entity,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.select_area,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.select_blueprint_entities,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.select_entity_slot,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.select_item,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.select_mapper_slot,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.select_next_valid_gun,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.select_tile_slot,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.set_auto_launch_rocket,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.set_autosort_inventory,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.set_behavior_mode,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.set_car_weapons_control,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.set_circuit_condition,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.set_circuit_mode_of_operation,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.set_deconstruction_item_tile_selection_mode,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.set_deconstruction_item_trees_and_rocks_only,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.set_entity_color,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.set_entity_energy_property,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.set_filter,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.set_heat_interface_mode,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.set_heat_interface_temperature,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.set_infinity_container_filter_item,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.set_infinity_container_remove_unfiltered_items,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.set_infinity_pipe_filter,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.set_inserter_max_stack_size,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.set_inventory_bar,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.set_logistic_filter_item,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.set_logistic_filter_signal,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.set_logistic_trash_filter_item,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.set_request_from_buffers,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.set_research_finished_stops_game,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.set_signal,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.set_single_blueprint_record_icon,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.set_splitter_priority,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.set_train_stopped,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.setup_assembling_machine,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.setup_blueprint,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.setup_single_blueprint_record,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.smart_pipette,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.stack_split,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.stack_transfer,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.start_repair,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.start_research,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.start_walking,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.stop_building_by_moving,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.switch_connect_to_logistic_network,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.switch_constant_combinator_state,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.switch_inserter_filter_mode_state,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.switch_power_switch_state,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.switch_to_rename_stop_gui,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.take_equipment,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.toggle_deconstruction_item_entity_filter_mode,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.toggle_deconstruction_item_tile_filter_mode,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.toggle_driving,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.toggle_enable_vehicle_logistics_while_moving,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.toggle_equipment_movement_bonus,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.toggle_map_editor,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.toggle_personal_roboport,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.toggle_show_entity_info,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.undo,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.upgrade,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.upgrade_opened_blueprint,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.use_artillery_remote,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.use_item,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.wire_dragging,true)
		game.permissions.get_group('Standard').set_allows_action(defines.input_action.write_to_console,true)
	end
})