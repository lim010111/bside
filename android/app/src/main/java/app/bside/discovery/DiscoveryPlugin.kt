package app.bside.discovery

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.PowerManager
import androidx.core.content.ContextCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.json.JSONObject

/**
 * The `Discovery` plugin: the native half of web/src/lib/native.js.
 *
 * Two decisions this implements, both written up in android/README.md:
 *
 *  1. The installation credential stays in [CredentialStore]. `getCredential()` lends
 *     it to the WebView per request; JS keeps it in memory and never persists it.
 *
 *  2. Native scans, native reports to POST /discovery/observations, and the server's
 *     response is pushed to JS as the `observations` event. JS never calls that
 *     endpoint and never runs a scan timer. This is forced by the API: v0.1 has no
 *     GET /discovery/nearby, so the only way to know who is nearby is to be the one
 *     who reported the scan.
 *
 * The user's participation intent lives on the server (`discovery_enabled`). This
 * plugin reports what the radio is actually doing and never flips that setting itself:
 * a denied permission is something to show, not a reason to turn the user off.
 */
@CapacitorPlugin(
    name = "Discovery",
    permissions = [
        Permission(
            alias = DiscoveryPlugin.BLUETOOTH,
            strings = [
                Manifest.permission.BLUETOOTH_SCAN,
                Manifest.permission.BLUETOOTH_ADVERTISE,
            ],
        )
    ],
)
class DiscoveryPlugin : Plugin() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private lateinit var credentials: CredentialStore
    private var intended = false

    override fun load() {
        credentials = CredentialStore(context)
        DiscoveryHolder.apiBaseUrl = apiBaseUrl()
        DiscoveryHolder.onObservations = { response -> deliverObservations(response) }
        DiscoveryHolder.onStatusChanged = { deliverStatus() }
    }

    /**
     * Where the product API lives. The WebView origin is https://localhost, so a
     * relative path is meaningless here — the value comes from a build-time string
     * resource that `VITE_API_BASE` should agree with.
     */
    private fun apiBaseUrl(): String {
        val id = context.resources.getIdentifier("api_base_url", "string", context.packageName)
        return if (id == 0) "" else context.getString(id)
    }

    // --- credential (decision 1) --------------------------------------------

    @PluginMethod
    fun getCredential(call: PluginCall) {
        call.resolve(JSObject().put("installation_credential", credentials.credential))
    }

    @PluginMethod
    fun setCredential(call: PluginCall) {
        val value = call.getString("installation_credential")
        if (value.isNullOrBlank()) {
            call.reject("installation_credential is required")
            return
        }
        credentials.credential = value
        call.resolve()
    }

    // --- radio ---------------------------------------------------------------

    @PluginMethod
    fun getStatus(call: PluginCall) = call.resolve(status())

    @PluginMethod
    fun start(call: PluginCall) {
        intended = true
        if (!hasBluetoothPermission()) {
            requestPermissionForAlias(BLUETOOTH, call, "permissionCallback")
            return
        }
        DiscoveryService.start(context)
        call.resolve(status())
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        intended = false
        DiscoveryService.stop(context)
        call.resolve(status())
    }

    @PluginMethod
    fun requestPermission(call: PluginCall) {
        requestPermissionForAlias(BLUETOOTH, call, "permissionCallback")
    }

    @PermissionCallback
    private fun permissionCallback(call: PluginCall) {
        if (intended && hasBluetoothPermission()) DiscoveryService.start(context)
        call.resolve(status())
    }

    /** Scan and report now, and give the server's answer straight back (decision 2). */
    @PluginMethod
    fun refreshObservations(call: PluginCall) {
        val radio = DiscoveryHolder.radio(context)
        if (radio == null || !hasBluetoothPermission()) {
            call.resolve(JSObject())
            return
        }
        scope.launch {
            radio.rotateIfDue()
            val response = radio.sweepAndReport()
            call.resolve(if (response == null) JSObject() else JSObject.fromJSONObject(response))
        }
    }

    private fun deliverObservations(response: JSONObject) {
        notifyListeners("observations", JSObject.fromJSONObject(response))
    }

    private fun deliverStatus() = notifyListeners("statusChanged", status())

    // --- status: intent and reality are reported separately -------------------

    private fun status(): JSObject {
        val radio = DiscoveryHolder.radio(context)
        return JSObject()
            .put("supported", radio?.adapter != null)
            .put("simulated", false)
            .put("running", intended && radio?.isRunning == true)
            .put("bluetooth", bluetoothState())
            .put("permission", permissionState())
            .put("os", osState())
            .put("detail", radio?.lastError)
    }

    private fun bluetoothState(): String {
        val adapter = DiscoveryHolder.radio(context)?.adapter ?: return "unavailable"
        return if (adapter.isEnabled) "on" else "off"
    }

    private fun hasBluetoothPermission(): Boolean = requiredPermissions().all {
        ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED
    }

    /** Android 12 split BLE out of location; older releases still need fine location. */
    private fun requiredPermissions(): List<String> =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            listOf(Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_ADVERTISE)
        } else {
            listOf(Manifest.permission.ACCESS_FINE_LOCATION)
        }

    private fun permissionState(): String = when {
        hasBluetoothPermission() -> "granted"
        getPermissionState(BLUETOOTH)?.toString()?.lowercase() == "denied" -> "denied"
        else -> "prompt"
    }

    /** Battery optimisation is the usual reason background scanning quietly stops. */
    private fun osState(): String {
        val power = context.getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return "unknown"
        return if (power.isIgnoringBatteryOptimizations(context.packageName)) "ok" else "restricted"
    }

    companion object {
        const val BLUETOOTH = "bluetooth"
    }
}
