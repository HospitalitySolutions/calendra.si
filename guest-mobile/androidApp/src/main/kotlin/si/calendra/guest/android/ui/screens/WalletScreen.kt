package si.calendra.guest.android.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import si.calendra.guest.shared.models.BookingHistoryItem
import si.calendra.guest.shared.models.WalletPayload

@Composable
fun WalletScreen(wallet: WalletPayload?, history: List<BookingHistoryItem>) {
    if (wallet == null) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = androidx.compose.ui.Alignment.Center) { CircularProgressIndicator() }
        return
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 12.dp, bottom = 124.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        item { Text("Wallet", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold) }
        item { SectionLabel("Entitlements") }
        items(wallet.entitlements) { ent ->
            ElevatedCard(shape = RoundedCornerShape(24.dp), colors = CardDefaults.elevatedCardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(ent.productName, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Text("${ent.status} • remaining ${ent.remainingUses ?: -1}", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        item { SectionLabel("Orders") }
        items(wallet.orders) { order ->
            ElevatedCard(shape = RoundedCornerShape(24.dp), colors = CardDefaults.elevatedCardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(order.orderId, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Text("${order.status} • ${order.totalGross} EUR", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        if (history.isNotEmpty()) {
            item { SectionLabel("History") }
            items(history) { booking ->
                ElevatedCard(shape = RoundedCornerShape(24.dp), colors = CardDefaults.elevatedCardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                    Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(booking.sessionTypeName, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                        Text("${booking.startsAt} • ${booking.bookingStatus}", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
    }
}

@Composable
private fun SectionLabel(text: String) {
    Text(text, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
}
