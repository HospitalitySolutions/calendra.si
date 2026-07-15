package si.calendra.guest.android.ui.screens

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountBalanceWallet
import androidx.compose.material.icons.outlined.EventAvailable
import androidx.compose.material.icons.outlined.NotificationsNone
import androidx.compose.material.icons.outlined.Security
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import si.calendra.guest.android.R

private data class WelcomeCopy(
    val eyebrow: String,
    val headline: String,
    val fastBooking: String,
    val fastBookingDescription: String,
    val wallet: String,
    val walletDescription: String,
    val notifications: String,
    val notificationsDescription: String,
    val secureLogin: String,
    val secureLoginDescription: String,
    val continueCta: String,
    val alreadyHaveAccount: String,
)

private data class WelcomeMetrics(
    val horizontalPadding: Dp,
    val topPadding: Dp,
    val eyebrowFontSize: Int,
    val eyebrowHorizontalPadding: Dp,
    val eyebrowVerticalPadding: Dp,
    val headlineTopPadding: Dp,
    val headlineFontSize: Int,
    val headlineLineHeight: Int,
    val featuresTopPadding: Dp,
    val featureSpacing: Dp,
    val iconSize: Dp,
    val iconInnerSize: Dp,
    val featureTitleSize: Int,
    val featureTitleLineHeight: Int,
    val featureDescriptionSize: Int,
    val featureDescriptionLineHeight: Int,
    val featureWidth: Float,
    val featureGap: Dp,
    val contentSpacer: Dp,
    val ctaSpacing: Dp,
    val buttonHeight: Dp,
    val buttonTextSize: Int,
    val buttonHorizontalPadding: Dp,
    val secondaryCtaSize: Int,
    val secondaryCtaVerticalPadding: Dp,
    val bottomPadding: Dp,
)

private fun welcomeCopy(lang: String): WelcomeCopy {
    if (lang.equals("sl", ignoreCase = true)) {
        return WelcomeCopy(
            eyebrow = "GOSTOVSKA APLIKACIJA",
            headline = "Rezervirajte.\nUpravljajte.\nUživajte.",
            fastBooking = "Hitra rezervacija",
            fastBookingDescription = "Poiščite termin in rezervirajte\nv nekaj klikih.",
            wallet = "Denarnica",
            walletDescription = "Upravljajte plačila hitro in varno.",
            notifications = "Pametna obvestila",
            notificationsDescription = "Prejemajte obvestila o vaših\nrezervacijah.",
            secureLogin = "Bodi varen",
            secureLoginDescription = "Vaši podatki so zaščiteni.",
            continueCta = "Nadaljuj",
            alreadyHaveAccount = "Že imam račun",
        )
    }
    return WelcomeCopy(
        eyebrow = "GUEST APP",
        headline = "Book.\nManage.\nEnjoy.",
        fastBooking = "Fast booking",
        fastBookingDescription = "Find a time and book\nin a few taps.",
        wallet = "Wallet",
        walletDescription = "Manage payments quickly and safely.",
        notifications = "Smart notifications",
        notificationsDescription = "Receive updates about\nyour bookings.",
        secureLogin = "Stay safe",
        secureLoginDescription = "Your data is protected.",
        continueCta = "Continue",
        alreadyHaveAccount = "I already have an account",
    )
}

@Composable
fun WelcomeScreen(
    languageCode: String,
    onLanguageChange: (String) -> Unit,
    onContinue: () -> Unit,
    onAlreadyHaveAccount: () -> Unit,
) {
    val copy = remember(languageCode) { welcomeCopy(languageCode) }

    Box(modifier = Modifier.fillMaxSize()) {
        Image(
            painter = painterResource(id = R.drawable.welcome_booking_background),
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize()
        )
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.horizontalGradient(
                        0.00f to Color(0xFFF8FBFF).copy(alpha = 0.97f),
                        0.38f to Color(0xFFF8FBFF).copy(alpha = 0.90f),
                        0.58f to Color(0xFFF8FBFF).copy(alpha = 0.30f),
                        1.00f to Color.Transparent,
                    )
                )
        )
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        0.00f to Color(0xFFEAF4FF).copy(alpha = 0.48f),
                        0.22f to Color.Transparent,
                        0.70f to Color.Transparent,
                        1.00f to Color(0xFFF6FAFF).copy(alpha = 0.97f),
                    )
                )
        )

        BoxWithConstraints(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .navigationBarsPadding()
        ) {
            val metrics = remember(maxWidth, maxHeight) { welcomeMetrics(maxWidth, maxHeight) }

            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = metrics.horizontalPadding)
                    .padding(top = metrics.topPadding, bottom = metrics.bottomPadding),
                verticalArrangement = Arrangement.SpaceBetween
            ) {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(0.dp)
                ) {
                    Image(
                        painter = painterResource(id = R.drawable.calendra_connect_logo),
                        contentDescription = "Calendra Connect",
                        contentScale = ContentScale.Fit,
                        modifier = Modifier
                            .widthIn(max = 230.dp)
                            .height(66.dp)
                    )

                    Text(
                        text = copy.headline,
                        color = Color(0xFF071A3A),
                        fontSize = metrics.headlineFontSize.sp,
                        lineHeight = metrics.headlineLineHeight.sp,
                        fontWeight = FontWeight.Black,
                        letterSpacing = (-1.4).sp,
                        modifier = Modifier.padding(top = metrics.headlineTopPadding)
                    )

                    Column(
                        verticalArrangement = Arrangement.spacedBy(metrics.featureSpacing),
                        modifier = Modifier.padding(top = metrics.featuresTopPadding)
                    ) {
                        FeatureLine(Icons.Outlined.EventAvailable, copy.fastBooking, copy.fastBookingDescription, metrics)
                        FeatureLine(Icons.Outlined.AccountBalanceWallet, copy.wallet, copy.walletDescription, metrics)
                        FeatureLine(Icons.Outlined.NotificationsNone, copy.notifications, copy.notificationsDescription, metrics)
                        FeatureLine(Icons.Outlined.Security, copy.secureLogin, copy.secureLoginDescription, metrics)
                    }
                }

                Spacer(modifier = Modifier.height(metrics.contentSpacer))

                Column(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(metrics.buttonHeight)
                            .background(
                                Brush.horizontalGradient(
                                    listOf(Color(0xFF1454C7), Color(0xFF1273FF))
                                )
                            )
                            .clickable(onClick = onContinue)
                            .padding(horizontal = metrics.buttonHorizontalPadding),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = copy.continueCta,
                            color = Color.White,
                            fontWeight = FontWeight.Bold,
                            fontSize = metrics.buttonTextSize.sp,
                            textAlign = TextAlign.Center
                        )
                    }
                    Text(
                        text = copy.alreadyHaveAccount,
                        color = Color(0xFF1273FF),
                        fontWeight = FontWeight.Bold,
                        fontSize = metrics.secondaryCtaSize.sp,
                        modifier = Modifier
                            .padding(top = metrics.ctaSpacing)
                            .clickable(onClick = onAlreadyHaveAccount)
                            .padding(horizontal = 16.dp, vertical = metrics.secondaryCtaVerticalPadding)
                    )
                }
            }
        }
    }
}

