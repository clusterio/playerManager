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

local playerData = ""
for index, player in pairs(game.players) do
	--[[ Collect info about the player for identification ]]
	playerData = playerData .. "|name:"..player.name.."~index:"..index.."~connected:"..tostring(player.connected)
	playerData = playerData .. "~r:"..tostring(player.color.r).."~g:"..tostring(player.color.g).."~b:"..tostring(player.color.b).."~a:"..tostring(player.color.a)
	playerData = playerData .. "~cr:"..tostring(player.chat_color.r).."~cg:"..tostring(player.chat_color.g).."~cb:"..tostring(player.chat_color.b).."~ca:"..tostring(player.chat_color.a)
	
	--[[ Collect players system information ]]
	playerData = playerData .. "~displayWidth:"..player.display_resolution.width.."~displayHeight:"..player.display_resolution.height.."~displayScale:"..player.display_scale
	
	--[[ Collect game/tool specific information from player ]]
	playerData = playerData .. "~afkTime:"..player.afk_time.."~onlineTime:"..player.online_time.."~admin:"..tostring(player.admin).."~spectator:"..tostring(player.spectator)
	playerData = playerData .. "~forceName:"..player.force.name
	
	if not player.connected then
		local inventories = {}
		for _, inventory_type in pairs(inventory_types) do
			local inventory = player.get_inventory(inventory_type)
			if inventory then
				inventories[inventory_type] = serialize_inventory(inventory)
			end
		end
		playerData = playerData .. "~inventory:"..serpent.line(inventories)
	end
end
game.remove_offline_players()
rcon.print(playerData)
