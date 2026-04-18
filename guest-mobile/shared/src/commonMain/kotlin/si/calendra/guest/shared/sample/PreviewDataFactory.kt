package si.calendra.guest.shared.sample

import si.calendra.guest.shared.models.*

class PreviewDataFactory {
    private val tenant = TenantSummary(
        companyId = "tenant-northside",
        companyName = "Northside Fitness",
        publicDescription = "Premium training studio",
        publicCity = "Ljubljana",
        publicPhone = "+38640111222"
    )

    private val yogaTenant = TenantSummary(
        companyId = "tenant-yoga",
        companyName = "Blue River Yoga",
        publicDescription = "Studio classes and private sessions",
        publicCity = "Celje",
        publicPhone = "+38640111333"
    )

    fun session(): GuestSession = GuestSession(
        token = "preview-token",
        guestUser = GuestUser(
            id = "guest-1",
            email = "ana@example.com",
            firstName = "Ana",
            lastName = "Novak",
            phone = "+38640123456",
            language = "sl"
        ),
        linkedTenants = listOf(tenant, yogaTenant)
    )

    fun profile(): GuestProfile = GuestProfile(
        guestUser = session().guestUser,
        linkedTenants = listOf(tenant, yogaTenant)
    )

    fun tenantLookup(code: String): TenantLookupResponse = TenantLookupResponse(
        companyId = tenant.companyId,
        companyName = tenant.companyName,
        publicDescription = tenant.publicDescription,
        publicCity = tenant.publicCity,
        publicPhone = tenant.publicPhone,
        joinMethod = "TENANT_CODE",
        canJoin = code.isNotBlank()
    )

    fun searchTenants(query: String): List<TenantSummary> = listOf(
        tenant,
        yogaTenant,
        TenantSummary(
            companyId = "tenant-arena",
            companyName = "Arena Gym",
            publicDescription = "Strength and conditioning",
            publicCity = "Maribor",
            publicPhone = "+38640111444"
        )
    ).filter { it.companyName.contains(query, ignoreCase = true) || query.isBlank() }

    fun joinTenant(request: JoinTenantRequest): JoinTenantResponse = JoinTenantResponse(
        tenantLink = TenantLink(
            companyId = request.companyId ?: tenant.companyId,
            clientId = "client-1",
            status = "ACTIVE",
            joinedVia = request.joinMethod
        ),
        clientMatched = true,
        matchType = "EMAIL"
    )

    fun home(companyId: String): HomePayload {
        val currentTenant = if (companyId == yogaTenant.companyId) yogaTenant else tenant
        return HomePayload(
            tenant = currentTenant,
            upcomingBookings = if (companyId == yogaTenant.companyId) {
                listOf(
                    UpcomingBooking(
                        bookingId = "booking-2",
                        sessionTypeName = "Yoga Flow",
                        startsAt = "2026-04-20T08:00:00Z",
                        bookingStatus = "CONFIRMED"
                    )
                )
            } else {
                listOf(
                    UpcomingBooking(
                        bookingId = "booking-1",
                        sessionTypeName = "Personal Training",
                        startsAt = "2026-04-18T18:30:00Z",
                        bookingStatus = "CONFIRMED"
                    ),
                    UpcomingBooking(
                        bookingId = "booking-3",
                        sessionTypeName = "Recovery Session",
                        startsAt = "2026-04-23T17:00:00Z",
                        bookingStatus = "CONFIRMED"
                    )
                )
            },
            activeEntitlements = if (companyId == yogaTenant.companyId) {
                listOf(
                    EntitlementSummary(
                        entitlementId = "ent-2",
                        productName = "Yoga 10 Pack",
                        entitlementType = "PACK",
                        remainingUses = 7,
                        validUntil = "2026-06-11T00:00:00Z"
                    )
                )
            } else {
                listOf(
                    EntitlementSummary(
                        entitlementId = "ent-1",
                        productName = "5 PT Pack",
                        entitlementType = "PACK",
                        remainingUses = 4,
                        validUntil = "2026-06-01T00:00:00Z"
                    ),
                    EntitlementSummary(
                        entitlementId = "ent-3",
                        productName = "Monthly Gym",
                        entitlementType = "MEMBERSHIP",
                        validUntil = "2026-05-01T00:00:00Z"
                    )
                )
            },
            pendingOrders = listOf(
                PendingOrderSummary(
                    orderId = "order-1",
                    status = "PENDING",
                    paymentMethodType = "BANK_TRANSFER",
                    totalGross = 59.0,
                    referenceCode = "ORD-2026-00014"
                )
            )
        )
    }

