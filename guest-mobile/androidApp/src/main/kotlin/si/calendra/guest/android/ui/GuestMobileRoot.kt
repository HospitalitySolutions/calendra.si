package si.calendra.guest.android.ui

import android.util.Log
import android.content.Intent
import android.content.ActivityNotFoundException
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.CalendarMonth
import androidx.compose.material.icons.rounded.Tune
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material.icons.rounded.KeyboardArrowRight
import androidx.compose.material.icons.rounded.NotificationsNone
import androidx.compose.material.icons.rounded.QrCodeScanner
import androidx.compose.material.icons.rounded.Home
import androidx.compose.material.icons.rounded.Forum
import androidx.compose.material.icons.rounded.Business
import androidx.compose.material.icons.rounded.FitnessCenter
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.PersonOutline
import androidx.compose.material.icons.rounded.Phone
import androidx.compose.material.icons.rounded.Wallet
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import si.calendra.guest.android.BuildConfig
import si.calendra.guest.android.R
import si.calendra.guest.android.auth.GoogleSignInManager
import si.calendra.guest.android.files.GuestAttachmentManager
import si.calendra.guest.android.payments.NativeCheckoutManager
import si.calendra.guest.android.payments.PaymentRedirectBus
import si.calendra.guest.android.push.GuestBookingChangeBus
import si.calendra.guest.android.push.GuestBookingRealtimeStream
import si.calendra.guest.android.push.GuestInboxDeepLinkBus
import si.calendra.guest.android.push.GuestPushManager
import si.calendra.guest.android.ui.screens.*
import si.calendra.guest.shared.GuestAppContainer
import si.calendra.guest.shared.config.GuestApiConfig
import si.calendra.guest.shared.models.*
import java.io.File
import java.io.FileOutputStream
import si.calendra.guest.shared.network.GuestSessionStore
import java.time.OffsetDateTime
import androidx.core.content.FileProvider

private enum class TenantPickerTarget {
    Calendar,
    Wallet,
    Inbox
}

private sealed class RootRoute(val route: String) {
    data object Splash : RootRoute("splash")
    data object Welcome : RootRoute("welcome")
    data object Login : RootRoute("login")
    data object Signup : RootRoute("signup")
    data object VerifyEmailCode : RootRoute("verify-email-code")
    data object JoinTenant : RootRoute("join-tenant")
    data object Home : RootRoute("home")
    data object Calendar : RootRoute("calendar")
    data object Book : RootRoute("book")
    data object Reschedule : RootRoute("reschedule")
    data object Wallet : RootRoute("wallet")
    data object Inbox : RootRoute("inbox")
    data object Notifications : RootRoute("notifications")
    data object Profile : RootRoute("profile")
}

private const val GOOGLE_WEB_CLIENT_ID = "773864552259-amsepvt8fs6tso2uado0ck4pj08179gp.apps.googleusercontent.com"
private const val STRIPE_PUBLISHABLE_KEY = "YOUR_STRIPE_PUBLISHABLE_KEY"
private const val WALLET_OFFERS_REFRESH_DEBOUNCE_MS = 1500L

private const val GUEST_API_DEBUG_TAG = "GuestApi"
private val GUEST_APP_BELL_NOTIFICATION_TYPES = setOf(
    "BOOKING_CONFIRMED",
    "BOOKING_RESCHEDULED",
    "BOOKING_CANCELLED",
    "BOOKING_REMINDER",
    "BOOKING_FOLLOW_UP"
)

private fun openTenantDialer(context: android.content.Context, rawPhone: String?) {
    val compact = rawPhone.orEmpty()
        .filter { it.isDigit() || it == '+' }
        .trimStart()
    if (compact.isEmpty()) return
    val uri = Uri.parse("tel:$compact")
    runCatching { context.startActivity(Intent(Intent.ACTION_DIAL, uri)) }
}

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

