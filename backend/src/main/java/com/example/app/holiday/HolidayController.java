package com.example.app.holiday;

import com.example.app.user.User;
import java.time.LocalDate;
import java.util.List;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/holidays")
public class HolidayController {
    private final HolidayService holidays;

    public HolidayController(HolidayService holidays) {
        this.holidays = holidays;
    }

    @GetMapping
    @Transactional(readOnly = true)
    public List<HolidayService.HolidayDto> list(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @AuthenticationPrincipal User me
    ) {
        if (me == null || me.getCompany() == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        }
        if (from == null || to == null || to.isBefore(from)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid date range.");
        }
        if (to.isAfter(from.plusYears(2))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Date range too large.");
        }
        return holidays.getHolidaysInRange(from, to);
    }
}
