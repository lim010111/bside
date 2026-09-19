package app.bside.discovery

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * Keeps discovery alive while the app is not in front.
 *
 * Android stops BLE scanning for a backgrounded process, so the sweep loop has to run
 * in a foreground service with a visible notification. That notification is also the
 * honest answer to "is this thing scanning right now" — the user can see it and stop it.
 *
 * The service owns the cadence. The WebView never runs a scan timer: this is decision
 * ② of the bridge contract, and it is what makes the nearby list work at all, since
 * API v0.1 has no endpoint to fetch it.
 */
class DiscoveryService : Service() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var loop: Job? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(NOTIFICATION_ID, notification())
        if (loop == null) {
            loop = scope.launch {
                val radio = DiscoveryHolder.radio(applicationContext) ?: return@launch
                radio.start()
                while (isActive) {
                    delay(SWEEP_INTERVAL_MS)
                    radio.rotateIfDue()
                    radio.sweepAndReport()
                }
            }
        }
        // Restart if the system kills us, but do not replay the intent.
        return START_STICKY
    }

    override fun onDestroy() {
        loop?.cancel()
        loop = null
        DiscoveryHolder.radio(applicationContext)?.stop()
        scope.cancel()
        super.onDestroy()
    }

    private fun notification(): Notification {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            manager.createNotificationChannel(
                NotificationChannel(CHANNEL, "주변 발견", NotificationManager.IMPORTANCE_LOW).apply {
                    description = "주변에 있는 참여자를 찾는 동안 표시됩니다."
                    setShowBadge(false)
                },
            )
        }
        val open = packageManager.getLaunchIntentForPackage(packageName)?.let {
            PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE)
        }
        return NotificationCompat.Builder(this, CHANNEL)
            .setContentTitle("주변 발견이 켜져 있어요")
            .setContentText("가까이 있는 참여자를 찾고 있어요.")
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(open)
            .build()
    }

    companion object {
        private const val CHANNEL = "discovery"
        private const val NOTIFICATION_ID = 1

        /**
         * How often to rotate, sweep and report. A starting value, not a measured one:
         * docs/api-contract.md keeps scan cadence as configuration to be recorded on
         * the first real-device run.
         */
        const val SWEEP_INTERVAL_MS = 15_000L

        fun start(context: Context) {
            val intent = Intent(context, DiscoveryService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent)
            else context.startService(intent)
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, DiscoveryService::class.java))
        }
    }
}

/**
 * One radio per process, shared by the plugin and the service.
 *
 * Both need the same advertiser, scanner and pending-observation set; two instances
 * would advertise two identifiers and split what was heard.
 */
object DiscoveryHolder {
    @Volatile
    private var instance: DiscoveryRadio? = null

    @Volatile
    var apiBaseUrl: String = ""

    var onObservations: ((org.json.JSONObject) -> Unit)? = null
    var onStatusChanged: (() -> Unit)? = null

    fun radio(context: Context): DiscoveryRadio? {
        if (apiBaseUrl.isBlank()) return null
        return instance ?: synchronized(this) {
            instance ?: DiscoveryRadio(
                context.applicationContext,
                ApiClient(apiBaseUrl, CredentialStore(context.applicationContext)),
                { onObservations?.invoke(it) },
                { onStatusChanged?.invoke() },
            ).also { instance = it }
        }
    }
}
