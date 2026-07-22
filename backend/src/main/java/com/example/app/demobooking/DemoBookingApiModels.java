package com.example.app.demobooking;

import java.time.Instant;
import java.util.List;

public final class DemoBookingApiModels {
    private DemoBookingApiModels() {}

    public record AvailabilityWindow(String dayOfWeek, boolean enabled, String start, String end) {}

    public record PublicProfile(
            String slug,
            String title,
            boolean enabled,
            int durationMinutes,
            String timeZone,
            String meetingProvider,
            int bookingHorizonDays,
            int minimumNoticeMinutes
    ) {}

    public record AvailableDay(String date, List<AvailableSlot> slots) {}
    public record AvailableSlot(String startAt, String endAt, String displayTime) {}
    public record AvailabilityResponse(String timeZone, List<AvailableDay> days) {}

    public record HoldRequest(String startAt, String guestTimeZone, String previousHoldToken) {}
    public record HoldResponse(String holdToken, Instant expiresAt, String startAt, String endAt) {}

    public record ConfirmRequest(
            String holdToken,
            String guestName,
            String guestEmail,
            String guestPhone,
            String companyName,
            String guestNote,
            String guestTimeZone,
            String locale,
            String utmSource,
            String utmMedium,
            String utmCampaign
    ) {}

    public record RescheduleRequest(String holdToken, String guestTimeZone, String locale) {}

    public record BookingView(
            Long id,
            String status,
            String title,
            String startAt,
            String endAt,
            int durationMinutes,
            String timeZone,
            String guestTimeZone,
            String guestName,
            String guestEmail,
            String guestPhone,
            String companyName,
            String guestNote,
            String meetingProvider,
            String meetingJoinUrl,
            String manageToken,
            boolean canModify
    ) {}

    public record AdminProfileRequest(
            Boolean enabled,
            String slug,
            String title,
            Integer durationMinutes,
            Integer slotStepMinutes,
            Integer bufferBeforeMinutes,
            Integer bufferAfterMinutes,
            Integer minimumNoticeMinutes,
            Integer bookingHorizonDays,
            Integer maximumBookingsPerDay,
            String timeZone,
            String meetingProvider,
            Long hostUserId,
            List<AvailabilityWindow> availability
    ) {}

    public record AdminProfileView(
            Long id,
            boolean enabled,
            String slug,
            String title,
            int durationMinutes,
            int slotStepMinutes,
            int bufferBeforeMinutes,
            int bufferAfterMinutes,
            int minimumNoticeMinutes,
            int bookingHorizonDays,
            int maximumBookingsPerDay,
            String timeZone,
            String meetingProvider,
            Long hostUserId,
            String hostName,
            String hostEmail,
            List<AvailabilityWindow> availability,
            boolean googleMeetConnected,
            boolean zoomConnected
    ) {}

    public record HostView(Long id, String name, String email, boolean googleMeetConnected, boolean zoomConnected) {}

    public record AdminBookingView(
            Long id,
            String status,
            String startAt,
            String endAt,
            String guestName,
            String guestEmail,
            String guestPhone,
            String companyName,
            String guestNote,
            String meetingProvider,
            String meetingJoinUrl,
            String hostName,
            String guestTimeZone,
            String createdAt
    ) {}
}
