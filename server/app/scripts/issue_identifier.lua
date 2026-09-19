-- Validate state, reuse the current identifier, or rotate it atomically.
-- KEYS: user, current record, new identifier mapping
-- ARGV: user_id, new identifier, now_ms, refresh window ms, ttl ms

local nickname = redis.call('HGET', KEYS[1], 'nickname')
local description = redis.call('HGET', KEYS[1], 'self_description')
local intent = redis.call('HGET', KEYS[1], 'connection_intent')
if not nickname or nickname == ''
   or not description or description == ''
   or not intent or intent == '' then
  return {'PROFILE_REQUIRED'}
end
if redis.call('HGET', KEYS[1], 'discovery_enabled') ~= '1' then
  return {'DISCOVERY_DISABLED'}
end

local current = redis.call('GET', KEYS[2])
if current then
  local record = cjson.decode(current)
  if tonumber(ARGV[3]) < tonumber(record.refresh_after_ms) then
    return {'ok', current}
  end
end

local record = cjson.encode({
  identifier = ARGV[2],
  issued_at_ms = tonumber(ARGV[3]),
  refresh_after_ms = tonumber(ARGV[3]) + tonumber(ARGV[4]),
  expires_at_ms = tonumber(ARGV[3]) + tonumber(ARGV[5])
})
redis.call('SET', KEYS[3], ARGV[1], 'PX', tonumber(ARGV[5]))
redis.call('SET', KEYS[2], record, 'PX', tonumber(ARGV[5]))
return {'ok', record}
