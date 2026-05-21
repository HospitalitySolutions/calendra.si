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
        if (!SecurityUtils.isAdmin(me) && (client.getAssignedTo() == null || !client.getAssignedTo().getId().equals(me.getId()))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        return anonymizeClient(client, me.getId());
    }

    @Transactional
    public Client anonymizeForGuest(Client client, Long guestUserId) {
        if (client == null || client.getId() == null || client.getCompany() == null || client.getCompany().getId() == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        return anonymizeClient(client, guestUserId);
    }

    private Client anonymizeClient(Client client, Long actorId) {
        if (client.isAnonymized()) {
            return client;
        }
        client.getPreferredSlots().clear();
        bookings.anonymizeNotesForClient(client.getCompany().getId(), client.getId(), NOTES_REPLACEMENT);
        client.anonymize(actorId);
        return clients.save(client);
    }
}

