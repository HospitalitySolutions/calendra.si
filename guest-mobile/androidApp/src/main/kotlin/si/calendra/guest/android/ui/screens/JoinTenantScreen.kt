package si.calendra.guest.android.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Business
import androidx.compose.material.icons.rounded.CenterFocusStrong
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material.icons.rounded.LocationOn
import androidx.compose.material.icons.rounded.QrCodeScanner
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material.icons.rounded.Tag
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import kotlinx.coroutines.launch
import si.calendra.guest.shared.models.TenantSummary
import si.calendra.guest.shared.repository.GuestRepository
import kotlin.math.absoluteValue

private enum class JoinMode { Code, Scan, Browse }

private data class TenantTypeOption(
    val id: String?,
    val label: String
)

private val tenantTypes = listOf(
    TenantTypeOption(null, "All"),
    TenantTypeOption("salon", "Salon"),
    TenantTypeOption("gym", "Gym"),
    TenantTypeOption("spa", "Spa"),
    TenantTypeOption("therapy", "Therapy")
)

@Composable
fun JoinTenantScreen(
    repository: GuestRepository,
    subscribedTenantIds: Set<String> = emptySet(),
    onJoinWithCode: (String) -> Unit,
    onJoinPublicTenant: (String) -> Unit,
    onScanQr: () -> Unit,
    onBack: () -> Unit
) {
    val colorScheme = MaterialTheme.colorScheme
    var mode by remember { mutableStateOf(JoinMode.Browse) }
    var code by remember { mutableStateOf("") }
    var selectedType by remember { mutableStateOf(tenantTypes.first()) }
    var tenantQuery by remember { mutableStateOf("") }
    var tenants by remember { mutableStateOf<List<TenantSummary>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    BackHandler(onBack = onBack)

    LaunchedEffect(selectedType.id, subscribedTenantIds, tenantQuery) {
        loading = true
        tenants = runCatching { repository.searchTenants(tenantQuery.trim(), selectedType.id) }
            .map { list -> list.filterNot { tenant -> subscribedTenantIds.contains(tenant.companyId) } }
            .getOrElse { emptyList() }
        loading = false
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    listOf(
                        colorScheme.surface,
                        colorScheme.surfaceVariant.copy(alpha = 0.35f),
                        colorScheme.surface
                    )
                )
            )
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp, vertical = 32.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Spacer(Modifier.height(12.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            JoinActionTile(
                label = "Enter tenant\ncode",
                icon = Icons.Rounded.Tag,
                selected = mode == JoinMode.Code,
                modifier = Modifier.weight(1f),
                onClick = { mode = JoinMode.Code }
            )
            JoinActionTile(
                label = "Scan QR",
                icon = Icons.Rounded.QrCodeScanner,
                selected = mode == JoinMode.Scan,
                modifier = Modifier.weight(1f),
                onClick = {
                    mode = JoinMode.Scan
                    onScanQr()
                }
            )
            JoinActionTile(
                label = "Browse\ntenant",
                icon = Icons.Rounded.Business,
                selected = mode == JoinMode.Browse,
                modifier = Modifier.weight(1f),
                onClick = { mode = JoinMode.Browse }
            )
        }

        Spacer(Modifier.height(26.dp))

        when (mode) {
            JoinMode.Code -> CodeJoinPanel(code = code, onCodeChange = { code = it }, onJoin = { onJoinWithCode(code) })
            JoinMode.Scan -> ScanPanel(onScanQr = onScanQr)
            JoinMode.Browse -> BrowseByTypePanel(
                selectedType = selectedType,
                onTypeSelected = { selectedType = it },
                tenantQuery = tenantQuery,
                onTenantQueryChange = { tenantQuery = it },
                tenants = tenants,
                loading = loading,
                onSelectTenant = { tenant -> onJoinPublicTenant(tenant.companyId) }
            )
        }
    }
}

@Composable
private fun JoinActionTile(label: String, icon: ImageVector, selected: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val colorScheme = MaterialTheme.colorScheme
    Surface(
        modifier = modifier
            .height(104.dp)
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(18.dp),
        color = if (selected) colorScheme.primary.copy(alpha = 0.08f) else colorScheme.surface,
        contentColor = if (selected) colorScheme.primary else colorScheme.onSurface,
        border = androidx.compose.foundation.BorderStroke(
            width = if (selected) 1.6.dp else 1.dp,
            color = if (selected) colorScheme.primary else colorScheme.outlineVariant.copy(alpha = 0.70f)
        ),
        tonalElevation = if (selected) 2.dp else 0.dp
    ) {
        Column(
            modifier = Modifier.fillMaxSize().padding(horizontal = 8.dp, vertical = 12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Icon(icon, contentDescription = null, modifier = Modifier.size(25.dp))
            Spacer(Modifier.height(10.dp))
            Text(label, style = MaterialTheme.typography.labelMedium, textAlign = TextAlign.Center, fontWeight = FontWeight.SemiBold, lineHeight = MaterialTheme.typography.labelMedium.lineHeight)
        }
    }
}

@Composable
private fun CodeJoinPanel(code: String, onCodeChange: (String) -> Unit, onJoin: () -> Unit) {
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Tenant code", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(value = code, onValueChange = onCodeChange, modifier = Modifier.weight(1f), singleLine = true, shape = RoundedCornerShape(18.dp))
            Button(onClick = onJoin, shape = RoundedCornerShape(18.dp), modifier = Modifier.height(56.dp)) { Text("Join") }
        }
    }
}

