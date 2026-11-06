export const luaExample = String.raw`-- Requires LuaSocket, LuaSec, and dkjson.
-- This uses a normal Lua HTTPS library, not game executor request hooks.
local https = require("ssl.https")
local ltn12 = require("ltn12")
local json = require("dkjson")

local API_BASE = "https://your-app-host/api"
local CLIENT_VERSION = "1.0.0"
local ENVIRONMENT = "lua-socket"

local function readText(path)
  local file = io.open(path, "r")
  if not file then return nil end
  local value = file:read("*a")
  file:close()
  return value
end

local function writeText(path, value)
  local file, err = io.open(path, "w")
  if not file then return false, err end
  file:write(value)
  file:close()
  return true
end

local function getInstallId()
  local existing = readText("license-device-id.txt")
  if existing and #existing >= 8 then return existing end

  math.randomseed(os.time())
  local parts = {}
  for i = 1, 32 do parts[i] = string.format("%x", math.random(0, 15)) end
  local installId = table.concat(parts)
  local saved = writeText("license-device-id.txt", installId)
  if not saved then error("Could not save the installation ID") end
  return installId
end

local function postJson(path, payload)
  local requestBody = json.encode(payload)
  local responseBody = {}
  local _, status = https.request({
    url = API_BASE .. path,
    method = "POST",
    headers = {
      ["Content-Type"] = "application/json",
      ["Content-Length"] = tostring(#requestBody),
    },
    source = ltn12.source.string(requestBody),
    sink = ltn12.sink.table(responseBody),
    verify = "peer",
    options = "all",
  })
  return tonumber(status), table.concat(responseBody)
end

local key = readText("key.txt")
if not key or key:gsub("%s+", "") == "" then
  io.write("Enter your license key: ")
  key = io.read("*l")
end
if not key or key == "" then error("A license key is required") end

local status, responseBody = postJson("/key/verify", {
  key = key,
  installId = getInstallId(),
  clientVersion = CLIENT_VERSION,
  environment = ENVIRONMENT,
})
if status ~= 200 then error("License service request failed") end

local verdict, _, decodeError = json.decode(responseBody, 1, nil)
if not verdict then error("Could not read license response: " .. tostring(decodeError)) end
if verdict.success ~= true then
  error("License rejected: " .. tostring(verdict.code))
end

-- Store the key only after a successful server response.
writeText("key.txt", key)

local function runLicensedFeature()
  -- Place authorized application logic here.
end

runLicensedFeature()`;