@OptIn(ExperimentalMaterial3Api::class)
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
    var headerAvatarBitmap by remember { mutableStateOf<Bitmap?>(null) }
    val headerAvatarInitials = headerProfileInitials(state.uiState.session?.guestUser)
    val activity = context as? ComponentActivity
    val snackbarHostState = remember { SnackbarHostState() }
    val lifecycleOwner = LocalLifecycleOwner.current
    var statusMessage by remember { mutableStateOf<String?>(null) }
    var signupChallenge by remember { mutableStateOf<SignupChallenge?>(null) }
    var bootstrappingSession by remember { mutableStateOf(true) }
    /** Covers auth UI until session + tenant dashboards are ready (avoids a flash of login after Google OAuth closes). */
    var socialSignInOverlay by remember { mutableStateOf(false) }
    var appUiLocale by remember { mutableStateOf(preferencesStore.loadAppUiLocale()) }
    var showWalletTenantPicker by remember { mutableStateOf(false) }
    var walletTenantPickerDraftId by remember { mutableStateOf<String?>(null) }
    var calendarSelectedTenantId by remember { mutableStateOf<String?>(null) }
    var tenantPickerTarget by remember { mutableStateOf(TenantPickerTarget.Wallet) }
    var lastWalletOffersRefreshTenantId by remember { mutableStateOf<String?>(null) }
    var lastWalletOffersRefreshAtMs by remember { mutableStateOf(0L) }
    var rescheduleContext by remember { mutableStateOf<BookingRescheduleContext?>(null) }
    val realtimeJobs = remember { mutableMapOf<String, Job>() }
    val realtimeRefreshMutex = remember { Mutex() }
    val qrScannerLauncher = rememberLauncherForActivityResult(contract = ScanContract()) { result ->
        val tenantCode = extractTenantCode(result.contents)
        if (!tenantCode.isNullOrBlank()) {
            scope.launch {
                runCatching {
                    joinTenantWithCode(
                        tenantCode,
                        repo,
                        state,
                        navController,
                        onPersistToken = { preferencesStore.saveAuthToken(it) }
                    )
                }
                    .onFailure { statusMessage = it.message ?: "Tenant join failed" }
            }
        }
    }

    LaunchedEffect(state.uiState.session?.guestUser?.id, state.uiState.session?.guestUser?.profilePicturePath) {
        val path = state.uiState.session?.guestUser?.profilePicturePath?.trim().orEmpty()
        headerAvatarBitmap = if (path.isNotBlank()) {
            withContext(Dispatchers.IO) {
                runCatching { repo.downloadProfilePicture() }
                    .getOrNull()
                    ?.takeIf { it.isNotEmpty() }
                    ?.let { bytes -> BitmapFactory.decodeByteArray(bytes, 0, bytes.size) }
            }
        } else {
            null
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
        preferencesStore.saveAuthToken(sessionToken.token)
        logLinkedTenantsDebug("applySession", sessionToken.linkedTenants)
        state.uiState = state.uiState.copy(
            session = sessionToken,
            linkedTenants = sessionToken.linkedTenants,
            selectedTenantId = state.uiState.selectedTenantId,
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
            notifications = repo.notifications(companyId).items,
            inboxThread = repo.inboxThreads(companyId).firstOrNull(),
            inboxMessages = state.uiState.tenantDashboards[companyId]?.inboxMessages.orEmpty()
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
                val activeTenantIds = profile.linkedTenants.map { it.companyId }.toSet()
                val selectedTenantId = state.uiState.selectedTenantId
                    ?.takeIf { activeTenantIds.contains(it) }
                    ?: profile.linkedTenants.firstOrNull()?.companyId
                val walletTenantId = state.uiState.walletSelectedTenantId
                    ?.takeIf { activeTenantIds.contains(it) }
                    ?: profile.linkedTenants.firstOrNull()?.companyId
                state.uiState = state.uiState.copy(
                    linkedTenants = profile.linkedTenants,
                    session = state.uiState.session?.copy(
                        guestUser = profile.guestUser,
                        linkedTenants = profile.linkedTenants
                    ),
                    selectedTenantId = selectedTenantId,
                    walletSelectedTenantId = walletTenantId,
                    tenantDashboards = state.uiState.tenantDashboards.filterKeys { activeTenantIds.contains(it) }
                )
            }
            state.uiState.linkedTenants.forEach { refreshTenant(it.companyId) }
        }.onFailure {
            statusMessage = it.message ?: "Failed to refresh tenant data"
        }
        state.uiState = state.uiState.copy(loading = false)
    }

    suspend fun completeAuth(session: GuestSession) {
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

    fun dial(phone: String) {
        context.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:${phone.filter { !it.isWhitespace() }}")))
    }

    fun sms(phone: String) {
        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("sms:${phone.filter { !it.isWhitespace() }}")))
    }

    suspend fun downloadReceiptToCache(orderId: String, pdfBytes: ByteArray): File = withContext(Dispatchers.IO) {
        val receiptsDir = File(context.cacheDir, "guest-receipts").apply { mkdirs() }
        val target = File(receiptsDir, "receipt-$orderId.pdf")
        FileOutputStream(target).use { it.write(pdfBytes) }
        target
    }

    suspend fun openReceiptPdf(file: File) {
        val receiptUri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
        withContext(Dispatchers.Main) {
            val viewIntent = Intent(Intent.ACTION_VIEW)
                .setDataAndType(receiptUri, "application/pdf")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
            try {
                context.startActivity(
                    Intent.createChooser(viewIntent, "Open receipt")
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                )
            } catch (_: ActivityNotFoundException) {
                val shareIntent = Intent(Intent.ACTION_SEND)
                    .setType("application/pdf")
                    .putExtra(Intent.EXTRA_STREAM, receiptUri)
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(
                    Intent.createChooser(shareIntent, "Share receipt")
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                )
            }
        }
    }

    fun logout() {
        GuestSessionStore.authToken = null
        preferencesStore.clearAuthToken()
        state.uiState = GuestUiState()
        navController.navigate(RootRoute.Login.route) {
            popUpTo(navController.graph.id) { inclusive = true }
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

    fun openWalletTabWithTenantSelection() {
        val tenants = state.uiState.linkedTenants
        if (tenants.size <= 1) {
            val onlyTenantId = tenants.firstOrNull()?.companyId
            state.uiState = state.uiState.copy(walletSelectedTenantId = onlyTenantId)
            navigateToTab(RootRoute.Wallet.route)
            return
        }
        navigateToTab(RootRoute.Wallet.route)
        val currentWalletTenantId = state.uiState.walletSelectedTenantId
            ?.takeIf { selected -> tenants.any { it.companyId == selected } }
            ?: tenants.first().companyId
        tenantPickerTarget = TenantPickerTarget.Wallet
        walletTenantPickerDraftId = currentWalletTenantId
        showWalletTenantPicker = true
    }

    fun refreshWalletOffersIfNeeded(tenantId: String?) {
        val normalizedTenantId = tenantId?.takeIf { it.isNotBlank() } ?: return
        val now = System.currentTimeMillis()
        val isSameTenant = lastWalletOffersRefreshTenantId == normalizedTenantId
        val elapsed = now - lastWalletOffersRefreshAtMs
        if (isSameTenant && elapsed < WALLET_OFFERS_REFRESH_DEBOUNCE_MS) return
        lastWalletOffersRefreshTenantId = normalizedTenantId
        lastWalletOffersRefreshAtMs = now
        scope.launch {
            runCatching { refreshTenant(normalizedTenantId) }
                .onFailure { if (BuildConfig.DEBUG) Log.d(GUEST_API_DEBUG_TAG, "Wallet offers refresh skipped: ${it.message}") }
        }
    }

    fun requestTabNavigation(route: String) {
        if (route == RootRoute.Wallet.route) {
            openWalletTabWithTenantSelection()
        } else {
            if (route == RootRoute.Book.route) {
                val selectedTenantId = state.uiState.selectedTenantId
                    ?.takeIf { selected -> state.uiState.linkedTenants.any { it.companyId == selected } }
                    ?: state.uiState.linkedTenants.firstOrNull()?.companyId
                if (selectedTenantId != null) {
                    scope.launch {
                        runCatching { refreshTenant(selectedTenantId) }
                            .onFailure {
                                if (BuildConfig.DEBUG) {
                                    Log.d(GUEST_API_DEBUG_TAG, "Book tab tenant refresh skipped: ${it.message}")
                                }
                            }
                    }
                }
            }
            navigateToTab(route)
        }
    }

    fun exitRescheduleToHome() {
        navController.navigate(RootRoute.Home.route) {
            popUpTo(RootRoute.Reschedule.route) { inclusive = true }
            launchSingleTop = true
        }
    }

    suspend fun openInboxFromPush(companyId: String) {
        if (companyId.isBlank()) return
        runCatching {
            state.uiState = state.uiState.copy(selectedTenantId = companyId)
            if (state.uiState.session != null) {
                requestTabNavigation(RootRoute.Inbox.route)
            }
            if (state.uiState.linkedTenants.any { it.companyId == companyId }) {
                refreshTenant(companyId)
                val items = repo.inboxMessages(companyId)
                val refreshedThread = repo.inboxThreads(companyId).firstOrNull()
                val dashboard = state.uiState.tenantDashboards[companyId]
                if (dashboard != null) {
                    state.uiState = state.uiState.copy(
                        tenantDashboards = state.uiState.tenantDashboards + (companyId to dashboard.copy(
                            inboxMessages = items,
                            inboxThread = refreshedThread ?: dashboard.inboxThread?.copy(unreadCount = 0)
                        ))
                    )
                }
            }
        }.onFailure {
            statusMessage = it.message ?: "Unable to open message thread"
        }
    }

    LaunchedEffect(Unit) {
        val persistedToken = preferencesStore.loadAuthToken()
        if (persistedToken.isNullOrBlank()) {
            navController.navigate(RootRoute.Welcome.route) {
                popUpTo(RootRoute.Splash.route) { inclusive = true }
                launchSingleTop = true
            }
            bootstrappingSession = false
        } else {
            GuestSessionStore.authToken = persistedToken
            runCatching { repo.me() }
                .onSuccess { profile ->
                    val session = GuestSession(
                        token = persistedToken,
                        guestUser = profile.guestUser,
                        linkedTenants = profile.linkedTenants
                    )
                    completeAuth(session)
                }
                .onFailure {
                    GuestSessionStore.authToken = null
                    preferencesStore.clearAuthToken()
                    navController.navigate(RootRoute.Welcome.route) {
                        popUpTo(RootRoute.Splash.route) { inclusive = true }
                        launchSingleTop = true
                    }
                }
            bootstrappingSession = false
        }

        GuestInboxDeepLinkBus.consumePending()?.let { openInboxFromPush(it) }
        GuestInboxDeepLinkBus.events.collectLatest { companyId ->
            openInboxFromPush(companyId)
        }
    }

    LaunchedEffect(state.uiState.session?.token, state.uiState.linkedTenants) {
        realtimeJobs.values.forEach { it.cancel() }
        realtimeJobs.clear()
        val token = state.uiState.session?.token
        if (token.isNullOrBlank()) return@LaunchedEffect
        state.uiState.linkedTenants.forEach { tenant ->
            val companyId = tenant.companyId
            val job = GuestBookingRealtimeStream.start(
                scope = scope,
                baseUrl = BuildConfig.API_BASE_URL,
                companyId = companyId
            ) { changedCompanyId ->
                scope.launch {
                    realtimeRefreshMutex.withLock {
                        runCatching { refreshTenant(changedCompanyId) }
                    }
                }
            }
            realtimeJobs[companyId] = job
        }
    }

    DisposableEffect(Unit) {
        onDispose {
            realtimeJobs.values.forEach { it.cancel() }
            realtimeJobs.clear()
        }
    }

    LaunchedEffect(Unit) {
        GuestBookingChangeBus.events.collectLatest { companyId ->
            runCatching { refreshTenant(companyId) }
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

    LaunchedEffect(state.uiState.session?.token) {
        if (state.uiState.session?.token.isNullOrBlank()) return@LaunchedEffect
        runCatching { GuestPushManager.syncCurrentToken(context.applicationContext, repo) }
            .onFailure { if (BuildConfig.DEBUG) Log.d(GUEST_API_DEBUG_TAG, "Push token sync skipped: ${it.message}") }
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
        NavHost(navController = navController, startDestination = RootRoute.Splash.route) {
            composable(RootRoute.Splash.route) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
            composable(RootRoute.Welcome.route) {
                WelcomeScreen(
                    languageCode = appUiLocale,
                    onLanguageChange = { code ->
                        preferencesStore.saveAppUiLocale(code)
                        appUiLocale = code
                    },
                    onContinue = { navController.navigate(RootRoute.Signup.route) },
                    onAlreadyHaveAccount = { navController.navigate(RootRoute.Login.route) }
                )
            }
            composable(RootRoute.Login.route) {
                LoginScreen(
                    languageCode = appUiLocale,
                    onLogin = { email, password ->
                        scope.launch {
                            runCatching { repo.login(LoginRequest(email, password)) }
                                .onSuccess { session -> completeAuth(session) }
                                .onFailure { statusMessage = it.message ?: "Login failed" }
                        }
                    },
                    onGoogleLogin = {
                        scope.launch {
                            socialSignInOverlay = true
                            try {
                                val manager = buildGoogleManager()
                                if (manager == null) {
                                    statusMessage = "Google Sign-In is unavailable in this context."
                                    return@launch
                                }
                                manager.signInWithGoogleButton()
                                    .onSuccess { idToken ->
                                        runCatching { repo.loginWithGoogle(idToken) }
                                            .onSuccess { session -> completeAuth(session) }
                                            .onFailure { statusMessage = it.message ?: "Google login failed" }
                                    }
                                    .onFailure { statusMessage = it.message ?: "Google Sign-In failed" }
                            } finally {
                                socialSignInOverlay = false
                            }
                        }
                    },
                    onLanguageChange = { code ->
                        preferencesStore.saveAppUiLocale(code)
                        appUiLocale = code
                    },
                    onCreateAccount = { navController.navigate(RootRoute.Signup.route) }
                )
            }
            composable(RootRoute.Signup.route) {
                var signupSubmitting by remember { mutableStateOf(false) }
                SignupScreen(
                    isSubmitting = signupSubmitting,
                    languageCode = appUiLocale,
                    onLanguageChange = { code ->
                        preferencesStore.saveAppUiLocale(code)
                        appUiLocale = code
                    },
                    onSubmit = click@{ request ->
                        if (signupSubmitting) return@click
                        signupSubmitting = true
                        scope.launch {
                            try {
                                runCatching { repo.signupStart(request) }
                                    .onSuccess { challenge ->
                                        signupChallenge = challenge
                                        navController.navigate(RootRoute.VerifyEmailCode.route)
                                    }
                                    .onFailure { statusMessage = it.message ?: "Could not send verification code." }
                            } finally {
                                signupSubmitting = false
                            }
                        }
                    },
                    onGoogleSignup = {
                        if (!signupSubmitting) {
                            scope.launch {
                                socialSignInOverlay = true
                                try {
                                    val manager = buildGoogleManager()
                                    if (manager == null) {
                                        statusMessage = "Google Sign-Up is unavailable in this context."
                                        return@launch
                                    }
                                    manager.signInWithGoogleButton()
                                        .onSuccess { idToken ->
                                            runCatching { repo.loginWithGoogle(idToken) }
                                                .onSuccess { session -> completeAuth(session) }
                                                .onFailure { statusMessage = it.message ?: "Google sign-up failed" }
                                        }
                                        .onFailure { statusMessage = it.message ?: "Google Sign-Up failed" }
                                } finally {
                                    socialSignInOverlay = false
                                }
                            }
                        }
                    },
                    onBackToLogin = { navController.navigate(RootRoute.Login.route) }
                )
            }
            composable(RootRoute.VerifyEmailCode.route) {
                val activeChallenge = signupChallenge
                if (activeChallenge == null) {
                    LaunchedEffect(Unit) { navController.navigate(RootRoute.Signup.route) }
                } else {
                    EmailCodeVerificationScreen(
                        email = activeChallenge.email,
                        onVerify = { code ->
                            scope.launch {
                                runCatching { repo.verifySignupCode(activeChallenge.challengeId, code) }
                                    .onSuccess { session -> completeAuth(session) }
                                    .onFailure { statusMessage = it.message ?: "Verification failed." }
                            }
                        },
                        onResend = {
                            scope.launch {
                                runCatching { repo.resendSignupCode(activeChallenge.challengeId) }
                                    .onSuccess { challenge ->
                                        signupChallenge = challenge
                                        statusMessage = "A new verification code was sent."
                                    }
                                    .onFailure { statusMessage = it.message ?: "Could not resend code." }
                            }
                        },
                        onBackToLogin = { navController.navigate(RootRoute.Login.route) }
                    )
                }
            }
            composable(RootRoute.JoinTenant.route) {
                JoinTenantScreen(
                    repository = repo,
                    languageCode = appUiLocale,
                    subscribedTenantIds = state.uiState.linkedTenants.map { it.companyId }.toSet(),
                    onJoinWithCode = { code ->
                        scope.launch {
                            runCatching {
                                joinTenantWithCode(
                                    code,
                                    repo,
                                    state,
                                    navController,
                                    onPersistToken = { preferencesStore.saveAuthToken(it) }
                                )
                            }
                                .onFailure { statusMessage = it.message ?: "Tenant join failed" }
                        }
                    },
                    onJoinPublicTenant = { companyId ->
                        scope.launch {
                            runCatching {
                                joinPublicTenant(
                                    companyId,
                                    repo,
                                    state,
                                    navController,
                                    onPersistToken = { preferencesStore.saveAuthToken(it) }
                                )
                            }
                                .onFailure { statusMessage = it.message ?: "Tenant join failed" }
                        }
                    },
                    onQrScanned = { raw ->
                        val tenantCode = extractTenantCode(raw)
                        if (!tenantCode.isNullOrBlank()) {
                            scope.launch {
                                runCatching {
                                    joinTenantWithCode(
                                        tenantCode,
                                        repo,
                                        state,
                                        navController,
                                        onPersistToken = { preferencesStore.saveAuthToken(it) }
                                    )
                                }
                                    .onFailure { statusMessage = it.message ?: "Tenant join failed" }
                            }
                        } else {
                            statusMessage = "The QR code does not contain a tenancy code."
                        }
                    },
                    onBack = {
                        if (state.uiState.linkedTenants.isEmpty()) {
                            navController.navigate(RootRoute.Login.route) {
                                popUpTo(navController.graph.id) { inclusive = true }
                                launchSingleTop = true
                            }
                        } else if (!navController.popBackStack()) {
                            navController.navigate(RootRoute.Home.route) { launchSingleTop = true }
                        }
                    },
                )
            }
            composable(RootRoute.Home.route) {
                GuestTabsScaffold(
                    current = RootRoute.Home.route,
                    languageCode = appUiLocale,
                    utilityBarVisible = true,
                    unreadNotificationCount = unreadBellCount(state.uiState),
                    unreadInboxCount = unreadInboxCount(state.uiState),
                    profileAvatarBitmap = headerAvatarBitmap,
                    profileInitials = headerAvatarInitials,
                    onAddTenant = { navController.navigate(RootRoute.JoinTenant.route) { launchSingleTop = true } },
                    onScanTenant = {
                        val options = ScanOptions().apply {
                            setDesiredBarcodeFormats(ScanOptions.QR_CODE)
                            setPrompt("Scan tenancy QR code")
                            setBeepEnabled(false)
                            setOrientationLocked(true)
                        }
                        qrScannerLauncher.launch(options)
                    },
                    onOpenNotifications = { navController.navigate(RootRoute.Notifications.route) { launchSingleTop = true } },
                    onTabSelected = ::requestTabNavigation,
                    leading = { ProfileTopLogo() }
                ) { innerModifier ->
                    HomeScreen(
                        modifier = innerModifier,
                        guestFirstName = state.uiState.session?.guestUser?.firstName,
                        bookings = aggregatedBookings(state.uiState),
                        accesses = aggregatedAccesses(state.uiState),
                        languageCode = appUiLocale,
                        onChooseTenant = { navController.navigate(RootRoute.JoinTenant.route) { launchSingleTop = true } },
                        onOpenNotifications = { navController.navigate(RootRoute.Notifications.route) { launchSingleTop = true } },
                        onBookNow = { requestTabNavigation(RootRoute.Book.route) },
                        onCall = ::dial,
                        onSms = ::sms,
                        onReschedule = { booking ->
                            rescheduleContext = BookingRescheduleContext(
                                bookingId = booking.id,
                                companyId = booking.companyId,
                                sessionTypeId = booking.sessionTypeId,
                                sessionTypeName = booking.title
                            )
                            navController.navigate(RootRoute.Reschedule.route) { launchSingleTop = true }
                        },
                        onCancelBooking = { booking ->
                            scope.launch {
                                runCatching {
                                    repo.cancelBooking(booking.companyId, booking.id)
                                    refreshTenant(booking.companyId)
                                }
                                    .onSuccess { statusMessage = "Booking cancelled" }
                                    .onFailure { statusMessage = it.message ?: "Booking cancellation failed" }
                            }
                        }
                    )
                }
            }
            composable(RootRoute.Calendar.route) {
                val calendarTenantLabel = calendarSelectedTenantId
                    ?.let { selectedId ->
                        state.uiState.tenantDashboards[selectedId]?.tenant?.companyName
                            ?: state.uiState.linkedTenants.firstOrNull { it.companyId == selectedId }?.companyName
                    }
                    ?: if (appUiLocale.lowercase().startsWith("sl")) "Vsi ponudniki" else "All providers"
                GuestTabsScaffold(
                    current = RootRoute.Calendar.route,
                    languageCode = appUiLocale,
                    utilityBarVisible = state.uiState.linkedTenants.isNotEmpty(),
                    unreadNotificationCount = unreadBellCount(state.uiState),
                    unreadInboxCount = unreadInboxCount(state.uiState),
                    profileAvatarBitmap = headerAvatarBitmap,
                    profileInitials = headerAvatarInitials,
                    onAddTenant = { navController.navigate(RootRoute.JoinTenant.route) { launchSingleTop = true } },
                    onScanTenant = {
                        val options = ScanOptions().apply {
                            setDesiredBarcodeFormats(ScanOptions.QR_CODE)
                            setPrompt("Scan tenancy QR code")
                            setBeepEnabled(false)
                            setOrientationLocked(true)
                        }
                        qrScannerLauncher.launch(options)
                    },
                    onOpenNotifications = { navController.navigate(RootRoute.Notifications.route) { launchSingleTop = true } },
                    onTabSelected = ::requestTabNavigation,
                    leading = { ProfileTopLogo() },
                    tenantSelectorLabel = calendarTenantLabel,
                    onTenantSelectorClick = {
                        tenantPickerTarget = TenantPickerTarget.Calendar
                        walletTenantPickerDraftId = calendarSelectedTenantId
                        showWalletTenantPicker = true
                    }
                ) { innerModifier ->
                    CalendarScreen(
                        modifier = innerModifier,
                        bookings = aggregatedCalendarBookings(state.uiState),
                        tenants = state.uiState.linkedTenants,
                        languageCode = appUiLocale,
                        selectedTenantId = calendarSelectedTenantId,
                        onOpenBooking = { booking ->
                            rescheduleContext = BookingRescheduleContext(
                                bookingId = booking.id,
                                companyId = booking.companyId,
                                sessionTypeId = booking.sessionTypeId,
                                sessionTypeName = booking.title
                            )
                            navController.navigate(RootRoute.Reschedule.route) { launchSingleTop = true }
                        }
                    )
                }
            }
            composable(RootRoute.Book.route) {
                GuestTabsScaffold(
                    current = RootRoute.Book.route,
                    languageCode = appUiLocale,
                    utilityBarVisible = false,
                    unreadNotificationCount = unreadBellCount(state.uiState),
                    unreadInboxCount = unreadInboxCount(state.uiState),
                    onAddTenant = { navController.navigate(RootRoute.JoinTenant.route) { launchSingleTop = true } },
                    onScanTenant = {
                        val options = ScanOptions().apply {
                            setDesiredBarcodeFormats(ScanOptions.QR_CODE)
                            setPrompt("Scan tenancy QR code")
                            setBeepEnabled(false)
                            setOrientationLocked(true)
                        }
                        qrScannerLauncher.launch(options)
                    },
                    onOpenNotifications = { navController.navigate(RootRoute.Notifications.route) { launchSingleTop = true } },
                    onTabSelected = ::requestTabNavigation
                ) { innerModifier ->
                    BookScreen(
                        modifier = innerModifier,
                        languageCode = appUiLocale,
                        providers = state.uiState.linkedTenants.map { provider ->
                            ProviderOption(
                                companyId = provider.companyId,
                                tenantName = provider.companyName,
                                tenantAddress = provider.companyAddress ?: provider.publicCity,
                                requireOnlinePayment = provider.requireOnlinePayment,
                                paymentRequirement = provider.paymentRequirement,
                                depositPercent = provider.depositPercent,
                                acceptedPaymentMethods = provider.acceptedPaymentMethods
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
                        onOpenNotifications = { navController.navigate(RootRoute.Notifications.route) { launchSingleTop = true } },
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
                            navigateToTab(RootRoute.Home.route)
                        },
                        onExit = { navigateToTab(RootRoute.Home.route) }
                    )
                }
            }
            composable(RootRoute.Reschedule.route) {
                val context = rescheduleContext
                if (context == null) {
                    LaunchedEffect(Unit) { exitRescheduleToHome() }
                } else {
                    GuestTabsScaffold(
                        current = RootRoute.Home.route,
                        languageCode = appUiLocale,
                        utilityBarVisible = false,
                        unreadNotificationCount = unreadBellCount(state.uiState),
                        unreadInboxCount = unreadInboxCount(state.uiState),
                        onAddTenant = { navController.navigate(RootRoute.JoinTenant.route) { launchSingleTop = true } },
                        onScanTenant = {
                            val options = ScanOptions().apply {
                                setDesiredBarcodeFormats(ScanOptions.QR_CODE)
                                setPrompt("Scan tenancy QR code")
                                setBeepEnabled(false)
                                setOrientationLocked(true)
                            }
                            qrScannerLauncher.launch(options)
                        },
                        onOpenNotifications = { navController.navigate(RootRoute.Notifications.route) { launchSingleTop = true } },
                        onTabSelected = ::requestTabNavigation
                    ) { innerModifier ->
                        BookScreen(
                            modifier = innerModifier,
                            languageCode = appUiLocale,
                            providers = state.uiState.linkedTenants.map { provider ->
                                ProviderOption(
                                    companyId = provider.companyId,
                                    tenantName = provider.companyName,
                                    tenantAddress = provider.companyAddress ?: provider.publicCity,
                                    requireOnlinePayment = provider.requireOnlinePayment,
                                    paymentRequirement = provider.paymentRequirement,
                                    depositPercent = provider.depositPercent,
                                    acceptedPaymentMethods = provider.acceptedPaymentMethods
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
                            onOpenNotifications = { navController.navigate(RootRoute.Notifications.route) { launchSingleTop = true } },
                            onLoadAvailability = { service, date, consultantId -> repo.availability(service.companyId, service.sessionTypeId, date.toString(), consultantId).slots },
                            onLoadConsultants = { service ->
                                runCatching { repo.consultants(service.companyId, service.sessionTypeId) }.getOrElse { emptyList() }
                                    .map { si.calendra.guest.android.ui.screens.ConsultantOption(id = it.id, firstName = it.firstName, lastName = it.lastName, email = it.email) }
                            },
                            employeeSelectionStepEnabled = { companyId ->
                                state.uiState.linkedTenants.firstOrNull { it.companyId == companyId }?.employeeSelectionStep == true
                            },
                            onCheckout = { _, _, _, _ -> },
                            rescheduleContext = context,
                            onReschedule = { ctx, slotId, _ ->
                                repo.rescheduleBooking(ctx.companyId, ctx.bookingId, slotId)
                                refreshTenant(ctx.companyId)
                                rescheduleContext = null
                                statusMessage = "Booking rescheduled"
                                exitRescheduleToHome()
                            },
                            onExit = {
                                rescheduleContext = null
                                exitRescheduleToHome()
                            }
                        )
                    }
                }
            }
            composable(RootRoute.Wallet.route) {
                val walletTenantId = selectedWalletTenantId(state.uiState)
                val walletTenantName = state.uiState.linkedTenants
                    .firstOrNull { it.companyId == walletTenantId }
                    ?.companyName
                val walletTenantPaymentMethods = state.uiState.linkedTenants
                    .firstOrNull { it.companyId == walletTenantId }
                    ?.acceptedPaymentMethods
                    .orEmpty()
                LaunchedEffect(walletTenantId) {
                    refreshWalletOffersIfNeeded(walletTenantId)
                }
                GuestTabsScaffold(
                    current = RootRoute.Wallet.route,
                    languageCode = appUiLocale,
                    utilityBarVisible = state.uiState.linkedTenants.isNotEmpty(),
                    unreadNotificationCount = unreadBellCount(state.uiState),
                    unreadInboxCount = unreadInboxCount(state.uiState),
                    profileAvatarBitmap = headerAvatarBitmap,
                    profileInitials = headerAvatarInitials,
                    onAddTenant = { navController.navigate(RootRoute.JoinTenant.route) { launchSingleTop = true } },
                    onScanTenant = {
                        val options = ScanOptions().apply {
                            setDesiredBarcodeFormats(ScanOptions.QR_CODE)
                            setPrompt("Scan tenancy QR code")
                            setBeepEnabled(false)
                            setOrientationLocked(true)
                        }
                        qrScannerLauncher.launch(options)
                    },
                    onOpenNotifications = { navController.navigate(RootRoute.Notifications.route) { launchSingleTop = true } },
                    onTabSelected = ::requestTabNavigation,
                    leading = { ProfileTopLogo() },
                    tenantSelectorLabel = walletTenantName
                        ?: state.uiState.linkedTenants.firstOrNull { it.companyId == walletTenantId }?.companyName
                        ?: state.uiState.linkedTenants.firstOrNull()?.companyName
                        ?: if (appUiLocale.lowercase().startsWith("sl")) "Izberi ponudnika" else "Select tenant",
                    onTenantSelectorClick = {
                        tenantPickerTarget = TenantPickerTarget.Wallet
                        walletTenantPickerDraftId = walletTenantId
                            ?: state.uiState.linkedTenants.firstOrNull()?.companyId
                        showWalletTenantPicker = true
                    }
                ) { innerModifier ->
                    Box(innerModifier) {
                        WalletScreen(
                            wallet = walletTenantId?.let { state.uiState.tenantDashboards[it]?.wallet },
                            accessCards = walletTenantId?.let { walletAccessesForTenant(state.uiState, it) }.orEmpty(),
                            offers = walletTenantId?.let { walletOffersForTenant(state.uiState, it) }.orEmpty(),
                            tenantPaymentMethods = walletTenantPaymentMethods,
                            languageCode = appUiLocale,
                            tenantName = walletTenantName,
                            onOpenTenantPicker = { openWalletTabWithTenantSelection() },
                            onSubTabChanged = { nextSubTab ->
                                if (nextSubTab == WalletSubTab.Buy) {
                                    refreshWalletOffersIfNeeded(walletTenantId)
                                }
                            },
                            onViewReceipt = { order ->
                                scope.launch {
                                    runCatching {
                                        val pdfBytes = repo.downloadOrderReceiptPdf(order.orderId)
                                        val receiptFile = downloadReceiptToCache(order.orderId, pdfBytes)
                                        openReceiptPdf(receiptFile)
                                    }.onFailure {
                                        statusMessage = it.message ?: "Receipt download failed"
                                    }
                                }
                            },
                            onBuyOffer = { offer, paymentMethod ->
                                scope.launch {
                                    val checkout = runCatching {
                                        val order = repo.createOrder(
                                            CreateOrderRequest(
                                                companyId = offer.companyId,
                                                productId = offer.productId,
                                                paymentMethodType = paymentMethod
                                            )
                                        )
                                        repo.checkout(
                                            order.order.orderId,
                                            CheckoutRequest(
                                                paymentMethodType = paymentMethod,
                                                saveCard = paymentMethod == "CARD"
                                            )
                                        )
                                    }.getOrElse {
                                        statusMessage = it.message ?: "Purchase failed"
                                        return@launch
                                    }

                                    when (paymentMethod) {
                                        "BANK_TRANSFER" -> {
                                            statusMessage = checkout.bankTransfer?.let {
                                                "Reference ${it.referenceCode} • ${it.amount} ${it.currency}"
                                            } ?: "Bank transfer instructions issued"
                                        }
                                        else -> {
                                            buildCheckoutManager()?.handle(
                                                checkout = checkout,
                                                onComplete = {
                                                    statusMessage = checkout.bankTransfer?.instructions
                                                        ?: "Purchase complete"
                                                },
                                                onError = { error -> statusMessage = error }
                                            ) ?: run {
                                                statusMessage = checkout.bankTransfer?.instructions ?: checkout.status
                                            }
                                        }
                                    }
                                    refreshTenant(offer.companyId)
                                }
                            },
                            onOpenNotifications = { navController.navigate(RootRoute.Notifications.route) { launchSingleTop = true } },
                            onToggleAutoRenew = { entitlementId, autoRenews ->
                                scope.launch {
                                    val tenantId = walletTenantId ?: findTenantForEntitlement(state.uiState, entitlementId)
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
                val inboxSelectedId = state.uiState.selectedTenantId
                    ?: state.uiState.linkedTenants.firstOrNull()?.companyId
                val activeTenantId = inboxSelectedId
                val activeDashboard = activeTenantId?.let { state.uiState.tenantDashboards[it] }
                val inboxTenantPhone = activeDashboard?.tenant?.publicPhone
                    ?: state.uiState.linkedTenants
                        .firstOrNull { it.companyId == inboxSelectedId }
                        ?.publicPhone
                GuestTabsScaffold(
                    current = RootRoute.Inbox.route,
                    languageCode = appUiLocale,
                    utilityBarVisible = state.uiState.linkedTenants.isNotEmpty(),
                    unreadNotificationCount = unreadBellCount(state.uiState),
                    unreadInboxCount = unreadInboxCount(state.uiState),
                    profileAvatarBitmap = headerAvatarBitmap,
                    profileInitials = headerAvatarInitials,
                    onAddTenant = { navController.navigate(RootRoute.JoinTenant.route) { launchSingleTop = true } },
                    onScanTenant = {
                        val options = ScanOptions().apply {
                            setDesiredBarcodeFormats(ScanOptions.QR_CODE)
                            setPrompt("Scan tenancy QR code")
                            setBeepEnabled(false)
                            setOrientationLocked(true)
                        }
                        qrScannerLauncher.launch(options)
                    },
                    onOpenNotifications = { navController.navigate(RootRoute.Notifications.route) { launchSingleTop = true } },
                    onTabSelected = ::requestTabNavigation,
                    leading = { ProfileTopLogo() },
                    tenantSelectorLabel = activeDashboard?.tenant?.companyName
                        ?: state.uiState.linkedTenants.firstOrNull { it.companyId == activeTenantId }?.companyName
                        ?: state.uiState.linkedTenants.firstOrNull()?.companyName
                        ?: if (appUiLocale.lowercase().startsWith("sl")) "Izberi ponudnika" else "Select tenant",
                    onTenantSelectorClick = {
                        tenantPickerTarget = TenantPickerTarget.Inbox
                        walletTenantPickerDraftId = activeTenantId
                            ?: state.uiState.linkedTenants.firstOrNull()?.companyId
                        showWalletTenantPicker = true
                    }
                ) { innerModifier ->
                    LaunchedEffect(activeTenantId) {
                        val tenantId = activeTenantId ?: return@LaunchedEffect
                        runCatching {
                            val items = repo.inboxMessages(tenantId)
                            val refreshedThread = repo.inboxThreads(tenantId).firstOrNull()
                            items to refreshedThread
                        }
                            .onSuccess { (items, refreshedThread) ->
                                val dashboard = state.uiState.tenantDashboards[tenantId]
                                if (dashboard != null) {
                                    state.uiState = state.uiState.copy(
                                        tenantDashboards = state.uiState.tenantDashboards + (tenantId to dashboard.copy(
                                            inboxMessages = items,
                                            inboxThread = refreshedThread ?: dashboard.inboxThread?.copy(unreadCount = 0)
                                        ))
                                    )
                                }
                            }
                            .onFailure { statusMessage = it.message ?: "Unable to load messages" }
                    }
                    Box(innerModifier) {
                        InboxScreen(
                            tenantName = activeDashboard?.tenant?.companyName,
                            messages = activeDashboard?.inboxMessages.orEmpty(),
                            languageCode = appUiLocale,
                            onSend = { body, attachmentFileIds ->
                                val tenantId = activeTenantId
                                if (tenantId == null) {
                                    statusMessage = "Select a tenancy first"
                                } else {
                                    scope.launch {
                                        runCatching { repo.sendInboxMessage(tenantId, body, attachmentFileIds) }
                                            .onSuccess {
                                                refreshTenant(tenantId)
                                                val items = repo.inboxMessages(tenantId)
                                                val refreshedThread = repo.inboxThreads(tenantId).firstOrNull()
                                                val dashboard = state.uiState.tenantDashboards[tenantId]
                                                if (dashboard != null) {
                                                    state.uiState = state.uiState.copy(
                                                        tenantDashboards = state.uiState.tenantDashboards + (tenantId to dashboard.copy(
                                                            inboxMessages = items,
                                                            inboxThread = refreshedThread ?: dashboard.inboxThread
                                                        ))
                                                    )
                                                }
                                            }
                                            .onFailure { statusMessage = it.message ?: "Unable to send message" }
                                    }
                                }
                            },
                            uploadAttachment = { source ->
                                val tenantId = activeTenantId
                                    ?: throw IllegalStateException("Select a tenancy first")
                                val bytes = context.contentResolver.openInputStream(source.uri)?.use { it.readBytes() }
                                    ?: throw IllegalStateException("Unable to read the selected file")
                                repo.uploadInboxAttachment(
                                    companyId = tenantId,
                                    fileName = source.fileName,
                                    contentType = source.contentType,
                                    bytes = bytes
                                )
                            },
                            discardAttachment = { fileId ->
                                activeTenantId?.let { tenantId ->
                                    repo.discardInboxAttachment(tenantId, fileId)
                                }
                            },
                            onOpenAttachment = { attachment ->
                                val tenantId = activeTenantId
                                val authToken = GuestSessionStore.authToken
                                if (tenantId == null || authToken.isNullOrBlank()) {
                                    statusMessage = "Attachment is unavailable until you are signed in."
                                } else {
                                    scope.launch {
                                        runCatching {
                                            GuestAttachmentManager.downloadAndOpen(
                                                context = context,
                                                baseUrl = BuildConfig.API_BASE_URL,
                                                companyId = tenantId,
                                                authToken = authToken,
                                                attachment = attachment
                                            )
                                        }.onFailure { statusMessage = it.message ?: "Unable to open attachment" }
                                    }
                                }
                            },
                            loadAttachmentPreview = { attachment ->
                                val tenantId = activeTenantId
                                val authToken = GuestSessionStore.authToken
                                if (tenantId == null || authToken.isNullOrBlank()) {
                                    null
                                } else {
                                    GuestAttachmentManager.loadImagePreview(
                                        context = context,
                                        baseUrl = BuildConfig.API_BASE_URL,
                                        companyId = tenantId,
                                        authToken = authToken,
                                        attachment = attachment
                                    )
                                }
                            }
                        )
                    }
                }
            }
            composable(RootRoute.Notifications.route) {
                val aggregated = aggregatedNotifications(state.uiState)
                val tenantByNotification = aggregated.associate { it.first.notificationId to it.second }
                val notifications = aggregated.map { it.first }
                LaunchedEffect(Unit) {
                    selectedTenantIds(state.uiState).forEach { tenantId ->
                        runCatching { refreshTenant(tenantId) }
                    }
                }
                NotificationsScreen(
                    notifications = notifications,
                    onNotificationClick = { notification ->
                        val tenantId = tenantByNotification[notification.notificationId] ?: return@NotificationsScreen
                        scope.launch {
                            runCatching { repo.markNotificationRead(tenantId, notification.notificationId) }
                                .onSuccess {
                                    val dashboard = state.uiState.tenantDashboards[tenantId]
                                    if (dashboard != null) {
                                        val updated = dashboard.notifications.map {
                                            if (it.notificationId == notification.notificationId && it.readAt == null) {
                                                it.copy(readAt = OffsetDateTime.now().toString())
                                            } else it
                                        }
                                        state.uiState = state.uiState.copy(
                                            tenantDashboards = state.uiState.tenantDashboards + (tenantId to dashboard.copy(notifications = updated))
                                        )
                                    }
                                }
                                .onFailure { statusMessage = it.message ?: "Unable to mark notification as read" }
                        }
                    },
                    onMarkAllRead = {
                        scope.launch {
                            val tenantIds = selectedTenantIds(state.uiState)
                            tenantIds.forEach { tenantId ->
                                runCatching { repo.markAllNotificationsRead(tenantId) }
                                    .onSuccess {
                                        val dashboard = state.uiState.tenantDashboards[tenantId]
                                        if (dashboard != null) {
                                            val nowIso = OffsetDateTime.now().toString()
                                            val updated = dashboard.notifications.map {
                                                if (it.readAt == null) it.copy(readAt = nowIso) else it
                                            }
                                            state.uiState = state.uiState.copy(
                                                tenantDashboards = state.uiState.tenantDashboards + (tenantId to dashboard.copy(notifications = updated))
                                            )
                                        }
                                    }
                                    .onFailure { statusMessage = it.message ?: "Unable to mark notifications as read" }
                            }
                        }
                    },
                    onBack = { navController.popBackStack() }
                )
            }
            composable(RootRoute.Profile.route) {
                GuestTabsScaffold(
                    current = RootRoute.Profile.route,
                    languageCode = appUiLocale,
                    utilityBarVisible = state.uiState.linkedTenants.isNotEmpty(),
                    unreadNotificationCount = unreadBellCount(state.uiState),
                    unreadInboxCount = unreadInboxCount(state.uiState),
                    profileAvatarBitmap = headerAvatarBitmap,
                    profileInitials = headerAvatarInitials,
                    onAddTenant = { navController.navigate(RootRoute.JoinTenant.route) { launchSingleTop = true } },
                    onScanTenant = {
                        val options = ScanOptions().apply {
                            setDesiredBarcodeFormats(ScanOptions.QR_CODE)
                            setPrompt("Scan tenancy QR code")
                            setBeepEnabled(false)
                            setOrientationLocked(true)
                        }
                        qrScannerLauncher.launch(options)
                    },
                    onOpenNotifications = { navController.navigate(RootRoute.Notifications.route) { launchSingleTop = true } },
                    onTabSelected = ::requestTabNavigation,
                    leading = { ProfileTopLogo() }
                ) { innerModifier ->
                    Box(innerModifier) {
                        ProfileScreen(
                            session = state.uiState.session,
                            activeTenantId = state.uiState.selectedTenantId ?: state.uiState.linkedTenants.firstOrNull()?.companyId,
                            languageCode = appUiLocale,
                            onLanguageChanged = { code ->
                                appUiLocale = code
                                preferencesStore.saveAppUiLocale(code)
                            },
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
                            onUploadProfilePicture = { fileName, contentType, bytes ->
                                val settings = repo.uploadProfilePicture(fileName, contentType, bytes)
                                state.uiState = state.uiState.copy(
                                    session = state.uiState.session?.copy(guestUser = settings.guestUser)
                                )
                                headerAvatarBitmap = bytes
                                    .takeIf { it.isNotEmpty() }
                                    ?.let { BitmapFactory.decodeByteArray(it, 0, it.size) }
                                settings
                            },
                            onDownloadProfilePicture = { repo.downloadProfilePicture() },
                            onUnsubscribeTenant = { companyId ->
                                repo.unsubscribeTenant(companyId)
                                refreshAllTenants()
                            },
                            onAnonymizeTenant = { companyId ->
                                repo.anonymizeTenant(companyId)
                                refreshAllTenants()
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
        if (showWalletTenantPicker) {
            val selectedTenantId = when (tenantPickerTarget) {
                TenantPickerTarget.Calendar -> walletTenantPickerDraftId ?: calendarSelectedTenantId
                TenantPickerTarget.Wallet -> walletTenantPickerDraftId
                    ?: state.uiState.walletSelectedTenantId
                    ?: state.uiState.linkedTenants.firstOrNull()?.companyId
                TenantPickerTarget.Inbox -> walletTenantPickerDraftId
                    ?: state.uiState.selectedTenantId
                    ?: state.uiState.linkedTenants.firstOrNull()?.companyId
            }
            val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
            ModalBottomSheet(
                onDismissRequest = { showWalletTenantPicker = false },
                sheetState = sheetState,
                containerColor = Color.White,
                shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
                dragHandle = {
                    Box(
                        modifier = Modifier
                            .padding(top = 10.dp, bottom = 4.dp)
                            .width(48.dp)
                            .height(5.dp)
                            .clip(RoundedCornerShape(999.dp))
                            .background(Color(0xFF124C9D).copy(alpha = 0.28f))
                    )
                }
            ) {
                TenantSelectionBottomSheetContent(
                    tenants = state.uiState.linkedTenants,
                    selectedTenantId = selectedTenantId,
                    languageCode = appUiLocale,
                    allowAllTenants = tenantPickerTarget == TenantPickerTarget.Calendar,
                    onSelect = { tenantId ->
                        walletTenantPickerDraftId = tenantId
                        showWalletTenantPicker = false
                        when (tenantPickerTarget) {
                            TenantPickerTarget.Calendar -> {
                                calendarSelectedTenantId = tenantId
                                navigateToTab(RootRoute.Calendar.route)
                            }
                            TenantPickerTarget.Wallet -> {
                                tenantId?.let { resolvedTenantId ->
                                    state.uiState = state.uiState.copy(walletSelectedTenantId = resolvedTenantId)
                                    refreshWalletOffersIfNeeded(resolvedTenantId)
                                    navigateToTab(RootRoute.Wallet.route)
                                }
                            }
                            TenantPickerTarget.Inbox -> {
                                tenantId?.let { resolvedTenantId ->
                                    state.uiState = state.uiState.copy(selectedTenantId = resolvedTenantId)
                                    navigateToTab(RootRoute.Inbox.route)
                                    scope.launch { runCatching { refreshTenant(resolvedTenantId) } }
                                }
                            }
                        }
                    },
                    onAddTenant = {
                        showWalletTenantPicker = false
                        navController.navigate(RootRoute.JoinTenant.route) { launchSingleTop = true }
                    }
                )
            }
        }

        if (bootstrappingSession) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        }
        if (socialSignInOverlay) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = 0.35f)),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator(color = Color.White)
            }
        }
    }
}

@Composable
private fun GuestTabsScaffold(
    current: String,
    languageCode: String,
    utilityBarVisible: Boolean,
    unreadNotificationCount: Int,
    unreadInboxCount: Int,
    profileAvatarBitmap: Bitmap? = null,
    profileInitials: String = "•",
    onAddTenant: () -> Unit,
    onScanTenant: () -> Unit,
    onOpenNotifications: () -> Unit,
    onTabSelected: (String) -> Unit,
    leading: (@Composable () -> Unit)? = null,
    tenantPublicPhone: String? = null,
    showPhoneAction: Boolean = false,
    tenantSelectorLabel: String? = null,
    onTenantSelectorClick: (() -> Unit)? = null,
    content: @Composable (Modifier) -> Unit
) {
    Scaffold(
        containerColor = Color.Transparent,
        bottomBar = {
            BottomNavBar(
                current = current,
                languageCode = languageCode,
                unreadInboxCount = unreadInboxCount,
                onTabSelected = onTabSelected
            )
        }
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) {
            if (utilityBarVisible) {
                GuestUtilityTopBar(
                    unreadNotificationCount = unreadNotificationCount,
                    languageCode = languageCode,
                    onAddTenant = onAddTenant,
                    onScanTenant = onScanTenant,
                    onOpenNotifications = onOpenNotifications,
                    onOpenProfile = { onTabSelected(RootRoute.Profile.route) },
                    leading = leading,
                    tenantPublicPhone = tenantPublicPhone,
                    showPhoneAction = showPhoneAction,
                    profileAvatarBitmap = profileAvatarBitmap,
                    profileInitials = profileInitials,
                    showProfileAction = current == RootRoute.Home.route || current == RootRoute.Calendar.route || current == RootRoute.Wallet.route || current == RootRoute.Inbox.route || current == RootRoute.Profile.route,
                    profileSelected = current == RootRoute.Profile.route,
                    transparentBackground = current == RootRoute.Inbox.route || current == RootRoute.Profile.route || current == RootRoute.Home.route || current == RootRoute.Wallet.route || current == RootRoute.Calendar.route,
                    showAddAction = current != RootRoute.Profile.route && (tenantSelectorLabel != null || leading == null || current == RootRoute.Home.route),
                    showAddLabel = current == RootRoute.Home.route || tenantSelectorLabel != null,
                    addLabelOverride = tenantSelectorLabel,
                    onAddLabelClickOverride = onTenantSelectorClick
                )
            }
            content(Modifier.weight(1f))
        }
    }
}

@Composable
private fun GuestUtilityTopBar(
    unreadNotificationCount: Int,
    languageCode: String,
    onAddTenant: () -> Unit,
    onScanTenant: () -> Unit,
    onOpenNotifications: () -> Unit,
    onOpenProfile: () -> Unit,
    leading: (@Composable () -> Unit)? = null,
    tenantPublicPhone: String? = null,
    showPhoneAction: Boolean = false,
    profileAvatarBitmap: Bitmap? = null,
    profileInitials: String = "•",
    showProfileAction: Boolean = false,
    profileSelected: Boolean = false,
    transparentBackground: Boolean = false,
    showAddAction: Boolean = true,
    showAddLabel: Boolean = false,
    addLabelOverride: String? = null,
    onAddLabelClickOverride: (() -> Unit)? = null
) {
    val isSl = languageCode.lowercase().startsWith("sl")
    val hasPhoneAction = showPhoneAction && leading != null
    val context = LocalContext.current
    var addMenuExpanded by remember { mutableStateOf(false) }
    val dialable = !tenantPublicPhone.isNullOrBlank() &&
        tenantPublicPhone.any { it.isDigit() }
    Surface(
        color = if (transparentBackground) Color.Transparent else MaterialTheme.colorScheme.surface,
        tonalElevation = 0.dp,
        shadowElevation = 0.dp,
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp)
                .padding(start = 12.dp, end = 4.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            if (leading != null) {
                Box(modifier = Modifier.weight(1f)) {
                    Box(modifier = Modifier.widthIn(max = 132.dp)) { leading() }
                }
            } else {
                Spacer(Modifier.weight(1f))
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (hasPhoneAction) {
                    IconButton(
                        onClick = { openTenantDialer(context, tenantPublicPhone) },
                        enabled = dialable,
                        modifier = Modifier.size(44.dp)
                    ) {
                        Icon(
                            Icons.Rounded.Phone,
                            contentDescription = if (isSl) "Pokliči ponudnika" else "Call tenancy",
                            modifier = Modifier.size(24.dp),
                            tint = if (dialable) MaterialTheme.colorScheme.onSurface
                            else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.38f)
                        )
                    }
                } else if (showAddAction) {
                    if (showAddLabel) {
                        val label = addLabelOverride?.takeIf { it.isNotBlank() }
                            ?: if (isSl) "Dodaj ponudnika" else "Add tenant"
                        val isTenantSelector = onAddLabelClickOverride != null && addLabelOverride != null
                        OutlinedButton(
                            onClick = onAddLabelClickOverride ?: onAddTenant,
                            shape = RoundedCornerShape(18.dp),
                            border = BorderStroke(1.2.dp, BottomTabAccent),
                            contentPadding = PaddingValues(horizontal = 10.dp, vertical = 0.dp),
                            colors = ButtonDefaults.outlinedButtonColors(
                                containerColor = Color.Transparent,
                                contentColor = BottomTabAccent
                            ),
                            modifier = Modifier
                                .height(34.dp)
                                .widthIn(max = 128.dp)
                        ) {
                            Icon(
                                Icons.Rounded.PersonOutline,
                                contentDescription = null,
                                modifier = Modifier.size(14.dp)
                            )
                            Spacer(Modifier.width(6.dp))
                            Text(
                                label,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.SemiBold,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.weight(1f, fill = false)
                            )
                            if (isTenantSelector) {
                                Spacer(Modifier.width(2.dp))
                                Icon(
                                    Icons.Rounded.KeyboardArrowDown,
                                    contentDescription = null,
                                    modifier = Modifier.size(15.dp)
                                )
                            }
                        }
                    } else {
                        Box {
                            IconButton(
                                onClick = { addMenuExpanded = true },
                                modifier = Modifier.size(44.dp)
                            ) {
                                Icon(
                                    Icons.Rounded.Add,
                                    contentDescription = if (isSl) "Dodaj ponudnika" else "Add tenancy",
                                    modifier = Modifier.size(24.dp),
                                    tint = MaterialTheme.colorScheme.onSurface
                                )
                            }
                            DropdownMenu(expanded = addMenuExpanded, onDismissRequest = { addMenuExpanded = false }) {
                                DropdownMenuItem(
                                    text = { Text(if (isSl) "Ročno dodaj kodo" else "Add code manually") },
                                    onClick = {
                                        addMenuExpanded = false
                                        onAddTenant()
                                    }
                                )
                                DropdownMenuItem(
                                    text = { Text(if (isSl) "QR skeniranje" else "QR scan") },
                                    leadingIcon = { Icon(Icons.Rounded.QrCodeScanner, contentDescription = null) },
                                    onClick = {
                                        addMenuExpanded = false
                                        onScanTenant()
                                    }
                                )
                            }
                        }
                    }
                }
                BadgedBox(
                    badge = {
                        if (unreadNotificationCount > 0) {
                            Badge { Text(unreadNotificationCount.coerceAtMost(99).toString()) }
                        }
                    }
                ) {
                    IconButton(
                        onClick = onOpenNotifications,
                        modifier = Modifier.size(40.dp)
                    ) {
                        Icon(
                            Icons.Rounded.NotificationsNone,
                            contentDescription = if (isSl) "Obvestila" else "Notifications",
                            modifier = Modifier.size(22.dp),
                            tint = MaterialTheme.colorScheme.onSurface
                        )
                    }
                }
                if (showProfileAction) {
                    HeaderProfileButton(
                        avatarBitmap = profileAvatarBitmap,
                        initials = profileInitials,
                        languageCode = languageCode,
                        selected = profileSelected,
                        onOpenProfile = onOpenProfile
                    )
                }
            }
        }
    }
}

@Composable
private fun HeaderProfileButton(
    avatarBitmap: Bitmap?,
    initials: String,
    languageCode: String,
    selected: Boolean,
    onOpenProfile: () -> Unit
) {
    val isSl = languageCode.lowercase().startsWith("sl")
    IconButton(
        onClick = onOpenProfile,
        modifier = Modifier.size(40.dp)
    ) {
        Surface(
            shape = CircleShape,
            color = Color.White,
            shadowElevation = 3.dp,
            border = BorderStroke(1.2.dp, if (selected) BottomTabAccent else Color.White.copy(alpha = 0.9f)),
            modifier = Modifier.size(34.dp)
        ) {
            if (avatarBitmap != null) {
                Image(
                    bitmap = avatarBitmap.asImageBitmap(),
                    contentDescription = if (isSl) "Profil" else "Profile",
                    modifier = Modifier
                        .fillMaxSize()
                        .clip(CircleShape),
                    contentScale = ContentScale.Crop
                )
            } else {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Color(0xFFEAF3FF)),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        initials.take(2).ifBlank { "•" },
                        fontSize = if (initials.length > 1) 11.sp else 13.sp,
                        fontWeight = FontWeight.Bold,
                        color = BottomTabAccent
                    )
                }
            }
        }
    }
}

private fun headerProfileInitials(user: GuestUser?): String {
    val first = user?.firstName.orEmpty().trim()
    val last = user?.lastName.orEmpty().trim()
    val combined = listOfNotNull(first.firstOrNull(), last.firstOrNull())
        .joinToString("") { it.uppercaseChar().toString() }
    if (combined.isNotEmpty()) return combined
    return (first.firstOrNull() ?: user?.email.orEmpty().firstOrNull())
        ?.uppercaseChar()
        ?.toString()
        ?: "•"
}

@Composable
private fun ProfileTopLogo() {
    Image(
        painter = painterResource(id = R.drawable.calendra_book_logo),
        contentDescription = "Calendra Book",
        modifier = Modifier
            .height(38.dp)
            .wrapContentWidth(Alignment.Start),
        contentScale = ContentScale.Fit
    )
}

@Composable
private fun InboxTenantPickerButton(
    tenants: List<si.calendra.guest.shared.models.TenantSummary>,
    selectedTenantId: String?,
    displayTitle: String? = null,
    onClick: () -> Unit
) {
    val selected = tenants.firstOrNull { it.companyId == selectedTenantId } ?: tenants.firstOrNull()
    val fallbackLabel = selected?.companyName ?: "Select tenancy"
    val primaryLabel = displayTitle
        ?.takeIf { it.isNotBlank() && !it.equals(fallbackLabel, ignoreCase = true) }
        ?: fallbackLabel
    val subtitle = when {
        !primaryLabel.equals(fallbackLabel, ignoreCase = true) -> fallbackLabel
        else -> selected?.let { inboxTenantSubtitle(it) }
    }?.takeIf { it.isNotBlank() && !it.equals(primaryLabel, ignoreCase = true) }

    Row(
        modifier = Modifier
            .clickable(enabled = tenants.isNotEmpty(), onClick = onClick)
            .heightIn(min = 52.dp)
            .padding(start = 4.dp, end = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Surface(
            modifier = Modifier.size(44.dp),
            shape = CircleShape,
            color = BottomTabAccent,
            shadowElevation = 6.dp
        ) {
            Box(contentAlignment = Alignment.Center) {
                Icon(
                    imageVector = inboxTenantIcon(selected?.tenantType),
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(24.dp)
                )
            }
        }
        Column(
            verticalArrangement = Arrangement.Center,
            modifier = Modifier.widthIn(max = 210.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = primaryLabel,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF071D3A),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.widthIn(max = 170.dp)
                )
                Icon(
                    imageVector = Icons.Rounded.KeyboardArrowDown,
                    contentDescription = null,
                    modifier = Modifier.size(20.dp),
                    tint = Color(0xFF071D3A)
                )
            }
            subtitle?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.bodySmall,
                    color = Color(0xFF607188),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
    }
}

@Composable
private fun TenantSelectionBottomSheetContent(
    tenants: List<si.calendra.guest.shared.models.TenantSummary>,
    selectedTenantId: String?,
    languageCode: String,
    allowAllTenants: Boolean = false,
    onSelect: (String?) -> Unit,
    onAddTenant: () -> Unit
) {
    val isSl = languageCode.lowercase().startsWith("sl")
    val searchState = remember { mutableStateOf("") }
    val query = searchState.value.trim()
    val filteredTenants = if (query.isBlank()) {
        tenants
    } else {
        tenants.filter { tenant ->
            tenant.companyName.contains(query, ignoreCase = true) ||
                (tenant.publicCity ?: "").contains(query, ignoreCase = true) ||
                (tenant.companyAddress ?: "").contains(query, ignoreCase = true)
        }
    }
    val scrollState = rememberScrollState()
    val brandBlue = Color(0xFF124C9D)
    val brandBlueSoft = brandBlue
    val brandOrange = Color(0xFFF2963B)
    val muted = brandBlue.copy(alpha = 0.66f)
    val line = brandBlue.copy(alpha = 0.22f)

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 20.dp, end = 20.dp, bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(0.dp)
    ) {
        Text(
            text = if (isSl) "Izberi ponudnika" else "Select tenant",
            fontSize = 23.sp,
            fontWeight = FontWeight.Bold,
            color = brandBlue
        )
        Spacer(Modifier.height(6.dp))
        Text(
            text = if (allowAllTenants) {
                if (isSl) "Izberite enega ponudnika ali prikažite termine vseh ponudnikov." else "Choose one provider or show sessions from all providers."
            } else {
                if (isSl) "Izberite ponudnika za upravljanje rezervacij in plačil." else "Choose a tenant for bookings and payments."
            },
            fontSize = 13.sp,
            color = muted
        )
        Spacer(Modifier.height(16.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Surface(
                modifier = Modifier
                    .weight(1f)
                    .height(44.dp),
                shape = RoundedCornerShape(16.dp),
                color = Color(0xFFFBFDFF),
                border = BorderStroke(1.dp, line)
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 13.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(9.dp)
                ) {
                    Icon(
                        imageVector = Icons.Rounded.Search,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp),
                        tint = brandBlue
                    )
                    BasicTextField(
                        value = searchState.value,
                        onValueChange = { searchState.value = it },
                        singleLine = true,
                        textStyle = TextStyle(
                            color = brandBlue,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Medium
                        ),
                        modifier = Modifier.weight(1f),
                        decorationBox = { innerTextField ->
                            if (searchState.value.isEmpty()) {
                                Text(
                                    text = if (isSl) "Išči ponudnika ..." else "Search tenant ...",
                                    color = brandBlue.copy(alpha = 0.58f),
                                    fontSize = 14.sp,
                                    maxLines = 1
                                )
                            }
                            innerTextField()
                        }
                    )
                }
            }
            Surface(
                modifier = Modifier.size(44.dp),
                shape = RoundedCornerShape(16.dp),
                color = Color.White,
                border = BorderStroke(1.dp, line)
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        imageVector = Icons.Rounded.Tune,
                        contentDescription = null,
                        tint = brandBlue,
                        modifier = Modifier.size(19.dp)
                    )
                }
            }
        }
        Spacer(Modifier.height(12.dp))
        Column(
            modifier = Modifier
                .heightIn(max = 292.dp)
                .verticalScroll(scrollState),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            if (allowAllTenants) {
                TenantSelectionAllSheetRow(
                    selected = selectedTenantId == null,
                    isSl = isSl,
                    brandBlue = brandBlue,
                    brandBlueSoft = brandBlueSoft,
                    muted = muted,
                    line = line,
                    onClick = { onSelect(null) }
                )
            }
            filteredTenants.forEachIndexed { index, tenant ->
                TenantSelectionSheetRow(
                    tenant = tenant,
                    selected = tenant.companyId == selectedTenantId,
                    index = index,
                    brandBlue = brandBlue,
                    brandBlueSoft = brandBlueSoft,
                    brandOrange = brandOrange,
                    muted = muted,
                    line = line,
                    onClick = { onSelect(tenant.companyId) }
                )
            }
            if (filteredTenants.isEmpty()) {
                Text(
                    text = if (isSl) "Ni najdenih ponudnikov." else "No tenants found.",
                    color = brandBlue.copy(alpha = 0.68f),
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 24.dp),
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center
                )
            }
        }
        Spacer(Modifier.height(14.dp))
        Button(
            onClick = onAddTenant,
            shape = RoundedCornerShape(16.dp),
            colors = ButtonDefaults.buttonColors(containerColor = brandBlue),
            contentPadding = PaddingValues(vertical = 14.dp),
            modifier = Modifier
                .fillMaxWidth()
                .height(52.dp)
        ) {
            Icon(
                imageVector = Icons.Rounded.Add,
                contentDescription = null,
                modifier = Modifier.size(20.dp)
            )
            Spacer(Modifier.width(10.dp))
            Text(
                text = if (isSl) "Dodaj ponudnika" else "Add tenant",
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold
            )
        }
    }
}

@Composable
private fun TenantSelectionAllSheetRow(
    selected: Boolean,
    isSl: Boolean,
    brandBlue: Color,
    brandBlueSoft: Color,
    muted: Color,
    line: Color,
    onClick: () -> Unit
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .height(58.dp)
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(15.dp),
        color = if (selected) Color(0xFFF5FBFF) else Color.White,
        border = BorderStroke(if (selected) 1.6.dp else 1.dp, if (selected) brandBlueSoft else line),
        shadowElevation = if (selected) 2.dp else 0.dp
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Surface(
                modifier = Modifier.size(42.dp),
                shape = CircleShape,
                color = brandBlue.copy(alpha = 0.13f)
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        imageVector = Icons.Rounded.CalendarMonth,
                        contentDescription = null,
                        tint = brandBlue,
                        modifier = Modifier.size(20.dp)
                    )
                }
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = if (isSl) "Vsi ponudniki" else "All providers",
                    color = brandBlue,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    text = if (isSl) "Prikaži termine vseh povezanih ponudnikov" else "Show sessions from every linked provider",
                    color = brandBlue.copy(alpha = 0.62f),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
            if (selected) {
                Surface(
                    modifier = Modifier.size(26.dp),
                    shape = CircleShape,
                    color = brandBlue
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            imageVector = Icons.Rounded.Check,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.size(15.dp)
                        )
                    }
                }
            } else {
                Icon(
                    imageVector = Icons.Rounded.KeyboardArrowRight,
                    contentDescription = null,
                    tint = brandBlue.copy(alpha = 0.62f),
                    modifier = Modifier.size(20.dp)
                )
            }
        }
    }
}