@Composable
private fun ScanPanel(onScanQr: () -> Unit) {
    Surface(
        modifier = Modifier.fillMaxWidth().height(180.dp).clickable(onClick = onScanQr),
        shape = RoundedCornerShape(28.dp),
        color = MaterialTheme.colorScheme.surface,
        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.7f))
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            Icon(Icons.Rounded.QrCodeScanner, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(42.dp))
            Spacer(Modifier.height(12.dp))
            Text("Camera preview", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Text("Align the provider QR in the frame.", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun BrowseByTypePanel(
    selectedType: TenantTypeOption,
    onTypeSelected: (TenantTypeOption) -> Unit,
    tenantQuery: String,
    onTenantQueryChange: (String) -> Unit,
    tenants: List<TenantSummary>,
    loading: Boolean,
    onSelectTenant: (TenantSummary) -> Unit
) {
    OutlinedTextField(
        value = tenantQuery,
        onValueChange = { incoming ->
            val normalized = if (incoming.isNotEmpty()) {
                incoming.replaceFirstChar { if (it.isLowerCase()) it.titlecase() else it.toString() }
            } else {
                incoming
            }
            onTenantQueryChange(normalized)
        },
        singleLine = true,
        modifier = Modifier.fillMaxWidth(),
        placeholder = { Text("Search tenant") },
        leadingIcon = { Icon(Icons.Rounded.Search, contentDescription = null) },
        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences)
    )
    Spacer(Modifier.height(12.dp))
    TenantTypeDropdown(selectedType = selectedType, onTypeSelected = onTypeSelected)
    Spacer(Modifier.height(26.dp))
    if (loading && tenants.isEmpty()) {
        CircularProgressIndicator(modifier = Modifier.padding(top = 60.dp))
    } else if (tenants.isEmpty()) {
        EmptyTenantCarousel(selectedType.label)
    } else {
        TenantCarousel(tenants = tenants, onSelectTenant = onSelectTenant)
    }
}

@Composable
@OptIn(ExperimentalMaterial3Api::class)
private fun TenantTypeDropdown(selectedType: TenantTypeOption, onTypeSelected: (TenantTypeOption) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = !expanded }) {
        OutlinedTextField(
            value = selectedType.label,
            onValueChange = {},
            readOnly = true,
            singleLine = true,
            modifier = Modifier
                .menuAnchor()
                .fillMaxWidth(),
            label = { Text("Tenant Type") },
            trailingIcon = {
                Icon(Icons.Rounded.KeyboardArrowDown, contentDescription = null)
            }
        )
        ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            tenantTypes.forEach { option ->
                DropdownMenuItem(
                    text = { Text(option.label) },
                    onClick = {
                        onTypeSelected(option)
                        expanded = false
                    }
                )
            }
        }
    }
}

@Composable
private fun TenantCarousel(tenants: List<TenantSummary>, onSelectTenant: (TenantSummary) -> Unit) {
    val pagerState = rememberPagerState(pageCount = { tenants.size })
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Box(modifier = Modifier.fillMaxWidth().height(380.dp), contentAlignment = Alignment.Center) {
            HorizontalPager(
                state = pagerState,
                contentPadding = PaddingValues(horizontal = 48.dp),
                pageSpacing = (-10).dp,
                modifier = Modifier.fillMaxSize()
            ) { page ->
                val offset = ((pagerState.currentPage - page) + pagerState.currentPageOffsetFraction).absoluteValue
                val scale = 1f - (offset.coerceIn(0f, 1f) * 0.12f)
                val alpha = 1f - (offset.coerceIn(0f, 1f) * 0.28f)
                TenantCarouselCard(
                    tenant = tenants[page],
                    modifier = Modifier
                        .graphicsLayer {
                            scaleX = scale
                            scaleY = scale
                            this.alpha = alpha
                        },
                    onSelect = { onSelectTenant(tenants[page]) }
                )
            }
        }
        Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            tenants.forEachIndexed { index, _ ->
                Box(
                    modifier = Modifier
                        .size(if (index == pagerState.currentPage) 9.dp else 7.dp)
                        .clip(CircleShape)
                        .background(if (index == pagerState.currentPage) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant)
                )
            }
        }
        Spacer(Modifier.height(12.dp))
    }
}

