package si.calendra.guest.android.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.wrapContentWidth
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Apartment
import androidx.compose.material.icons.rounded.Business
import androidx.compose.material.icons.rounded.ContentCut
import androidx.compose.material.icons.rounded.FitnessCenter
import androidx.compose.material.icons.rounded.LocalHospital
import androidx.compose.material.icons.rounded.LocationOn
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Spa
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import coil.compose.AsyncImage
import si.calendra.guest.android.R
import si.calendra.guest.shared.models.TenantSummary
import si.calendra.guest.shared.repository.GuestRepository
import kotlin.math.absoluteValue

private enum class JoinMode { Code, Scan, Browse }

private data class TenantTypeOption(
    val id: String?,
    val label: String,
    val icon: ImageVector? = null
)

private val tenantTypes = listOf(
    TenantTypeOption(null, "All"),
    TenantTypeOption("salon", "Salon", Icons.Rounded.ContentCut),
    TenantTypeOption("gym", "Gym", Icons.Rounded.FitnessCenter),
    TenantTypeOption("spa", "Spa", Icons.Rounded.Spa),
    TenantTypeOption("therapy", "Therapy", Icons.Rounded.LocalHospital)
)

private val CalendraBlue = Color(0xFF1568F4)
private val CalendraBlueDark = Color(0xFF0F4FCC)
private val CalendraOrange = Color(0xFFFF9D1B)
private val PageBackground = Color(0xFFF5F6FA)
private val SoftOutline = Color(0xFFDDE3EF)
private val SoftText = Color(0xFF667693)
private val TitleText = Color(0xFF13264A)

@Composable
fun JoinTenantScreen(
    repository: GuestRepository,
    subscribedTenantIds: Set<String> = emptySet(),
    onJoinWithCode: (String) -> Unit,
    onJoinPublicTenant: (String) -> Unit,
    onScanQr: () -> Unit,
    onBack: () -> Unit
) {
    var mode by remember { mutableStateOf(JoinMode.Browse) }
    var showCodeDialog by remember { mutableStateOf(false) }
    var showScanDialog by remember { mutableStateOf(false) }
    var code by remember { mutableStateOf("") }
    var selectedType by remember { mutableStateOf(tenantTypes.first()) }
    var tenantQuery by remember { mutableStateOf("") }
    var tenants by remember { mutableStateOf<List<TenantSummary>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }

    BackHandler(onBack = onBack)

    LaunchedEffect(selectedType.id, subscribedTenantIds, tenantQuery) {
        loading = true
        tenants = runCatching { repository.searchTenants(tenantQuery.trim(), selectedType.id) }
            .map { list -> list.filterNot { tenant -> subscribedTenantIds.contains(tenant.companyId) } }
            .getOrElse { emptyList() }
        loading = false
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(PageBackground)
    ) {
        Image(
            painter = painterResource(id = R.drawable.add_tenant_background),
            contentDescription = null,
            modifier = Modifier.fillMaxSize(),
            contentScale = ContentScale.Crop
        )

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 22.dp, vertical = 16.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            BrandHeader()
            Spacer(Modifier.height(14.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                JoinModeTile(
                    label = "Enter tenant code",
                    mode = JoinMode.Code,
                    selected = mode == JoinMode.Code,
                    modifier = Modifier.weight(1f),
                    onClick = {
                        mode = JoinMode.Code
                        showCodeDialog = true
                    }
                )
                JoinModeTile(
                    label = "Scan QR",
                    mode = JoinMode.Scan,
                    selected = mode == JoinMode.Scan,
                    modifier = Modifier.weight(1f),
                    onClick = {
                        mode = JoinMode.Scan
                        showScanDialog = true
                    }
                )
                JoinModeTile(
                    label = "Browse tenant",
                    mode = JoinMode.Browse,
                    selected = mode == JoinMode.Browse,
                    modifier = Modifier.weight(1f),
                    onClick = { mode = JoinMode.Browse }
                )
            }

            Spacer(Modifier.height(18.dp))

            SearchField(
                value = tenantQuery,
                onValueChange = { incoming ->
                    tenantQuery = if (incoming.isNotEmpty()) {
                        incoming.replaceFirstChar { if (it.isLowerCase()) it.titlecase() else it.toString() }
                    } else incoming
                }
            )

            Spacer(Modifier.height(14.dp))

            TenantTypeChips(selectedType = selectedType, onTypeSelected = { selectedType = it })

            Spacer(Modifier.height(16.dp))

            when {
                loading -> LoadingTenantCard()
                tenants.isEmpty() -> EmptyTenantCard()
                else -> TenantCarousel(tenants = tenants, onSelectTenant = { onJoinPublicTenant(it.companyId) })
            }

            Spacer(Modifier.height(20.dp))
        }

        if (showCodeDialog) {
            JoinWithCodePopup(
                code = code,
                onCodeChange = { code = it },
                onDismiss = { showCodeDialog = false },
                onJoin = {
                    showCodeDialog = false
                    onJoinWithCode(code)
                }
            )
        }

        if (showScanDialog) {
            ScanQrPopup(
                onDismiss = { showScanDialog = false },
                onOpenScanner = {
                    showScanDialog = false
                    onScanQr()
                }
            )
        }
    }
}

