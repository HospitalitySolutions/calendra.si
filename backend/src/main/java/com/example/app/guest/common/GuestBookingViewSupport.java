package com.example.app.guest.common;

import com.example.app.guest.catalog.GuestCatalogService;
import com.example.app.session.SessionBooking;
import com.example.app.session.SessionService;
import com.example.app.session.SessionServiceSupport;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;

/** Shared guest-facing projection for a session and its ordered service lines. */
public final class GuestBookingViewSupport {
    private GuestBookingViewSupport() {}

    public static List<GuestDtos.BookingServiceResponse> services(SessionBooking booking, String currency) {
        List<SessionService> rows = SessionServiceSupport.orderedServices(booking);
        if (rows.isEmpty() && booking != null && booking.getType() != null) {
            BigDecimal price = GuestCatalogService.sessionTypePriceGross(booking.getType());
            return List.of(new GuestDtos.BookingServiceResponse(
                    String.valueOf(booking.getType().getId()),
                    booking.getType().getName(),
                    0,
                    Math.max(1, SessionServiceSupport.totalServiceMinutes(booking)),
                    booking.getStartTime() == null ? null : booking.getStartTime().toString(),
                    booking.getEndTime() == null ? null : booking.getEndTime().toString(),
                    price.doubleValue(),
                    currency
            ));
        }
        List<GuestDtos.BookingServiceResponse> out = new ArrayList<>();
        for (SessionService row : rows) {
            BigDecimal price = GuestCatalogService.sessionTypePriceGross(row.getSessionType());
            out.add(new GuestDtos.BookingServiceResponse(
                    String.valueOf(row.getSessionType().getId()),
                    row.getServiceNameSnapshot(),
                    row.getPosition(),
                    row.getDurationMinutesSnapshot(),
                    row.getStartTime() == null ? null : row.getStartTime().toString(),
                    row.getEndTime() == null ? null : row.getEndTime().toString(),
                    price.doubleValue(),
                    currency
            ));
        }
        return List.copyOf(out);
    }

    public static String summaryName(List<GuestDtos.BookingServiceResponse> services) {
        if (services == null || services.isEmpty()) return "Session";
        return services.stream().map(GuestDtos.BookingServiceResponse::name).filter(name -> name != null && !name.isBlank())
                .reduce((left, right) -> left + " + " + right).orElse("Session");
    }

    public static double totalPrice(List<GuestDtos.BookingServiceResponse> services) {
        return (services == null ? List.<GuestDtos.BookingServiceResponse>of() : services).stream()
                .map(service -> BigDecimal.valueOf(service.priceGross()))
                .reduce(BigDecimal.ZERO, BigDecimal::add)
                .setScale(2, RoundingMode.HALF_UP)
                .doubleValue();
    }
}
