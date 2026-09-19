// Wire contract: docs/api-contract.md (API v0.1) and docs/openapi.yaml.
// Both adapters expose these same shapes. Field names and paths follow that spec.
/**
 * @typedef {{nickname:string, self_description:string, connection_intent:string}} PublicProfile
 * @typedef {{user_id:string, profile:PublicProfile|null, discovery_enabled:boolean}} Me
 * @typedef {{status:'unavailable'}} Recommendation  // v0.1 always 'unavailable'
 * @typedef {{user_id:string, profile:PublicProfile, recommendation:Recommendation,
 * last_seen_at:string, conversation_eligibility_expires_at:string}} ObservedUser
 * @typedef {{message_id:string, conversation_id:string, sender_id:string, recipient_id:string,
 * seq:number, text:string, created_at:string}} Message
 * @typedef {{conversation_id:string, participant:{user_id:string, profile:PublicProfile},
 * last_message:Message}} ConversationSummary
 * @typedef {{messages:Message[], next_after_seq:number|null, has_more:boolean}} MessagePage
 * @typedef {{identifier:string, issued_at:string, refresh_after:string, expires_at:string}} DiscoveryIdentifier
 *
 * Shared API — base path /api/v1, Bearer installation_credential on every call but
 * registerInstallation:
 * registerInstallation({installation_request_id,platform}, options?) -> {user_id,installation_credential,created_at}
 * getMe(options?) -> Me
 * putProfile(PublicProfile, options?) -> PublicProfile      // full replace, no partial edit
 * setDiscovery({enabled}, options?) -> {discovery_enabled}
 * issueIdentifier(options?) -> DiscoveryIdentifier          // native BLE layer only
 * reportObservations({identifiers}, options?) -> {observed_users:ObservedUser[]}
 * getConversations(options?) -> {conversations:ConversationSummary[]}
 * sendMessage({recipient_id,client_message_id,text}, options?) -> Message
 * getMessages(conversationId, {after_seq?,limit?}, options?) -> MessagePage
 * options.signal cancels HTTP requests; the controller also ignores obsolete results.
 *
 * What v0.1 deliberately does NOT have, and what that costs this frontend:
 * - No GET /discovery/nearby. The nearby list exists only as the response to an
 *   observation report, and only the native scanner can produce identifiers. So the
 *   list is PUSHED from the native layer, never fetched by a screen.
 * - No GET /users/{id}. The detail screen reads the last observation response held in
 *   memory. That cache redraws a screen; it is not proof of proximity.
 * - No before_seq. History is forward-only from after_seq=0, so there is no
 *   "load older messages" control.
 * - No SSE or WebSocket (listed as follow-up scope). Updates come from the native
 *   observation push plus polling of conversations.
 * - No profile_revision or discovery_revision in any public response, so there is no
 *   client-side optimistic-concurrency check. Re-submitting identical values is a no-op.
 *
 * Errors are {error:{code,message,details}}. details.field names the offending field
 * on VALIDATION_ERROR. Known codes: VALIDATION_ERROR, IDEMPOTENCY_CONFLICT,
 * IDEMPOTENCY_REPLAY_EXPIRED, OBSERVATION_REQUIRED, DISCOVERY_DISABLED,
 * PROFILE_REQUIRED, RECIPIENT_NOT_FOUND, CONVERSATION_NOT_FOUND.
 */
export {};
