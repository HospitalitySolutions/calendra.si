package si.calendra.guest.android.ui.screens

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.outlined.Email
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.rounded.Visibility
import androidx.compose.material.icons.rounded.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import si.calendra.guest.android.R
import si.calendra.guest.shared.models.ResetPasswordCodeResponse
import si.calendra.guest.shared.models.ResetPasswordValidateResponse

@Composable
fun ForgotPasswordScreen(
    languageCode: String,
    initialEmail: String,
    onRequestReset: suspend (String) -> Unit,
    onVerifyCode: suspend (String, String) -> ResetPasswordCodeResponse,
    onCodeVerified: (String, String?) -> Unit,
    onBackToLogin: () -> Unit,
    onError: (String) -> Unit
) {
    val isSl = languageCode.equals("sl", ignoreCase = true)
    var email by remember(initialEmail) { mutableStateOf(initialEmail) }
    var code by remember { mutableStateOf("") }
    var codeSent by remember { mutableStateOf(false) }
    var submitting by remember { mutableStateOf(false) }
    var inlineError by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val blue = Color(0xFF0568F5)
    val dark = Color(0xFF071735)
    val muted = Color(0xFF5D6B8C)
    val appFont = FontFamily.SansSerif

    BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
        val screenWidth = maxWidth
        val screenHeight = maxHeight
        val contentInset = screenWidth * 0.17f
        val contentWidth = screenWidth - (contentInset * 2f)
        val fieldHeight = screenHeight * 0.074f
        val buttonHeight = screenHeight * 0.069f

        Image(
            painter = painterResource(id = R.drawable.signin_background),
            contentDescription = null,
            contentScale = ContentScale.FillBounds,
            modifier = Modifier.fillMaxSize()
        )

        if (!codeSent) {
            Text(
                text = if (isSl) "PONASTAVITEV GESLA" else "PASSWORD RESET",
                color = blue,
                fontSize = 12.sp,
                lineHeight = 15.sp,
                fontWeight = FontWeight.Bold,
                fontFamily = appFont,
                modifier = Modifier.offset(x = contentInset, y = screenHeight * 0.253f)
            )
            Text(
                text = if (isSl) "Pozabljeno geslo" else "Forgot password",
                color = dark,
                fontSize = 33.sp,
                lineHeight = 38.sp,
                fontWeight = FontWeight.ExtraBold,
                fontFamily = appFont,
                modifier = Modifier.offset(x = contentInset, y = screenHeight * 0.302f)
            )
            Text(
                text = if (isSl) "Vnesite e-poštni naslov, povezan z vašim
računom. Poslali vam bomo 6-mestno
kodo za ponastavitev gesla." else "Enter the email address connected to
your account. We will send you a 6-digit
code to reset your password.",
                color = muted,
                fontSize = 15.sp,
                lineHeight = 21.sp,
                fontWeight = FontWeight.Normal,
                fontFamily = appFont,
                modifier = Modifier
                    .offset(x = contentInset, y = screenHeight * 0.365f)
                    .width(contentWidth)
            )
            AuthResetField(
                value = email,
                onValueChange = { email = it },
                placeholder = if (isSl) "E-pošta" else "Email",
                leadingIcon = Icons.Outlined.Email,
                modifier = Modifier
                    .offset(x = contentInset, y = screenHeight * 0.508f)
                    .width(contentWidth)
                    .height(fieldHeight),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Done)
            )
            inlineError?.let {
                Text(
                    text = it,
                    color = Color.Red,
                    fontSize = 12.sp,
                    lineHeight = 16.sp,
                    fontFamily = appFont,
                    modifier = Modifier
                        .offset(x = contentInset, y = screenHeight * 0.59f)
                        .width(contentWidth)
                )
            }
            Button(
                onClick = {
                    val normalized = email.trim()
                    if (normalized.isNotEmpty()) {
                        submitting = true
                        inlineError = null
                        scope.launch {
                            runCatching { onRequestReset(normalized) }
                                .onSuccess {
                                    email = normalized
                                    code = ""
                                    codeSent = true
                                }
                                .onFailure {
                                    inlineError = it.message ?: if (isSl) "Kode ni bilo mogoče poslati." else "Could not send code."
                                    onError(inlineError.orEmpty())
                                }
                            submitting = false
                        }
                    }
                },
                enabled = !submitting && email.trim().isNotEmpty(),
                shape = RoundedCornerShape(6.dp),
                colors = ButtonDefaults.buttonColors(containerColor = blue, contentColor = Color.White),
                elevation = ButtonDefaults.buttonElevation(defaultElevation = 0.dp, pressedElevation = 0.dp),
                modifier = Modifier
                    .offset(x = contentInset, y = screenHeight * 0.628f)
                    .width(contentWidth)
                    .height(buttonHeight)
            ) {
                Text(if (submitting) (if (isSl) "Pošiljanje…" else "Sending…") else (if (isSl) "Pošlji kodo" else "Send code"), fontSize = 16.sp, fontWeight = FontWeight.SemiBold, fontFamily = appFont)
            }
            Text(
                text = if (isSl) "Nazaj na prijavo" else "Back to login",
                color = blue,
                fontSize = 16.sp,
                lineHeight = 20.sp,
                fontWeight = FontWeight.SemiBold,
                fontFamily = appFont,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .offset(x = contentInset, y = screenHeight * 0.748f)
                    .width(contentWidth)
                    .clickable(onClick = onBackToLogin)
            )
        } else {
            Text(
                text = if (isSl) "PREVERJANJE KODE" else "CODE VERIFICATION",
                color = blue,
                fontSize = 12.sp,
                lineHeight = 15.sp,
                fontWeight = FontWeight.Bold,
                fontFamily = appFont,
                modifier = Modifier.offset(x = contentInset, y = screenHeight * 0.253f)
            )
            Text(
                text = if (isSl) "Vnesite kodo" else "Enter code",
                color = dark,
                fontSize = 34.sp,
                lineHeight = 38.sp,
                fontWeight = FontWeight.ExtraBold,
                fontFamily = appFont,
                modifier = Modifier.offset(x = contentInset, y = screenHeight * 0.302f)
            )
            Text(
                text = (if (isSl) "6-mestno kodo za ponastavitev gesla smo
poslali na
" else "We sent a 6-digit password reset code to
") + email,
                color = muted,
                fontSize = 15.sp,
                lineHeight = 21.sp,
                fontWeight = FontWeight.Normal,
                fontFamily = appFont,
                modifier = Modifier
                    .offset(x = contentInset, y = screenHeight * 0.365f)
                    .width(contentWidth)
            )
            AuthResetField(
                value = code,
                onValueChange = { code = it.filter { char -> char.isDigit() }.take(6) },
                placeholder = if (isSl) "Potrditvena koda" else "Verification code",
                leadingIcon = Icons.Outlined.Lock,
                modifier = Modifier
                    .offset(x = contentInset, y = screenHeight * 0.512f)
                    .width(contentWidth)
                    .height(fieldHeight),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword, imeAction = ImeAction.Done)
            )
            Text(
                text = if (isSl) "Koda velja 15 minut. Če je ne vidite, preverite mapo z vsiljeno pošto." else "The code is valid for 15 minutes. If you do not see it, check your spam folder.",
                color = muted,
                fontSize = 12.sp,
                lineHeight = 16.sp,
                fontWeight = FontWeight.Normal,
                fontFamily = appFont,
                modifier = Modifier
                    .offset(x = contentInset, y = screenHeight * 0.606f)
                    .width(contentWidth)
            )
            inlineError?.let {
                Text(
                    text = it,
                    color = Color.Red,
                    fontSize = 12.sp,
                    lineHeight = 16.sp,
                    fontFamily = appFont,
                    modifier = Modifier
                        .offset(x = contentInset, y = screenHeight * 0.665f)
                        .width(contentWidth)
                )
            }
            Button(
                onClick = {
                    val normalized = email.trim()
                    val normalizedCode = code.trim()
                    if (normalized.isNotEmpty() && normalizedCode.length == 6) {
                        submitting = true
                        inlineError = null
                        scope.launch {
                            runCatching { onVerifyCode(normalized, normalizedCode) }
                                .onSuccess { response ->
                                    val resetToken = response.resetToken.orEmpty()
                                    if (response.verified && resetToken.isNotBlank()) {
                                        onCodeVerified(resetToken, response.email ?: normalized)
                                    } else {
                                        inlineError = if (isSl) "Koda ni veljavna ali je potekla." else "The code is invalid or expired."
                                    }
                                }
                                .onFailure {
                                    inlineError = if (isSl) "Koda ni veljavna ali je potekla." else "The code is invalid or expired."
                                    onError(inlineError.orEmpty())
                                }
                            submitting = false
                        }
                    }
                },
                enabled = !submitting && code.trim().length == 6,
                shape = RoundedCornerShape(6.dp),
                colors = ButtonDefaults.buttonColors(containerColor = blue, contentColor = Color.White),
                elevation = ButtonDefaults.buttonElevation(defaultElevation = 0.dp, pressedElevation = 0.dp),
                modifier = Modifier
                    .offset(x = contentInset, y = screenHeight * 0.704f)
                    .width(contentWidth)
                    .height(buttonHeight)
            ) {
                Text(if (submitting) (if (isSl) "Preverjanje…" else "Checking…") else (if (isSl) "Potrdi kodo" else "Confirm code"), fontSize = 16.sp, fontWeight = FontWeight.SemiBold, fontFamily = appFont)
            }
            Text(
                text = if (isSl) "Niste prejeli kode? Pošlji znova" else "Did not receive the code? Send again",
                color = blue,
                fontSize = 14.sp,
                lineHeight = 18.sp,
                fontWeight = FontWeight.SemiBold,
                fontFamily = appFont,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .offset(x = contentInset, y = screenHeight * 0.82f)
                    .width(contentWidth)
                    .clickable {
                        val normalized = email.trim()
                        if (!submitting && normalized.isNotEmpty()) {
                            submitting = true
                            inlineError = null
                            scope.launch {
                                runCatching { onRequestReset(normalized) }
                                    .onSuccess { code = "" }
                                    .onFailure {
                                        inlineError = it.message ?: if (isSl) "Kode ni bilo mogoče ponovno poslati." else "Could not resend code."
                                        onError(inlineError.orEmpty())
                                    }
                                submitting = false
                            }
                        }
                    }
            )
            Text(
                text = if (isSl) "Nazaj na prijavo" else "Back to login",
                color = blue,
                fontSize = 14.sp,
                lineHeight = 18.sp,
                fontWeight = FontWeight.SemiBold,
                fontFamily = appFont,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .offset(x = contentInset, y = screenHeight * 0.865f)
                    .width(contentWidth)
                    .clickable(onClick = onBackToLogin)
            )
        }
    }
}