@Composable
private fun BrandHeader() {
    Image(
        painter = painterResource(id = R.drawable.calendra_logo),
        contentDescription = "Calendra",
        modifier = Modifier
            .fillMaxWidth()
            .height(42.dp)
            .wrapContentWidth(Alignment.Start),
        contentScale = ContentScale.Fit,
        alignment = Alignment.CenterStart
    )
}

@Composable
private fun TitleBlock() {
    Column(modifier = Modifier.fillMaxWidth()) {
        Text(
            "Add tenant",
            color = TitleText,
            style = MaterialTheme.typography.headlineLarge.copy(fontSize = 28.sp),
            fontWeight = FontWeight.ExtraBold
        )
        Spacer(Modifier.height(4.dp))
        Text(
            "Find and add a tenant to your property",
            color = SoftText,
            style = MaterialTheme.typography.bodyLarge.copy(fontSize = 16.sp)
        )
    }
}

@Composable
private fun JoinModeTile(
    label: String,
    mode: JoinMode,
    selected: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    Surface(
        modifier = modifier
            .height(102.dp)
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(20.dp),
        color = Color.White,
        border = androidx.compose.foundation.BorderStroke(
            width = if (selected) 1.6.dp else 1.dp,
            color = if (selected) CalendraBlue else SoftOutline
        ),
        shadowElevation = if (selected) 3.dp else 0.dp
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 8.dp, vertical = 12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            JoinModeGlyph(mode = mode)
            Spacer(Modifier.height(10.dp))
            Text(
                label,
                color = TitleText,
                style = MaterialTheme.typography.titleSmall.copy(fontSize = 15.sp),
                fontWeight = FontWeight.SemiBold,
                textAlign = TextAlign.Center,
                lineHeight = 17.sp,
                maxLines = 2
            )
            Spacer(Modifier.height(8.dp))
            Box(
                modifier = Modifier
                    .width(34.dp)
                    .height(3.dp)
                    .clip(RoundedCornerShape(999.dp))
                    .background(if (selected) CalendraBlue else Color.Transparent)
            )
        }
    }
}

@Composable
private fun JoinModeGlyph(mode: JoinMode) {
    when (mode) {
        JoinMode.Code -> CodeGlyph()
        JoinMode.Scan -> ScanGlyph()
        JoinMode.Browse -> BrowseGlyph()
    }
}

@Composable
private fun CodeGlyph() {
    Box(
        modifier = Modifier
            .size(width = 34.dp, height = 26.dp)
            .border(2.dp, CalendraBlue, RoundedCornerShape(8.dp)),
        contentAlignment = Alignment.Center
    ) {
        Text("</>", color = CalendraOrange, fontSize = 11.sp, fontWeight = FontWeight.ExtraBold)
    }
}

