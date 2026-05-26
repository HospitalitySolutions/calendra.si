package si.calendra.guest.android.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Email
import androidx.compose.material.icons.outlined.Language
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Phone
import androidx.compose.material.icons.rounded.Visibility
import androidx.compose.material.icons.rounded.VisibilityOff
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import si.calendra.guest.android.R
import si.calendra.guest.shared.models.SignupStartRequest
import androidx.compose.foundation.gestures.detectTapGestures

private const val DesignWidth = 941f
private const val DesignHeight = 1672f
private val SignupBlue = Color(0xFF1477FF)
private val SignupButtonBlueStart = Color(0xFF0066F4)
private val SignupButtonBlueEnd = Color(0xFF0053DB)
private val SignupNavy = Color(0xFF061A3A)
private val SignupMuted = Color(0xFF65728A)
private val SignupBorder = Color(0xFFCAD4E2)
private val SignupFieldFill = Color.White.copy(alpha = 0.82f)

@Composable
fun SignupScreen(
    isSubmitting: Boolean,
    languageCode: String,
    onLanguageChange: (String) -> Unit,
    onSubmit: (SignupStartRequest) -> Unit,
    onGoogleSignup: () -> Unit,
    onBackToLogin: () -> Unit
) {
    var firstName by remember { mutableStateOf("") }
    var lastName by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var repeatPassword by remember { mutableStateOf("") }
    var passwordVisible by remember { mutableStateOf(false) }
    var repeatPasswordVisible by remember { mutableStateOf(false) }
    var phone by remember { mutableStateOf("") }
    var languageMenuOpen by remember { mutableStateOf(false) }

    val isSl = languageCode.lowercase().startsWith("sl")
    val createAccountTitle = if (isSl) "USTVARI RAČUN" else "CREATE ACCOUNT"
    val detailsTitle = if (isSl) "Začnite s\nsvojimi podatki" else "Start with\nyour details"
    val firstNameLabel = if (isSl) "Ime" else "First"
    val lastNameLabel = if (isSl) "Priimek" else "Last"
    val emailLabel = if (isSl) "E-pošta" else "Email"
    val passwordLabel = if (isSl) "Geslo" else "Password"
    val repeatPasswordLabel = if (isSl) "Ponovite geslo" else "Repeat password"
    val phoneLabel = if (isSl) "Telefon (neobvezno)" else "Phone (optional)"
    val sendingText = if (isSl) "Pošiljanje…" else "Sending…"
    val sendCodeText = if (isSl) "Pošlji potrditveno kodo" else "Send confirmation code"
    val googleSignupText = if (isSl) "Registriraj se z Googlom" else "Sign up with Google"
    val orText = if (isSl) "ALI" else "OR"
    val alreadyHaveAccountText = if (isSl) "Že imate račun? " else "Already have an account? "
    val signInText = if (isSl) "Prijava" else "Sign in"
    val focusManager = LocalFocusManager.current
    val density = LocalDensity.current

    val passwordsMatch = password == repeatPassword
    val canSubmit = !isSubmitting &&
        firstName.isNotBlank() &&
        lastName.isNotBlank() &&
        email.isNotBlank() &&
        password.isNotBlank() &&
        repeatPassword.isNotBlank() &&
        passwordsMatch

    BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
        val scrollState = rememberScrollState()
        val screenWidth = maxWidth
        val screenHeight = maxHeight
        val imeBottomPx = WindowInsets.ime.getBottom(density)
        val keyboardVisible = imeBottomPx > 0
        val keyboardHeight = with(density) { imeBottomPx.toDp() }
        val alreadyHaveAccountBottom = screenHeight * ((1488f + 60f) / DesignHeight)
        val keyboardTop = screenHeight - keyboardHeight
        val maxKeyboardScroll = if (keyboardVisible) {
            val neededScroll = alreadyHaveAccountBottom - keyboardTop + 10.dp
            if (neededScroll > 0.dp) neededScroll else 0.dp
        } else {
            0.dp
        }

        LaunchedEffect(keyboardVisible) {
            if (!keyboardVisible && scrollState.value > 0) {
                delay(60)
                scrollState.animateScrollTo(0)
            }
        }

        Image(
            painter = painterResource(id = R.drawable.signup_background),
            contentDescription = null,
            contentScale = ContentScale.FillBounds,
            modifier = Modifier.fillMaxSize()
        )

        Box(
            modifier = Modifier
                .fillMaxSize()
                .pointerInput(Unit) {
                    detectTapGestures(onTap = { focusManager.clearFocus() })
                }
                .verticalScroll(scrollState)
        ) {
            Box(
                modifier = Modifier
                    .width(screenWidth)
                    .height(screenHeight + maxKeyboardScroll)
            ) {
                Text(
                    text = createAccountTitle,
                    color = SignupBlue,
                    fontSize = 11.sp,
                    lineHeight = 14.sp,
                    fontWeight = FontWeight.Black,
                    letterSpacing = 2.2.sp,
                    modifier = Modifier.designBounds(screenWidth, screenHeight, 124f, 276f, 520f, 42f)
                )

                Box(
                    modifier = Modifier.designBounds(screenWidth, screenHeight, 748f, 259f, 76f, 76f)
                ) {
                    IconButton(
                        onClick = { languageMenuOpen = true },
                        modifier = Modifier.fillMaxSize()
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.Language,
                            contentDescription = if (isSl) "Jezik" else "Language",
                            tint = SignupBlue,
                            modifier = Modifier.size(25.dp)
                        )
                    }
                    DropdownMenu(
                        expanded = languageMenuOpen,
                        onDismissRequest = { languageMenuOpen = false }
                    ) {
                        DropdownMenuItem(
                            text = { Text("Slovenščina") },
                            onClick = {
                                onLanguageChange("sl")
                                languageMenuOpen = false
                            }
                        )
                        DropdownMenuItem(
                            text = { Text("English") },
                            onClick = {
                                onLanguageChange("en")
                                languageMenuOpen = false
                            }
                        )
                    }
                }

                Text(
                    text = detailsTitle,
                    color = SignupNavy,
                    fontSize = 30.sp,
                    lineHeight = 35.sp,
                    fontWeight = FontWeight.Black,
                    letterSpacing = (-0.8).sp,
                    modifier = Modifier.designBounds(screenWidth, screenHeight, 124f, 346f, 620f, 148f)
                )

                SignupTextField(
                    value = firstName,
                    onValueChange = { firstName = it },
                    placeholder = firstNameLabel,
                    leadingIcon = Icons.Outlined.Person,
                    modifier = Modifier.designBounds(screenWidth, screenHeight, 124f, 556f, 330f, 104f),
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words)
                )
                SignupTextField(
                    value = lastName,
                    onValueChange = { lastName = it },
                    placeholder = lastNameLabel,
                    leadingIcon = Icons.Outlined.Person,
                    modifier = Modifier.designBounds(screenWidth, screenHeight, 473f, 556f, 330f, 104f),
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words)
                )
                SignupTextField(
                    value = email,
                    onValueChange = { email = it },
                    placeholder = emailLabel,
                    leadingIcon = Icons.Outlined.Email,
                    modifier = Modifier.designBounds(screenWidth, screenHeight, 124f, 692f, 680f, 104f),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email)
                )
                SignupTextField(
                    value = password,
                    onValueChange = { password = it },
                    placeholder = passwordLabel,
                    leadingIcon = Icons.Outlined.Lock,
                    modifier = Modifier.designBounds(screenWidth, screenHeight, 124f, 828f, 680f, 104f),
                    visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                    trailingIcon = if (passwordVisible) Icons.Rounded.VisibilityOff else Icons.Rounded.Visibility,
                    onTrailingClick = { passwordVisible = !passwordVisible }
                )
                SignupTextField(
                    value = repeatPassword,
                    onValueChange = { repeatPassword = it },
                    placeholder = repeatPasswordLabel,
                    leadingIcon = Icons.Outlined.Lock,
                    modifier = Modifier.designBounds(screenWidth, screenHeight, 124f, 964f, 680f, 104f),
                    visualTransformation = if (repeatPasswordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                    trailingIcon = if (repeatPasswordVisible) Icons.Rounded.VisibilityOff else Icons.Rounded.Visibility,
                    onTrailingClick = { repeatPasswordVisible = !repeatPasswordVisible }
                )
                SignupTextField(
                    value = phone,
                    onValueChange = { phone = it },
                    placeholder = phoneLabel,
                    leadingIcon = Icons.Outlined.Phone,
                    modifier = Modifier.designBounds(screenWidth, screenHeight, 124f, 1100f, 680f, 104f),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone)
                )

                SignupSubmitButton(
                    text = if (isSubmitting) sendingText else sendCodeText,
                    modifier = Modifier.designBounds(screenWidth, screenHeight, 124f, 1210f, 680f, 104f),
                    enabled = !isSubmitting,
                    onClick = {
                        if (canSubmit) {
                            onSubmit(
                                SignupStartRequest(
                                    email = email.trim(),
                                    password = password,
                                    firstName = firstName.trim(),
                                    lastName = lastName.trim(),
                                    phone = phone.trim().ifBlank { null },
                                    language = languageCode
                                )
                            )
                        }
                    }
                )

                SignupDivider(
                    text = orText,
                    modifier = Modifier.designBounds(screenWidth, screenHeight, 124f, 1330f, 680f, 28f)
                )

                SignupGoogleButton(
                    text = googleSignupText,
                    modifier = Modifier.designBounds(screenWidth, screenHeight, 124f, 1366f, 680f, 92f),
                    enabled = !isSubmitting,
                    onClick = onGoogleSignup
                )

                Row(
                    modifier = Modifier
                        .designBounds(screenWidth, screenHeight, 188f, 1488f, 565f, 60f)
                        .clickable(
                            enabled = !isSubmitting,
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            onClick = onBackToLogin
                        ),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = alreadyHaveAccountText,
                        color = SignupMuted,
                        fontSize = 13.sp,
                        lineHeight = 16.sp,
                        fontWeight = FontWeight.Medium
                    )
                    Text(
                        text = signInText,
                        color = SignupBlue,
                        fontSize = 13.sp,
                        lineHeight = 16.sp,
                        fontWeight = FontWeight.Black
                    )
                }
            }
        }
    }
}


