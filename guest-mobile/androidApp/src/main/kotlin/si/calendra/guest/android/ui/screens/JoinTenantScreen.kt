package si.calendra.guest.android.ui.screens

import com.journeyapps.barcodescanner.DefaultDecoderFactory
import com.journeyapps.barcodescanner.DecoratedBarcodeView
import com.journeyapps.barcodescanner.BarcodeResult
import com.journeyapps.barcodescanner.BarcodeCallback
import com.google.zxing.BarcodeFormat
import androidx.core.content.ContextCompat
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.runtime.DisposableEffect
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.compose.rememberLauncherForActivityResult
import android.content.pm.PackageManager
import android.Manifest
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.aspectRatio
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
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.requiredWidth
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
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.ContentCut
import androidx.compose.material.icons.rounded.FitnessCenter
import androidx.compose.material.icons.rounded.LocalHospital
import androidx.compose.material.icons.rounded.LocationOn
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Spa
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
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
import androidx.compose.ui.geometry.CornerRadius
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
    languageCode: String,
    subscribedTenantIds: Set<String> = emptySet(),
    onJoinWithCode: (String) -> Unit,
    onJoinPublicTenant: (String) -> Unit,
    onQrScanned: (String) -> Unit,
    onBack: () -> Unit
) {
    val isSl = languageCode.lowercase().startsWith("sl")
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
                .statusBarsPadding()
                .verticalScroll(rememberScrollState())
                .padding(top = 0.dp, bottom = 16.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            BrandHeader(
                modifier = Modifier.padding(start = 12.dp, end = 4.dp)
            )

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = 22.dp, end = 22.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Spacer(Modifier.height(10.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    JoinModeTile(
                        label = if (isSl) "Vnesi kodo" else "Enter tenant code",
                        mode = JoinMode.Code,
                        selected = mode == JoinMode.Code,
                        modifier = Modifier.weight(1f),
                        onClick = {
                            mode = JoinMode.Code
                            showCodeDialog = true
                        }
                    )
                    JoinModeTile(
                        label = if (isSl) "Skeniraj QR" else "Scan QR",
                        mode = JoinMode.Scan,
                        selected = mode == JoinMode.Scan,
                        modifier = Modifier.weight(1f),
                        onClick = {
                            mode = JoinMode.Scan
                            showScanDialog = true
                        }
                    )
                    JoinModeTile(
                        label = if (isSl) "Brskaj ponudnike" else "Browse tenant",
                        mode = JoinMode.Browse,
                        selected = mode == JoinMode.Browse,
                        modifier = Modifier.weight(1f),
                        onClick = { mode = JoinMode.Browse }
                    )
                }

                Spacer(Modifier.height(18.dp))

                SearchField(
                    value = tenantQuery,
                    isSl = isSl,
                    onValueChange = { incoming ->
                        tenantQuery = if (incoming.isNotEmpty()) {
                            incoming.replaceFirstChar { if (it.isLowerCase()) it.titlecase() else it.toString() }
                        } else incoming
                    }
                )

                Spacer(Modifier.height(10.dp))

                TenantTypeChips(selectedType = selectedType, isSl = isSl, onTypeSelected = { selectedType = it })

                Spacer(Modifier.height(14.dp))

                when {
                    loading -> LoadingTenantCard(isSl = isSl)
                    tenants.isEmpty() -> EmptyTenantCard(isSl = isSl)
                    else -> TenantCarousel(tenants = tenants, isSl = isSl, onSelectTenant = { onJoinPublicTenant(it.companyId) })
                }

                Spacer(Modifier.height(20.dp))
            }
        }

        if (showCodeDialog) {
            JoinWithCodePopup(
                code = code,
                onCodeChange = { code = it },
                onDismiss = { showCodeDialog = false },
                isSl = isSl,
                onJoin = {
                    showCodeDialog = false
                    onJoinWithCode(code)
                }
            )
        }

        if (showScanDialog) {
            ScanQrPopup(
                isSl = isSl,
                onDismiss = { showScanDialog = false },
                onQrScanned = { raw ->
                    showScanDialog = false
                    onQrScanned(raw)
                }
            )
        }
    }
}

