package com.example.app.session;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class SessionBookingOnlineStateTest {
    @Test
    void provisioningStateKeepsOnlineBookingsOutOfPhysicalRoomCapacity() {
        SessionBooking booking = new SessionBooking();
        assertThat(booking.isOnlineSession()).isFalse();

        booking.setMeetingProvisioningStatus("PENDING");
        assertThat(booking.isOnlineSession()).isTrue();

        booking.setMeetingProvisioningStatus("FAILED");
        assertThat(booking.isOnlineSession()).isTrue();

        booking.setMeetingProvisioningStatus("NONE");
        booking.setMeetingLink("https://meet.example/session");
        assertThat(booking.isOnlineSession()).isTrue();
    }
}
