-- The tokens worth sending to for one user, dropping the ones that went quiet.
--
-- Reading is where stale members are cleared, so no sweep job is needed: the
-- only time a user's token list matters is when something is being sent to
-- them, and that is exactly when it is worth being right.
--
-- A key still in the old set shape has no scores to judge by, so its members
-- are returned untouched; the next registration converts and stamps them.
--
-- ARGV: user_id, cutoff_ms

local key = 'push:tokens:' .. ARGV[1]
local shape = redis.call('TYPE', key).ok

if shape == 'none' then
  return {}
end
if shape == 'set' then
  return redis.call('SMEMBERS', key)
end

redis.call('ZREMRANGEBYSCORE', key, '-inf', '(' .. ARGV[2])
return redis.call('ZRANGE', key, 0, -1)