@Composable
private fun TenantSelectionSheetRow(
    tenant: si.calendra.guest.shared.models.TenantSummary,
    selected: Boolean,
    index: Int,
    brandBlue: Color,
    brandBlueSoft: Color,
    brandOrange: Color,
    muted: Color,
    line: Color,
    onClick: () -> Unit
) {
    val iconTint = when (index % 4) {
        1 -> brandBlue
        2 -> Color(0xFF7A5C29)
        3 -> Color.White
        else -> brandOrange
    }
    val iconBg = when (index % 4) {
        1 -> brandBlue.copy(alpha = 0.13f)
        2 -> Color(0xFFFFEFCF)
        3 -> Color(0xFF0E2347)
        else -> brandOrange.copy(alpha = 0.14f)
    }
    val icon = when (index % 4) {
        1 -> Icons.Rounded.Home
        2 -> Icons.Rounded.Business
        3 -> Icons.Rounded.Forum
        else -> Icons.Rounded.CalendarMonth
    }
    val subtitle = tenant.publicCity?.takeIf { it.isNotBlank() }
        ?: tenant.companyAddress?.takeIf { it.isNotBlank() }
        ?: "Slovenija"

    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .height(58.dp)
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(15.dp),
        color = if (selected) Color(0xFFF5FBFF) else Color.White,
        border = BorderStroke(if (selected) 1.6.dp else 1.dp, if (selected) brandBlueSoft else line),
        shadowElevation = if (selected) 2.dp else 0.dp
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Surface(
                modifier = Modifier.size(42.dp),
                shape = CircleShape,
                color = iconBg
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        imageVector = icon,
                        contentDescription = null,
                        tint = iconTint,
                        modifier = Modifier.size(20.dp)
                    )
                }
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = tenant.companyName,
                    color = brandBlue,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    text = subtitle,
                    color = brandBlue.copy(alpha = 0.62f),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
            if (selected) {
                Surface(
                    modifier = Modifier.size(26.dp),
                    shape = CircleShape,
                    color = brandBlue
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            imageVector = Icons.Rounded.Check,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.size(15.dp)
                        )
                    }
                }
            } else {
                Icon(
                    imageVector = Icons.Rounded.KeyboardArrowRight,
                    contentDescription = null,
                    tint = brandBlue.copy(alpha = 0.62f),
                    modifier = Modifier.size(20.dp)
                )
            }
        }
    }
}