@Composable
private fun BrandHeader(modifier: Modifier = Modifier) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(56.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Image(
            painter = painterResource(id = R.drawable.calendra_book_logo),
            contentDescription = "Calendra Book",
            modifier = Modifier
                .height(38.dp)
                .wrapContentWidth(Alignment.Start),
            contentScale = ContentScale.Fit,
            alignment = Alignment.CenterStart
        )
        Spacer(Modifier.weight(1f))
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
private fun SearchField(value: String, isSl: Boolean, onValueChange: (String) -> Unit) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        singleLine = true,
        modifier = Modifier
            .fillMaxWidth()
            .height(56.dp),
        shape = RoundedCornerShape(20.dp),
        textStyle = MaterialTheme.typography.bodyMedium.copy(fontSize = 14.sp, lineHeight = 20.sp, color = TitleText),
        placeholder = { Text(if (isSl) "Poišči ponudnika" else "Search tenant", color = SoftText.copy(alpha = 0.92f), fontSize = 14.sp, lineHeight = 20.sp) },
        leadingIcon = { Icon(Icons.Rounded.Search, contentDescription = null, tint = SoftText, modifier = Modifier.size(16.dp)) },
        trailingIcon = {
            if (value.isNotBlank()) {
                Surface(
                    modifier = Modifier
                        .size(22.dp)
                        .clickable { onValueChange("") },
                    shape = CircleShape,
                    color = Color(0xFFE9EEF8)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(Icons.Rounded.Close, contentDescription = if (isSl) "Počisti" else "Clear", tint = SoftText, modifier = Modifier.size(14.dp))
                    }
                }
            }
        },
        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences)
    )
}