@Composable
private fun ScanGlyph() {
    Canvas(modifier = Modifier.size(28.dp)) {
        val blue = CalendraBlue
        val orange = CalendraOrange
        val stroke = 2.4.dp.toPx()
        val short = size.minDimension * 0.24f
        val inset = size.minDimension * 0.12f
        // corners
        drawLine(blue, Offset(inset, inset + short), Offset(inset, inset), strokeWidth = stroke, cap = StrokeCap.Round)
        drawLine(blue, Offset(inset, inset), Offset(inset + short, inset), strokeWidth = stroke, cap = StrokeCap.Round)
        drawLine(blue, Offset(size.width - inset - short, inset), Offset(size.width - inset, inset), strokeWidth = stroke, cap = StrokeCap.Round)
        drawLine(blue, Offset(size.width - inset, inset), Offset(size.width - inset, inset + short), strokeWidth = stroke, cap = StrokeCap.Round)
        drawLine(blue, Offset(inset, size.height - inset - short), Offset(inset, size.height - inset), strokeWidth = stroke, cap = StrokeCap.Round)
        drawLine(blue, Offset(inset, size.height - inset), Offset(inset + short, size.height - inset), strokeWidth = stroke, cap = StrokeCap.Round)
        drawLine(blue, Offset(size.width - inset - short, size.height - inset), Offset(size.width - inset, size.height - inset), strokeWidth = stroke, cap = StrokeCap.Round)
        drawLine(blue, Offset(size.width - inset, size.height - inset - short), Offset(size.width - inset, size.height - inset), strokeWidth = stroke, cap = StrokeCap.Round)
        // small nodes
        val node = size.minDimension * 0.10f
        drawRect(blue, topLeft = Offset(size.width * 0.38f, size.height * 0.34f), size = Size(node, node))
        drawRect(blue, topLeft = Offset(size.width * 0.54f, size.height * 0.34f), size = Size(node, node))
        drawRect(blue, topLeft = Offset(size.width * 0.38f, size.height * 0.50f), size = Size(node, node))
        // orange magnifier
        val r = size.minDimension * 0.14f
        drawCircle(orange, radius = r, center = Offset(size.width * 0.76f, size.height * 0.70f), style = androidx.compose.ui.graphics.drawscope.Stroke(width = stroke))
        drawLine(orange, Offset(size.width * 0.82f, size.height * 0.76f), Offset(size.width * 0.91f, size.height * 0.87f), strokeWidth = stroke, cap = StrokeCap.Round)
    }
}

@Composable
private fun BrowseGlyph() {
    Box(modifier = Modifier.size(30.dp), contentAlignment = Alignment.Center) {
        Icon(Icons.Rounded.Apartment, contentDescription = null, tint = CalendraBlue, modifier = Modifier.size(24.dp))
        Box(
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .offset(x = (-1).dp, y = (-1).dp)
                .size(width = 8.dp, height = 10.dp)
                .clip(RoundedCornerShape(2.dp))
                .background(CalendraOrange)
        )
    }
}

@Composable
private fun SearchField(value: String, onValueChange: (String) -> Unit) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        singleLine = true,
        modifier = Modifier
            .fillMaxWidth()
            .height(44.dp),
        shape = RoundedCornerShape(18.dp),
        placeholder = { Text("Search tenant", color = Color(0xFFA0AAC0), fontSize = 15.sp) },
        leadingIcon = { Icon(Icons.Rounded.Search, contentDescription = null, tint = SoftText, modifier = Modifier.size(20.dp)) },
        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences)
    )
}

