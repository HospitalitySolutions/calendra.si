package si.calendra.guest.android.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val LightScheme = lightColorScheme(
    primary = Color(0xFF124C9D),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFDCEAFF),
    onPrimaryContainer = Color(0xFF0B2D5F),
    secondary = Color(0xFFE6892D),
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFFFE7CC),
    onSecondaryContainer = Color(0xFF5F3502),
    tertiary = Color(0xFFF29F3D),
    onTertiary = Color.White,
    background = Color(0xFFF6F9FF),
    onBackground = Color(0xFF10243F),
    surface = Color(0xFFFFFFFF),
    onSurface = Color(0xFF10243F),
    surfaceVariant = Color(0xFFF0F5FF),
    onSurfaceVariant = Color(0xFF4E617B),
    surfaceContainerLowest = Color(0xFFF6F9FF),
    surfaceContainerLow = Color(0xFFFFFFFF),
    surfaceContainer = Color(0xFFF6F9FF),
    outline = Color(0xFFD5DFED)
)

private val DarkScheme = darkColorScheme(
    primary = Color(0xFF87B4FF),
    onPrimary = Color(0xFF082447),
    primaryContainer = Color(0xFF173D70),
    onPrimaryContainer = Color(0xFFDCEAFF),
    secondary = Color(0xFFF6B064),
    onSecondary = Color(0xFF4A2600),
    background = Color(0xFF081326),
    onBackground = Color(0xFFE7F0FF),
    surface = Color(0xFF11233E),
    onSurface = Color(0xFFE7F0FF),
    surfaceVariant = Color(0xFF1C355A),
    onSurfaceVariant = Color(0xFFA5BCD9)
)

@Composable
fun GuestMobileTheme(
    darkTheme: Boolean = false,
    content: @Composable () -> Unit
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkScheme else LightScheme,
        content = content
    )
}
