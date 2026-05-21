package si.calendra.guest.android.ui.screens

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
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
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material3.Icon
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
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import si.calendra.guest.android.R

private const val VerificationDesignWidth = 941f
private const val VerificationDesignHeight = 1672f
private val VerificationBlue = Color(0xFF1477FF)
private val VerificationButtonBlueStart = Color(0xFF0066F4)
private val VerificationButtonBlueEnd = Color(0xFF0053DB)
private val VerificationNavy = Color(0xFF061A3A)
private val VerificationMuted = Color(0xFF65728A)
private val VerificationBody = Color(0xFF5F6F8C)
private val VerificationHelper = Color(0xFF52637A)
private val VerificationBorder = Color(0xFFCAD4E2)
private val VerificationFieldFill = Color.White.copy(alpha = 0.82f)

@Composable
fun EmailCodeVerificationScreen(
    email: String,
    onVerify: (String) -> Unit,
    onResend: () -> Unit,
    onBackToLogin: () -> Unit
) {
    var code by remember { mutableStateOf("") }

    BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
        Image(
            painter = painterResource(id = R.drawable.signup_background),
            contentDescription = null,
            contentScale = ContentScale.FillBounds,
            modifier = Modifier.fillMaxSize()
        )

        Text(
            text = "CHECK YOUR EMAIL",
            color = VerificationBlue,
            fontSize = 9.sp,
            lineHeight = 12.sp,
            fontWeight = FontWeight.Black,
            letterSpacing = 2.2.sp,
            modifier = Modifier.verificationBounds(maxWidth, maxHeight, 124f, 260f, 680f, 42f)
        )

        Text(
            text = "Confirm to\nfinish",
            color = VerificationNavy,
            fontSize = 30.sp,
            lineHeight = 33.sp,
            fontWeight = FontWeight.Black,
            letterSpacing = (-0.8).sp,
            modifier = Modifier.verificationBounds(maxWidth, maxHeight, 124f, 340f, 560f, 130f)
        )

        Text(
            text = "Enter the 6-digit verification code sent to\n$email.",
            color = VerificationBody,
            fontSize = 15.sp,
            lineHeight = 23.sp,
            fontWeight = FontWeight.Normal,
            modifier = Modifier.verificationBounds(maxWidth, maxHeight, 124f, 518f, 680f, 96f)
        )

        VerificationCodeField(
            value = code,
            onValueChange = { code = it.filter(Char::isDigit).take(6) },
            modifier = Modifier.verificationBounds(maxWidth, maxHeight, 124f, 662f, 680f, 104f)
        )

        Text(
            text = "We keep this page simple and focused.",
            color = VerificationHelper,
            fontSize = 10.sp,
            lineHeight = 14.sp,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.verificationBounds(maxWidth, maxHeight, 124f, 792f, 680f, 40f)
        )

        VerificationSubmitButton(
            text = "Verify code",
            modifier = Modifier.verificationBounds(maxWidth, maxHeight, 124f, 860f, 680f, 112f),
            onClick = { onVerify(code) }
        )

        Text(
            text = "Resend code",
            color = VerificationBlue,
            fontSize = 15.sp,
            lineHeight = 19.sp,
            fontWeight = FontWeight.Black,
            modifier = Modifier
                .verificationBounds(maxWidth, maxHeight, 124f, 1048f, 320f, 52f)
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    onClick = onResend
                )
        )

        Text(
            text = "Back to login",
            color = VerificationMuted,
            fontSize = 13.sp,
            lineHeight = 17.sp,
            fontWeight = FontWeight.Normal,
            modifier = Modifier
                .verificationBounds(maxWidth, maxHeight, 124f, 1128f, 320f, 52f)
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    onClick = onBackToLogin
                )
        )
    }
}

@Composable
private fun VerificationCodeField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier
) {
    Box(
        modifier = modifier
            .background(VerificationFieldFill)
            .border(width = 0.8.dp, color = VerificationBorder)
            .padding(horizontal = 22.dp),
        contentAlignment = Alignment.CenterStart
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxSize()
        ) {
            Icon(
                imageVector = Icons.Outlined.Lock,
                contentDescription = null,
                tint = VerificationBlue,
                modifier = Modifier.size(22.dp)
            )
            BasicTextField(
                value = value,
                onValueChange = onValueChange,
                modifier = Modifier
                    .weight(1f)
                    .padding(start = 20.dp),
                textStyle = TextStyle(
                    color = VerificationNavy,
                    fontSize = 13.sp,
                    lineHeight = 17.sp,
                    fontWeight = FontWeight.Normal
                ),
                cursorBrush = SolidColor(VerificationBlue),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                singleLine = true,
                decorationBox = { innerTextField ->
                    Box(contentAlignment = Alignment.CenterStart) {
                        if (value.isEmpty()) {
                            Text(
                                text = "Verification code",
                                color = VerificationMuted,
                                fontSize = 13.sp,
                                lineHeight = 17.sp,
                                fontWeight = FontWeight.Normal
                            )
                        }
                        innerTextField()
                    }
                }
            )
        }
    }
}

@Composable
private fun VerificationSubmitButton(
    text: String,
    modifier: Modifier,
    onClick: () -> Unit
) {
    Box(
        modifier = modifier
            .background(
                brush = Brush.horizontalGradient(
                    colors = listOf(VerificationButtonBlueStart, VerificationButtonBlueEnd)
                )
            )
            .clickable(
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
            lineHeight = 18.sp,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center
        )
    }
}

private fun Modifier.verificationBounds(
    screenWidth: Dp,
    screenHeight: Dp,
    left: Float,
    top: Float,
    width: Float,
    height: Float
): Modifier = this
    .offset(x = screenWidth * (left / VerificationDesignWidth), y = screenHeight * (top / VerificationDesignHeight))
    .width(screenWidth * (width / VerificationDesignWidth))
    .height(screenHeight * (height / VerificationDesignHeight))
