-- The critical section for sending a message.
--
-- A first message between two users has to re-check eligibility at save time, and
-- create the conversation, sequence the message and record the dedupe key without
-- another writer slipping in between. Redis runs this script atomically, which is why
-- all of it lives here rather than in Python round trips.
--
-- This script never calls out to anything: no AI, no HTTP. It only reads and writes.
--
-- ARGV: sender, recipient, client_message_id, text, now_ms, window_ms,
--       new_message_id, new_conversation_id, created_at

local sender        = ARGV[1]
local recipient     = ARGV[2]
local cmid          = ARGV[3]
local text          = ARGV[4]
local now_ms        = tonumber(ARGV[5])
local window_ms     = tonumber(ARGV[6])
local new_message   = ARGV[7]
local new_conv      = ARGV[8]
local created_at    = ARGV[9]

local idem_key = 'idem:' .. sender .. ':' .. cmid
local stored = redis.call('GET', idem_key)
if stored then
  local message = cjson.decode(stored)
  -- The same key with different content is a conflict, never a silent overwrite.
  if message.recipient_id ~= recipient or message.text ~= text then
    return cjson.encode({ status = 'IDEMPOTENCY_CONFLICT' })
  end
  return cjson.encode({ status = 'REPLAYED', message = message })
end

if redis.call('EXISTS', 'user:' .. recipient) == 0 then
  return cjson.encode({ status = 'RECIPIENT_NOT_FOUND' })
end

local low, high = sender, recipient
if low > high then low, high = high, low end
local pair_key = 'pair:' .. low .. '|' .. high
local conversation = redis.call('GET', pair_key)
local created = false

if not conversation then
  -- No conversation yet, so this message is what would create the relationship.
  if redis.call('HGET', 'user:' .. sender, 'nickname') == false
     or redis.call('HGET', 'user:' .. recipient, 'nickname') == false then
    return cjson.encode({ status = 'PROFILE_REQUIRED' })
  end
  if redis.call('HGET', 'user:' .. sender, 'discovery_enabled') ~= '1'
     or redis.call('HGET', 'user:' .. recipient, 'discovery_enabled') ~= '1' then
    return cjson.encode({ status = 'DISCOVERY_DISABLED' })
  end
  local seen = redis.call('ZSCORE', 'obs:' .. sender, recipient)
  if not seen or (tonumber(seen) + window_ms) <= now_ms then
    return cjson.encode({ status = 'OBSERVATION_REQUIRED' })
  end
  conversation = new_conv
  redis.call('SET', pair_key, conversation)
  redis.call('HSET', 'conv:' .. conversation,
             'user_a', low, 'user_b', high, 'created_at', created_at)
  created = true
end

-- An existing conversation is not re-checked: distance, discovery state and
-- observation expiry do not apply once the relationship exists.
local seq = redis.call('INCR', 'conv:' .. conversation .. ':seq')
local message = {
  message_id = new_message,
  conversation_id = conversation,
  sender_id = sender,
  recipient_id = recipient,
  seq = seq,
  text = text,
  created_at = created_at,
}
local encoded = cjson.encode(message)
redis.call('RPUSH', 'conv:' .. conversation .. ':msgs', encoded)
redis.call('SET', idem_key, encoded)
redis.call('ZADD', 'user:' .. sender .. ':convs', now_ms, conversation)
redis.call('ZADD', 'user:' .. recipient .. ':convs', now_ms, conversation)

local status = 'APPENDED'
if created then status = 'CREATED' end
return cjson.encode({ status = status, message = message })
