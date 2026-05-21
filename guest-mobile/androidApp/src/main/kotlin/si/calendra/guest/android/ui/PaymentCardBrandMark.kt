package si.calendra.guest.android.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun PaymentCardBrandMark(brand: PaymentCardBrand, modifier: Modifier = Modifier) {
    val h = 20.dp
    when (brand) {
        PaymentCardBrand.Mastercard -> {
            Box(
                modifier
                    .height(h)
                    .width(30.dp),
                contentAlignment = Alignment.Center
            ) {
                Box(
                    Modifier
                        .align(Alignment.Center)
                        .offset(x = (-5).dp)
                        .size(14.dp)
                        .clip(CircleShape)
                        .background(Color(0xFFEB001B))
                )
                Box(
                    Modifier
                        .align(Alignment.Center)
                        .offset(x = 5.dp)
                        .size(14.dp)
                        .clip(CircleShape)
                        .background(Color(0xFFF79E1B))
                )
            }
        }
        else -> {
            val bg = when (brand) {
                PaymentCardBrand.Visa -> Color(0xFF1A1F71)
                PaymentCardBrand.Amex -> Color(0xFF006FCF)
                PaymentCardBrand.Discover -> Color(0xFFFF6000)
                PaymentCardBrand.Diners -> Color(0xFF0079BE)
                PaymentCardBrand.Jcb -> Color(0xFF0C4DA2)
                PaymentCardBrand.UnionPay -> Color(0xFFE21836)
                PaymentCardBrand.Unknown -> MaterialTheme.colorScheme.surfaceVariant
            }
            val label = when (brand) {
                PaymentCardBrand.Visa -> "VISA"
                PaymentCardBrand.Amex -> "AMEX"
                PaymentCardBrand.Discover -> "DISC"
                PaymentCardBrand.Diners -> "DC"
                PaymentCardBrand.Jcb -> "JCB"
                PaymentCardBrand.UnionPay -> "UP"
                PaymentCardBrand.Unknown -> "CARD"
                PaymentCardBrand.Mastercard -> "MC"
            }
            val fg = if (brand == PaymentCardBrand.Unknown) {
                MaterialTheme.colorScheme.onSurfaceVariant
            } else {
                Color.White
            }
            Box(
                modifier
                    .height(h)
                    .widthIn(min = 34.dp, max = 52.dp)
                    .clip(RoundedCornerShape(4.dp))
                    .background(bg)
                    .padding(horizontal = 4.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    label,
                    color = fg,
                    fontWeight = FontWeight.Bold,
                    fontSize = 8.sp,
                    maxLines = 1
                )
            }
        }
    }
}