@Composable
private fun TenantTypeChips(selectedType: TenantTypeOption, isSl: Boolean, onTypeSelected: (TenantTypeOption) -> Unit) {
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
                        option.displayLabel(isSl),
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
private fun TenantCarousel(tenants: List<TenantSummary>, isSl: Boolean, onSelectTenant: (TenantSummary) -> Unit) {
    val pagerState = rememberPagerState(pageCount = { tenants.size })
    val screenWidth = LocalConfiguration.current.screenWidthDp.dp

    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.requiredWidth(screenWidth)
    ) {
        Box(
            modifier = Modifier
                .requiredWidth(screenWidth)
                .height(396.dp),
            contentAlignment = Alignment.Center
        ) {
            HorizontalPager(
                state = pagerState,
                contentPadding = PaddingValues(horizontal = screenWidth * 0.22f),
                pageSpacing = 14.dp,
                modifier = Modifier.fillMaxSize()
            ) { page ->
                val offset = ((pagerState.currentPage - page) + pagerState.currentPageOffsetFraction).absoluteValue
                val distance = offset.coerceIn(0f, 1f)
                TenantCarouselCard(
                    tenant = tenants[page],
                    isSl = isSl,
                    modifier = Modifier.graphicsLayer {
                        alpha = 1f - (distance * 0.38f)
                        shadowElevation = if (distance < 0.5f) 14f else 5f
                    },
                    onSelect = { onSelectTenant(tenants[page]) }
                )
            }
        }

        Spacer(Modifier.height(10.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            tenants.forEachIndexed { index, _ ->
                Box(
                    modifier = Modifier
                        .width(if (index == pagerState.currentPage) 28.dp else 10.dp)
                        .height(6.dp)
                        .clip(RoundedCornerShape(999.dp))
                        .background(if (index == pagerState.currentPage) CalendraBlue else Color(0xFFD7DDE8))
                )
            }
        }
    }
}


@Composable
private fun TenantCarouselCard(tenant: TenantSummary, isSl: Boolean, modifier: Modifier = Modifier, onSelect: () -> Unit) {
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .fillMaxHeight()
            .shadow(14.dp, RoundedCornerShape(28.dp), clip = false),
        shape = RoundedCornerShape(28.dp),
        color = Color.White,
        border = androidx.compose.foundation.BorderStroke(1.dp, Color.White.copy(alpha = 0.98f))
    ) {
        Column(modifier = Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = 8.dp, top = 8.dp, end = 8.dp)
                    .height(174.dp)
                    .clip(RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp, bottomStart = 0.dp, bottomEnd = 0.dp))
                    .background(Color(0xFFF0F5FC))
            ) {
                if (!tenant.cardImageUrl.isNullOrBlank()) {
                    AsyncImage(
                        model = tenant.cardImageUrl,
                        contentDescription = tenant.companyName,
                        modifier = Modifier.fillMaxSize(),
                        contentScale = ContentScale.Crop
                    )
                } else {
                    TenantHeroPlaceholder(tenantType = tenant.tenantType)
                }

                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(
                            Brush.verticalGradient(
                                colors = listOf(Color.Transparent, Color.Transparent, Color.Black.copy(alpha = 0.08f))
                            )
                        )
                )

                Surface(
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .offset(y = 32.dp)
                        .size(78.dp),
                    shape = CircleShape,
                    color = Color.White,
                    shadowElevation = 10.dp
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        if (!tenant.logoImageUrl.isNullOrBlank()) {
                            AsyncImage(
                                model = tenant.logoImageUrl,
                                contentDescription = tenant.companyName,
                                modifier = Modifier
                                    .fillMaxSize()
                                    .padding(10.dp)
                                    .clip(CircleShape),
                                contentScale = ContentScale.Fit
                            )
                        } else {
                            Box(
                                modifier = Modifier
                                    .fillMaxSize()
                                    .padding(11.dp)
                                    .clip(CircleShape)
                                    .background(tenantAccent(tenant.tenantType)),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(
                                    tenantTypeIcon(tenant.tenantType),
                                    contentDescription = null,
                                    tint = Color.White,
                                    modifier = Modifier.size(32.dp)
                                )
                            }
                        }
                    }
                }
            }

            Spacer(Modifier.height(28.dp))
            Text(
                text = tenant.companyName,
                color = TitleText,
                fontSize = 18.sp,
                lineHeight = 22.sp,
                fontWeight = FontWeight.ExtraBold,
                textAlign = TextAlign.Center,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(horizontal = 22.dp)
            )

            tenantTypeLabel(tenant.tenantType, isSl)?.let { typeLabel ->
                Spacer(Modifier.height(7.dp))
                Surface(shape = RoundedCornerShape(999.dp), color = Color(0xFFEAF1FF)) {
                    Row(
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Icon(tenantTypeIcon(tenant.tenantType), contentDescription = null, tint = CalendraBlue, modifier = Modifier.size(13.dp))
                        Text(typeLabel, color = CalendraBlue, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
            }

            Spacer(Modifier.height(10.dp))
            Row(
                modifier = Modifier.padding(horizontal = 22.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center
            ) {
                Icon(Icons.Rounded.LocationOn, contentDescription = null, tint = CalendraBlue, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(6.dp))
                Text(
                    tenant.publicCity?.ifBlank { tenant.companyAddress.orEmpty() }?.ifBlank {
                        if (isSl) "Lokacija je na voljo v profilu" else "Location available on profile"
                    } ?: if (isSl) "Lokacija je na voljo v profilu" else "Location available on profile",
                    color = SoftText,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Normal,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }

            Spacer(Modifier.height(8.dp))
            Button(
                onClick = onSelect,
                modifier = Modifier.fillMaxWidth().padding(horizontal = 22.dp).height(44.dp),
                shape = RoundedCornerShape(17.dp),
                colors = ButtonDefaults.buttonColors(containerColor = CalendraBlue, contentColor = Color.White)
            ) {
                Text(if (isSl) "Izberi ponudnika" else "Select tenant", fontWeight = FontWeight.Bold, fontSize = 11.sp)
            }
            Spacer(Modifier.height(4.dp))
        }
    }
}


@Composable
private fun TenantHeroPlaceholder(tenantType: String?) {
    val colors = when (tenantType?.lowercase()) {
        "salon" -> listOf(Color(0xFFFFF1F4), Color(0xFFF7D4DF))
        "gym" -> listOf(Color(0xFFE4F5FF), Color(0xFFB8DDFB))
        "spa" -> listOf(Color(0xFFEAF8E6), Color(0xFFC9E2C0))
        "therapy" -> listOf(Color(0xFFEAF0FF), Color(0xFFC1CFF1))
        else -> listOf(Color(0xFFF6F8FC), Color(0xFFE6EEF8))
    }
    val accent = tenantAccent(tenantType)
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Brush.linearGradient(colors = colors, start = Offset(0f, 0f), end = Offset(900f, 900f)))
    ) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val w = size.width
            val h = size.height
            val cream = Color(0xFFFFFBF3)
            val shadow = Color(0x22000000)
            val glass = Color(0xFFB9D8F5).copy(alpha = 0.80f)
            val awningLight = Color.White.copy(alpha = 0.92f)

            drawCircle(Color.White.copy(alpha = 0.30f), radius = w * 0.26f, center = Offset(w * 0.78f, h * 0.26f))
            drawCircle(Color.White.copy(alpha = 0.22f), radius = w * 0.18f, center = Offset(w * 0.17f, h * 0.28f))

            drawRoundRect(shadow, topLeft = Offset(w * 0.20f, h * 0.72f), size = Size(w * 0.60f, h * 0.05f), cornerRadius = CornerRadius(24.dp.toPx(), 24.dp.toPx()))
            drawRoundRect(cream, topLeft = Offset(w * 0.23f, h * 0.24f), size = Size(w * 0.54f, h * 0.47f), cornerRadius = CornerRadius(13.dp.toPx(), 13.dp.toPx()))
            drawRoundRect(Color.White.copy(alpha = 0.72f), topLeft = Offset(w * 0.28f, h * 0.18f), size = Size(w * 0.44f, h * 0.12f), cornerRadius = CornerRadius(8.dp.toPx(), 8.dp.toPx()))

            val awningTop = h * 0.34f
            val stripeW = w * 0.075f
            repeat(7) { i ->
                val x = w * 0.22f + stripeW * i
                drawRect(if (i % 2 == 0) accent.copy(alpha = 0.88f) else awningLight, topLeft = Offset(x, awningTop), size = Size(stripeW, h * 0.14f))
                drawCircle(if (i % 2 == 0) accent.copy(alpha = 0.88f) else awningLight, radius = stripeW / 2f, center = Offset(x + stripeW / 2f, awningTop + h * 0.14f))
            }

            drawRoundRect(accent.copy(alpha = 0.85f), topLeft = Offset(w * 0.32f, h * 0.52f), size = Size(w * 0.13f, h * 0.18f), cornerRadius = CornerRadius(5.dp.toPx(), 5.dp.toPx()))
            drawRoundRect(glass, topLeft = Offset(w * 0.50f, h * 0.53f), size = Size(w * 0.17f, h * 0.13f), cornerRadius = CornerRadius(5.dp.toPx(), 5.dp.toPx()))
            drawRoundRect(Color.White.copy(alpha = 0.35f), topLeft = Offset(w * 0.53f, h * 0.55f), size = Size(w * 0.09f, h * 0.03f), cornerRadius = CornerRadius(8.dp.toPx(), 8.dp.toPx()))

            drawRoundRect(Color(0xFFE5D6C3), topLeft = Offset(w * 0.20f, h * 0.70f), size = Size(w * 0.62f, h * 0.04f), cornerRadius = CornerRadius(5.dp.toPx(), 5.dp.toPx()))

            // Plants / soft decorative foreground.
            drawRoundRect(Color(0xFFEAE6DD), topLeft = Offset(w * 0.18f, h * 0.62f), size = Size(w * 0.06f, h * 0.10f), cornerRadius = CornerRadius(12.dp.toPx(), 12.dp.toPx()))
            drawCircle(Color(0xFF6BA35E), radius = w * 0.025f, center = Offset(w * 0.19f, h * 0.57f))
            drawCircle(Color(0xFF7FB76E), radius = w * 0.026f, center = Offset(w * 0.22f, h * 0.54f))
            drawCircle(Color(0xFF8DC47C), radius = w * 0.022f, center = Offset(w * 0.23f, h * 0.60f))

            drawRoundRect(Color(0xFFEAE6DD), topLeft = Offset(w * 0.78f, h * 0.62f), size = Size(w * 0.06f, h * 0.10f), cornerRadius = CornerRadius(12.dp.toPx(), 12.dp.toPx()))
            drawCircle(Color(0xFF6BA35E), radius = w * 0.025f, center = Offset(w * 0.80f, h * 0.57f))
            drawCircle(Color(0xFF7FB76E), radius = w * 0.026f, center = Offset(w * 0.83f, h * 0.54f))
            drawCircle(Color(0xFF8DC47C), radius = w * 0.022f, center = Offset(w * 0.82f, h * 0.61f))
        }
    }
}


