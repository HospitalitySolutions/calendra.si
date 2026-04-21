package si.calendra.guest.android.ui

import android.util.Log
import android.content.Intent
import android.net.Uri
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.CalendarMonth
import androidx.compose.material.icons.rounded.KeyboardArrowRight
import androidx.compose.material.icons.rounded.NotificationsNone
import androidx.compose.material.icons.rounded.QrCodeScanner
import androidx.compose.material.icons.rounded.Home
import androidx.compose.material.icons.rounded.MailOutline
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.Wallet
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import kotlinx.coroutines.launch
import si.calendra.guest.android.BuildConfig
import si.calendra.guest.android.auth.GoogleSignInManager
import si.calendra.guest.android.payments.NativeCheckoutManager
import si.calendra.guest.android.payments.PaymentRedirectBus
import si.calendra.guest.android.ui.screens.*
import si.calendra.guest.shared.GuestAppContainer
import si.calendra.guest.shared.config.GuestApiConfig
import si.calendra.guest.shared.models.*
import si.calendra.guest.shared.network.GuestSessionStore
import java.time.OffsetDateTime

private sealed class RootRoute(val route: String) {
    data object Welcome : RootRoute("welcome")
    data object Login : RootRoute("login")
    data object JoinTenant : RootRoute("join-tenant")
    data object Home : RootRoute("home")
    data object Book : RootRoute("book")
    data object Wallet : RootRoute("wallet")
    data object Inbox : RootRoute("inbox")
    data object Profile : RootRoute("profile")
}

private const val GOOGLE_WEB_CLIENT_ID = "YOUR_GOOGLE_WEB_CLIENT_ID"
private const val STRIPE_PUBLISHABLE_KEY = "YOUR_STRIPE_PUBLISHABLE_KEY"

private const val GUEST_API_DEBUG_TAG = "GuestApi"

private fun logLinkedTenantsDebug(source: String, tenants: List<TenantSummary>) {
    if (!BuildConfig.DEBUG) return
    Log.d(GUEST_API_DEBUG_TAG, "$source baseUrl=${BuildConfig.API_BASE_URL} tenantCount=${tenants.size}")
    tenants.forEachIndexed { index, t ->
        Log.d(
            GUEST_API_DEBUG_TAG,
            "$source[$index] companyId=${t.companyId} companyName=${t.companyName} companyAddress=${t.companyAddress} publicCity=${t.publicCity}"
        )
    }
}