@Composable
private fun TenantTypeChips(selectedType: TenantTypeOption, onTypeSelected: (TenantTypeOption) -> Unit) {
    LazyRow(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        contentPadding = PaddingValues(horizontal = 2.dp)
    ) {
        items(tenantTypes) { option ->
            val selected = option == selectedType
            Surface(
                modifier = Modifier.clickable { onTypeSelected(option) },
                shape = RoundedCornerShape(999.dp),
                color = if (selected) CalendraBlue else Color.White,
                border = androidx.compose.foundation.BorderStroke(1.dp, if (selected) CalendraBlue else SoftOutline)
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    option.icon?.let {
                        Icon(it, contentDescription = null, modifier = Modifier.size(14.dp), tint = if (selected) Color.White else CalendraBlue)
                    }
                    Text(
                        option.label,
                        color = if (selected) Color.White else CalendraBlue,
                        style = MaterialTheme.typography.labelLarge.copy(fontSize = 14.sp),
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }
        }
    }
}

@Composable
private fun TenantCarousel(tenants: List<TenantSummary>, onSelectTenant: (TenantSummary) -> Unit) {
    val pagerState = rememberPagerState(pageCount = { tenants.size })

    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Box(modifier = Modifier.fillMaxWidth().height(430.dp), contentAlignment = Alignment.Center) {
            HorizontalPager(
                state = pagerState,
                contentPadding = PaddingValues(horizontal = 6.dp),
                pageSpacing = 14.dp,
                modifier = Modifier.fillMaxSize()
            ) { page ->
                val offset = ((pagerState.currentPage - page) + pagerState.currentPageOffsetFraction).absoluteValue
                val scale = 1f - (offset.coerceIn(0f, 1f) * 0.10f)
                val alpha = 1f - (offset.coerceIn(0f, 1f) * 0.32f)
                TenantCarouselCard(
                    tenant = tenants[page],
                    modifier = Modifier.graphicsLayer {
                        scaleX = scale
                        scaleY = scale
                        this.alpha = alpha
                    },
                    onSelect = { onSelectTenant(tenants[page]) }
                )
            }
        }

        Spacer(Modifier.height(6.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            tenants.forEachIndexed { index, _ ->
                Box(
                    modifier = Modifier
                        .size(if (index == pagerState.currentPage) 9.dp else 7.dp)
                        .clip(CircleShape)
                        .background(if (index == pagerState.currentPage) CalendraBlue else Color(0xFFD7DDE8))
                )
            }
        }
    }
}

@Composable
private fun TenantCarouselCard(tenant: TenantSummary, modifier: Modifier = Modifier, onSelect: () -> Unit) {
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .fillMaxHeight()
            .shadow(14.dp, RoundedCornerShape(28.dp), clip = false),
        shape = RoundedCornerShape(28.dp),
        color = Color.White,
        border = androidx.compose.foundation.BorderStroke(1.dp, SoftOutline)
    ) {
        Column(modifier = Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(164.dp)
                    .clip(RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp, bottomStart = 26.dp, bottomEnd = 26.dp))
                    .background(Color(0xFFF0F4FA))
            ) {
                if (!tenant.cardImageUrl.isNullOrBlank()) {
                    AsyncImage(
                        model = tenant.cardImageUrl,
                        contentDescription = tenant.companyName,
                        modifier = Modifier.fillMaxSize(),
                        contentScale = ContentScale.Crop
                    )
                } else {
                    Box(
                        modifier = Modifier.fillMaxSize().background(
                            Brush.linearGradient(colors = listOf(Color(0xFFF5F7FB), Color(0xFFE6EDF9)))
                        )
                    )
                    Icon(
                        tenantTypeIcon(tenant.tenantType),
                        contentDescription = null,
                        tint = CalendraBlue.copy(alpha = 0.72f),
                        modifier = Modifier.align(Alignment.Center).size(50.dp)
                    )
                }

                Surface(
                    modifier = Modifier.align(Alignment.BottomCenter).offset(y = 34.dp).size(78.dp),
                    shape = CircleShape,
                    color = Color.White,
                    shadowElevation = 7.dp
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
                            Text(tenant.companyName.initials(), color = CalendraBlue, fontSize = 23.sp, fontWeight = FontWeight.ExtraBold)
                        }
                    }
                }
            }

            Spacer(Modifier.height(44.dp))
            Text(
                tenant.companyName,
                color = TitleText,
                style = MaterialTheme.typography.headlineMedium.copy(fontSize = 24.sp),
                fontWeight = FontWeight.ExtraBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(horizontal = 20.dp)
            )

            tenantTypeLabel(tenant.tenantType)?.let { typeLabel ->
                Spacer(Modifier.height(8.dp))
                Surface(shape = RoundedCornerShape(999.dp), color = Color(0xFFEAF1FF)) {
                    Row(
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Icon(tenantTypeIcon(tenant.tenantType), contentDescription = null, modifier = Modifier.size(13.dp), tint = CalendraBlue)
                        Text(typeLabel, color = CalendraBlue, style = MaterialTheme.typography.labelMedium.copy(fontSize = 13.sp), fontWeight = FontWeight.SemiBold)
                    }
                }
            }

            Spacer(Modifier.height(10.dp))
            Row(modifier = Modifier.padding(horizontal = 20.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center) {
                Icon(Icons.Rounded.LocationOn, contentDescription = null, modifier = Modifier.size(17.dp), tint = SoftText)
                Spacer(Modifier.width(3.dp))
                Text(
                    tenant.publicCity?.ifBlank { tenant.companyAddress.orEmpty() }?.ifBlank { "Location available on profile" }
                        ?: "Location available on profile",
                    color = SoftText,
                    style = MaterialTheme.typography.bodyMedium.copy(fontSize = 14.sp),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }

            Spacer(Modifier.height(10.dp))
            Text(
                tenant.publicDescription?.ifBlank { "Discover this tenant and continue to booking." }
                    ?: "Discover this tenant and continue to booking.",
                color = SoftText,
                style = MaterialTheme.typography.bodyMedium.copy(fontSize = 14.sp),
                textAlign = TextAlign.Center,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.fillMaxWidth().height(40.dp).padding(horizontal = 22.dp)
            )

            Spacer(Modifier.weight(1f))
            Button(
                onClick = onSelect,
                modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp).height(50.dp),
                shape = RoundedCornerShape(17.dp)
            ) {
                Text("Select tenancy", fontWeight = FontWeight.Bold, fontSize = 17.sp)
            }
            Spacer(Modifier.height(20.dp))
        }
    }
}