private fun inboxTenantSubtitle(tenant: si.calendra.guest.shared.models.TenantSummary): String? {
    val city = tenant.publicCity?.trim().orEmpty()
    if (city.isNotBlank() && !city.equals(tenant.companyName, ignoreCase = true)) return city
    val type = tenant.tenantType?.trim().orEmpty()
    if (type.isBlank() || type.equals(tenant.companyName, ignoreCase = true)) return null
    return type.lowercase().replace('_', ' ').replaceFirstChar { char ->
        if (char.isLowerCase()) char.titlecase() else char.toString()
    }
}

private fun inboxTenantIcon(tenantType: String?) = when {
    tenantType?.contains("gym", ignoreCase = true) == true ||
        tenantType?.contains("fitness", ignoreCase = true) == true ||
        tenantType?.contains("trainer", ignoreCase = true) == true -> Icons.Rounded.FitnessCenter
    else -> Icons.Rounded.Business
}

private val BottomTabAccent = Color(0xFF1D66F4)
private val BottomTabInactive = Color(0xFF5E6F85)
private val BottomTabBackground = Color.White

@Composable
private fun BottomNavBar(
    current: String,
    languageCode: String,
    unreadInboxCount: Int,
    onTabSelected: (String) -> Unit
) {
    val isSl = languageCode.lowercase().startsWith("sl")
    val sideItems = listOf(
        Triple(RootRoute.Home.route, if (isSl) "Domov" else "Home", Icons.Rounded.Home),
        Triple(RootRoute.Calendar.route, if (isSl) "Koledar" else "Calendar", Icons.Rounded.CalendarMonth),
        Triple(RootRoute.Wallet.route, if (isSl) "Denarnica" else "Wallet", Icons.Rounded.Wallet),
        Triple(RootRoute.Inbox.route, if (isSl) "Prejeto" else "Inbox", Icons.Rounded.Forum)
    )

    Surface(
        modifier = Modifier
            .fillMaxWidth(),
        shape = RectangleShape,
        color = BottomTabBackground,
        shadowElevation = 0.dp,
        tonalElevation = 0.dp
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
        ) {
            HorizontalDivider(color = Color(0xFFE7ECF3))
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 14.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                sideItems.take(2).forEach { (route, label, icon) ->
                    BottomItem(
                        selected = current == route,
                        label = label,
                        onClick = { onTabSelected(route) },
                        icon = { Icon(icon, contentDescription = label) },
                        badgeCount = if (route == RootRoute.Inbox.route) unreadInboxCount else 0,
                        modifier = Modifier.weight(1f)
                    )
                }
                BookCenterItem(
                    selected = current == RootRoute.Book.route,
                    label = if (isSl) "Rezerviraj" else "Book",
                    onClick = { onTabSelected(RootRoute.Book.route) },
                    modifier = Modifier.width(76.dp)
                )
                sideItems.drop(2).forEach { (route, label, icon) ->
                    BottomItem(
                        selected = current == route,
                        label = label,
                        onClick = { onTabSelected(route) },
                        icon = { Icon(icon, contentDescription = label) },
                        badgeCount = if (route == RootRoute.Inbox.route) unreadInboxCount else 0,
                        modifier = Modifier.weight(1f)
                    )
                }
            }
        }
    }
}