@Composable
private fun SignupDivider(
    text: String,
    modifier: Modifier
) {
    Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .weight(1f)
                .height(1.dp)
                .background(Color(0xFFDDE4EE))
        )
        Text(
            text = text,
            color = Color(0xFF7D8AA4),
            fontSize = 11.sp,
            lineHeight = 14.sp,
            fontWeight = FontWeight.SemiBold,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(horizontal = 14.dp)
        )
        Box(
            modifier = Modifier
                .weight(1f)
                .height(1.dp)
                .background(Color(0xFFDDE4EE))
        )
    }
}

@Composable
private fun SignupGoogleButton(
    text: String,
    modifier: Modifier,
    enabled: Boolean,
    onClick: () -> Unit
) {
    OutlinedButton(
        onClick = onClick,
        enabled = enabled,
        shape = RoundedCornerShape(4.dp),
        border = BorderStroke(1.5.dp, SignupBlue),
        modifier = modifier
    ) {
        Row(
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth()
        ) {
            Image(
                painter = painterResource(id = R.drawable.google_logo),
                contentDescription = null,
                contentScale = ContentScale.Fit,
                modifier = Modifier
                    .size(24.dp)
                    .offset(y = (-3).dp)
            )
            Spacer(modifier = Modifier.width(14.dp))
            Text(
                text = text,
                color = SignupNavy,
                fontSize = 13.sp,
                lineHeight = 17.sp,
                fontWeight = FontWeight.Normal
            )
        }
    }
}

