package si.calendra.guest.shared.models

import kotlinx.serialization.Serializable

@Serializable
data class TenantLookupRequest(
    val tenantCode: String
)

@Serializable
data class TenantLookupResponse(
    val companyId: String,
    val companyName: String,
    val publicDescription: String? = null,
    val publicCity: String? = null,
    val publicPhone: String? = null,
    val joinMethod: String,
    val canJoin: Boolean
)

@Serializable
data class JoinTenantRequest(
    val joinMethod: String,
    val tenantCode: String? = null,
    val inviteCode: String? = null,
    val companyId: String? = null
)

@Serializable
data class JoinTenantResponse(
    val tenantLink: TenantLink,
    val clientMatched: Boolean,
    val matchType: String
)

@Serializable
data class TenantLink(
    val companyId: String,
    val clientId: String,
    val status: String,
    val joinedVia: String
)