@Composable
private fun BookCenterItem(selected: Boolean, label: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .clickable(onClick = onClick),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Surface(
            modifier = Modifier.size(46.dp),
            shape = CircleShape,
            color = BottomTabAccent,
            shadowElevation = 12.dp,
            tonalElevation = 0.dp
        ) {
            Box(contentAlignment = Alignment.Center) {
                Icon(
                    Icons.Rounded.Add,
                    contentDescription = label,
                    modifier = Modifier.size(26.dp),
                    tint = MaterialTheme.colorScheme.onPrimary
                )
            }
        }
        Text(
            label,
            style = MaterialTheme.typography.labelMedium.copy(fontSize = 10.sp),
            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium,
            color = if (selected) BottomTabAccent else BottomTabInactive
        )
    }
}

@Composable
private fun BottomItem(
    selected: Boolean,
    label: String,
    onClick: () -> Unit,
    icon: @Composable () -> Unit,
    badgeCount: Int = 0,
    modifier: Modifier = Modifier
) {
    TextButton(
        onClick = onClick,
        modifier = modifier,
        contentPadding = PaddingValues(horizontal = 4.dp, vertical = 4.dp),
        shape = RoundedCornerShape(18.dp)
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
            CompositionLocalProvider(LocalContentColor provides if (selected) BottomTabAccent else BottomTabInactive) {
                BadgedBox(
                    badge = {
                        if (badgeCount > 0) {
                            Badge { Text(badgeCount.coerceAtMost(99).toString()) }
                        }
                    }
                ) {
                    ProvideTextStyle(MaterialTheme.typography.titleMedium) { icon() }
                }
            }
            Text(
                label,
                style = MaterialTheme.typography.labelMedium.copy(fontSize = 10.sp),
                fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium,
                color = if (selected) BottomTabAccent else BottomTabInactive
            )
        }
    }
}