@Composable
fun ResetPasswordScreen(
    languageCode: String,
    token: String,
    initialEmail: String?,
    onValidateToken: suspend (String) -> ResetPasswordValidateResponse,
    onResetPassword: suspend (String, String) -> Unit,
    onBackToLogin: () -> Unit,
    onError: (String) -> Unit
) {
    val isSl = languageCode.equals("sl", ignoreCase = true)
    val blue = Color(0xFF0568F5)
    val dark = Color(0xFF071735)
    val muted = Color(0xFF5D6B8C)
    val appFont = FontFamily.SansSerif
    var validating by remember(token) { mutableStateOf(true) }
    var valid by remember(token) { mutableStateOf(false) }
    var success by remember(token) { mutableStateOf(false) }
    var email by remember(token) { mutableStateOf(initialEmail.orEmpty()) }
    var password by remember(token) { mutableStateOf("") }
    var confirm by remember(token) { mutableStateOf("") }
    var passwordVisible by remember { mutableStateOf(false) }
    var confirmVisible by remember { mutableStateOf(false) }
    var submitting by remember { mutableStateOf(false) }
    var inlineError by remember(token) { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(token) {
        validating = true
        runCatching { onValidateToken(token) }
            .onSuccess {
                valid = it.valid
                if (!it.email.isNullOrBlank()) email = it.email.orEmpty()
                inlineError = if (it.valid) null else if (isSl) "Ponastavitvena seja ni veljavna ali je potekla." else "The reset session is invalid or expired."
            }
            .onFailure {
                valid = false
                inlineError = it.message ?: if (isSl) "Ponastavitvena seja ni veljavna." else "The reset session is invalid."
            }
        validating = false
    }

    BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
        val screenWidth = maxWidth
        val screenHeight = maxHeight
        val contentInset = screenWidth * 0.17f
        val contentWidth = screenWidth - (contentInset * 2f)
        val fieldHeight = screenHeight * 0.074f
        val buttonHeight = screenHeight * 0.069f

        Image(
            painter = painterResource(id = R.drawable.signin_background),
            contentDescription = null,
            contentScale = ContentScale.FillBounds,
            modifier = Modifier.fillMaxSize()
        )

        when {
            validating -> CircularProgressIndicator(modifier = Modifier.offset(x = screenWidth * 0.45f, y = screenHeight * 0.46f), color = blue)
            success -> {
                Icon(
                    imageVector = Icons.Filled.CheckCircle,
                    contentDescription = null,
                    tint = Color(0xFF22C55E),
                    modifier = Modifier
                        .offset(x = contentInset + contentWidth * 0.34f, y = screenHeight * 0.34f)
                        .size(contentWidth * 0.32f)
                )
                Text(
                    text = if (isSl) "Geslo je shranjeno" else "Password saved",
                    color = dark,
                    fontSize = 31.sp,
                    lineHeight = 36.sp,
                    fontWeight = FontWeight.ExtraBold,
                    fontFamily = appFont,
                    textAlign = TextAlign.Center,
                    modifier = Modifier
                        .offset(x = contentInset, y = screenHeight * 0.50f)
                        .width(contentWidth)
                )
                Text(
                    text = if (isSl) "Zdaj se lahko prijavite z novim geslom." else "You can now sign in with your new password.",
                    color = muted,
                    fontSize = 15.sp,
                    lineHeight = 21.sp,
                    fontFamily = appFont,
                    textAlign = TextAlign.Center,
                    modifier = Modifier
                        .offset(x = contentInset, y = screenHeight * 0.56f)
                        .width(contentWidth)
                )
                Button(
                    onClick = onBackToLogin,
                    shape = RoundedCornerShape(6.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = blue, contentColor = Color.White),
                    elevation = ButtonDefaults.buttonElevation(defaultElevation = 0.dp, pressedElevation = 0.dp),
                    modifier = Modifier
                        .offset(x = contentInset, y = screenHeight * 0.66f)
                        .width(contentWidth)
                        .height(buttonHeight)
                ) { Text(if (isSl) "Nazaj na prijavo" else "Back to login", fontSize = 16.sp, fontWeight = FontWeight.SemiBold, fontFamily = appFont) }
            }
            !valid -> {
                Text(
                    text = if (isSl) "KODA NI VELJAVNA" else "CODE INVALID",
                    color = blue,
                    fontSize = 12.sp,
                    lineHeight = 15.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = appFont,
                    modifier = Modifier.offset(x = contentInset, y = screenHeight * 0.253f)
                )
                Text(
                    text = if (isSl) "Seja je potekla" else "Session expired",
                    color = dark,
                    fontSize = 32.sp,
                    lineHeight = 38.sp,
                    fontWeight = FontWeight.ExtraBold,
                    fontFamily = appFont,
                    modifier = Modifier.offset(x = contentInset, y = screenHeight * 0.31f)
                )
                Text(
                    text = inlineError ?: if (isSl) "Zahtevajte novo kodo za ponastavitev gesla." else "Request a new password reset code.",
                    color = muted,
                    fontSize = 15.sp,
                    lineHeight = 21.sp,
                    fontFamily = appFont,
                    modifier = Modifier
                        .offset(x = contentInset, y = screenHeight * 0.40f)
                        .width(contentWidth)
                )
                Button(
                    onClick = onBackToLogin,
                    shape = RoundedCornerShape(6.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = blue, contentColor = Color.White),
                    elevation = ButtonDefaults.buttonElevation(defaultElevation = 0.dp, pressedElevation = 0.dp),
                    modifier = Modifier
                        .offset(x = contentInset, y = screenHeight * 0.55f)
                        .width(contentWidth)
                        .height(buttonHeight)
                ) { Text(if (isSl) "Nazaj na prijavo" else "Back to login", fontSize = 16.sp, fontWeight = FontWeight.SemiBold, fontFamily = appFont) }
            }
            else -> {
                Text(
                    text = if (isSl) "NASTAVITE NOVO GESLO" else "SET NEW PASSWORD",
                    color = blue,
                    fontSize = 12.sp,
                    lineHeight = 15.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = appFont,
                    modifier = Modifier.offset(x = contentInset, y = screenHeight * 0.253f)
                )
                Text(
                    text = if (isSl) "Novo geslo" else "New password",
                    color = dark,
                    fontSize = 34.sp,
                    lineHeight = 38.sp,
                    fontWeight = FontWeight.ExtraBold,
                    fontFamily = appFont,
                    modifier = Modifier.offset(x = contentInset, y = screenHeight * 0.302f)
                )
                Text(
                    text = if (isSl) "Vnesite in potrdite novo geslo za\nsvoj račun." else "Enter and confirm a new password\nfor your account.",
                    color = muted,
                    fontSize = 15.sp,
                    lineHeight = 21.sp,
                    fontWeight = FontWeight.Normal,
                    fontFamily = appFont,
                    modifier = Modifier
                        .offset(x = contentInset, y = screenHeight * 0.365f)
                        .width(contentWidth)
                )
                AuthResetField(
                    value = password,
                    onValueChange = { password = it },
                    placeholder = if (isSl) "Novo geslo" else "New password",
                    leadingIcon = Icons.Outlined.Lock,
                    modifier = Modifier
                        .offset(x = contentInset, y = screenHeight * 0.484f)
                        .width(contentWidth)
                        .height(fieldHeight),
                    trailingIcon = {
                        IconButton(onClick = { passwordVisible = !passwordVisible }) {
                            Icon(if (passwordVisible) Icons.Rounded.VisibilityOff else Icons.Rounded.Visibility, contentDescription = null, tint = Color(0xFF243A5E))
                        }
                    },
                    visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Next)
                )
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .offset(x = contentInset, y = screenHeight * 0.586f)
                        .width(contentWidth)
                ) {
                    Icon(Icons.Outlined.Lock, contentDescription = null, tint = muted, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(if (isSl) "Vsaj 8 znakov, velika in mala črka ter številka" else "At least 8 characters, uppercase, lowercase and number", color = muted, fontSize = 12.sp, fontFamily = appFont)
                }
                AuthResetField(
                    value = confirm,
                    onValueChange = { confirm = it },
                    placeholder = if (isSl) "Potrdite novo geslo" else "Confirm new password",
                    leadingIcon = Icons.Outlined.Lock,
                    modifier = Modifier
                        .offset(x = contentInset, y = screenHeight * 0.624f)
                        .width(contentWidth)
                        .height(fieldHeight),
                    trailingIcon = {
                        IconButton(onClick = { confirmVisible = !confirmVisible }) {
                            Icon(if (confirmVisible) Icons.Rounded.VisibilityOff else Icons.Rounded.Visibility, contentDescription = null, tint = Color(0xFF243A5E))
                        }
                    },
                    visualTransformation = if (confirmVisible) VisualTransformation.None else PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done)
                )
                inlineError?.let {
                    Text(
                        text = it,
                        color = Color.Red,
                        fontSize = 12.sp,
                        lineHeight = 16.sp,
                        fontFamily = appFont,
                        modifier = Modifier
                            .offset(x = contentInset, y = screenHeight * 0.714f)
                            .width(contentWidth)
                    )
                }
                Button(
                    onClick = {
                        val message = passwordValidationMessage(password, confirm, isSl)
                        if (message != null) {
                            inlineError = message
                        } else {
                            submitting = true
                            scope.launch {
                                runCatching { onResetPassword(token, password) }
                                    .onSuccess { success = true }
                                    .onFailure {
                                        inlineError = it.message ?: if (isSl) "Gesla ni bilo mogoče shraniti." else "Could not save password."
                                        onError(inlineError.orEmpty())
                                    }
                                submitting = false
                            }
                        }
                    },
                    enabled = !submitting,
                    shape = RoundedCornerShape(6.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = blue, contentColor = Color.White),
                    elevation = ButtonDefaults.buttonElevation(defaultElevation = 0.dp, pressedElevation = 0.dp),
                    modifier = Modifier
                        .offset(x = contentInset, y = screenHeight * 0.742f)
                        .width(contentWidth)
                        .height(buttonHeight)
                ) { Text(if (submitting) (if (isSl) "Shranjevanje…" else "Saving…") else (if (isSl) "Shrani novo geslo" else "Save new password"), fontSize = 16.sp, fontWeight = FontWeight.SemiBold, fontFamily = appFont) }
                Text(
                    text = if (isSl) "←  Nazaj na prijavo" else "←  Back to login",
                    color = blue,
                    fontSize = 16.sp,
                    lineHeight = 20.sp,
                    fontWeight = FontWeight.SemiBold,
                    fontFamily = appFont,
                    textAlign = TextAlign.Center,
                    modifier = Modifier
                        .offset(x = contentInset, y = screenHeight * 0.846f)
                        .width(contentWidth)
                        .clickable(onClick = onBackToLogin)
                )
            }
        }
    }
}

