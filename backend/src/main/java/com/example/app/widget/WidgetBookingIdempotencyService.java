package com.example.app.widget;

import com.example.app.company.Company;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HexFormat;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

@Service
public class WidgetBookingIdempotencyService {
    private static final ObjectMapper JSON = new ObjectMapper();
    private final WidgetBookingIdempotencyRepository repository;
    private final TransactionTemplate requiresNew;

    public WidgetBookingIdempotencyService(
            WidgetBookingIdempotencyRepository repository,
            PlatformTransactionManager transactionManager
    ) {
        this.repository = repository;
        this.requiresNew = new TransactionTemplate(transactionManager);
        this.requiresNew.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    public <T> T execute(Company company, String endpoint, String idempotencyKey, Object requestBody, Class<T> responseType, IdempotentSupplier<T> supplier) {
        if (company == null || company.getId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Company is required for idempotent requests.");
        }
        String normalizedKey = normalizeRequiredKey(idempotencyKey);
        String normalizedEndpoint = normalizeEndpoint(endpoint);
        String payloadHash = hash(toJson(requestBody));

        Claim claim = claimOrLoad(company.getId(), normalizedEndpoint, normalizedKey, payloadHash);
        WidgetBookingIdempotencyRecord record = claim.record();
        if (!payloadHash.equals(record.getPayloadHash())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Idempotency key was already used for a different request payload.");
        }
        if (record.getStatus() == WidgetBookingIdempotencyStatus.COMPLETED) {
            return readStoredResponse(record, responseType);
        }
        if (record.getStatus() == WidgetBookingIdempotencyStatus.FAILED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Previous request with this Idempotency-Key failed. Please retry with a new Idempotency-Key.");
        }
        if (record.getStatus() != WidgetBookingIdempotencyStatus.IN_PROGRESS) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Idempotency key is in an unknown state.");
        }
        if (!claim.inserted()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Request with this Idempotency-Key is still processing.");
        }

        try {
            T response = supplier.get();
            String responseJson = toJson(response);
            markCompletedAfterCommit(record.getId(), responseJson);
            return response;
        } catch (RuntimeException ex) {
            markFailed(record.getId(), ex.getMessage());
            throw ex;
        } catch (Exception ex) {
            markFailed(record.getId(), ex.getMessage());
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Idempotent request failed.", ex);
        }
    }

    private Claim claimOrLoad(Long companyId, String endpoint, String idempotencyKey, String payloadHash) {
        return requiresNew.execute(status -> {
            boolean inserted = repository.claim(companyId, idempotencyKey, endpoint, payloadHash) > 0;
            WidgetBookingIdempotencyRecord record = repository.findForUpdate(companyId, idempotencyKey, endpoint)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Idempotency claim could not be loaded."));
            return new Claim(record, inserted);
        });
    }

    private <T> T readStoredResponse(WidgetBookingIdempotencyRecord record, Class<T> responseType) {
        if (record.getResponseJson() == null || record.getResponseJson().isBlank()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Stored idempotent response is not available yet.");
        }
        try {
            return JSON.readValue(record.getResponseJson(), responseType);
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Stored idempotent response could not be read.");
        }
    }

    private void markCompletedAfterCommit(Long recordId, String responseJson) {
        Runnable task = () -> markCompleted(recordId, responseJson);
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    task.run();
                }

                @Override
                public void afterCompletion(int status) {
                    if (status != STATUS_COMMITTED) {
                        markFailed(recordId, "Transaction rolled back before idempotent response was completed.");
                    }
                }
            });
            return;
        }
        task.run();
    }

    private void markCompleted(Long recordId, String responseJson) {
        requiresNew.executeWithoutResult(status -> {
            WidgetBookingIdempotencyRecord record = repository.findById(recordId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Idempotency record not found."));
            record.setStatus(WidgetBookingIdempotencyStatus.COMPLETED);
            record.setResponseJson(responseJson);
            record.setCompletedAt(Instant.now());
            record.setFailedAt(null);
            record.setLastError(null);
            repository.save(record);
        });
    }

    private void markFailed(Long recordId, String error) {
        requiresNew.executeWithoutResult(status -> repository.findById(recordId).ifPresent(record -> {
            record.setStatus(WidgetBookingIdempotencyStatus.FAILED);
            record.setFailedAt(Instant.now());
            record.setLastError(truncate(error, 1000));
            repository.save(record);
        }));
    }

    private String normalizeRequiredKey(String idempotencyKey) {
        if (idempotencyKey == null || idempotencyKey.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Idempotency-Key header is required for this request.");
        }
        String clean = idempotencyKey.trim();
        return clean.length() <= 128 ? clean : clean.substring(0, 128);
    }

    private String normalizeEndpoint(String endpoint) {
        if (endpoint == null || endpoint.isBlank()) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Idempotency endpoint is required.");
        }
        String clean = endpoint.trim();
        return clean.length() <= 80 ? clean : clean.substring(0, 80);
    }

    private String toJson(Object value) {
        try {
            return JSON.writeValueAsString(value);
        } catch (JsonProcessingException ex) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Request could not be serialized for idempotency.");
        }
    }

    private String hash(String text) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(text.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Request hash could not be generated.");
        }
    }

    private static String truncate(String value, int maxLength) {
        if (value == null) return null;
        return value.length() <= maxLength ? value : value.substring(0, maxLength);
    }

    private record Claim(WidgetBookingIdempotencyRecord record, boolean inserted) {}

    @FunctionalInterface
    public interface IdempotentSupplier<T> {
        T get();
    }
}
