package app.bside.discovery

import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.net.HttpURLConnection
import java.net.URL

/** A failure the server named, kept so callers can tell refusals from outages apart. */
class ApiException(val status: Int, val code: String, override val message: String) : Exception(message)

/**
 * The two endpoints the native layer owns (docs/api-contract.md v0.1).
 *
 * Deliberately `HttpURLConnection` rather than another HTTP library: two POSTs do not
 * justify a dependency, and the WebView side already has its own client.
 *
 * Both calls carry the installation credential as a bearer token. A public user_id or
 * a BLE identifier is never used as authentication.
 */
class ApiClient(private val baseUrl: String, private val credentials: CredentialStore) {

    /** POST /api/v1/discovery/identifiers — the identifier this device advertises. */
    fun issueIdentifier(): JSONObject = post("/api/v1/discovery/identifiers", null)

    /**
     * POST /api/v1/discovery/observations — report what the scan heard.
     *
     * The server ignores unknown, expired and self identifiers, so a batch never needs
     * pre-filtering and a bad entry does not fail the rest.
     */
    fun reportObservations(identifiers: List<String>): JSONObject {
        val body = JSONObject().put("identifiers", JSONArray(identifiers.distinct().take(MAX_BATCH)))
        return post("/api/v1/discovery/observations", body)
    }

    /**
     * POST /api/v1/me/push-token — file this device's FCM token under this user.
     *
     * Sent with the credential like everything else, because the server files a
     * token per user rather than per device: a phone that is re-registered by
     * somebody else must stop receiving the previous user's messages.
     */
    fun registerPushToken(token: String): JSONObject {
        val body = JSONObject().put("token", token).put("platform", "android")
        return post("/api/v1/me/push-token", body)
    }

    private fun post(path: String, body: JSONObject?): JSONObject {
        val credential = credentials.credential
            ?: throw ApiException(401, "UNAUTHORIZED", "No installation credential is stored yet.")

        val connection = (URL(baseUrl.trimEnd('/') + path).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = TIMEOUT_MS
            readTimeout = TIMEOUT_MS
            setRequestProperty("Accept", "application/json")
            setRequestProperty("Authorization", "Bearer $credential")
            if (body != null) {
                setRequestProperty("Content-Type", "application/json")
                doOutput = true
            }
        }
        try {
            body?.let { connection.outputStream.use { stream -> stream.write(it.toString().toByteArray()) } }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val text = stream?.bufferedReader()?.use(BufferedReader::readText).orEmpty()
            if (status !in 200..299) {
                val error = runCatching { JSONObject(text).getJSONObject("error") }.getOrNull()
                throw ApiException(
                    status,
                    error?.optString("code").orEmpty().ifEmpty { "REQUEST_FAILED" },
                    error?.optString("message").orEmpty().ifEmpty { "The request failed." },
                )
            }
            return JSONObject(text)
        } finally {
            connection.disconnect()
        }
    }

    private companion object {
        const val TIMEOUT_MS = 15_000

        /** The contract caps one observation report at fifty identifiers. */
        const val MAX_BATCH = 50
    }
}