@Composable
private fun SignupTextField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    leadingIcon: ImageVector,
    modifier: Modifier,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    trailingIcon: ImageVector? = null,
    onTrailingClick: (() -> Unit)? = null
) {
    val focusRequester = remember { FocusRequester() }

    Box(
        modifier = modifier
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = { focusRequester.requestFocus() }
            )
            .background(SignupFieldFill)
            .border(width = 0.8.dp, color = SignupBorder)
            .padding(horizontal = 22.dp),
        contentAlignment = Alignment.CenterStart
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxSize()
        ) {
            Icon(
                imageVector = leadingIcon,
                contentDescription = null,
                tint = SignupBlue,
                modifier = Modifier.size(22.dp)
            )
            BasicTextField(
                value = value,
                onValueChange = onValueChange,
                modifier = Modifier
                    .focusRequester(focusRequester)
                    .weight(1f)
                    .padding(start = 20.dp, end = if (trailingIcon == null) 0.dp else 12.dp),
                textStyle = TextStyle(
                    color = SignupNavy,
                    fontSize = 11.sp,
                    lineHeight = 15.sp,
                    fontWeight = FontWeight.Normal
                ),
                cursorBrush = SolidColor(SignupBlue),
                keyboardOptions = keyboardOptions,
                singleLine = true,
                visualTransformation = visualTransformation,
                decorationBox = { innerTextField ->
                    Box(contentAlignment = Alignment.CenterStart) {
                        if (value.isEmpty()) {
                            Text(
                                text = placeholder,
                                color = SignupMuted,
                                fontSize = 11.sp,
                                lineHeight = 15.sp,
                                fontWeight = FontWeight.Normal
                            )
                        }
                        innerTextField()
                    }
                }
            )
            if (trailingIcon != null && onTrailingClick != null) {
                Icon(
                    imageVector = trailingIcon,
                    contentDescription = null,
                    tint = SignupMuted,
                    modifier = Modifier
                        .size(27.dp)
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            onClick = onTrailingClick
                        )
                )
            }
        }
    }
}

@Composable
private fun SignupSubmitButton(
    text: String,
    modifier: Modifier,
    enabled: Boolean,
    onClick: () -> Unit
) {
    Box(
        modifier = modifier
            .background(
                brush = Brush.horizontalGradient(
                    colors = listOf(SignupButtonBlueStart, SignupButtonBlueEnd)
                )
            )
            .clickable(
                enabled = enabled,
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onClick
            )
            .padding(horizontal = 30.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = text,
            color = Color.White,
            fontSize = 14.sp,
            lineHeight = 17.sp,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center
        )
    }
}

private fun Modifier.designBounds(
    screenWidth: Dp,
    screenHeight: Dp,
    left: Float,
    top: Float,
    width: Float,
    height: Float
): Modifier = this
    .offset(x = screenWidth * (left / DesignWidth), y = screenHeight * (top / DesignHeight))
    .width(screenWidth * (width / DesignWidth))
    .height(screenHeight * (height / DesignHeight))
