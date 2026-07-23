package com.example.app.widget;

import com.example.app.session.BookingSource;
import jakarta.servlet.http.HttpServletRequest;

final class WidgetBookingSourceResolver {
    static final String HEADER = "X-Calendra-Booking-Source";

    private WidgetBookingSourceResolver() {}

    static BookingSource resolve(HttpServletRequest request) {
        String raw = request == null ? null : request.getHeader(HEADER);
        BookingSource requested = BookingSource.parse(raw, null);
        return requested == BookingSource.PUBLIC_BOOKING_PAGE
                ? BookingSource.PUBLIC_BOOKING_PAGE
                : BookingSource.WEBSITE_WIDGET;
    }
}