@Composable
private fun FeatureLine(icon: ImageVector, title: String, description: String, metrics: WelcomeMetrics) {
    Row(
        modifier = Modifier
            .fillMaxWidth(metrics.featureWidth)
            .widthIn(max = 350.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(metrics.featureGap)
    ) {
        Box(
            modifier = Modifier
                .size(metrics.iconSize)
                .clip(CircleShape)
                .background(Color(0xFFEAF4FF)),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = Color(0xFF1273FF),
                modifier = Modifier.size(metrics.iconInnerSize)
            )
        }

        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(
                text = title,
                color = Color(0xFF071A3A),
                fontSize = metrics.featureTitleSize.sp,
                lineHeight = metrics.featureTitleLineHeight.sp,
                fontWeight = FontWeight.Bold
            )
            Text(
                text = description,
                color = Color(0xFF4F5F7E),
                fontSize = metrics.featureDescriptionSize.sp,
                lineHeight = metrics.featureDescriptionLineHeight.sp,
                fontWeight = FontWeight.Medium
            )
        }
    }
}

private fun welcomeMetrics(maxWidth: Dp, maxHeight: Dp): WelcomeMetrics {
    val compactHeight = maxHeight <= 820.dp
    val veryCompactHeight = maxHeight <= 760.dp
    val narrowWidth = maxWidth < 380.dp

    return WelcomeMetrics(
        horizontalPadding = if (narrowWidth) 28.dp else 32.dp,
        topPadding = when {
            veryCompactHeight -> 46.dp
            compactHeight -> 56.dp
            else -> 70.dp
        },
        eyebrowFontSize = 12,
        eyebrowHorizontalPadding = 12.dp,
        eyebrowVerticalPadding = 7.dp,
        headlineTopPadding = if (veryCompactHeight) 22.dp else 28.dp,
        headlineFontSize = when {
            veryCompactHeight -> 31
            compactHeight -> 34
            else -> 38
        },
        headlineLineHeight = when {
            veryCompactHeight -> 34
            compactHeight -> 37
            else -> 41
        },
        featuresTopPadding = if (veryCompactHeight) 24.dp else 28.dp,
        featureSpacing = if (veryCompactHeight) 18.dp else 22.dp,
        iconSize = if (veryCompactHeight) 50.dp else 54.dp,
        iconInnerSize = if (veryCompactHeight) 26.dp else 28.dp,
        featureTitleSize = if (veryCompactHeight) 15 else 16,
        featureTitleLineHeight = if (veryCompactHeight) 18 else 19,
        featureDescriptionSize = if (veryCompactHeight) 13 else 14,
        featureDescriptionLineHeight = if (veryCompactHeight) 18 else 19,
        featureWidth = 0.86f,
        featureGap = 18.dp,
        contentSpacer = when {
            veryCompactHeight -> 16.dp
            compactHeight -> 24.dp
            else -> 36.dp
        },
        ctaSpacing = if (veryCompactHeight) 10.dp else 14.dp,
        buttonHeight = if (veryCompactHeight) 52.dp else 56.dp,
        buttonTextSize = if (veryCompactHeight) 18 else 19,
        buttonHorizontalPadding = 24.dp,
        secondaryCtaSize = if (veryCompactHeight) 16 else 17,
        secondaryCtaVerticalPadding = 6.dp,
        bottomPadding = 8.dp,
    )
}
