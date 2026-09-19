// Wire contract: docs/api-contract.md. Both adapters expose these same shapes.
//
// Endpoint paths in client.js are this frontend's proposal and are NOT fixed yet —
// api-contract.md says they are pinned at implementation time with the server's
// shared examples and OpenAPI (T00). Field names below follow that document.
/**
 * @typedef {{user_id:string, nickname:string, self_description:string,
 * connection_intent:string, profile_revision:number,
 * discovery_enabled:boolean, discovery_revision:number}} Me
 * @typedef {'ready'|'pending'|'unscored'|'failed'} EvaluationState
 * @typedef {{id:string, nickname:string, self_description:string, connection_intent:string,
 * profile_revision:number, last_observed_at:string}} Person
 * @typedef {{id:string, nickname:string, self_description:string, profile_revision:number,
 * last_observed_at:string, evaluation_state:EvaluationState}} NearbyBanner
 * @typedef {{state:EvaluationState, reason:string|null, viewer_profile_revision:number,
 * candidate_profile_revision:number, policy_revision:string|null}} Reason
 * @typedef {{nearby_version:number, state:'pending'|'partial'|'ready'|'failed',
 * ordered_evaluated_ids:string[]}} Recommendations
 * @typedef {{id:string, conversation_id:string, seq:number, sender_id:string,
 * client_message_id:string, text:string, created_at:string}} Message
 * @typedef {{id:string, peer:Pick<Person, 'id'|'nickname'>, peer_nearby:boolean,
 * last_seq:number, last_message:Message|null}} Conversation
 * @typedef {{items:Message[], has_more:boolean, next_after_seq:number|null,
 * next_before_seq:number|null, latest_seq:number}} MessagePage
 * @typedef {{peer_token:string, observed_at:string, rssi?:number}} Observation
 *
 * Shared API — see the "API 기능 단위" table in docs/api-contract.md:
 * registerInstall(options?) -> {user_id:string|null}
 *   Install-scoped credential. The server issues and stores it; JS never holds it.
 * getMe(options?) -> Me|null                      // null before the profile exists
 * createProfile({nickname,self_description,connection_intent}, options?) -> Me
 * updateProfile({self_description,connection_intent,expected_profile_revision}, options?) -> Me
 * setDiscovery({enabled,expected_discovery_revision}, options?) -> Me
 * reportObservations({observations:Observation[]}, options?) -> {nearby_version:number}
 * getNearby(options?) -> {nearby_version,recommendation_state,items:NearbyBanner[]}
 * getPerson(id, options?) -> {person:Person,recommendation:Reason}
 * getRecommendations(options?) -> Recommendations
 * refreshRecommendations(options?) -> {nearby_version,state}
 * getConversations(options?) -> {items:Conversation[]}
 * sendMessage({recipient_id,client_message_id,text}, options?) -> {message:Message,replayed:boolean}
 * getMessages(conversationId, {after_seq?,before_seq?,limit?}, options?) -> MessagePage
 * subscribe(onEvent, onError) -> unsubscribe()
 * options.signal cancels HTTP requests; the controller also ignores obsolete results.
 *
 * There is no room, no event closure and no request/accept state. A conversation
 * starts when the first message is stored, and it outlives proximity and discovery OFF.
 */
export {};
