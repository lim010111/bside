package app.bside.discovery

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlin.math.absoluteValue

/**
 * Receives FCM messages and draws the notification.
 *
 * The server sends data-only messages (see server/app/push.py), never a
 * `notification` block, so this runs in the foreground and the background alike
 * and there is exactly one place that decides the channel, the text and where a
 * tap lands. A `notification` block would be drawn by the system when the app is
 * backgrounded and by this class when it is not, which is two notifications for
 * one event.
 *
 * Registration is the other half. The token belongs to the install, but the
 * server files it under a *user*, so it can only be sent once an installation
 * credential exists. [registerIfPossible] is therefore called both on a new
 * token and after the WebView stores a credential.
 */
class PushService : FirebaseMessagingService() {

    override fun onNewToken(token: String) {
        // Fired on install, on restore to a new device, and when Firebase
        // rotates. The server's copy is stale from this moment until it is told.
        registerIfPossible(this, token)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val data = message.data
        val title = data["title"] ?: return
        val body = data["body"].orEmpty()
        val kind = data["kind"] ?: OTHER

        if (NotificationManagerCompat.from(this).areNotificationsEnabled().not()) {
            // The user said no. Posting anyway is not possible, and treating it
            // as an error is not useful: the message is already on the server
            // and the app shows it when opened.
            return
        }
        notify(kind, title, body, data)
    }

    private fun notify(kind: String, title: String, body: String, data: Map<String, String>) {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val channel = if (kind == MESSAGE) CHANNEL_MESSAGES else CHANNEL_NEARBY
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            manager.createNotificationChannel(
                NotificationChannel(channel, channelName(kind), NotificationManager.IMPORTANCE_HIGH)
            )
        }

        val open = Intent(this, Class.forName("app.bside.MainActivity")).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            data["conversation_id"]?.let { putExtra("conversation_id", it) }
            data["user_id"]?.let { putExtra("user_id", it) }
        }
        val pending = PendingIntent.getActivity(
            this,
            // A per-conversation request code so a second message replaces the
            // first one's intent instead of reusing a stale extra.
            (data["conversation_id"] ?: data["user_id"] ?: kind).hashCode(),
            open,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val notification = NotificationCompat.Builder(this, channel)
            .setSmallIcon(android.R.drawable.ic_dialog_email)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            // A message is another person's words. Whether it appears on a
            // locked screen is the device owner's setting to make, not ours.
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setContentIntent(pending)
            .build()

        // One notification per conversation, so a chat updates in place rather
        // than stacking a row per message.
        val id = (data["conversation_id"] ?: data["user_id"] ?: kind).hashCode().absoluteValue
        manager.notify(id, notification)
    }

    private fun channelName(kind: String) = if (kind == MESSAGE) "메시지" else "주변 추천"

    companion object {
        const val MESSAGE = "message"
        private const val OTHER = "other"
        private const val CHANNEL_MESSAGES = "messages"
        private const val CHANNEL_NEARBY = "nearby"

        /**
         * Tell the server this device's token, if both halves are available.
         *
         * Silent no-ops are deliberate: no FirebaseApp means the build has no
         * google-services.json, and no credential means the WebView has not
         * registered an installation yet. Neither is a failure worth surfacing,
         * and both resolve on a later call.
         */
        fun registerIfPossible(context: Context, token: String? = null) {
            if (FirebaseApp.getApps(context).isEmpty()) return
            val credentials = CredentialStore(context)
            if (credentials.credential.isNullOrBlank()) return
            val baseUrl = context.getString(
                context.resources.getIdentifier("api_base_url", "string", context.packageName)
            )
            if (baseUrl.isBlank()) return

            val send = { value: String ->
                Thread {
                    runCatching { ApiClient(baseUrl, credentials).registerPushToken(value) }
                        .onFailure { android.util.Log.w("PushService", "token register failed: $it") }
                }.start()
            }
            if (token != null) {
                send(token)
                return
            }
            FirebaseMessaging.getInstance().token.addOnSuccessListener { send(it) }
        }
    }
}
