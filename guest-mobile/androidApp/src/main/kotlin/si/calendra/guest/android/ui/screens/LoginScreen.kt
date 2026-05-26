package si.calendra.guest.android.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.material.icons.outlined.Email
import androidx.compose.material.icons.outlined.Language
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.rounded.Visibility
import androidx.compose.material.icons.rounded.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
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
import si.calendra.guest.android.R

@Composable
fun LoginScreen(
    languageCode: String,
    onLogin: (String, String) -> Unit,
    onGoogleLogin: () -> Unit,
    onLanguageChange: (String) -> Unit,
    onCreateAccount: () -> Unit
) {
    val isSl = languageCode.equals("sl", ignoreCase = true)
    val welcomeBack = if (isSl) "DOBRODOŠLI NAZAJ" else "WELCOME BACK"
    val signInTitle = if (isSl) "Prijava" else "Sign in"
    val signInHint = if (isSl) "Uporabite e-pošto ali nadaljujte\nz Googlom." else "Use your email or continue\nwith Google."
    val emailLabel = if (isSl) "E-pošta" else "Email"
    val passwordLabel = if (isSl) "Geslo" else "Password"
    val hidePassword = if (isSl) "Skrij geslo" else "Hide password"
    val showPassword = if (isSl) "Prikaži geslo" else "Show password"
    val loginCta = if (isSl) "Prijava" else "Sign in"
    val continueWithGoogle = if (isSl) "Nadaljuj z Google" else "Continue with Google"
    val noAccount = if (isSl) "Nimate računa? " else "No account? "
    val createOne = if (isSl) "Ustvarite ga" else "Create one"
    val orText = if (isSl) "ALI" else "OR"

    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var passwordVisible by remember { mutableStateOf(false) }
    var languageMenuOpen by remember { mutableStateOf(false) }

    BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
        val screenWidth = maxWidth
        val screenHeight = maxHeight
        val contentInset = screenWidth * 0.17f
        val contentWidth = screenWidth - (contentInset * 2f)
        val fieldHeight = screenHeight * 0.074f
        val buttonHeight = screenHeight * 0.069f
        val iconTint = Color(0xFF243A5E)
        val labelColor = Color(0xFF677493)
        val borderColor = Color(0xFFD3DEEC)
        val blue = Color(0xFF0568F5)
        val dark = Color(0xFF071735)
        val appFont = FontFamily.SansSerif

        Image(
            painter = painterResource(id = R.drawable.signin_background),
            contentDescription = null,
            contentScale = ContentScale.FillBounds,
            modifier = Modifier.fillMaxSize()
        )

        Box(
            modifier = Modifier
                .offset(x = screenWidth * 0.76f, y = screenHeight * 0.198f)
                .size(screenWidth * 0.112f)
        ) {
            IconButton(
                onClick = { languageMenuOpen = true },
                modifier = Modifier.fillMaxSize()
            ) {
                Icon(
                    imageVector = Icons.Outlined.Language,
                    contentDescription = if (isSl) "Jezik" else "Language",
                    tint = blue,
                    modifier = Modifier.size(screenWidth * 0.054f)
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
            text = welcomeBack,
            color = blue,
            fontSize = 12.sp,
            lineHeight = 15.sp,
            fontWeight = FontWeight.Bold,
            fontFamily = appFont,
            modifier = Modifier.offset(x = contentInset, y = screenHeight * 0.211f)
        )

        Text(
            text = signInTitle,
            color = dark,
            fontSize = 34.sp,
            lineHeight = 38.sp,
            fontWeight = FontWeight.ExtraBold,
            fontFamily = appFont,
            modifier = Modifier.offset(x = contentInset, y = screenHeight * 0.253f)
        )

        Text(
            text = signInHint,
            color = Color(0xFF5D6B8C),
            fontSize = 15.sp,
            lineHeight = 21.sp,
            fontWeight = FontWeight.Normal,
            fontFamily = appFont,
            modifier = Modifier
                .offset(x = contentInset, y = screenHeight * 0.329f)
                .width(contentWidth)
        )

        LoginTextField(
            value = email,
            onValueChange = { email = it },
            placeholder = emailLabel,
            leadingIcon = Icons.Outlined.Email,
            iconTint = iconTint,
            borderColor = borderColor,
            textColor = dark,
            placeholderColor = labelColor,
            modifier = Modifier
                .offset(x = contentInset, y = screenHeight * 0.407f)
                .width(contentWidth)
                .height(fieldHeight),
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Email,
                imeAction = ImeAction.Next
            )
        )

        LoginTextField(
            value = password,
            onValueChange = { password = it },
            placeholder = passwordLabel,
            leadingIcon = Icons.Outlined.Lock,
            trailingIcon = {
                IconButton(onClick = { passwordVisible = !passwordVisible }) {
                    Icon(
                        imageVector = if (passwordVisible) Icons.Rounded.VisibilityOff else Icons.Rounded.Visibility,
                        contentDescription = if (passwordVisible) hidePassword else showPassword,
                        tint = iconTint,
                        modifier = Modifier.size(24.dp)
                    )
                }
            },
            visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
            iconTint = iconTint,
            borderColor = borderColor,
            textColor = dark,
            placeholderColor = labelColor,
            modifier = Modifier
                .offset(x = contentInset, y = screenHeight * 0.508f)
                .width(contentWidth)
                .height(fieldHeight),
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Password,
                imeAction = ImeAction.Done
            )
        )

        Button(
            onClick = { onLogin(email.trim(), password) },
            shape = RoundedCornerShape(6.dp),
            colors = ButtonDefaults.buttonColors(containerColor = blue, contentColor = Color.White),
            elevation = ButtonDefaults.buttonElevation(defaultElevation = 0.dp, pressedElevation = 0.dp),
            modifier = Modifier
                .offset(x = contentInset, y = screenHeight * 0.612f)
                .width(contentWidth)
                .height(buttonHeight)
        ) {
            Text(loginCta, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, fontFamily = appFont)
        }

        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .offset(x = contentInset, y = screenHeight * 0.711f)
                .width(contentWidth)
        ) {
            Spacer(
                modifier = Modifier
                    .weight(1f)
                    .height(1.dp)
                    .background(Color(0xFFDDE4EE))
            )
            Text(
                text = orText,
                color = Color(0xFF7D8AA4),
                fontSize = 14.sp,
                lineHeight = 18.sp,
                fontWeight = FontWeight.SemiBold,
                fontFamily = appFont,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(horizontal = 16.dp)
            )
            Spacer(
                modifier = Modifier
                    .weight(1f)
                    .height(1.dp)
                    .background(Color(0xFFDDE4EE))
            )
        }

        OutlinedButton(
            onClick = onGoogleLogin,
            shape = RoundedCornerShape(4.dp),
            border = BorderStroke(1.5.dp, blue),
            modifier = Modifier
                .offset(x = contentInset, y = screenHeight * 0.740f)
                .width(contentWidth)
                .height(buttonHeight)
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
                    text = continueWithGoogle,
                    color = dark,
                    fontSize = 15.sp,
                    lineHeight = 19.sp,
                    fontWeight = FontWeight.Normal,
                    fontFamily = appFont
                )
            }
        }

        Row(
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .offset(x = contentInset, y = screenHeight * 0.840f)
                .width(contentWidth)
        ) {
            Text(noAccount, color = Color(0xFF697794), fontSize = 15.sp, lineHeight = 20.sp, fontFamily = appFont)
            Text(
                createOne,
                color = blue,
                fontSize = 15.sp,
                lineHeight = 20.sp,
                fontWeight = FontWeight.SemiBold,
                fontFamily = appFont,
                modifier = Modifier.clickable(onClick = onCreateAccount)
            )
        }
    }
}

