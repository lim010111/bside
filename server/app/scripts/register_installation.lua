-- Atomically claim a request and create its user and credential mapping.
-- KEYS: permanent link, encrypted replay, user, credential hash
-- ARGV: platform, user_id, encrypted replay, created_at, replay ttl

local link = redis.call('GET', KEYS[1])
if link then
  local registration = cjson.decode(link)
  if registration.platform ~= ARGV[1] then return {'conflict'} end

  local replay = redis.call('GET', KEYS[2])
  if not replay or string.sub(replay, 1, 3) ~= 'v1:' then
    return {'expired'}
  end
  return {'replayed', registration.user_id, replay, registration.created_at}
end

local registration = cjson.encode({
  user_id = ARGV[2],
  platform = ARGV[1],
  created_at = ARGV[4]
})
redis.call('SET', KEYS[1], registration)
redis.call('SET', KEYS[2], ARGV[3], 'EX', tonumber(ARGV[5]))
redis.call('HSET', KEYS[3], 'discovery_enabled', '0', 'created_at', ARGV[4])
redis.call('SET', KEYS[4], ARGV[2])
return {'created', ARGV[2], ARGV[3], ARGV[4]}
