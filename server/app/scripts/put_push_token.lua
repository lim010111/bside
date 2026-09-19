-- Give one FCM registration token to one user, taking it from whoever held it.
--
-- A token identifies a device install, not a person. The same device can end up
-- registering under a different user: a reinstall, a cleared app, or someone
-- else picking up the phone. If the token stayed in the previous owner's set,
-- that user's private messages would be pushed to a device that is now somebody
-- else's. Read-compare-write in Python would leave a window where both sets
-- contain it, so the handover happens here in one step.
--
-- Registering is also the liveness signal. The app re-registers on every launch,
-- so a token's score is when its device last said it still exists, and the
-- whole set carries a TTL refreshed on each write. A device that stops checking
-- in expires instead of being pushed to for ever. Without that, the only way a
-- token is ever removed is FCM answering UNREGISTERED to a send, which never
-- happens for a user nobody messages again.
--
-- ARGV: user_id, token, platform, now_ms, ttl_seconds
-- Returns 1 when the token moved to a different user, 0 when it was already theirs.

local user_id = ARGV[1]
local token = ARGV[2]
local platform = ARGV[3]
local now = ARGV[4]
local ttl = tonumber(ARGV[5])

local owner_key = 'push:owner:' .. token
local token_key = 'push:token:' .. token
local previous = redis.call('GET', owner_key)

-- The key was a plain set before tokens carried a last-seen score, and ZADD on
-- a set is a WRONGTYPE error. Convert in place, stamping the existing members
-- as seen now: they were registered by a device we have no newer word about.
local function devices(uid)
  local key = 'push:tokens:' .. uid
  if redis.call('TYPE', key).ok == 'set' then
    local members = redis.call('SMEMBERS', key)
    redis.call('DEL', key)
    for _, member in ipairs(members) do
      redis.call('ZADD', key, now, member)
    end
  end
  return key
end

if previous and previous ~= user_id then
  redis.call('ZREM', devices(previous), token)
end

local key = devices(user_id)
redis.call('ZADD', key, now, token)
redis.call('EXPIRE', key, ttl)
redis.call('SET', owner_key, user_id, 'EX', ttl)
redis.call('HSET', token_key, 'platform', platform, 'user_id', user_id, 'seen_at', now)
redis.call('EXPIRE', token_key, ttl)

if previous == user_id then
  return 0
end
return 1