@Composable
private fun LoginTextField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    leadingIcon: ImageVector,
    iconTint: Color,
    borderColor: Color,
    textColor: Color,
    placeholderColor: Color,
    modifier: Modifier = Modifier,
    trailingIcon: (@Composable () -> Unit)? = null,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = modifier
            .clip(RoundedCornerShape(4.dp))
            .background(Color.White.copy(alpha = 0.72f))
            .border(1.dp, borderColor, RoundedCornerShape(4.dp))
            .padding(horizontal = 16.dp)
    ) {
        Icon(
            imageVector = leadingIcon,
            contentDescription = null,
            tint = iconTint,
            modifier = Modifier.size(22.dp)
        )
        Spacer(modifier = Modifier.width(16.dp))
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            singleLine = true,
            textStyle = TextStyle(
                color = textColor,
                fontSize = 15.sp,
                lineHeight = 19.sp,
                fontWeight = FontWeight.Normal,
                fontFamily = FontFamily.SansSerif
            ),
            visualTransformation = visualTransformation,
            keyboardOptions = keyboardOptions,
            modifier = Modifier.weight(1f),
            decorationBox = { innerTextField ->
                Box(contentAlignment = Alignment.CenterStart) {
                    if (value.isEmpty()) {
                        Text(
                            text = placeholder,
                            color = placeholderColor,
                            fontSize = 15.sp,
                            lineHeight = 19.sp,
                            fontFamily = FontFamily.SansSerif
                        )
                    }
                    innerTextField()
                }
            }
        )
        if (trailingIcon != null) {
            trailingIcon()
        }
    }
}

@Composable
private fun GoogleLogoMark(modifier: Modifier = Modifier) {
    Canvas(modifier = modifier) {
        val logoSize = minOf(size.width, size.height)
        val strokeWidth = logoSize * 0.24f
        val inset = strokeWidth / 2f
        val arcSize = androidx.compose.ui.geometry.Size(size.width - strokeWidth, size.height - strokeWidth)
        val topLeft = androidx.compose.ui.geometry.Offset(inset, inset)
        val style = Stroke(width = strokeWidth, cap = StrokeCap.Butt)

        drawArc(
            color = Color(0xFF4285F4),
            startAngle = -38f,
            sweepAngle = 74f,
            useCenter = false,
            topLeft = topLeft,
            size = arcSize,
            style = style
        )
        drawArc(
            color = Color(0xFFEA4335),
            startAngle = 36f,
            sweepAngle = 92f,
            useCenter = false,
            topLeft = topLeft,
            size = arcSize,
            style = style
        )
        drawArc(
            color = Color(0xFFFBBC05),
            startAngle = 128f,
            sweepAngle = 86f,
            useCenter = false,
            topLeft = topLeft,
            size = arcSize,
            style = style
        )
        drawArc(
            color = Color(0xFF34A853),
            startAngle = 214f,
            sweepAngle = 112f,
            useCenter = false,
            topLeft = topLeft,
            size = arcSize,
            style = style
        )

        drawCircle(
            color = Color.White,
            radius = logoSize * 0.16f,
            center = center
        )

        drawLine(
            color = Color(0xFF4285F4),
            start = androidx.compose.ui.geometry.Offset(size.width * 0.56f, size.height * 0.54f),
            end = androidx.compose.ui.geometry.Offset(size.width * 0.94f, size.height * 0.54f),
            strokeWidth = strokeWidth,
            cap = StrokeCap.Butt
        )
    }
}
