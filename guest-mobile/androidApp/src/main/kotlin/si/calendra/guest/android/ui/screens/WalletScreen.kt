package si.calendra.guest.android.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import si.calendra.guest.shared.models.BookingHistoryItem
import si.calendra.guest.shared.models.WalletPayload

@Composable
fun WalletScreen(
    wallet: WalletPayload?,
    history: List<BookingHistoryItem>,
    offers: List<WalletOfferCard> = emptyList(),
    onBuyOffer: (WalletOfferCard) -> Unit = {},
    onToggleAutoRenew: (String, Boolean) -> Unit = { _, _ -> }
) {
    if (wallet == null) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
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
                    val validUntil = ent.validUntil
                    Text(
                        buildString {
                            append(ent.status)
                            append(" • remaining ")
                            append(ent.remainingUses?.toString() ?: "unlimited")
                            if (!validUntil.isNullOrBlank()) {
                                append(" • valid until ")
                                append(validUntil.take(10))
                            }
                        },
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    if (ent.entitlementType == "MEMBERSHIP") {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text("Auto-renew", style = MaterialTheme.typography.bodyMedium)
                            Switch(checked = ent.autoRenews, onCheckedChange = { checked -> onToggleAutoRenew(ent.entitlementId, checked) })
                        }
                    }
                }
            }
        }

        if (offers.isNotEmpty()) {
            item { SectionLabel("Buy") }
            items(offers) { offer ->
                ElevatedCard(shape = RoundedCornerShape(24.dp), colors = CardDefaults.elevatedCardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                    Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(offer.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                        Text(
                            buildString {
                                append(offer.priceGross)
                                append(' ')
                                append(offer.currency)
                                if (!offer.sessionTypeName.isNullOrBlank()) {
                                    append(" • ")
                                    append(offer.sessionTypeName)
                                }
                            },
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        offer.description?.takeIf { it.isNotBlank() }?.let { description ->
                            Text(description, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Button(onClick = { onBuyOffer(offer) }) {
                            Text("Buy with card")
                        }
                    }
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

data class WalletOfferCard(
    val companyId: String,
    val productId: String,
    val name: String,
    val productType: String,
    val priceGross: Double,
    val currency: String,
    val description: String? = null,
    val sessionTypeName: String? = null
)

@Composable
private fun SectionLabel(text: String) {
    Text(text, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
}
