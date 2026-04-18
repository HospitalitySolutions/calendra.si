package si.calendra.guest.android.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun WelcomeScreen(onContinue: () -> Unit) {
    Box(modifier = Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
        Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Text("Calendra Guest", style = MaterialTheme.typography.headlineMedium)
            Text("Native Android/iOS guest app scaffold for booking, wallet, notifications, and tenant joining.")
            Button(onClick = onContinue) { Text("Continue") }
        }
    }
}