@Composable
fun GuestMobileRoot() {
    val container = remember { GuestAppContainer(GuestApiConfig(baseUrl = BuildConfig.API_BASE_URL)) }
    val repo = remember { container.repository }
    val navController = rememberNavController()
    val state = remember { GuestMutableState() }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val preferencesStore = remember(context) { GuestPreferencesStore(context) }
    var savedCards by remember { mutableStateOf(preferencesStore.loadSavedCards()) }
    val activity = context as? ComponentActivity
    val snackbarHostState = remember { SnackbarHostState() }
    val lifecycleOwner = LocalLifecycleOwner.current
    var statusMessage by remember { mutableStateOf<String?>(null) }
    val qrScannerLauncher = rememberLauncherForActivityResult(contract = ScanContract()) { result ->
        val tenantCode = extractTenantCode(result.contents)
        if (!tenantCode.isNullOrBlank()) {
            scope.launch {
                runCatching { joinTenantWithCode(tenantCode, repo, state, navController) }
                    .onFailure { statusMessage = it.message ?: "Tenant join failed" }
            }
        }
    }

    fun buildCheckoutManager(): NativeCheckoutManager? {
        val componentActivity = activity ?: return null
        return NativeCheckoutManager(activity = componentActivity, publishableKey = STRIPE_PUBLISHABLE_KEY)
    }

    fun buildGoogleManager(): GoogleSignInManager? {
        val componentActivity = activity ?: return null
        return GoogleSignInManager(activity = componentActivity, webClientId = GOOGLE_WEB_CLIENT_ID)
    }

    suspend fun applySession(sessionToken: GuestSession) {
        GuestSessionStore.authToken = sessionToken.token
        logLinkedTenantsDebug("applySession", sessionToken.linkedTenants)
        state.uiState = state.uiState.copy(
            session = sessionToken,
            linkedTenants = sessionToken.linkedTenants,
            selectedTenantId = null,
            tenantDashboards = emptyMap()
        )
    }

    suspend fun refreshTenant(companyId: String) {
        if (state.uiState.linkedTenants.none { it.companyId == companyId }) return
        val home = repo.home(companyId)
        val freshTenant = home.tenant
        val mergedTenants = state.uiState.linkedTenants.map { if (it.companyId == companyId) freshTenant else it }
        val dashboard = TenantDashboard(
            tenant = freshTenant,
            home = home,
            products = repo.products(companyId),
            wallet = repo.wallet(companyId),
            history = repo.bookingHistory(companyId),
            notifications = repo.notifications(companyId).items
        )
        state.uiState = state.uiState.copy(
            linkedTenants = mergedTenants,
            session = state.uiState.session?.copy(linkedTenants = mergedTenants),
            tenantDashboards = state.uiState.tenantDashboards + (companyId to dashboard)
        )
        if (BuildConfig.DEBUG) {
            val productSummaries = dashboard.products.joinToString { p ->
                "${p.productId}(sessionTypeId=${p.sessionTypeId},bookable=${p.bookable})"
            }
            Log.d(
                GUEST_API_DEBUG_TAG,
                "refreshTenant companyId=$companyId products=${dashboard.products.size} [$productSummaries]"
            )
        }
    }

    suspend fun refreshAllTenants() {
        state.uiState = state.uiState.copy(loading = true)
        runCatching {
            runCatching { repo.me() }.getOrNull()?.let { profile ->
                logLinkedTenantsDebug("GET /api/guest/me", profile.linkedTenants)
                state.uiState = state.uiState.copy(
                    linkedTenants = profile.linkedTenants,
                    session = state.uiState.session?.copy(
                        guestUser = profile.guestUser,
                        linkedTenants = profile.linkedTenants
                    )
                )
            }
            state.uiState.linkedTenants.forEach { refreshTenant(it.companyId) }
        }.onFailure {
            statusMessage = it.message ?: "Failed to refresh tenant data"
        }
        state.uiState = state.uiState.copy(loading = false)
    }

    fun dial(phone: String) {
        context.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:${phone.filter { !it.isWhitespace() }}")))
    }

    fun sms(phone: String) {
        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("sms:${phone.filter { !it.isWhitespace() }}")))
    }

    fun logout() {
        GuestSessionStore.authToken = null
        state.uiState = GuestUiState()
        navController.navigate(RootRoute.Login.route) {
            popUpTo(navController.graph.findStartDestination().id) { inclusive = false }
            launchSingleTop = true
        }
    }

    fun navigateToTab(route: String) {
        navController.navigate(route) {
            popUpTo(RootRoute.Home.route) { saveState = true }
            launchSingleTop = true
            restoreState = true
        }
    }

    LaunchedEffect(statusMessage) {
        statusMessage?.let {
            snackbarHostState.showSnackbar(it)
            statusMessage = null
        }
    }

    val paymentRedirectUri by PaymentRedirectBus.latest.collectAsState()

    LaunchedEffect(paymentRedirectUri) {
        val uri = paymentRedirectUri ?: return@LaunchedEffect
        val status = uri.getQueryParameter("status")?.lowercase() ?: uri.lastPathSegment?.lowercase()
        val message = when (status) {
            "success" -> "PayPal payment confirmed"
            "cancelled", "canceled" -> "PayPal checkout canceled"
            "error" -> uri.getQueryParameter("message") ?: "PayPal payment failed"
            else -> null
        }
        if (!message.isNullOrBlank()) {
            statusMessage = message
        }
        if (state.uiState.session != null) {
            refreshAllTenants()
        }
        PaymentRedirectBus.consume()
    }

    DisposableEffect(lifecycleOwner, state.uiState.session?.token) {
        val sessionToken = state.uiState.session?.token
        if (sessionToken.isNullOrBlank()) {
            return@DisposableEffect onDispose { }
        }
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                scope.launch { refreshAllTenants() }
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    listOf(Color(0xFFF6F9FF), Color(0xFFEFF5FF), Color(0xFFFFF2E3))
                )
            )
    ) {
        NavHost(navController = navController, startDestination = RootRoute.Welcome.route) {
            composable(RootRoute.Welcome.route) {
                WelcomeScreen(onContinue = { navController.navigate(RootRoute.Login.route) })
            }
            composable(RootRoute.Login.route) {
                LoginScreen(
                    onLogin = { email, password ->
                        scope.launch {
                            runCatching { repo.login(LoginRequest(email, password)) }
                                .onSuccess { session ->
                                    applySession(session)
                                    if (session.linkedTenants.isEmpty()) {
                                        navController.navigate(RootRoute.JoinTenant.route)
                                    } else {
                                        refreshAllTenants()
                                        navController.navigate(RootRoute.Home.route) {
                                            popUpTo(navController.graph.findStartDestination().id) { inclusive = false }
                                            launchSingleTop = true
                                        }
                                    }
                                }
                                .onFailure { statusMessage = it.message ?: "Login failed" }
                        }
                    },
                    onGoogleLogin = {
                        scope.launch {
                            val manager = buildGoogleManager() ?: run {
                                statusMessage = "Google Sign-In is unavailable in this context."
                                return@launch
                            }
                            manager.signInWithGoogleButton()
                                .onSuccess { idToken ->
                                    runCatching { repo.loginWithGoogle(idToken) }
                                        .onSuccess { session ->
                                            applySession(session)
                                            if (session.linkedTenants.isEmpty()) {
                                                navController.navigate(RootRoute.JoinTenant.route)
                                            } else {
                                                refreshAllTenants()
                                                navController.navigate(RootRoute.Home.route) {
                                                    popUpTo(navController.graph.findStartDestination().id) { inclusive = false }
                                                    launchSingleTop = true
                                                }
                                            }
                                        }
                                        .onFailure { statusMessage = it.message ?: "Google login failed" }
                                }
                                .onFailure { statusMessage = it.message ?: "Google Sign-In failed" }
                        }
                    }
                )
            }
            composable(RootRoute.JoinTenant.route) {
                JoinTenantScreen { code ->
                    scope.launch {
                        runCatching { joinTenantWithCode(code, repo, state, navController) }
                            .onFailure { statusMessage = it.message ?: "Tenant join failed" }
                    }
                }
            }
            composable(RootRoute.Home.route) {
                GuestTabsScaffold(
                    current = RootRoute.Home.route,
                    utilityBarVisible = state.uiState.linkedTenants.isNotEmpty(),
                    unreadNotificationCount = unreadNotificationCount(state.uiState),
                    onAddTenant = { navController.navigate(RootRoute.JoinTenant.route) { launchSingleTop = true } },
                    onScanTenant = {
                        val options = ScanOptions().apply {
                            setDesiredBarcodeFormats(ScanOptions.QR_CODE)
                            setPrompt("Scan tenancy QR code")
                            setBeepEnabled(false)
                            setOrientationLocked(false)
                        }
                        qrScannerLauncher.launch(options)
                    },
                    onOpenNotifications = { navigateToTab(RootRoute.Inbox.route) },
                    onTabSelected = ::navigateToTab
                ) { innerModifier ->
                    HomeScreen(
                        modifier = innerModifier,
                        bookings = aggregatedBookings(state.uiState),
                        accesses = aggregatedAccesses(state.uiState),
                        onCall = ::dial,
                        onSms = ::sms
                    )
                }
            }
            composable(RootRoute.Book.route) {
                GuestTabsScaffold(
                    current = RootRoute.Book.route,
                    utilityBarVisible = false,
                    unreadNotificationCount = unreadNotificationCount(state.uiState),
                    onAddTenant = { navController.navigate(RootRoute.JoinTenant.route) { launchSingleTop = true } },
                    onScanTenant = {
                        val options = ScanOptions().apply {
                            setDesiredBarcodeFormats(ScanOptions.QR_CODE)
                            setPrompt("Scan tenancy QR code")
                            setBeepEnabled(false)
                            setOrientationLocked(false)
                        }
                        qrScannerLauncher.launch(options)
                    },
                    onOpenNotifications = { navigateToTab(RootRoute.Inbox.route) },
                    onTabSelected = ::navigateToTab
                ) { innerModifier ->
                    BookScreen(
                        modifier = innerModifier,
                        providers = state.uiState.linkedTenants.map { provider ->
                            ProviderOption(
                                companyId = provider.companyId,
                                tenantName = provider.companyName,
                                tenantAddress = provider.companyAddress ?: provider.publicCity,
                                requireOnlinePayment = provider.requireOnlinePayment
                            )
                        },
                        services = aggregatedServices(state.uiState),
                        savedCards = savedCards,
                        redeemableEntitlements = aggregatedRedeemableEntitlements(state.uiState),
                        onSaveCard = { card ->
                            val updated = savedCards.filterNot { it.id == card.id } + card
                            savedCards = updated
                            preferencesStore.saveSavedCards(updated)
                        },
                        onRemoveSavedCard = { id ->
                            val updated = savedCards.filterNot { it.id == id }
                            savedCards = updated
                            preferencesStore.saveSavedCards(updated)
                        },
                        onOpenNotifications = { navigateToTab(RootRoute.Inbox.route) },
                        onLoadAvailability = { service, date, consultantId -> repo.availability(service.companyId, service.sessionTypeId, date.toString(), consultantId).slots },
                        onLoadConsultants = { service ->
                            runCatching { repo.consultants(service.companyId, service.sessionTypeId) }.getOrElse { emptyList() }
                                .map { si.calendra.guest.android.ui.screens.ConsultantOption(id = it.id, firstName = it.firstName, lastName = it.lastName, email = it.email) }
                        },
                        employeeSelectionStepEnabled = { companyId ->
                            state.uiState.linkedTenants.firstOrNull { it.companyId == companyId }?.employeeSelectionStep == true
                        },
                        onCheckout = onCheckout@{ service, slotId, paymentMethodType, consultantId ->
                            val checkout = runCatching {
                                val order = repo.createOrder(
                                    CreateOrderRequest(
                                        companyId = service.companyId,
                                        productId = service.productId,
                                        slotId = slotId,
                                        paymentMethodType = paymentMethodType,
                                        consultantId = consultantId
                                    )
                                )
                                repo.checkout(order.order.orderId, CheckoutRequest(paymentMethodType = paymentMethodType, saveCard = paymentMethodType == "CARD"))
                            }.getOrElse {
                                statusMessage = it.message ?: "Checkout failed"
                                return@onCheckout
                            }

                            buildCheckoutManager()?.handle(
                                checkout = checkout,
                                onComplete = { statusMessage = checkout.bankTransfer?.instructions ?: "Order created" },
                                onError = { error -> statusMessage = error }
                            ) ?: run {
                                statusMessage = checkout.bankTransfer?.instructions ?: checkout.status
                            }
                            refreshTenant(service.companyId)
                            navController.navigate(RootRoute.Wallet.route) { launchSingleTop = true }
                        }
                    )
                }
            }
            composable(RootRoute.Wallet.route) {
                GuestTabsScaffold(
                    current = RootRoute.Wallet.route,
                    utilityBarVisible = state.uiState.linkedTenants.isNotEmpty(),
                    unreadNotificationCount = unreadNotificationCount(state.uiState),
                    onAddTenant = { navController.navigate(RootRoute.JoinTenant.route) { launchSingleTop = true } },
                    onScanTenant = {
                        val options = ScanOptions().apply {
                            setDesiredBarcodeFormats(ScanOptions.QR_CODE)
                            setPrompt("Scan tenancy QR code")
                            setBeepEnabled(false)
                            setOrientationLocked(false)
                        }
                        qrScannerLauncher.launch(options)
                    },
                    onOpenNotifications = { navigateToTab(RootRoute.Inbox.route) },
                    onTabSelected = ::navigateToTab
                ) { innerModifier ->
                    Box(innerModifier) {
                        WalletScreen(
                            wallet = aggregatedWallet(state.uiState),
                            history = aggregatedWalletHistory(state.uiState),
                            offers = aggregatedWalletOffers(state.uiState),
                            onBuyOffer = { offer ->
                                scope.launch {
                                    val checkout = runCatching {
                                        val order = repo.createOrder(
                                            CreateOrderRequest(
                                                companyId = offer.companyId,
                                                productId = offer.productId,
                                                paymentMethodType = "CARD"
                                            )
                                        )
                                        repo.checkout(order.order.orderId, CheckoutRequest(paymentMethodType = "CARD", saveCard = true))
                                    }.getOrElse {
                                        statusMessage = it.message ?: "Purchase failed"
                                        return@launch
                                    }

                                    buildCheckoutManager()?.handle(
                                        checkout = checkout,
                                        onComplete = { statusMessage = checkout.bankTransfer?.instructions ?: "Purchase complete" },
                                        onError = { error -> statusMessage = error }
                                    ) ?: run {
                                        statusMessage = checkout.bankTransfer?.instructions ?: checkout.status
                                    }
                                    refreshTenant(offer.companyId)
                                }
                            },
                            onToggleAutoRenew = { entitlementId, autoRenews ->
                                scope.launch {
                                    val tenantId = findTenantForEntitlement(state.uiState, entitlementId)
                                    if (tenantId == null) {
                                        statusMessage = "Membership not found"
                                        return@launch
                                    }
                                    runCatching { repo.toggleAutoRenew(tenantId, entitlementId, autoRenews) }
                                        .onSuccess {
                                            refreshTenant(tenantId)
                                            statusMessage = if (autoRenews) "Auto-renew enabled" else "Auto-renew disabled"
                                        }
                                        .onFailure { statusMessage = it.message ?: "Unable to update membership" }
                                }
                            }
                        )
                    }
                }
            }
            composable(RootRoute.Inbox.route) {
                GuestTabsScaffold(
                    current = RootRoute.Inbox.route,
                    utilityBarVisible = state.uiState.linkedTenants.isNotEmpty(),
                    unreadNotificationCount = unreadNotificationCount(state.uiState),
                    onAddTenant = { navController.navigate(RootRoute.JoinTenant.route) { launchSingleTop = true } },
                    onScanTenant = {
                        val options = ScanOptions().apply {
                            setDesiredBarcodeFormats(ScanOptions.QR_CODE)
                            setPrompt("Scan tenancy QR code")
                            setBeepEnabled(false)
                            setOrientationLocked(false)
                        }
                        qrScannerLauncher.launch(options)
                    },
                    onOpenNotifications = { navigateToTab(RootRoute.Inbox.route) },
                    onTabSelected = ::navigateToTab
                ) { innerModifier ->
                    val notifications = selectedTenantIds(state.uiState).flatMap { tenantId -> state.uiState.tenantDashboards[tenantId]?.notifications.orEmpty() }
                    Box(innerModifier) { InboxScreen(notifications) }
                }
            }
            composable(RootRoute.Profile.route) {
                GuestTabsScaffold(
                    current = RootRoute.Profile.route,
                    utilityBarVisible = state.uiState.linkedTenants.isNotEmpty(),
                    unreadNotificationCount = unreadNotificationCount(state.uiState),
                    onAddTenant = { navController.navigate(RootRoute.JoinTenant.route) { launchSingleTop = true } },
                    onScanTenant = {
                        val options = ScanOptions().apply {
                            setDesiredBarcodeFormats(ScanOptions.QR_CODE)
                            setPrompt("Scan tenancy QR code")
                            setBeepEnabled(false)
                            setOrientationLocked(false)
                        }
                        qrScannerLauncher.launch(options)
                    },
                    onOpenNotifications = { navigateToTab(RootRoute.Inbox.route) },
                    onTabSelected = ::navigateToTab
                ) { innerModifier ->
                    Box(innerModifier) {
                        ProfileScreen(
                            session = state.uiState.session,
                            activeTenantId = state.uiState.selectedTenantId ?: state.uiState.linkedTenants.firstOrNull()?.companyId,
                            activeTenantName = state.uiState.linkedTenants.firstOrNull { it.companyId == (state.uiState.selectedTenantId ?: state.uiState.linkedTenants.firstOrNull()?.companyId) }?.companyName,
                            onLoadProfileSettings = { companyId ->
                                val settings = repo.profileSettings(companyId)
                                state.uiState = state.uiState.copy(
                                    session = state.uiState.session?.copy(guestUser = settings.guestUser)
                                )
                                settings
                            },
                            onSaveProfileSettings = { request ->
                                val settings = repo.updateProfileSettings(request)
                                state.uiState = state.uiState.copy(
                                    session = state.uiState.session?.copy(guestUser = settings.guestUser)
                                )
                                settings
                            },
                            onLogout = ::logout
                        )
                    }
                }
            }
        }

        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.BottomCenter) {
            SnackbarHost(hostState = snackbarHostState, modifier = Modifier.padding(bottom = 104.dp))
        }
    }
}

