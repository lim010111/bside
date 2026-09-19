-- Give one FCM registration token to one user, taking it from whoever held it.
--
-- A token identifies a device install, not a person. The same device can end up
-- registering under a different user: a reinstall, a cleared app, or someone
-- else picking up the phone. If the token stayed in the previous owner's set,
-- that user's private messages would be pushed to a device that is now somebody
-- else's. Read-compare-write in Python would leave a window where both sets
-- contain it, so the handover happens here in one step.
--
-- ARGV: user_id, token, platform, now_ms
-- Returns 1 when the token moved to a different user, 0 when it was already theirs.

local user_id = ARGV[1]
local token = ARGV[2]
local platform = ARGV[3]
local now = ARGV[4]

local owner_key = 'push:owner:' .. token
local previous = redis.call('GET', owner_key)

if previous == user_id then
  -- Same owner: refresh the liveness stamp and nothing else.
  redis.call('HSET', 'push:token:' .. token, 'seen_at', now)
  return 0
end

if previous then
  redis.call('SREM', 'push:tokens:' .. previous, token)
end

redis.call('SET', owner_key, user_id)
redis.call('SADD', 'push:tokens:' .. user_id, token)
redis.call('HSET', 'push:token:' .. token,
  'platform', platform,
  'user_id', user_id,
  'seen_at', now)
return 1