private fun tenantInitials(name: String): String =
    name.split(" ").mapNotNull { it.firstOrNull()?.uppercaseChar()?.toString() }.take(2).joinToString("").ifBlank { "C" }

private fun tenantAccent(tenantType: String?): Color = when (tenantType?.lowercase()) {
    "salon" -> Color(0xFFE66F94)
    "gym" -> Color(0xFF1478D4)
    "spa" -> Color(0xFF5C8C58)
    "therapy" -> Color(0xFF6D70D9)
    else -> CalendraBlue
}

private fun tenantAccentSoft(tenantType: String?): Color = when (tenantType?.lowercase()) {
    "salon" -> Color(0xFFFFE8EF)
    "gym" -> Color(0xFFE5F2FF)
    "spa" -> Color(0xFFE7F4E3)
    "therapy" -> Color(0xFFECEDFF)
    else -> Color(0xFFEAF1FF)
}


@Composable
private fun JoinWithCodePopup(
    code: String,
    onCodeChange: (String) -> Unit,
    onDismiss: () -> Unit,
    isSl: Boolean,
    onJoin: () -> Unit
) {
    val actionBlue = Color(0xFF1568F4)
    val mutedBlue = actionBlue.copy(alpha = 0.66f)
    val fieldLine = actionBlue.copy(alpha = 0.22f)

    Dialog(onDismissRequest = onDismiss) {
        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(28.dp),
            color = Color.White,
            shadowElevation = 18.dp
        ) {
            Column(modifier = Modifier.padding(20.dp)) {
                Text(if (isSl) "Pridružitev s kodo ponudnika" else "Join with tenant code", color = actionBlue, fontSize = 22.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(4.dp))
                Text(if (isSl) "Vnesite kodo, ki vam jo je posredoval ponudnik." else "Enter the code provided by the tenant.", color = mutedBlue, fontSize = 14.sp)
                Spacer(Modifier.height(16.dp))
                OutlinedTextField(
                    value = code,
                    onValueChange = onCodeChange,
                    modifier = Modifier.fillMaxWidth().height(54.dp),
                    singleLine = true,
                    placeholder = { Text("e.g. TEN-7X9K", fontSize = 14.sp) },
                    leadingIcon = { CodeGlyph() },
                    shape = RoundedCornerShape(16.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = actionBlue,
                        unfocusedBorderColor = fieldLine,
                        focusedTextColor = actionBlue,
                        unfocusedTextColor = actionBlue,
                        cursorColor = actionBlue,
                        focusedLeadingIconColor = actionBlue,
                        unfocusedLeadingIconColor = actionBlue.copy(alpha = 0.74f),
                        focusedPlaceholderColor = actionBlue.copy(alpha = 0.58f),
                        unfocusedPlaceholderColor = actionBlue.copy(alpha = 0.58f)
                    )
                )
                Spacer(Modifier.height(18.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
                    Surface(
                        modifier = Modifier.weight(1f).height(50.dp).clickable(onClick = onDismiss),
                        shape = RoundedCornerShape(16.dp),
                        color = Color.White,
                        border = androidx.compose.foundation.BorderStroke(1.dp, fieldLine)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Text(if (isSl) "Prekliči" else "Cancel", color = actionBlue, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                        }
                    }
                    Button(
                        onClick = onJoin,
                        modifier = Modifier.weight(1f).height(50.dp),
                        shape = RoundedCornerShape(16.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = actionBlue, contentColor = Color.White)
                    ) {
                        Text(if (isSl) "Pridruži se" else "Join", fontSize = 16.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}

@Composable
private fun ScanQrPopup(isSl: Boolean, onDismiss: () -> Unit, onQrScanned: (String) -> Unit) {
    val context = LocalContext.current
    var hasCameraPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
        )
    }
    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        hasCameraPermission = granted
    }

    LaunchedEffect(Unit) {
        if (!hasCameraPermission) {
            permissionLauncher.launch(Manifest.permission.CAMERA)
        }
    }

    Dialog(onDismissRequest = onDismiss) {
        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(28.dp),
            color = Color.White,
            shadowElevation = 18.dp
        ) {
            Column(modifier = Modifier.padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Text(if (isSl) "Skeniraj QR" else "Scan QR", color = TitleText, fontSize = 22.sp, fontWeight = FontWeight.Bold, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(4.dp))
                Text(if (isSl) "Poravnajte QR kodo ponudnika z okvirjem." else "Align the provider QR in the frame.", color = SoftText, fontSize = 14.sp, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(16.dp))
                Surface(
                    modifier = Modifier.fillMaxWidth().height(220.dp),
                    shape = RoundedCornerShape(24.dp),
                    color = Color(0xFFF6F8FC),
                    border = androidx.compose.foundation.BorderStroke(1.dp, SoftOutline)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        if (hasCameraPermission) {
                            EmbeddedQrScanner(
                                modifier = Modifier.fillMaxSize().clip(RoundedCornerShape(24.dp)),
                                onQrScanned = onQrScanned
                            )
                            ScannerFrameOverlay(modifier = Modifier.fillMaxSize())
                        } else {
                            Text(
                                if (isSl) "Za skeniranje QR kode ponudnika je potrebno dovoljenje za kamero." else "Camera permission is required to scan the tenant QR code.",
                                color = SoftText,
                                fontSize = 14.sp,
                                textAlign = TextAlign.Center,
                                modifier = Modifier.padding(24.dp)
                            )
                        }
                    }
                }
                Spacer(Modifier.height(16.dp))
                Surface(
                    modifier = Modifier.fillMaxWidth().height(48.dp).clickable(onClick = onDismiss),
                    shape = RoundedCornerShape(16.dp),
                    color = Color.White,
                    border = androidx.compose.foundation.BorderStroke(1.dp, SoftOutline)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Text(if (isSl) "Prekliči" else "Cancel", color = CalendraBlue, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }
    }
}

@Composable
private fun EmbeddedQrScanner(modifier: Modifier = Modifier, onQrScanned: (String) -> Unit) {
    var scanned by remember { mutableStateOf(false) }
    var barcodeView by remember { mutableStateOf<DecoratedBarcodeView?>(null) }

    AndroidView(
        modifier = modifier,
        factory = { context ->
            DecoratedBarcodeView(context).apply {
                barcodeView = this
                setStatusText("")
                this.barcodeView.decoderFactory = DefaultDecoderFactory(listOf(BarcodeFormat.QR_CODE))
                decodeContinuous(object : BarcodeCallback {
                    override fun barcodeResult(result: BarcodeResult?) {
                        val value = result?.text?.trim().orEmpty()
                        if (value.isNotBlank() && !scanned) {
                            post {
                                if (!scanned) {
                                    scanned = true
                                    pause()
                                    onQrScanned(value)
                                }
                            }
                        }
                    }
                })
                resume()
            }
        },
        update = { view ->
            if (!scanned) view.resume()
        }
    )

    DisposableEffect(Unit) {
        onDispose { barcodeView?.pause() }
    }
}

@Composable
private fun ScannerFrameOverlay(modifier: Modifier = Modifier) {
    Canvas(modifier = modifier.padding(28.dp)) {
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
}


@Composable
private fun JoinWithCodeSection(code: String, isSl: Boolean, onCodeChange: (String) -> Unit, onJoin: () -> Unit) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(24.dp),
        color = Color.White,
        border = androidx.compose.foundation.BorderStroke(1.dp, SoftOutline),
        shadowElevation = 3.dp
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(if (isSl) "Pridružitev s kodo ponudnika" else "Join with tenant code", color = TitleText, style = MaterialTheme.typography.titleLarge.copy(fontSize = 22.sp), fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(2.dp))
            Text(if (isSl) "Že imate kodo? Vnesite jo spodaj." else "Already have a code? Enter it below.", color = SoftText, style = MaterialTheme.typography.bodyMedium.copy(fontSize = 14.sp))
            Spacer(Modifier.height(10.dp))
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
                    Text(if (isSl) "Pridruži se" else "Join", fontWeight = FontWeight.Bold, fontSize = 16.sp)
                }
            }
        }
    }
}