@Composable
private fun GuestTabsScaffold(
    current: String,
    utilityBarVisible: Boolean,
    unreadNotificationCount: Int,
    onAddTenant: () -> Unit,
    onScanTenant: () -> Unit,
    onOpenNotifications: () -> Unit,
    onTabSelected: (String) -> Unit,
    content: @Composable (Modifier) -> Unit
) {
    Scaffold(
        containerColor = Color.Transparent,
        bottomBar = { BottomNavBar(current = current, onTabSelected = onTabSelected) }
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) {
            if (utilityBarVisible) {
                GuestUtilityTopBar(
                    unreadNotificationCount = unreadNotificationCount,
                    onAddTenant = onAddTenant,
                    onScanTenant = onScanTenant,
                    onOpenNotifications = onOpenNotifications
                )
            }
            content(Modifier.weight(1f))
        }
    }
}

@Composable
private fun GuestUtilityTopBar(
    unreadNotificationCount: Int,
    onAddTenant: () -> Unit,
    onScanTenant: () -> Unit,
    onOpenNotifications: () -> Unit
) {
    var addMenuExpanded by remember { mutableStateOf(false) }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .statusBarsPadding()
            .padding(start = 16.dp, end = 16.dp, top = 2.dp, bottom = 4.dp),
        horizontalArrangement = Arrangement.End,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box {
            FilledTonalIconButton(
                onClick = { addMenuExpanded = true },
                colors = IconButtonDefaults.filledTonalIconButtonColors(containerColor = MaterialTheme.colorScheme.surface),
                modifier = Modifier.size(44.dp)
            ) {
                Icon(Icons.Rounded.Add, contentDescription = "Add tenancy", modifier = Modifier.size(22.dp))
            }
            DropdownMenu(expanded = addMenuExpanded, onDismissRequest = { addMenuExpanded = false }) {
                DropdownMenuItem(
                    text = { Text("Add code manually") },
                    onClick = {
                        addMenuExpanded = false
                        onAddTenant()
                    }
                )
                DropdownMenuItem(
                    text = { Text("QR scan") },
                    leadingIcon = { Icon(Icons.Rounded.QrCodeScanner, contentDescription = null) },
                    onClick = {
                        addMenuExpanded = false
                        onScanTenant()
                    }
                )
            }
        }
        Spacer(Modifier.width(8.dp))
        BadgedBox(
            badge = {
                if (unreadNotificationCount > 0) {
                    Badge { Text(unreadNotificationCount.coerceAtMost(99).toString()) }
                }
            }
        ) {
            FilledTonalIconButton(
                onClick = onOpenNotifications,
                colors = IconButtonDefaults.filledTonalIconButtonColors(containerColor = MaterialTheme.colorScheme.surface),
                modifier = Modifier.size(44.dp)
            ) {
                Icon(Icons.Rounded.NotificationsNone, contentDescription = "Notifications", modifier = Modifier.size(22.dp))
            }
        }
    }
}

