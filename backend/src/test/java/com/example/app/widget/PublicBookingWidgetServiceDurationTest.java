package com.example.app.widget;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.example.app.session.SessionType;
import java.lang.reflect.Method;
import java.util.List;
import org.junit.jupiter.api.Test;

class PublicBookingWidgetServiceDurationTest {

    @Test
    void serviceChainUsesOnlyFinalServiceBreakForAvailability() throws Exception {
        PublicBookingWidgetService service = new PublicBookingWidgetService(
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                "Europe/Ljubljana"
        );

        SessionType massage = serviceType(45, 15);
        SessionType groupExercise = serviceType(45, 10);
        List<SessionType> chain = List.of(massage, groupExercise);

        assertEquals(90, invokeMinutes(service, "chainBookingMinutes", chain));
        assertEquals(100, invokeMinutes(service, "chainAvailabilityMinutes", chain));
    }

    private int invokeMinutes(
            PublicBookingWidgetService service,
            String methodName,
            List<SessionType> chain
    ) throws Exception {
        Method method = PublicBookingWidgetService.class.getDeclaredMethod(methodName, List.class);
        method.setAccessible(true);
        return (int) method.invoke(service, chain);
    }

    private SessionType serviceType(int durationMinutes, int breakMinutes) {
        SessionType type = new SessionType();
        type.setDurationMinutes(durationMinutes);
        type.setBreakMinutes(breakMinutes);
        return type;
    }
}
