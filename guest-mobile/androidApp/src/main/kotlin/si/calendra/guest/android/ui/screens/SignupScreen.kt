package si.calendra.guest.android.ui.screens

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Email
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Phone
import androidx.compose.material.icons.rounded.Visibility
import androidx.compose.material.icons.rounded.VisibilityOff
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
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
import si.calendra.guest.android.R
import si.calendra.guest.shared.models.SignupStartRequest

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

    val passwordsMatch = password == repeatPassword
    val canSubmit = !isSubmitting &&
        firstName.isNotBlank() &&
        lastName.isNotBlank() &&
        email.isNotBlank() &&
        password.isNotBlank() &&
        repeatPassword.isNotBlank() &&
        passwordsMatch

    BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
        Image(
            painter = painterResource(id = R.drawable.signup_background),
            contentDescription = null,
            contentScale = ContentScale.FillBounds,
            modifier = Modifier.fillMaxSize()
        )

        Text(
            text = "CREATE ACCOUNT",
            color = SignupBlue,
            fontSize = 11.sp,
            lineHeight = 14.sp,
            fontWeight = FontWeight.Black,
            letterSpacing = 2.2.sp,
            modifier = Modifier.designBounds(maxWidth, maxHeight, 124f, 300f, 520f, 42f)
        )

        Text(
            text = "Start with\nyour details",
            color = SignupNavy,
            fontSize = 34.sp,
            lineHeight = 40.sp,
            fontWeight = FontWeight.Black,
            letterSpacing = (-0.8).sp,
            modifier = Modifier.designBounds(maxWidth, maxHeight, 124f, 380f, 620f, 165f)
        )

        SignupTextField(
            value = firstName,
            onValueChange = { firstName = it },
            placeholder = "First",
            leadingIcon = Icons.Outlined.Person,
            modifier = Modifier.designBounds(maxWidth, maxHeight, 124f, 624f, 330f, 104f),
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words)
        )
        SignupTextField(
            value = lastName,
            onValueChange = { lastName = it },
            placeholder = "Last",
            leadingIcon = Icons.Outlined.Person,
            modifier = Modifier.designBounds(maxWidth, maxHeight, 473f, 624f, 330f, 104f),
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words)
        )
        SignupTextField(
            value = email,
            onValueChange = { email = it },
            placeholder = "Email",
            leadingIcon = Icons.Outlined.Email,
            modifier = Modifier.designBounds(maxWidth, maxHeight, 124f, 768f, 680f, 104f),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email)
        )
        SignupTextField(
            value = password,
            onValueChange = { password = it },
            placeholder = "Password",
            leadingIcon = Icons.Outlined.Lock,
            modifier = Modifier.designBounds(maxWidth, maxHeight, 124f, 912f, 680f, 104f),
            visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            trailingIcon = if (passwordVisible) Icons.Rounded.VisibilityOff else Icons.Rounded.Visibility,
            onTrailingClick = { passwordVisible = !passwordVisible }
        )
        SignupTextField(
            value = repeatPassword,
            onValueChange = { repeatPassword = it },
            placeholder = "Repeat password",
            leadingIcon = Icons.Outlined.Lock,
            modifier = Modifier.designBounds(maxWidth, maxHeight, 124f, 1056f, 680f, 104f),
            visualTransformation = if (repeatPasswordVisible) VisualTransformation.None else PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            trailingIcon = if (repeatPasswordVisible) Icons.Rounded.VisibilityOff else Icons.Rounded.Visibility,
            onTrailingClick = { repeatPasswordVisible = !repeatPasswordVisible }
        )
        SignupTextField(
            value = phone,
            onValueChange = { phone = it },
            placeholder = "Phone (optional)",
            leadingIcon = Icons.Outlined.Phone,
            modifier = Modifier.designBounds(maxWidth, maxHeight, 124f, 1198f, 680f, 104f),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone)
        )

        SignupSubmitButton(
            text = if (isSubmitting) "Sending…" else "Send confirmation code",
            modifier = Modifier.designBounds(maxWidth, maxHeight, 124f, 1338f, 680f, 112f),
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

        Row(
            modifier = Modifier
                .designBounds(maxWidth, maxHeight, 188f, 1464f, 565f, 60f)
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
                text = "Already have an account? ",
                color = SignupMuted,
                fontSize = 13.sp,
                lineHeight = 16.sp,
                fontWeight = FontWeight.Medium
            )
            Text(
                text = "Sign in",
                color = SignupBlue,
                fontSize = 13.sp,
                lineHeight = 16.sp,
                fontWeight = FontWeight.Black
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
    Box(
        modifier = modifier
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
                    .weight(1f)
                    .padding(start = 20.dp, end = if (trailingIcon == null) 0.dp else 12.dp),
                textStyle = TextStyle(
                    color = SignupNavy,
                    fontSize = 13.sp,
                    lineHeight = 17.sp,
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
                                fontSize = 13.sp,
                                lineHeight = 17.sp,
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
