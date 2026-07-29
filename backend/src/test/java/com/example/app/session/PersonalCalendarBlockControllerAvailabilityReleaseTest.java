package com.example.app.session;

import com.example.app.company.Company;
import com.example.app.google.calendar.GoogleCalendarSyncQueueService;
import com.example.app.user.Role;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PersonalCalendarBlockControllerAvailabilityReleaseTest {

    @Mock
    private PersonalCalendarBlockRepository repository;
    @Mock
    private UserRepository users;
    @Mock
    private GoogleCalendarSyncQueueService googleCalendarSyncQueueService;

    private PersonalCalendarBlockController controller;
    private Company company;
    private User consultant;

    @BeforeEach
    void setUp() {
        company = new Company();
        company.setId(1L);
        consultant = new User();
        consultant.setId(6L);
        consultant.setCompany(company);
        consultant.setRole(Role.CONSULTANT);
        consultant.setConsultant(true);
        controller = new PersonalCalendarBlockController(repository, users, googleCalendarSyncQueueService);
    }

    @Test
    void partialOpenRepairsAndDeduplicatesPreviouslyDuplicatedAllDayMarkers() {
        LocalDate date = LocalDate.of(2026, 8, 22);
        AvailabilityBlockMetadata.Metadata blocked = new AvailabilityBlockMetadata.Metadata(
                DayOfWeek.SATURDAY,
                LocalTime.MIDNIGHT,
                LocalTime.of(23, 59, 59),
                false,
                date,
                date
        );
        PersonalCalendarBlock first = marker(10L, date, blocked);
        PersonalCalendarBlock duplicate = marker(11L, date, blocked);
        when(repository.findAvailabilityBlockMarkersForOwner(consultant.getId(), company.getId()))
                .thenReturn(List.of(first, duplicate));
        final long[] nextId = {20L};
        when(repository.save(any(PersonalCalendarBlock.class))).thenAnswer(invocation -> {
            PersonalCalendarBlock saved = invocation.getArgument(0);
            saved.setId(nextId[0]++);
            return saved;
        });

        PersonalCalendarBlockController.AvailabilityReleaseResponse response = controller.releaseAvailability(
                new PersonalCalendarBlockController.AvailabilityReleaseRequest(
                        "2026-08-22T10:00:00",
                        "2026-08-22T12:00:00",
                        null,
                        false,
                        date,
                        date
                ),
                consultant
        );

        assertEquals(2, response.replacedMarkers());
        assertEquals(2, response.createdMarkers());
        verify(repository, times(2)).delete(any(PersonalCalendarBlock.class));

        ArgumentCaptor<PersonalCalendarBlock> savedCaptor = ArgumentCaptor.forClass(PersonalCalendarBlock.class);
        verify(repository, times(2)).save(savedCaptor.capture());
        List<AvailabilityBlockMetadata.Metadata> residuals = savedCaptor.getAllValues().stream()
                .map(AvailabilityBlockMetadata::parse)
                .map(parsed -> parsed.orElseThrow())
                .toList();
        assertFalse(residuals.stream().anyMatch(meta -> AvailabilityBlockMetadata.overlaps(
                meta,
                date.atTime(10, 30),
                date.atTime(11, 0)
        )));
    }

    private PersonalCalendarBlock marker(
            Long id,
            LocalDate date,
            AvailabilityBlockMetadata.Metadata metadata
    ) {
        PersonalCalendarBlock block = new PersonalCalendarBlock();
        block.setId(id);
        block.setCompany(company);
        block.setOwner(consultant);
        block.setStartTime(date.atStartOfDay());
        block.setEndTime(date.atTime(23, 59, 59));
        block.setTask(AvailabilityBlockMetadata.TASK);
        block.setNotes(AvailabilityBlockMetadata.notes(metadata));
        block.setVisibleToAdmins(false);
        return block;
    }
}