@Composable
private fun JoinWithCodePopup(
    code: String,
    onCodeChange: (String) -> Unit,
    onDismiss: () -> Unit,
    onJoin: () -> Unit
) {
    Dialog(onDismissRequest = onDismiss) {
        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(28.dp),
            color = Color.White,
            shadowElevation = 18.dp
        ) {
            Column(modifier = Modifier.padding(20.dp)) {
                Text("Join with tenant code", color = TitleText, fontSize = 22.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(4.dp))
                Text("Enter the code provided by the tenant.", color = SoftText, fontSize = 14.sp)
                Spacer(Modifier.height(16.dp))
                OutlinedTextField(
                    value = code,
                    onValueChange = onCodeChange,
                    modifier = Modifier.fillMaxWidth().height(54.dp),
                    singleLine = true,
                    placeholder = { Text("e.g. TEN-7X9K", fontSize = 14.sp) },
                    leadingIcon = { CodeGlyph() },
                    shape = RoundedCornerShape(16.dp)
                )
                Spacer(Modifier.height(18.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
                    Surface(
                        modifier = Modifier.weight(1f).height(50.dp).clickable(onClick = onDismiss),
                        shape = RoundedCornerShape(16.dp),
                        color = Color.White,
                        border = androidx.compose.foundation.BorderStroke(1.dp, SoftOutline)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Text("Cancel", color = CalendraBlue, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                        }
                    }
                    Button(
                        onClick = onJoin,
                        modifier = Modifier.weight(1f).height(50.dp),
                        shape = RoundedCornerShape(16.dp)
                    ) {
                        Text("Join", fontSize = 16.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}

@Composable
private fun ScanQrPopup(onDismiss: () -> Unit, onOpenScanner: () -> Unit) {
    Dialog(onDismissRequest = onDismiss) {
        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(28.dp),
            color = Color.White,
            shadowElevation = 18.dp
        ) {
            Column(modifier = Modifier.padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Text("Scan QR", color = TitleText, fontSize = 22.sp, fontWeight = FontWeight.Bold, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(4.dp))
                Text("Align the provider QR in the frame.", color = SoftText, fontSize = 14.sp, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(16.dp))
                Surface(
                    modifier = Modifier.fillMaxWidth().height(210.dp),
                    shape = RoundedCornerShape(24.dp),
                    color = Color(0xFFF6F8FC),
                    border = androidx.compose.foundation.BorderStroke(1.dp, SoftOutline)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Canvas(modifier = Modifier.fillMaxSize().padding(28.dp)) {
                            val stroke = 4.dp.toPx()
                            val corner = 42.dp.toPx()
                            val inset = 18.dp.toPx()
                            val w = size.width
                            val h = size.height
                            drawLine(CalendraBlue, Offset(inset, inset + corner), Offset(inset, inset), strokeWidth = stroke, cap = StrokeCap.Round)
                            drawLine(CalendraBlue, Offset(inset, inset), Offset(inset + corner, inset), strokeWidth = stroke, cap = StrokeCap.Round)
                            drawLine(CalendraBlue, Offset(w - inset - corner, inset), Offset(w - inset, inset), strokeWidth = stroke, cap = StrokeCap.Round)
                            drawLine(CalendraBlue, Offset(w - inset, inset), Offset(w - inset, inset + corner), strokeWidth = stroke, cap = StrokeCap.Round)
                            drawLine(CalendraBlue, Offset(inset, h - inset - corner), Offset(inset, h - inset), strokeWidth = stroke, cap = StrokeCap.Round)
                            drawLine(CalendraBlue, Offset(inset, h - inset), Offset(inset + corner, h - inset), strokeWidth = stroke, cap = StrokeCap.Round)
                            drawLine(CalendraBlue, Offset(w - inset - corner, h - inset), Offset(w - inset, h - inset), strokeWidth = stroke, cap = StrokeCap.Round)
                            drawLine(CalendraBlue, Offset(w - inset, h - inset - corner), Offset(w - inset, h - inset), strokeWidth = stroke, cap = StrokeCap.Round)
                            drawLine(CalendraOrange, Offset(w * 0.20f, h * 0.52f), Offset(w * 0.80f, h * 0.52f), strokeWidth = 3.dp.toPx(), cap = StrokeCap.Round)
                        }
                        ScanGlyph()
                    }
                }
                Spacer(Modifier.height(18.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
                    Surface(
                        modifier = Modifier.weight(1f).height(50.dp).clickable(onClick = onDismiss),
                        shape = RoundedCornerShape(16.dp),
                        color = Color.White,
                        border = androidx.compose.foundation.BorderStroke(1.dp, SoftOutline)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Text("Cancel", color = CalendraBlue, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                        }
                    }
                    Button(
                        onClick = onOpenScanner,
                        modifier = Modifier.weight(1f).height(50.dp),
                        shape = RoundedCornerShape(16.dp)
                    ) {
                        Text("Open scanner", fontSize = 16.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}

@Composable
private fun JoinWithCodeSection(code: String, onCodeChange: (String) -> Unit, onJoin: () -> Unit) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(24.dp),
        color = Color.White,
        border = androidx.compose.foundation.BorderStroke(1.dp, SoftOutline),
        shadowElevation = 3.dp
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text("Join with tenant code", color = TitleText, style = MaterialTheme.typography.titleLarge.copy(fontSize = 22.sp), fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(2.dp))
            Text("Already have a code? Enter it below.", color = SoftText, style = MaterialTheme.typography.bodyMedium.copy(fontSize = 14.sp))
            Spacer(Modifier.height(12.dp))
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(
                    value = code,
                    onValueChange = onCodeChange,
                    modifier = Modifier.weight(1f).height(54.dp),
                    singleLine = true,
                    placeholder = { Text("e.g. TEN-7X9K", fontSize = 14.sp) },
                    shape = RoundedCornerShape(16.dp)
                )
                Button(
                    onClick = onJoin,
                    modifier = Modifier.wrapContentWidth().height(54.dp),
                    shape = RoundedCornerShape(16.dp)
                ) {
                    Text("Join", fontWeight = FontWeight.Bold, fontSize = 16.sp)
                }
            }
        }
    }
}

@Composable
private fun LoadingTenantCard() {
    Surface(
        modifier = Modifier.fillMaxWidth().height(380.dp),
        shape = RoundedCornerShape(28.dp),
        color = Color.White,
        border = androidx.compose.foundation.BorderStroke(1.dp, SoftOutline)
    ) {
        Box(contentAlignment = Alignment.Center) {
            Text("Loading tenants…", color = SoftText, style = MaterialTheme.typography.titleMedium.copy(fontSize = 18.sp))
        }
    }
}

@Composable
private fun EmptyTenantCard() {
    Surface(
        modifier = Modifier.fillMaxWidth().height(380.dp),
        shape = RoundedCornerShape(28.dp),
        color = Color.White,
        border = androidx.compose.foundation.BorderStroke(1.dp, SoftOutline)
    ) {
        Column(
            modifier = Modifier.fillMaxSize().padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Icon(Icons.Rounded.Business, contentDescription = null, tint = CalendraBlue, modifier = Modifier.size(36.dp))
            Spacer(Modifier.height(14.dp))
            Text("No public tenants found", color = TitleText, style = MaterialTheme.typography.titleLarge.copy(fontSize = 22.sp), fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
            Spacer(Modifier.height(6.dp))
            Text("Try another category or search term.", color = SoftText, style = MaterialTheme.typography.bodyMedium.copy(fontSize = 14.sp), textAlign = TextAlign.Center)
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

private fun tenantTypeIcon(raw: String?): ImageVector = when (raw?.trim()?.lowercase()) {
    "salon" -> Icons.Rounded.ContentCut
    "gym" -> Icons.Rounded.FitnessCenter
    "spa" -> Icons.Rounded.Spa
    "therapy" -> Icons.Rounded.LocalHospital
    else -> Icons.Rounded.Business
}
