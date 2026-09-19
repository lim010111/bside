-- Store the complete public profile and bump the internal revision only when
-- the text actually changed.
--
-- The revision is what the AI cache is keyed on. Bumping it on an identical
-- resubmit would throw away every evaluation for this user and pay for them
-- again; not bumping it on a real edit would serve a reason that quotes text
-- the user has replaced. Read-compare-write in Python would let two concurrent
-- saves both see the old value and assign the same revision to different text,
-- so the comparison and the bump happen together here.
--
-- ARGV: user_id, nickname, self_description, connection_intent

local key = 'user:' .. ARGV[1]
local nickname = ARGV[2]
local self_description = ARGV[3]
local connection_intent = ARGV[4]

local current = redis.call('HMGET', key,
  'nickname', 'self_description', 'connection_intent', 'profile_revision')

local unchanged = current[1] == nickname
  and current[2] == self_description
  and current[3] == connection_intent
  and current[4]

if unchanged then
  return current[4]
end

-- The nickname is part of the public profile but not of an evaluation's input,
-- so a nickname-only edit still bumps: one revision number covers the whole
-- profile and a spurious bump only costs a re-evaluation.
local revision = tonumber(current[4] or '0') + 1
redis.call('HSET', key,
  'nickname', nickname,
  'self_description', self_description,
  'connection_intent', connection_intent,
  'profile_revision', tostring(revision))
return tostring(revision)
