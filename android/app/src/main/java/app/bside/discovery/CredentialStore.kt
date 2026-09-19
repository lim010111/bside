package app.bside.discovery

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Holds the installation credential in Android's protected storage.
 *
 * This is decision ① of the bridge contract (see android/README.md): the credential
 * lives here, and the WebView borrows it per request through `getCredential()`. JS
 * keeps it in a closure and never writes it to localStorage, so the WebView never
 * becomes the system of record.
 *
 * The native scanner also reads it directly, because it talks to the API on its own
 * while the app is in the background.
 */
class CredentialStore(context: Context) {

    private val prefs: SharedPreferences = run {
        val key = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            FILE,
            key,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    var credential: String?
        get() = prefs.getString(CREDENTIAL, null)
        set(value) = prefs.edit().apply {
            if (value.isNullOrBlank()) remove(CREDENTIAL) else putString(CREDENTIAL, value)
        }.apply()

    private companion object {
        const val FILE = "bside.installation"
        const val CREDENTIAL = "installation_credential"
    }
}