@Composable
private fun TenantCarouselCard(tenant: TenantSummary, modifier: Modifier = Modifier, onSelect: () -> Unit) {
    val colorScheme = MaterialTheme.colorScheme
    Surface(
        modifier = modifier
            .width(260.dp)
            .fillMaxHeight()
            .shadow(18.dp, RoundedCornerShape(30.dp), clip = false),
        shape = RoundedCornerShape(30.dp),
        color = colorScheme.surface,
        border = androidx.compose.foundation.BorderStroke(1.dp, colorScheme.outlineVariant.copy(alpha = 0.55f))
    ) {
        Column(Modifier.padding(14.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(150.dp)
                    .clip(RoundedCornerShape(24.dp))
                    .then(
                        if (tenant.cardImageUrl.isNullOrBlank()) {
                            Modifier.background(colorScheme.surfaceVariant.copy(alpha = 0.45f))
                        } else {
                            Modifier
                        }
                    )
            ) {
                if (!tenant.cardImageUrl.isNullOrBlank()) {
                    AsyncImage(
                        model = tenant.cardImageUrl,
                        contentDescription = tenant.companyName,
                        modifier = Modifier.fillMaxSize(),
                        contentScale = ContentScale.Crop
                    )
                }
                TenantLogo(tenant, Modifier.align(Alignment.Center))
            }
            Surface(
                modifier = Modifier.offset(y = (-14).dp),
                shape = RoundedCornerShape(999.dp),
                color = colorScheme.primaryContainer,
                contentColor = colorScheme.onPrimaryContainer
            ) {
                Row(Modifier.padding(horizontal = 10.dp, vertical = 5.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    Icon(Icons.Rounded.Star, contentDescription = null, modifier = Modifier.size(14.dp))
                    Text("Popular nearby", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                }
            }
            Text(tenant.companyName, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.ExtraBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            val tenantTypeLabel = tenantTypeLabel(tenant.tenantType)
            if (tenantTypeLabel != null) {
                Spacer(Modifier.height(8.dp))
                Surface(
                    shape = RoundedCornerShape(999.dp),
                    color = colorScheme.secondaryContainer,
                    contentColor = colorScheme.onSecondaryContainer
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Icon(Icons.Rounded.Business, contentDescription = null, modifier = Modifier.size(13.dp))
                        Text(tenantTypeLabel, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center) {
                Icon(Icons.Rounded.LocationOn, contentDescription = null, modifier = Modifier.size(17.dp), tint = colorScheme.onSurfaceVariant)
                Spacer(Modifier.width(4.dp))
                Text(listOfNotNull(tenant.publicCity, "0.${(tenant.companyId.hashCode().absoluteValue % 8) + 2} km").joinToString(" • "), color = colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodyMedium, maxLines = 1)
            }
            Spacer(Modifier.height(12.dp))
            Text(
                tenant.publicDescription.orEmpty(),
                style = MaterialTheme.typography.bodyMedium,
                color = colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(20.dp)
            )
            Spacer(Modifier.height(6.dp))
            Button(onClick = onSelect, modifier = Modifier.fillMaxWidth().height(52.dp), shape = RoundedCornerShape(18.dp)) {
                Text("Select tenancy", fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun TenantLogo(tenant: TenantSummary, modifier: Modifier = Modifier) {
    val colorScheme = MaterialTheme.colorScheme
    Surface(
        modifier = modifier.size(82.dp),
        shape = CircleShape,
        color = colorScheme.inverseSurface.copy(alpha = 0.92f),
        contentColor = colorScheme.inverseOnSurface,
        shadowElevation = 6.dp
    ) {
        Box(contentAlignment = Alignment.Center) {
            if (!tenant.logoImageUrl.isNullOrBlank()) {
                AsyncImage(
                    model = tenant.logoImageUrl,
                    contentDescription = "${tenant.companyName} logo",
                    modifier = Modifier.fillMaxSize().clip(CircleShape),
                    contentScale = ContentScale.Crop
                )
            } else {
                Text(tenant.companyName.initials(), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.ExtraBold, textAlign = TextAlign.Center)
            }
        }
    }
}

@Composable
private fun EmptyTenantCarousel(typeLabel: String) {
    Surface(
        modifier = Modifier.fillMaxWidth().height(220.dp),
        shape = RoundedCornerShape(30.dp),
        color = MaterialTheme.colorScheme.surface,
        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center, modifier = Modifier.padding(24.dp)) {
            Icon(Icons.Rounded.CenterFocusStrong, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(36.dp))
            Spacer(Modifier.height(12.dp))
            Text("No public ${typeLabel.lowercase()} tenants yet", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Text("Only active tenants with Public discoverable ON appear here.", textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
        }
    }
}

private fun String.initials(): String = trim()
    .split(Regex("\\s+"))
    .filter { it.isNotBlank() }
    .take(2)
    .joinToString("") { it.first().uppercaseChar().toString() }
    .ifBlank { "C" }

private fun tenantTypeLabel(raw: String?): String? = when (raw?.trim()?.lowercase()) {
    "salon" -> "Salon"
    "gym" -> "Gym"
    "spa" -> "Spa"
    "therapy" -> "Therapy"
    null, "" -> null
    else -> raw
}
