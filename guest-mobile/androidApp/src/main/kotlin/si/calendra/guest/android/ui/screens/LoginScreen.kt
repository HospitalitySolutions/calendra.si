package si.calendra.guest.android.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun LoginScreen(
    onLogin: (String, String) -> Unit,
    onGoogleLogin: () -> Unit
) {
    var email by remember { mutableStateOf("ana@example.com") }
    var password by remember { mutableStateOf("Secret123!") }

    Column(modifier = Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Sign in", style = MaterialTheme.typography.headlineMedium)
        OutlinedTextField(value = email, onValueChange = { email = it }, label = { Text("Email") }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(value = password, onValueChange = { password = it }, label = { Text("Password") }, modifier = Modifier.fillMaxWidth())
        Button(onClick = { onLogin(email, password) }, modifier = Modifier.fillMaxWidth()) { Text("Login") }
        OutlinedButton(onClick = onGoogleLogin, modifier = Modifier.fillMaxWidth()) { Text("Continue with Google") }
        Text("Apple sign-in is available on iOS through the native SwiftUI app.")
    }
}
