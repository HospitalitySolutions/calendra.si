package si.calendra.guest.android.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun JoinTenantScreen(onUsePreviewTenant: (String) -> Unit) {
    var code by remember { mutableStateOf("FIT-8K2L") }

    Column(modifier = Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Join a tenant", style = MaterialTheme.typography.headlineMedium)
        OutlinedTextField(value = code, onValueChange = { code = it }, label = { Text("Tenant code") })
        Button(onClick = { onUsePreviewTenant(code) }) { Text("Join with code") }
        Text("Invite links, QR links, and public search are planned in the backend contract and UI flow.")
    }
}
