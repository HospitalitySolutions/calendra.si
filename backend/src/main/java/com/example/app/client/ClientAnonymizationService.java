package com.example.app.client;

import com.example.app.security.SecurityUtils;
import com.example.app.session.SessionBookingRepository;
import com.example.app.user.User;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ClientAnonymizationService {
    private static final String NOTES_REPLACEMENT = "[ANONYMIZED]";

    private final ClientRepository clients;
    private final SessionBookingRepository bookings;

    public ClientAnonymizationService(ClientRepository clients, SessionBookingRepository bookings) {
        this.clients = clients;
        this.bookings = bookings;
    }

    @Transactional
    public Client anonymize(Long clientId, User me) {
        var client = clients.findByIdAndCompanyId(clientId, me.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!SecurityUtils.isAdmin(me) && !client.getAssignedTo().getId().equals(me.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        if (client.isAnonymized()) {
            return client;
        }

        client.getPreferredSlots().clear();
        bookings.anonymizeNotesForClient(me.getCompany().getId(), client.getId(), NOTES_REPLACEMENT);
        client.anonymize(me.getId());
        return clients.save(client);
    }
}

