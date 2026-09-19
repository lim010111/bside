package app.bside.discovery

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.PowerManager
import androidx.core.content.ContextCompat
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

/**
 * The `Discovery` plugin: the native half of the contract in web/src/lib/native.js.
 *
 * NOT BUILT OR RUN YET. This file is the agreed shape of the bridge (T01), written so
 * the two questions the web side could not decide alone now have one answer each.
 *
 * ## 1. How the installation credential reaches the WebView
 *
 * It does not. `getCredential()` returns the credential from EncryptedSharedPreferences
 * for the duration of one request, and JS holds it only in memory (see
 * lib/credentials.js, which caches it in a closure and never writes it to
 * localStorage when a native bridge is present). JS never persists it, and the
 * WebView never becomes the system of record.
 *
 * The alternative — native injecting the Authorization header into every WebView
 * request — was rejected: it hides which calls are authenticated, and Capacitor's
 * request interception differs across Android versions.
 *
 * If you later prefer the credential never to enter JS at all, the change is local:
 * add a `fetch(path, body)` method here, and swap the transport in api/client.js.
 * Nothing else in the frontend depends on where the credential lives.
 *
 * ## 2. How observation results reach the WebView
 *
 * Native scans, calls POST /api/v1/discovery/observations itself, and pushes the
 * server's response to JS as the `observations` event. `refreshObservations()` is the
 * same thing on demand, for pull-to-refresh. JS never calls that endpoint in
 * production and never runs a scan timer.
 *
 * This is forced by the API: v0.1 has no GET /discovery/nearby, so the only way to
 * learn who is nearby is to be the one who reported the scan.
 *
 * ## What is still open for whoever builds this
 *
 * - Foreground service, scan mode and duty cycle for background operation.
 * - GATT vs. advertising-only carriage of the 22-character identifier.
 * - The recommendation notification, which v0.1 has no data for yet.
 */
@CapacitorPlugin(
    name = "Discovery",
    permissions = [
        // Android 12+ splits these; the manifest also needs neverForLocation if you
        // do not derive location from scans.
        com.getcapacitor.annotation.Permission(
            strings = [Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_ADVERTISE],
            alias = "bluetooth",
        )
    ],
)
class DiscoveryPlugin : Plugin() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private lateinit var secrets: EncryptedSharedPreferences
    private var scanner: DiscoveryScanner? = null
    private var running = false

    override fun load() {
        val key = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        secrets = EncryptedSharedPreferences.create(
            context,
            "bside.installation",
            key,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        ) as EncryptedSharedPreferences
    }

    // --- credential ---------------------------------------------------------

    @PluginMethod
    fun getCredential(call: PluginCall) {
        val stored = secrets.getString(CREDENTIAL, null)
        call.resolve(JSObject().put("installation_credential", stored))
    }

    @PluginMethod
    fun setCredential(call: PluginCall) {
        val credential = call.getString("installation_credential")
        if (credential.isNullOrBlank()) {
            call.reject("installation_credential is required")
            return
        }
        secrets.edit().putString(CREDENTIAL, credential).apply()
        call.resolve()
    }

    // --- radio --------------------------------------------------------------

    @PluginMethod
    fun getStatus(call: PluginCall) = call.resolve(status())

    @PluginMethod
    fun start(call: PluginCall) {
        // The user's intent is already stored server-side; this only starts the radio.
        // A blocked radio is reported, never silently treated as "off".
        if (!hasPermission()) {
            requestPermissionForAlias("bluetooth", call, "permissionCallback")
            return
        }
        running = true
        scope.launch { runCatching { scanner().start() } }
        call.resolve(status())
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        running = false
        scope.launch { runCatching { scanner().stop() } }
        call.resolve(status())
    }

    @PluginMethod
    fun requestPermission(call: PluginCall) {
        requestPermissionForAlias("bluetooth", call, "permissionCallback")
    }

    @com.getcapacitor.annotation.PermissionCallback
    private fun permissionCallback(call: PluginCall) {
        if (hasPermission() && running) scope.launch { runCatching { scanner().start() } }
        call.resolve(status())
    }

    /** Scan now, report to the server, and return that response to JS. */
    @PluginMethod
    fun refreshObservations(call: PluginCall) {
        scope.launch {
            val response = runCatching { scanner().sweepAndReport() }.getOrNull()
            if (response == null) call.resolve(JSObject()) else call.resolve(JSObject.fromJSONObject(response))
        }
    }

    /** Called by the scanner after every background report. */
    fun deliverObservations(response: JSONObject) {
        notifyListeners("observations", JSObject.fromJSONObject(response))
    }

    fun deliverStatus() = notifyListeners("statusChanged", status())

    private fun scanner(): DiscoveryScanner =
        scanner ?: DiscoveryScanner(context, secrets, ::deliverObservations, ::deliverStatus)
            .also { scanner = it }

    // --- status -------------------------------------------------------------

    private fun status(): JSObject = JSObject()
        .put("supported", adapter() != null)
        .put("simulated", false)
        .put("running", running && hasPermission() && bluetoothState() == "on")
        .put("bluetooth", bluetoothState())
        .put("permission", permissionState())
        .put("os", osState())
        .put("detail", null as String?)

    private fun adapter(): BluetoothAdapter? =
        (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter

    private fun bluetoothState(): String = when {
        adapter() == null -> "unavailable"
        adapter()?.isEnabled == true -> "on"
        else -> "off"
    }

    private fun hasPermission(): Boolean = requiredPermissions().all {
        ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED
    }

    private fun requiredPermissions(): List<String> =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            listOf(Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_ADVERTISE)
        } else {
            listOf(Manifest.permission.ACCESS_FINE_LOCATION)
        }

    private fun permissionState(): String = when {
        hasPermission() -> "granted"
        getPermissionState("bluetooth")?.toString() == "denied" -> "denied"
        else -> "prompt"
    }

    /** Battery optimisation is the usual reason background scanning quietly stops. */
    private fun osState(): String {
        val power = context.getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return "unknown"
        return if (power.isIgnoringBatteryOptimizations(context.packageName)) "ok" else "restricted"
    }

    private companion object {
        const val CREDENTIAL = "installation_credential"
    }
}

/**
 * Owns advertising, scanning and reporting. Left as an interface sketch on purpose:
 * the duty cycle and the BLE carriage are the implementer's call, but the two
 * endpoints it must use are fixed by the contract.
 */
class DiscoveryScanner(
    private val context: Context,
    private val secrets: EncryptedSharedPreferences,
    private val onObservations: (JSONObject) -> Unit,
    private val onStatus: () -> Unit,
) {
    /**
     * POST /api/v1/discovery/identifiers, then advertise the returned 22-character
     * identifier. Re-issue at `refresh_after`; the replaced value stays valid for up
     * to a minute, so do not stop honouring it immediately.
     */
    suspend fun start(): Unit = TODO("advertise the issued identifier and begin scanning")

    suspend fun stop(): Unit = TODO("stop advertising and scanning")

    /**
     * Collect the identifiers heard since the last sweep, POST them to
     * /api/v1/discovery/observations in batches of at most 50, and hand each response
     * to [onObservations]. Invalid or expired identifiers are ignored by the server,
     * so a batch never needs pre-filtering.
     */
    suspend fun sweepAndReport(): JSONObject? = TODO("report scanned identifiers and return the response")

    private fun authorization(): String = "Bearer " + secrets.getString("installation_credential", "")

    private fun batches(identifiers: List<String>): List<JSONArray> =
        identifiers.distinct().chunked(50).map { JSONArray(it) }
}
