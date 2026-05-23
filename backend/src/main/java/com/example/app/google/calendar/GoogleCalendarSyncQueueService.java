package com.example.app.google.calendar;

import com.example.app.company.Company;
import com.example.app.company.CompanyRepository;
import java.time.Instant;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class GoogleCalendarSyncQueueService {
    private final GoogleCalendarConnectionRepository connections;
    private final GoogleCalendarEventLinkRepository links;
    private final GoogleCalendarSyncJobRepository jobs;
    private final CompanyRepository companies;

    public GoogleCalendarSyncQueueService(GoogleCalendarConnectionRepository connections, GoogleCalendarEventLinkRepository links, GoogleCalendarSyncJobRepository jobs, CompanyRepository companies) {
        this.connections = connections;
        this.links = links;
        this.jobs = jobs;
        this.companies = companies;
    }

    @Transactional
    public void enqueueUpsert(Company company, Long ownerUserId, GoogleCalendarEntityType type, Long entityId) {
        if (company == null || company.getId() == null || type == null || entityId == null) return;
        GoogleCalendarConnection connection = resolveConnection(company.getId(), ownerUserId);
        if (connection == null || connection.getSyncDirection() == GoogleCalendarSyncDirection.GOOGLE_TO_CALENDRA) return;
        saveJob(company, connection, type, entityId, GoogleCalendarSyncAction.UPSERT_TO_GOOGLE);
    }

    @Transactional
    public void enqueueDelete(Company company, GoogleCalendarEntityType type, Long entityId) {
        if (company == null || company.getId() == null || type == null || entityId == null) return;
        Company managedCompany = companies.findById(company.getId()).orElse(company);
        List<GoogleCalendarEventLink> existingLinks = links.findAllByCompany_IdAndAppEntityTypeAndAppEntityId(company.getId(), type, entityId);
        for (GoogleCalendarEventLink link : existingLinks) saveJob(managedCompany, link.getConnection(), type, entityId, GoogleCalendarSyncAction.DELETE_FROM_GOOGLE);
    }

    @Transactional
    public void enqueuePull(GoogleCalendarConnection connection) {
        if (connection == null || connection.getCompany() == null) return;
        saveJob(connection.getCompany(), connection, null, null, GoogleCalendarSyncAction.PULL_FROM_GOOGLE);
    }

    @Transactional
    public void enqueueFullSync(GoogleCalendarConnection connection) {
        if (connection == null || connection.getCompany() == null) return;
        saveJob(connection.getCompany(), connection, null, null, GoogleCalendarSyncAction.FULL_SYNC);
    }

    private GoogleCalendarConnection resolveConnection(Long companyId, Long ownerUserId) {
        if (ownerUserId != null) {
            var userConnection = connections.findFirstByCompany_IdAndUser_IdAndStatusOrderByIdDesc(companyId, ownerUserId, GoogleCalendarConnectionStatus.ACTIVE);
            if (userConnection.isPresent()) return userConnection.get();
        }
        return connections.findFirstByCompany_IdAndUserIsNullAndStatusOrderByIdDesc(companyId, GoogleCalendarConnectionStatus.ACTIVE).orElse(null);
    }

    private void saveJob(Company company, GoogleCalendarConnection connection, GoogleCalendarEntityType type, Long entityId, GoogleCalendarSyncAction action) {
        if (connection != null) {
            boolean duplicatePending = type == null
                    ? jobs.findFirstByConnection_IdAndActionAndStatusOrderByCreatedAtDesc(connection.getId(), action, GoogleCalendarSyncJobStatus.PENDING).isPresent()
                    : jobs.findFirstByConnection_IdAndActionAndAppEntityTypeAndAppEntityIdAndStatusOrderByCreatedAtDesc(connection.getId(), action, type, entityId, GoogleCalendarSyncJobStatus.PENDING).isPresent();
            if (duplicatePending) return;
        }
        GoogleCalendarSyncJob job = new GoogleCalendarSyncJob();
        job.setCompany(company);
        job.setConnection(connection);
        job.setAppEntityType(type);
        job.setAppEntityId(entityId);
        job.setAction(action);
        job.setStatus(GoogleCalendarSyncJobStatus.PENDING);
        job.setNextAttemptAt(Instant.now());
        jobs.save(job);
    }
}
