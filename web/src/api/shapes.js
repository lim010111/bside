// Wire contract: docs/api-contract.md. Both adapters expose these same shapes.
/**
 * @typedef {{id:string, name:string, status:'open'|'closed', closed_at:string|null}} RoomMeta
 * @typedef {{id:string, room_id:string, nickname:string, self_description:string,
 * connection_intent:string, participation_status:'active'|'stopped',
 * profile_version:number, joined_at:string}} Participant
 * @typedef {'ready'|'pending'|'unscored'|'failed'|'unavailable'} EvaluationState
 * @typedef {{id:string, nickname:string, self_description:string, profile_version:number,
 * joined_at:string, evaluation_state:EvaluationState}} Banner
 * @typedef {{state:EvaluationState, reason:string|null, viewer_profile_version:number,
 * candidate_profile_version:number}} Reason
 * @typedef {{candidate_version:number, state:'pending'|'partial'|'ready'|'failed',
 * ordered_evaluated_ids:string[]}} Recommendations
 * @typedef {{id:string, conversation_id:string, seq:number, sender_id:string,
 * client_message_id:string, text:string, created_at:string}} Message
 * @typedef {{id:string, peer:Pick<Participant, 'id'|'nickname'|'participation_status'>,
 * last_seq:number, last_message:Message|null}} Conversation
 * @typedef {{items:Message[], has_more:boolean, next_after_seq:number|null,
 * next_before_seq:number|null, latest_seq:number}} MessagePage
 *
 * Shared API:
 * ensureSession(options?) -> {ready:true}
 * getRoom(code, options?) -> RoomMeta
 * getMe(code, options?) -> Participant|null
 * join(code, {nickname,self_description,connection_intent}, options?) -> Participant
 * updateMe(code, {self_description,connection_intent,expected_profile_version}, options?) -> Participant
 * stop(code, options?) / resume(code, options?) -> Participant
 * getParticipants(code, options?) -> {candidate_version,recommendation_state,items:Banner[]}
 * getParticipant(code, id, options?) -> {participant:Participant,recommendation:Reason}
 * getRecommendations(code, options?) -> Recommendations
 * refreshRecommendations(code, options?) -> {candidate_version,state}
 * getConversations(code, options?) -> {items:Conversation[]}
 * sendMessage(code, {recipient_id,client_message_id,text}, options?) -> {message:Message,replayed:boolean}
 * getMessages(code, conversationId, {after_seq?,before_seq?,limit?}, options?) -> MessagePage
 * subscribe(code, onEvent, onError) -> unsubscribe()
 * options.signal cancels HTTP requests; controller also ignores obsolete results.
 */
export {};