    fun products(companyId: String): List<ProductSummary> = if (companyId == yogaTenant.companyId) {
        listOf(
            ProductSummary(
                productId = "prod-yoga-ticket",
                name = "Yoga Flow",
                productType = "CLASS_TICKET",
                priceGross = 12.0,
                currency = "EUR",
                sessionTypeId = "session-yoga",
                sessionTypeName = "Yoga Flow",
                description = "Group class for mobility, breathwork, and full-body flow.",
                durationMinutes = 60
            ),
            ProductSummary(
                productId = "prod-yoga-private",
                name = "Private Yoga",
                productType = "SESSION_SINGLE",
                priceGross = 38.0,
                currency = "EUR",
                sessionTypeId = "session-yoga-private",
                sessionTypeName = "Private Yoga",
                description = "One-on-one guided session tailored to your goals.",
                durationMinutes = 45
            )
        )
    } else {
        listOf(
            ProductSummary(
                productId = "prod-pt-single",
                name = "Personal Training",
                productType = "SESSION_SINGLE",
                priceGross = 45.0,
                currency = "EUR",
                sessionTypeId = "session-pt",
                sessionTypeName = "Personal Training",
                description = "Focused one-on-one coaching session in the studio.",
                durationMinutes = 45
            ),
            ProductSummary(
                productId = "prod-recovery",
                name = "Recovery Session",
                productType = "SESSION_SINGLE",
                priceGross = 35.0,
                currency = "EUR",
                sessionTypeId = "session-recovery",
                sessionTypeName = "Recovery Session",
                description = "Mobility and recovery work to reset after intense training.",
                durationMinutes = 30
            ),
            ProductSummary(
                productId = "prod-pack-5",
                name = "5 Session Pack",
                productType = "PACK",
                priceGross = 180.0,
                currency = "EUR",
                sessionTypeId = "session-pt",
                sessionTypeName = "Personal Training",
                bookable = false,
                description = "Best value bundle for regular personal training.",
                durationMinutes = 45
            ),
            ProductSummary(
                productId = "prod-membership",
                name = "Monthly Membership",
                productType = "MEMBERSHIP",
                priceGross = 59.0,
                currency = "EUR",
                bookable = false,
                description = "Unlimited gym access during staffed hours."
            )
        )
    }

    fun availability(sessionTypeId: String, date: String): AvailabilityResponse = AvailabilityResponse(
        sessionTypeId = sessionTypeId,
        date = date,
        slots = listOf(
            AvailabilitySlot("slot-1", date + "T08:00:00Z", date + "T08:45:00Z", true),
            AvailabilitySlot("slot-2", date + "T10:00:00Z", date + "T10:45:00Z", true),
            AvailabilitySlot("slot-3", date + "T18:30:00Z", date + "T19:15:00Z", true)
        )
    )

    fun createOrder(request: CreateOrderRequest): CreateOrderResponse = CreateOrderResponse(
        order = OrderSummary(
            orderId = "order-created",
            status = "PENDING",
            paymentMethodType = request.paymentMethodType,
            subtotalGross = 45.0,
            taxAmount = 0.0,
            totalGross = 45.0,
            currency = "EUR"
        ),
        booking = request.slotId?.let { BookingSummary("booking-created", "PENDING_PAYMENT") },
        nextAction = "CHECKOUT"
    )

    fun checkout(orderId: String, request: CheckoutRequest): CheckoutResponse =
        if (request.paymentMethodType == "BANK_TRANSFER") {
            CheckoutResponse(
                orderId = orderId,
                paymentMethodType = "BANK_TRANSFER",
                status = "PENDING",
                bankTransfer = BankTransferInstructions(
                    amount = 59.0,
                    currency = "EUR",
                    referenceCode = "ORD-2026-00014",
                    instructions = "Use the reference code when paying."
                ),
                nextAction = "SHOW_INSTRUCTIONS"
            )
        } else {
            CheckoutResponse(
                orderId = orderId,
                paymentMethodType = "CARD",
                status = "PENDING",
                checkoutUrl = "https://checkout.stripe.example/session/mock",
                nextAction = "REDIRECT"
            )
        }

    fun wallet(companyId: String): WalletPayload = WalletPayload(
        entitlements = home(companyId).activeEntitlements,
        orders = listOf(
            WalletOrder("order-paid-1", "PAID", "CARD", 59.0, "2026-04-15T10:00:00Z"),
            WalletOrder("order-pending-1", "PENDING", "BANK_TRANSFER", 180.0, null)
        )
    )

    fun history(): List<BookingHistoryItem> = listOf(
        BookingHistoryItem("booking-h1", "Personal Training", "2026-04-01T18:30:00Z", "COMPLETED"),
        BookingHistoryItem("booking-h2", "Yoga Flow", "2026-03-28T08:00:00Z", "COMPLETED"),
        BookingHistoryItem("booking-h3", "Gym Access", "2026-03-12T17:00:00Z", "CANCELLED")
    )

    fun notifications(companyId: String): NotificationsPayload = NotificationsPayload(
        items = listOf(
            GuestNotification(
                notificationId = "notif-1",
                notificationType = "BOOKING_REMINDER",
                title = if (companyId == yogaTenant.companyId) "Reminder: Yoga Flow" else "Reminder: Personal Training",
                body = "Your upcoming session is confirmed.",
                createdAt = "2026-04-16T08:00:00Z"
            ),
            GuestNotification(
                notificationId = "notif-2",
                notificationType = "PAYMENT_PENDING",
                title = "Payment pending",
                body = "Your bank transfer will activate the membership once received.",
                createdAt = "2026-04-15T10:00:00Z"
            )
        )
    )
}
