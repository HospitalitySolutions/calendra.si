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

@Serializable
data class SignupStartRequest(
    val email: String,
    val password: String,
    val firstName: String,
    val lastName: String,
    val phone: String? = null,
    val language: String = "sl"
)

@Serializable
data class SignupChallenge(
    val challengeId: String,
    val email: String,
    val expiresAt: String
)

@Serializable
data class VerifySignupCodeRequest(
    val challengeId: String,
    val code: String
)

@Serializable
data class ResendSignupCodeRequest(
    val challengeId: String
)

@Serializable
data class ForgotPasswordRequest(
    val email: String,
    val locale: String? = null,
    val language: String? = null
)

@Serializable
data class VerifyPasswordResetCodeRequest(
    val email: String,
    val code: String
)

@Serializable
data class ResetPasswordCodeResponse(
    val verified: Boolean = false,
    val email: String? = null,
    val resetToken: String? = null
)

@Serializable
data class ResetPasswordValidateResponse(
    val valid: Boolean,
    val email: String? = null
)

@Serializable
data class ResetPasswordRequest(
    val token: String,
    val password: String
)


@Serializable
data class DeleteGuestAccountRequest(
    val confirm: Boolean
)

@Serializable
data class DeleteGuestAccountResponse(
    val deleted: Boolean = false
)