private suspend fun joinTenantWithCode(
    code: String,
    repo: si.calendra.guest.shared.repository.GuestRepository,
    state: GuestMutableState,
    navController: androidx.navigation.NavHostController,
    onPersistToken: (String) -> Unit = {}
) {
    val normalizedCode = extractTenantCode(code)
        ?: throw IllegalArgumentException("The QR code does not contain a tenancy code.")
    val tenantLookup = repo.resolveTenant(normalizedCode)
    repo.joinTenant(JoinTenantRequest(joinMethod = "TENANT_CODE", tenantCode = normalizedCode))
    val updatedSession = repo.me()
    val token = state.uiState.session?.token.orEmpty()
    GuestSessionStore.authToken = token
    if (token.isNotBlank()) onPersistToken(token)
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
        notifications = repo.notifications(tenant.companyId).items,
        inboxThread = repo.inboxThreads(tenant.companyId).firstOrNull()
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
private suspend fun joinPublicTenant(
    companyId: String,
    repo: si.calendra.guest.shared.repository.GuestRepository,
    state: GuestMutableState,
    navController: androidx.navigation.NavHostController,
    onPersistToken: (String) -> Unit = {}
) {
    val normalizedCompanyId = companyId.trim().takeIf { it.isNotBlank() }
        ?: throw IllegalArgumentException("Tenant not found.")

    repo.joinTenant(
        JoinTenantRequest(
            joinMethod = "PUBLIC_SEARCH",
            companyId = normalizedCompanyId
        )
    )

    val updatedSession = repo.me()
    val token = state.uiState.session?.token.orEmpty()

    GuestSessionStore.authToken = token

    if (token.isNotBlank()) {
        onPersistToken(token)
    }

    val tenant = updatedSession.linkedTenants.firstOrNull { it.companyId == normalizedCompanyId }
        ?: TenantSummary(
            companyId = normalizedCompanyId,
            companyName = "Tenant",
            status = "ACTIVE"
        )

    val home = repo.home(tenant.companyId)

    val dashboard = TenantDashboard(
        tenant = home.tenant,
        home = home,
        products = repo.products(tenant.companyId),
        wallet = repo.wallet(tenant.companyId),
        history = repo.bookingHistory(tenant.companyId),
        notifications = repo.notifications(tenant.companyId).items,
        inboxThread = repo.inboxThreads(tenant.companyId).firstOrNull()
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

    navController.navigate(RootRoute.Home.route) {
        launchSingleTop = true
    }
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

private fun unreadBellCount(state: GuestUiState): Int =
    badgeTenantIds(state)
        .sumOf { tenantId ->
            state.tenantDashboards[tenantId]
                ?.notifications
                .orEmpty()
                .count { notification ->
                    notification.readAt == null &&
                        GUEST_APP_BELL_NOTIFICATION_TYPES.contains(notification.notificationType.uppercase())
                }
        }

private fun unreadInboxCount(state: GuestUiState): Int =
    badgeTenantIds(state)
        .sumOf { tenantId ->
            state.tenantDashboards[tenantId]?.inboxThread?.unreadCount?.toInt() ?: 0
        }

private fun badgeTenantIds(state: GuestUiState): List<String> =
    state.linkedTenants.map { it.companyId }

private fun aggregatedWallet(state: GuestUiState): WalletPayload? {
    val dashboards = state.linkedTenants.mapNotNull { state.tenantDashboards[it.companyId] }
    if (dashboards.isEmpty()) return null
    return WalletPayload(
        entitlements = dashboards.flatMap { it.wallet?.entitlements.orEmpty() },
        orders = dashboards.flatMap { it.wallet?.orders.orEmpty() }
    )
}

private fun selectedWalletTenantId(state: GuestUiState): String? {
    val availableIds = state.linkedTenants.map { it.companyId }
    val explicit = state.walletSelectedTenantId
    return when {
        explicit != null && availableIds.contains(explicit) -> explicit
        else -> availableIds.firstOrNull()
    }
}

private fun walletAccessesForTenant(state: GuestUiState, tenantId: String): List<AccessCard> {
    val dashboard = state.tenantDashboards[tenantId]
    val tenant = dashboard?.home?.tenant ?: state.linkedTenants.firstOrNull { it.companyId == tenantId }
    return dashboard?.wallet?.entitlements.orEmpty().mapNotNull { access ->
        tenant?.let {
            AccessCard(
                id = access.entitlementId,
                name = access.productName,
                type = access.entitlementType,
                tenantName = it.companyName,
                entitlementCode = access.entitlementCode,
                validUntil = access.validUntil,
                remainingUses = access.remainingUses,
                totalUses = access.totalUses,
                displayCode = access.displayCode,
                priceGross = access.priceGross,
                currency = access.currency,
                validityDays = access.validityDays,
                autoRenews = access.autoRenews
            )
        }
    }
}

private fun walletOffersForTenant(state: GuestUiState, tenantId: String): List<WalletOfferCard> =
    state.tenantDashboards[tenantId]?.products.orEmpty()
        .filter { it.productType == "PACK" || it.productType == "MEMBERSHIP" || it.productType == "CLASS_TICKET" || it.productType == "GIFT_CARD" }
        .map { product ->
            WalletOfferCard(
                companyId = tenantId,
                productId = product.productId,
                name = product.name,
                productType = product.productType,
                priceGross = product.priceGross,
                currency = product.currency,
                description = product.description,
                sessionTypeName = product.sessionTypeName,
                promoText = product.promoText,
                validityDays = product.validityDays,
                usageLimit = product.usageLimit
            )
        }
        .sortedBy { it.name }

private fun selectedTenantIds(state: GuestUiState): List<String> = state.selectedTenantId?.let(::listOf) ?: state.linkedTenants.map { it.companyId }

private fun aggregatedNotifications(state: GuestUiState): List<Pair<GuestNotification, String>> =
    selectedTenantIds(state).flatMap { tenantId ->
        state.tenantDashboards[tenantId]?.notifications.orEmpty().map { it to tenantId }
    }.sortedByDescending { it.first.createdAt }

private fun aggregatedBookings(state: GuestUiState): List<UpcomingBookingCard> =
    selectedTenantIds(state).flatMap { tenantId ->
        val dashboard = state.tenantDashboards[tenantId]
        val tenant = dashboard?.home?.tenant ?: state.linkedTenants.firstOrNull { it.companyId == tenantId }
        val upcoming = dashboard?.home?.upcomingBookings.orEmpty().mapNotNull { booking ->
            tenant?.let {
                val phone =
                    if (it.useEmployeeContact && !booking.employeePhone.isNullOrBlank()) {
                        booking.employeePhone
                    } else {
                        it.publicPhone
                    }
                UpcomingBookingCard(
                    id = booking.bookingId,
                    companyId = tenantId,
                    title = booking.sessionTypeName,
                    sessionTypeId = booking.sessionTypeId,
                    startsAt = booking.startsAt,
                    endsAt = booking.endsAt,
                    status = booking.bookingStatus,
                    tenantName = it.companyName,
                    tenantCity = it.publicCity,
                    tenantAddress = it.companyAddress,
                    consultantName = booking.consultantName,
                    tenantPhone = phone,
                    cardImageUrl = it.cardImageUrl,
                    logoImageUrl = it.logoImageUrl,
                    iconImageUrl = it.iconImageUrl
                )
            }
        }
        val history = dashboard?.history.orEmpty().mapNotNull { booking ->
            tenant?.let {
                UpcomingBookingCard(
                    id = booking.bookingId,
                    companyId = tenantId,
                    title = booking.sessionTypeName,
                    sessionTypeId = null,
                    startsAt = booking.startsAt,
                    endsAt = null,
                    status = booking.bookingStatus,
                    tenantName = it.companyName,
                    tenantCity = it.publicCity,
                    tenantAddress = it.companyAddress,
                    consultantName = null,
                    tenantPhone = it.publicPhone,
                    cardImageUrl = it.cardImageUrl,
                    logoImageUrl = it.logoImageUrl,
                    iconImageUrl = it.iconImageUrl
                )
            }
        }
        (upcoming + history).distinctBy { it.id }
    }.sortedBy { runCatching { OffsetDateTime.parse(it.startsAt).toInstant().toEpochMilli() }.getOrDefault(Long.MAX_VALUE) }

private fun aggregatedCalendarBookings(state: GuestUiState): List<UpcomingBookingCard> =
    state.linkedTenants.flatMap { linkedTenant ->
        val tenantId = linkedTenant.companyId
        val dashboard = state.tenantDashboards[tenantId]
        val tenant = dashboard?.home?.tenant ?: linkedTenant
        dashboard?.home?.upcomingBookings.orEmpty().map { booking ->
            val phone =
                if (tenant.useEmployeeContact && !booking.employeePhone.isNullOrBlank()) {
                    booking.employeePhone
                } else {
                    tenant.publicPhone
                }
            UpcomingBookingCard(
                id = booking.bookingId,
                companyId = tenantId,
                title = booking.sessionTypeName,
                sessionTypeId = booking.sessionTypeId,
                startsAt = booking.startsAt,
                endsAt = booking.endsAt,
                status = booking.bookingStatus,
                tenantName = tenant.companyName,
                tenantCity = tenant.publicCity,
                tenantAddress = tenant.companyAddress,
                consultantName = booking.consultantName,
                tenantPhone = phone,
                cardImageUrl = tenant.cardImageUrl,
                logoImageUrl = tenant.logoImageUrl,
                iconImageUrl = tenant.iconImageUrl
            )
        }
    }.filterNot { it.status.equals("CANCELLED", ignoreCase = true) }
        .distinctBy { it.id }
        .sortedBy { runCatching { OffsetDateTime.parse(it.startsAt).toInstant().toEpochMilli() }.getOrDefault(Long.MAX_VALUE) }


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
                    entitlementCode = access.entitlementCode,
                    validUntil = access.validUntil,
                    remainingUses = access.remainingUses,
                    totalUses = access.totalUses,
                    displayCode = access.displayCode,
                    priceGross = access.priceGross,
                    currency = access.currency,
                    validityDays = access.validityDays,
                    autoRenews = access.autoRenews
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
        state.tenantDashboards[tenantId]?.wallet?.entitlements.orEmpty()
            .filter { e ->
                val s = e.status.uppercase()
                s == "ACTIVE" || s == "PENDING"
            }
            .map { entitlement ->
            RedeemableEntitlementOption(
                entitlementId = entitlement.entitlementId,
                companyId = tenantId,
                productName = entitlement.productName,
                remainingUses = entitlement.remainingUses,
                validUntil = entitlement.validUntil,
                sessionTypeId = entitlement.sessionTypeId,
                autoRenews = entitlement.autoRenews,
                entitlementType = entitlement.entitlementType,
                remainingValueGross = entitlement.remainingValueGross,
                currency = entitlement.currency
            )
        }
    }

private fun aggregatedWalletOffers(state: GuestUiState): List<WalletOfferCard> =
    selectedTenantIds(state).flatMap { tenantId ->
        state.tenantDashboards[tenantId]?.products.orEmpty()
            .filter { it.productType == "PACK" || it.productType == "MEMBERSHIP" || it.productType == "CLASS_TICKET" || it.productType == "GIFT_CARD" }
            .map { product ->
                WalletOfferCard(
                    companyId = tenantId,
                    productId = product.productId,
                    name = product.name,
                    productType = product.productType,
                    priceGross = product.priceGross,
                    currency = product.currency,
                    description = product.description,
                    sessionTypeName = product.sessionTypeName,
                    promoText = product.promoText,
                    validityDays = product.validityDays,
                    usageLimit = product.usageLimit
                )
            }
    }.sortedBy { it.name }

private fun findTenantForEntitlement(state: GuestUiState, entitlementId: String): String? =
    state.tenantDashboards.entries.firstOrNull { (_, dashboard) ->
        dashboard.wallet?.entitlements.orEmpty().any { it.entitlementId == entitlementId }
    }?.key
