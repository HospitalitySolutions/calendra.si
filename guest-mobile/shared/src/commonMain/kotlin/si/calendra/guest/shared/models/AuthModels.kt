package si.calendra.guest.shared.models

import kotlinx.serialization.Serializable

@Serializable
data class LoginRequest(
    val email: String,
    val password: String
)

@Serializable
data class SignupRequest(
    val email: String,
    val password: String,
    val firstName: String,
    val lastName: String,
    val phone: String? = null,
    val language: String = "sl"
)

@Serializable
data class SocialTokenRequest(
    val idToken: String
)