private fun passwordValidationMessage(password: String, confirm: String, isSl: Boolean): String? {
    if (password.length < 8) return if (isSl) "Geslo mora imeti vsaj 8 znakov." else "Password must contain at least 8 characters."
    if (password.none { it.isDigit() }) return if (isSl) "Geslo mora vsebovati vsaj eno številko." else "Password must contain at least one number."
    if (password.none { it.isUpperCase() }) return if (isSl) "Geslo mora vsebovati vsaj eno veliko črko." else "Password must contain at least one uppercase letter."
    if (password.none { it.isLowerCase() }) return if (isSl) "Geslo mora vsebovati vsaj eno malo črko." else "Password must contain at least one lowercase letter."
    if (password != confirm) return if (isSl) "Gesli se ne ujemata." else "Passwords do not match."
    return null
}

@Composable
private fun AuthResetField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    leadingIcon: ImageVector,
    modifier: Modifier = Modifier,
    trailingIcon: (@Composable () -> Unit)? = null,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default
) {
    val iconTint = Color(0xFF243A5E)
    val borderColor = Color(0xFFD3DEEC)
    val textColor = Color(0xFF071735)
    val placeholderColor = Color(0xFF677493)
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = modifier
            .clip(RoundedCornerShape(4.dp))
            .background(Color.White.copy(alpha = 0.72f))
            .border(1.dp, borderColor, RoundedCornerShape(4.dp))
            .padding(horizontal = 16.dp)
    ) {
        Icon(imageVector = leadingIcon, contentDescription = null, tint = iconTint, modifier = Modifier.size(22.dp))
        Spacer(modifier = Modifier.width(16.dp))
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            singleLine = true,
            textStyle = TextStyle(color = textColor, fontSize = 15.sp, fontFamily = FontFamily.SansSerif),
            keyboardOptions = keyboardOptions,
            visualTransformation = visualTransformation,
            modifier = Modifier.weight(1f),
            decorationBox = { inner ->
                if (value.isEmpty()) {
                    Text(placeholder, color = placeholderColor, fontSize = 15.sp, fontFamily = FontFamily.SansSerif)
                }
                inner()
            }
        )
        trailingIcon?.invoke()
    }
}
