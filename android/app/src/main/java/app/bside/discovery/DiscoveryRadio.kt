package app.bside.discovery

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.util.Base64
import android.util.Log
import org.json.JSONObject
import java.util.Collections

/**
 * BLE advertising and scanning for the 22-character discovery identifier.
 *
 * ## How the identifier travels
 *
 * The server's identifier is 128 random bits rendered as 22 unpadded base64url
 * characters. Those 16 raw bytes go in BLE manufacturer-specific data:
 *
 *     [2 bytes company id 0xFFFF][16 bytes identifier]
 *
 * That is 18 bytes of a 31-byte legacy advertisement, so it fits without a scan
 * response and without GATT. No connection is ever made: a scan result is all that is
 * needed, which is what keeps discovery cheap.
 *
 * 0xFFFF is the SIG's "for testing only" company id. A shipping build needs either a
 * registered company id or a 16-bit service UUID; both are drop-in changes here.
 *
 * ## Rotation
 *
 * The server decides when the identifier changes: it returns `refresh_after`, and this
 * class re-issues at that point and restarts advertising. The replaced value stays
 * valid server-side for up to a minute, so a peer that heard the old one still resolves.
 */
class DiscoveryRadio(
    private val context: Context,
    private val api: ApiClient,
    private val onObservations: (JSONObject) -> Unit,
    private val onStatusChanged: () -> Unit,
) {

    private val heard = Collections.synchronizedSet(mutableSetOf<String>())
    private var advertiser: AdvertiseCallback? = null
    private var scanner: ScanCallback? = null
    private var identifier: String? = null
    private var refreshAtMs: Long = 0

    val adapter: BluetoothAdapter?
        get() = (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter

    var lastError: String? = null
        private set

    val isRunning: Boolean
        get() = advertiser != null || scanner != null

    /** Issue an identifier if needed, then advertise it and start scanning. */
    @SuppressLint("MissingPermission")
    fun start() {
        val adapter = adapter ?: run {
            lastError = "This device has no Bluetooth adapter."
            return
        }
        if (!adapter.isEnabled) {
            lastError = "Bluetooth is off."
            return
        }
        try {
            ensureIdentifier()
        } catch (error: Exception) {
            lastError = error.message
            onStatusChanged()
            return
        }
        startAdvertising()
        startScanning()
        lastError = null
        onStatusChanged()
    }

    @SuppressLint("MissingPermission")
    fun stop() {
        val adapter = adapter
        advertiser?.let { adapter?.bluetoothLeAdvertiser?.stopAdvertising(it) }
        scanner?.let { adapter?.bluetoothLeScanner?.stopScan(it) }
        advertiser = null
        scanner = null
        heard.clear()
        onStatusChanged()
    }

    /**
     * Report everything heard since the last sweep and hand the response back.
     *
     * Returns null when there was nothing to report, so callers can tell "nobody is
     * around" from "the server said nobody is around".
     */
    fun sweepAndReport(): JSONObject? {
        val batch = synchronized(heard) { heard.toList().also { heard.clear() } }
        if (batch.isEmpty()) return null
        return try {
            val response = api.reportObservations(batch)
            onObservations(response)
            lastError = null
            response
        } catch (error: Exception) {
            // A failed report must not lose the observations; the next sweep retries.
            synchronized(heard) { heard.addAll(batch) }
            lastError = error.message
            onStatusChanged()
            null
        }
    }

    /** Re-issue and re-advertise once the server's rotation time has passed. */
    @SuppressLint("MissingPermission")
    fun rotateIfDue() {
        if (!isRunning || System.currentTimeMillis() < refreshAtMs) return
        runCatching {
            ensureIdentifier(force = true)
            adapter?.bluetoothLeAdvertiser?.stopAdvertising(advertiser ?: return@runCatching)
            advertiser = null
            startAdvertising()
        }.onFailure { lastError = it.message }
    }

    private fun ensureIdentifier(force: Boolean = false) {
        if (!force && identifier != null && System.currentTimeMillis() < refreshAtMs) return
        val issued = api.issueIdentifier()
        identifier = issued.getString("identifier")
        // The server tells us when rotation is allowed; we do not invent a schedule.
        refreshAtMs = parseRfc3339(issued.getString("refresh_after"))
    }

    @SuppressLint("MissingPermission")
    private fun startAdvertising() {
        val value = identifier ?: return
        val bytes = decodeIdentifier(value) ?: return
        val settings = AdvertiseSettings.Builder()
            .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_BALANCED)
            .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_MEDIUM)
            .setConnectable(false)
            .setTimeout(0)
            .build()
        val data = AdvertiseData.Builder()
            .setIncludeDeviceName(false)
            .setIncludeTxPowerLevel(false)
            .addManufacturerData(COMPANY_ID, bytes)
            .build()
        val callback = object : AdvertiseCallback() {
            override fun onStartFailure(errorCode: Int) {
                lastError = "Advertising failed with code $errorCode."
                advertiser = null
                onStatusChanged()
            }
        }
        adapter?.bluetoothLeAdvertiser?.startAdvertising(settings, data, callback)
        advertiser = callback
    }

    @SuppressLint("MissingPermission")
    private fun startScanning() {
        val settings = ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_BALANCED)
            .setCallbackType(ScanSettings.CALLBACK_TYPE_ALL_MATCHES)
            .build()
        // Filter on our manufacturer id so the callback is not woken by every beacon
        // in the room. The mask is empty, meaning "any payload with this company id".
        val filter = ScanFilter.Builder()
            .setManufacturerData(COMPANY_ID, ByteArray(0), ByteArray(0))
            .build()
        val callback = object : ScanCallback() {
            override fun onScanResult(callbackType: Int, result: ScanResult) {
                val payload = result.scanRecord?.getManufacturerSpecificData(COMPANY_ID) ?: return
                if (payload.size != IDENTIFIER_BYTES) return
                val value = encodeIdentifier(payload)
                // Our own advertisement can come back on some devices; the server
                // ignores self observations anyway, but there is no point sending it.
                if (value != identifier) heard.add(value)
            }

            override fun onScanFailed(errorCode: Int) {
                lastError = "Scanning failed with code $errorCode."
                scanner = null
                onStatusChanged()
            }
        }
        adapter?.bluetoothLeScanner?.startScan(listOf(filter), settings, callback)
        scanner = callback
    }

    companion object {
        /** SIG "for testing" company id. Replace before shipping. */
        const val COMPANY_ID = 0xFFFF
        const val IDENTIFIER_BYTES = 16

        private const val BASE64_FLAGS = Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP

        fun encodeIdentifier(bytes: ByteArray): String = Base64.encodeToString(bytes, BASE64_FLAGS)

        fun decodeIdentifier(value: String): ByteArray? = runCatching {
            Base64.decode(value, BASE64_FLAGS).takeIf { it.size == IDENTIFIER_BYTES }
        }.getOrNull()

        /** The server sends UTC RFC 3339 with seconds precision. */
        fun parseRfc3339(value: String): Long = runCatching {
            java.time.Instant.parse(value).toEpochMilli()
        }.getOrElse {
            Log.w("DiscoveryRadio", "Unparsable server time: $value")
            0L
        }
    }
}