@Composable
private fun LoadingTenantCard(isSl: Boolean) {
    Surface(
        modifier = Modifier.fillMaxWidth().height(380.dp),
        shape = RoundedCornerShape(28.dp),
        color = Color.White,
        border = androidx.compose.foundation.BorderStroke(1.dp, SoftOutline)
    ) {
        Box(contentAlignment = Alignment.Center) {
            Text(if (isSl) "Nalaganje ponudnikov…" else "Loading tenants…", color = SoftText, style = MaterialTheme.typography.titleMedium.copy(fontSize = 18.sp))
        }
    }
}

@Composable
private fun EmptyTenantCard(isSl: Boolean) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(30.dp),
        color = Color.White,
        shadowElevation = 6.dp
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 18.dp, vertical = 22.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Image(
                painter = painterResource(id = R.drawable.add_tenant_empty_illustration),
                contentDescription = null,
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(775f / 470f),
                contentScale = ContentScale.Fit
            )
            Spacer(Modifier.height(10.dp))
            Text(
                if (isSl) "Ni najdenih javnih ponudnikov" else "No public tenants found",
                color = TitleText,
                fontSize = 24.sp,
                lineHeight = 29.sp,
                fontWeight = FontWeight.ExtraBold,
                textAlign = TextAlign.Center
            )
            Spacer(Modifier.height(10.dp))
            Text(
                if (isSl) "Trenutno ne najdemo javnih ponudnikov, ki bi ustrezali vašemu iskanju." else "We couldn’t find any public tenants matching your search right now.",
                color = SoftText,
                fontSize = 11.sp,
                lineHeight = 16.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(horizontal = 14.dp)
            )
            Spacer(Modifier.height(6.dp))
        }
    }
}

private fun String.initials(): String = trim()
    .split(Regex("\\s+"))
    .filter { it.isNotBlank() }
    .take(2)
    .joinToString("") { it.first().uppercaseChar().toString() }
    .ifBlank { "C" }

private fun TenantTypeOption.displayLabel(isSl: Boolean): String = when (id) {
    null -> if (isSl) "Vse" else "All"
    "salon" -> "Salon"
    "gym" -> if (isSl) "Fitnes" else "Gym"
    "spa" -> "Spa"
    "therapy" -> if (isSl) "Terapija" else "Therapy"
    else -> label
}

private fun tenantTypeLabel(raw: String?, isSl: Boolean): String? = when (raw?.trim()?.lowercase()) {
    "salon" -> "Salon"
    "gym" -> if (isSl) "Fitnes" else "Gym"
    "spa" -> "Spa"
    "therapy" -> if (isSl) "Terapija" else "Therapy"
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
