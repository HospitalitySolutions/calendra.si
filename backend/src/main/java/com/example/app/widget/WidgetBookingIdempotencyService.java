package com.example.app.widget;

import com.example.app.company.Company;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class WidgetBookingIdempotencyService {
    private static final ObjectMapper JSON = new ObjectMapper();
    private final WidgetBookingIdempotencyRepository repository;

    public WidgetBookingIdempotencyService(WidgetBookingIdempotencyRepository repository) {
        this.repository = repository;
    }

    public <T> T execute(Company company, String endpoint, String idempotencyKey, Object requestBody, Class<T> responseType, IdempotentSupplier<T> supplier) {
        if (idempotencyKey == null || idempotencyKey.isBlank()) {
            return supplier.get();
        }
        String normalizedKey = idempotencyKey.trim();
        String payloadHash = hash(toJson(requestBody));
        var existing = repository.findByCompanyIdAndIdempotencyKeyAndEndpoint(company.getId(), normalizedKey, endpoint).orElse(null);
        if (existing != null) {
            if (!payloadHash.equals(existing.getPayloadHash())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Idempotency key was already used for a different booking request.");
            }
            try {
                return JSON.readValue(existing.getResponseJson(), responseType);
            } catch (Exception ex) {
                throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Stored widget booking response could not be read.");
            }
        }
        T response = supplier.get();
        WidgetBookingIdempotencyRecord record = new WidgetBookingIdempotencyRecord();
        record.setCompany(company);
        record.setEndpoint(endpoint);
        record.setIdempotencyKey(normalizedKey);
        record.setPayloadHash(payloadHash);
        record.setResponseJson(toJson(response));
        repository.save(record);
        return response;
    }

    private String toJson(Object value) {
        try {
            return JSON.writeValueAsString(value);
        } catch (JsonProcessingException ex) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Widget request could not be serialized.");
        }
    }

    private String hash(String text) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(text.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Widget request hash could not be generated.");
        }
    }

    @FunctionalInterface
    public interface IdempotentSupplier<T> {
        T get();
    }
}
