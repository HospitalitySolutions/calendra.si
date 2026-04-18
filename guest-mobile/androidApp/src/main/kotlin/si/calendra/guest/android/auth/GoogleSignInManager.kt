package si.calendra.guest.android.auth

import android.app.Activity
import android.util.Base64
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetCredentialResponse
import androidx.credentials.exceptions.GetCredentialException
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import java.security.SecureRandom

class GoogleSignInManager(
    private val activity: Activity,
    private val webClientId: String
) {
    private val credentialManager = CredentialManager.create(activity)

    suspend fun signInWithGoogleButton(): Result<String> {
        if (webClientId.isBlank() || webClientId.contains("YOUR_")) {
            return Result.failure(IllegalStateException("Set your Google web client ID in GoogleSignInManager before using native sign-in."))
        }
        val option = GetSignInWithGoogleOption.Builder(serverClientId = webClientId)
            .setNonce(generateNonce())
            .build()
        return requestIdToken(option)
    }

    suspend fun signInAuthorizedAccountFirst(): Result<String> {
        if (webClientId.isBlank() || webClientId.contains("YOUR_")) {
            return Result.failure(IllegalStateException("Set your Google web client ID in GoogleSignInManager before using native sign-in."))
        }
        val option = GetGoogleIdOption.Builder()
            .setServerClientId(webClientId)
            .setFilterByAuthorizedAccounts(true)
            .setAutoSelectEnabled(true)
            .setNonce(generateNonce())
            .build()
        return requestIdToken(option)
    }

    private suspend fun requestIdToken(option: Any): Result<String> {
        val request = when (option) {
            is GetGoogleIdOption -> GetCredentialRequest.Builder().addCredentialOption(option).build()
            is GetSignInWithGoogleOption -> GetCredentialRequest.Builder().addCredentialOption(option).build()
            else -> return Result.failure(IllegalArgumentException("Unsupported Google sign-in option."))
        }
        return try {
            val result = credentialManager.getCredential(activity, request)
            Result.success(extractIdToken(result))
        } catch (ex: GetCredentialException) {
            Result.failure(ex)
        } catch (ex: Exception) {
            Result.failure(ex)
        }
    }

    private fun extractIdToken(result: GetCredentialResponse): String {
        val credential = result.credential
        val googleCredential = GoogleIdTokenCredential.createFrom(credential.data)
        return googleCredential.idToken
    }

    private fun generateNonce(byteLength: Int = 32): String {
        val randomBytes = ByteArray(byteLength)
        SecureRandom().nextBytes(randomBytes)
        return Base64.encodeToString(randomBytes, Base64.NO_WRAP or Base64.URL_SAFE or Base64.NO_PADDING)
    }
}