@Composable
private fun BottomNavBar(current: String, onTabSelected: (String) -> Unit) {
    val items = listOf(
        Triple(RootRoute.Home.route, "Home", Icons.Rounded.Home),
        Triple(RootRoute.Wallet.route, "Wallet", Icons.Rounded.Wallet),
        Triple(RootRoute.Inbox.route, "Inbox", Icons.Rounded.MailOutline),
        Triple(RootRoute.Profile.route, "Profile", Icons.Rounded.Person)
    )

    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RectangleShape,
        color = MaterialTheme.colorScheme.surface,
        shadowElevation = 10.dp,
        tonalElevation = 0.dp
    ) {
        Column(modifier = Modifier.fillMaxWidth()) {
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f))
            Box(modifier = Modifier.fillMaxWidth()) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .navigationBarsPadding()
                        .padding(horizontal = 8.dp, vertical = 10.dp),
                    horizontalArrangement = Arrangement.SpaceAround,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    items.take(2).forEach { (route, label, icon) ->
                        BottomItem(selected = current == route, label = label, onClick = { onTabSelected(route) }, icon = { Icon(icon, contentDescription = label) })
                    }
                    Spacer(modifier = Modifier.width(80.dp))
                    items.drop(2).forEach { (route, label, icon) ->
                        BottomItem(selected = current == route, label = label, onClick = { onTabSelected(route) }, icon = { Icon(icon, contentDescription = label) })
                    }
                }

                FloatingActionButton(
                    onClick = { onTabSelected(RootRoute.Book.route) },
                    modifier = Modifier
                        .align(Alignment.Center)
                        .offset(y = (-14).dp)
                        .graphicsLayer { shadowElevation = 24.dp.toPx() },
                    shape = CircleShape,
                    containerColor = if (current == RootRoute.Book.route) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant,
                    contentColor = if (current == RootRoute.Book.route) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.primary
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            Icons.Rounded.CalendarMonth,
                            contentDescription = "Book",
                            modifier = Modifier
                                .size(28.dp)
                                .offset(y = (-1).dp)
                        )
                        Surface(
                            modifier = Modifier
                                .align(Alignment.BottomEnd)
                                .offset(x = 3.dp, y = 3.dp)
                                .size(16.dp),
                            shape = CircleShape,
                            color = MaterialTheme.colorScheme.secondary
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(
                                    Icons.Rounded.Add,
                                    contentDescription = null,
                                    modifier = Modifier.size(11.dp),
                                    tint = MaterialTheme.colorScheme.onSecondary
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun BottomItem(selected: Boolean, label: String, onClick: () -> Unit, icon: @Composable () -> Unit) {
    TextButton(onClick = onClick, contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp)) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
            CompositionLocalProvider(LocalContentColor provides if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant) {
                ProvideTextStyle(MaterialTheme.typography.titleMedium) { icon() }
            }
            Text(label, style = MaterialTheme.typography.labelMedium, fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium, color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

private suspend fun joinTenantWithCode(
    code: String,
    repo: si.calendra.guest.shared.repository.GuestRepository,
    state: GuestMutableState,
    navController: androidx.navigation.NavHostController
) {
    val normalizedCode = extractTenantCode(code)
        ?: throw IllegalArgumentException("The QR code does not contain a tenancy code.")
    val tenantLookup = repo.resolveTenant(normalizedCode)
    repo.joinTenant(JoinTenantRequest(joinMethod = "TENANT_CODE", tenantCode = normalizedCode))
    val updatedSession = repo.me()
    val token = state.uiState.session?.token.orEmpty()
    GuestSessionStore.authToken = token
    val tenant = updatedSession.linkedTenants.firstOrNull { it.companyId == tenantLookup.companyId }
        ?: TenantSummary(
            companyId = tenantLookup.companyId,
            companyName = tenantLookup.companyName,
            publicDescription = tenantLookup.publicDescription,
            publicCity = tenantLookup.publicCity,
            publicPhone = tenantLookup.publicPhone,
            companyAddress = tenantLookup.companyAddress,
            status = "ACTIVE"
        )
    val home = repo.home(tenant.companyId)
    val dashboard = TenantDashboard(
        tenant = home.tenant,
        home = home,
        products = repo.products(tenant.companyId),
        wallet = repo.wallet(tenant.companyId),
        history = repo.bookingHistory(tenant.companyId),
        notifications = repo.notifications(tenant.companyId).items
    )
    state.uiState = state.uiState.copy(
        session = GuestSession(
            token = token,
            guestUser = updatedSession.guestUser,
            linkedTenants = updatedSession.linkedTenants
        ),
        linkedTenants = updatedSession.linkedTenants,
        selectedTenantId = null,
        tenantDashboards = state.uiState.tenantDashboards + (tenant.companyId to dashboard)
    )
    navController.navigate(RootRoute.Home.route) { launchSingleTop = true }
}

private fun extractTenantCode(raw: String?): String? {
    val value = raw?.trim().orEmpty()
    if (value.isBlank()) return null
    if (!value.contains("://")) return value
    return runCatching {
        val uri = Uri.parse(value)
        uri.getQueryParameter("tenantCode")
            ?: uri.getQueryParameter("code")
            ?: uri.lastPathSegment
    }.getOrNull()?.takeIf { it.isNotBlank() } ?: value.substringAfterLast('/').substringBefore('?').takeIf { it.isNotBlank() }
}

private fun unreadNotificationCount(state: GuestUiState): Int =
    selectedTenantIds(state)
        .flatMap { tenantId -> state.tenantDashboards[tenantId]?.notifications.orEmpty() }
        .count { it.readAt == null }

private fun aggregatedWallet(state: GuestUiState): WalletPayload? {
    val dashboards = state.linkedTenants.mapNotNull { state.tenantDashboards[it.companyId] }
    if (dashboards.isEmpty()) return null
    return WalletPayload(
        entitlements = dashboards.flatMap { it.wallet?.entitlements.orEmpty() },
        orders = dashboards.flatMap { it.wallet?.orders.orEmpty() }
    )
}

private fun aggregatedWalletHistory(state: GuestUiState): List<BookingHistoryItem> =
    state.linkedTenants.flatMap { t -> state.tenantDashboards[t.companyId]?.history.orEmpty() }

private fun selectedTenantIds(state: GuestUiState): List<String> = state.selectedTenantId?.let(::listOf) ?: state.linkedTenants.map { it.companyId }

private fun aggregatedBookings(state: GuestUiState): List<UpcomingBookingCard> =
    selectedTenantIds(state).flatMap { tenantId ->
        val dashboard = state.tenantDashboards[tenantId]
        val tenant = dashboard?.home?.tenant ?: state.linkedTenants.firstOrNull { it.companyId == tenantId }
        dashboard?.home?.upcomingBookings.orEmpty().mapNotNull { booking ->
            tenant?.let {
                UpcomingBookingCard(
                    id = booking.bookingId,
                    title = booking.sessionTypeName,
                    startsAt = booking.startsAt,
                    status = booking.bookingStatus,
                    tenantName = it.companyName,
                    tenantCity = it.publicCity,
                    tenantPhone = it.publicPhone
                )
            }
        }
    }.sortedBy { runCatching { OffsetDateTime.parse(it.startsAt).toInstant().toEpochMilli() }.getOrDefault(Long.MAX_VALUE) }


private fun aggregatedAccesses(state: GuestUiState): List<AccessCard> =
    selectedTenantIds(state).flatMap { tenantId ->
        val dashboard = state.tenantDashboards[tenantId]
        val tenant = dashboard?.home?.tenant ?: state.linkedTenants.firstOrNull { it.companyId == tenantId }
        dashboard?.wallet?.entitlements.orEmpty().mapNotNull { access ->
            tenant?.let {
                AccessCard(
                    id = access.entitlementId,
                    name = access.productName,
                    type = access.entitlementType,
                    tenantName = it.companyName,
                    validUntil = access.validUntil,
                    remainingUses = access.remainingUses
                )
            }
        }
    }

private fun aggregatedServices(state: GuestUiState): List<ServiceOption> =
    selectedTenantIds(state).flatMap { tenantId ->
        val dashboard = state.tenantDashboards[tenantId]
        val tenant = dashboard?.home?.tenant ?: state.linkedTenants.firstOrNull { it.companyId == tenantId }
        dashboard?.products.orEmpty().filter { it.bookable && !it.sessionTypeId.isNullOrBlank() }.mapNotNull { product ->
            tenant?.let {
                ServiceOption(
                    id = "$tenantId-${product.productId}",
                    companyId = tenantId,
                    tenantName = it.companyName,
                    tenantCity = it.publicCity,
                    productId = product.productId,
                    name = product.name,
                    description = product.description,
                    priceGross = product.priceGross,
                    currency = product.currency,
                    durationMinutes = product.durationMinutes,
                    sessionTypeId = product.sessionTypeId.orEmpty()
                )
            }
        }
    }.sortedBy { it.name }

private fun aggregatedRedeemableEntitlements(state: GuestUiState): List<RedeemableEntitlementOption> =
    selectedTenantIds(state).flatMap { tenantId ->
        state.tenantDashboards[tenantId]?.wallet?.entitlements.orEmpty().map { entitlement ->
            RedeemableEntitlementOption(
                entitlementId = entitlement.entitlementId,
                companyId = tenantId,
                productName = entitlement.productName,
                remainingUses = entitlement.remainingUses,
                validUntil = entitlement.validUntil,
                sessionTypeId = entitlement.sessionTypeId,
                autoRenews = entitlement.autoRenews
            )
        }
    }

private fun aggregatedWalletOffers(state: GuestUiState): List<WalletOfferCard> =
    selectedTenantIds(state).flatMap { tenantId ->
        state.tenantDashboards[tenantId]?.products.orEmpty()
            .filter { !it.bookable || it.productType == "PACK" || it.productType == "MEMBERSHIP" || it.productType == "CLASS_TICKET" }
            .map { product ->
                WalletOfferCard(
                    companyId = tenantId,
                    productId = product.productId,
                    name = product.name,
                    productType = product.productType,
                    priceGross = product.priceGross,
                    currency = product.currency,
                    description = product.description,
                    sessionTypeName = product.sessionTypeName
                )
            }
    }.sortedBy { it.name }

private fun findTenantForEntitlement(state: GuestUiState, entitlementId: String): String? =
    state.tenantDashboards.entries.firstOrNull { (_, dashboard) ->
        dashboard.wallet?.entitlements.orEmpty().any { it.entitlementId == entitlementId }
    }?.key
