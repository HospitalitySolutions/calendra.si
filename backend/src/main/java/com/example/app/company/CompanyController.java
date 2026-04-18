package com.example.app.company;

import com.example.app.billing.BillRepository;
import com.example.app.files.CompanyFile;
import com.example.app.files.CompanyFileRepository;
import com.example.app.files.StoredFileResponse;
import com.example.app.files.TenantFileS3Service;
import com.example.app.user.User;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/companies")
public class CompanyController {
    private final ClientCompanyRepository companies;
    private final BillRepository bills;
    private final CompanyFileRepository companyFiles;
    private final TenantFileS3Service fileStorage;

    public CompanyController(
            ClientCompanyRepository companies,
            BillRepository bills,
            CompanyFileRepository companyFiles,
            TenantFileS3Service fileStorage
    ) {
        this.companies = companies;
        this.bills = bills;
        this.companyFiles = companyFiles;
        this.fileStorage = fileStorage;
    }

    public record CompanyRequest(
            String name,
            String address,
            String postalCode,
            String city,
            String vatId,
            String iban,
            String email,
            String telephone,
            Boolean batchPaymentEnabled
    ) {}

    public record CompanyResponse(
            Long id,
            String name,
            String address,
            String postalCode,
            String city,
            String vatId,
            String iban,
            String email,
            String telephone,
            boolean batchPaymentEnabled,
            boolean active,
            Instant createdAt,
            Instant updatedAt
    ) {}

    public record CompanyBillSummary(
            Long id,
            String billNumber,
            LocalDate issueDate,
            BigDecimal totalNet,
            BigDecimal totalGross,
            Long clientId,
            String clientName,
            String paymentStatus,
            String fiscalStatus
    ) {}

    @GetMapping
    @Transactional(readOnly = true)
    public List<CompanyResponse> list(
            @RequestParam(required = false) String search,
            @AuthenticationPrincipal User me
    ) {
        var ownerCompanyId = me.getCompany().getId();
        var rows = (search == null || search.isBlank())
                ? companies.findAllByOwnerCompanyIdOrderByNameAsc(ownerCompanyId)
                : companies.searchByOwnerCompanyId(ownerCompanyId, search.trim());
        return rows.stream().map(CompanyController::toResponse).toList();
    }

    @GetMapping("/{id}")
    @Transactional(readOnly = true)
    public CompanyResponse get(@PathVariable Long id, @AuthenticationPrincipal User me) {
        var row = companies.findByIdAndOwnerCompanyId(id, me.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        return toResponse(row);
    }

    @PostMapping
    @Transactional
    public CompanyResponse create(@RequestBody CompanyRequest req, @AuthenticationPrincipal User me) {
        var row = new ClientCompany();
        row.setOwnerCompany(me.getCompany());
        apply(row, req);
        return toResponse(companies.save(row));
    }

    @PutMapping("/{id}")
    @Transactional
    public CompanyResponse update(@PathVariable Long id, @RequestBody CompanyRequest req, @AuthenticationPrincipal User me) {
        var row = companies.findByIdAndOwnerCompanyId(id, me.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        apply(row, req);
        return toResponse(companies.save(row));
    }

    @PatchMapping("/{id}/deactivate")
    @Transactional
    public CompanyResponse deactivate(@PathVariable Long id, @AuthenticationPrincipal User me) {
        var row = companies.findByIdAndOwnerCompanyId(id, me.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        row.setActive(false);
        return toResponse(companies.save(row));
    }

    @PatchMapping("/{id}/activate")
    @Transactional
    public CompanyResponse activate(@PathVariable Long id, @AuthenticationPrincipal User me) {
        var row = companies.findByIdAndOwnerCompanyId(id, me.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        row.setActive(true);
        return toResponse(companies.save(row));
    }

    @GetMapping("/{id}/bills")
    @Transactional(readOnly = true)
    public List<CompanyBillSummary> bills(@PathVariable Long id, @AuthenticationPrincipal User me) {
        var ownerCompanyId = me.getCompany().getId();
        if (companies.findByIdAndOwnerCompanyId(id, ownerCompanyId).isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        return bills.findAllByCompanyIdAndRecipientCompanyIdSnapshotOrderByIssueDateDescIdDesc(ownerCompanyId, id).stream()
                .map(b -> new CompanyBillSummary(
                        b.getId(),
                        b.getBillNumber(),
                        b.getIssueDate(),
                        b.getTotalNet(),
                        b.getTotalGross(),
                        b.getClient() == null ? null : b.getClient().getId(),
                        b.getClient() == null ? ""
                                : ((b.getClientFirstNameSnapshot() == null ? "" : b.getClientFirstNameSnapshot()) + " "
                                + (b.getClientLastNameSnapshot() == null ? "" : b.getClientLastNameSnapshot())).trim(),
                        b.getPaymentStatus(),
                        b.getFiscalStatus() == null ? null : b.getFiscalStatus().name()
                ))
                .toList();
    }


    @GetMapping("/{id}/files")
    @Transactional(readOnly = true)
    public List<StoredFileResponse> listFiles(@PathVariable Long id, @AuthenticationPrincipal User me) {
        var company = loadCompany(id, me);
        return companyFiles.findAllByCompanyIdAndOwnerCompanyIdOrderByCreatedAtDescIdDesc(company.getId(), me.getCompany().getId())
                .stream()
                .map(StoredFileResponse::from)
                .toList();
    }

    @PostMapping("/{id}/files")
    @Transactional
    public StoredFileResponse uploadFile(
            @PathVariable Long id,
            @RequestParam("file") MultipartFile file,
            @AuthenticationPrincipal User me
    ) {
        var company = loadCompany(id, me);
        var stored = fileStorage.uploadCompanyFile(me.getCompany(), company, file);

        var row = new CompanyFile();
        row.setCompany(company);
        row.setOwnerCompany(me.getCompany());
        row.setOriginalFileName(file.getOriginalFilename() == null || file.getOriginalFilename().isBlank() ? "file" : file.getOriginalFilename().trim());
        row.setContentType(stored.contentType());
        row.setSizeBytes(stored.sizeBytes());
        row.setS3ObjectKey(stored.objectKey());
        row.setUploadedByUserId(me.getId());
        return StoredFileResponse.from(companyFiles.save(row));
    }

    @GetMapping("/{id}/files/{fileId}")
    @Transactional(readOnly = true)
    public ResponseEntity<byte[]> downloadFile(
            @PathVariable Long id,
            @PathVariable Long fileId,
            @AuthenticationPrincipal User me
    ) {
        loadCompany(id, me);
        var file = companyFiles.findByIdAndCompanyIdAndOwnerCompanyId(fileId, id, me.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        byte[] bytes = fileStorage.download(file.getS3ObjectKey());
        String contentType = file.getContentType() == null || file.getContentType().isBlank()
                ? MediaType.APPLICATION_OCTET_STREAM_VALUE
                : file.getContentType();
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(file.getOriginalFileName()).build().toString())
                .contentType(MediaType.parseMediaType(contentType))
                .body(bytes);
    }

    @DeleteMapping("/{id}/files/{fileId}")
    @Transactional
    public void deleteFile(
            @PathVariable Long id,
            @PathVariable Long fileId,
            @AuthenticationPrincipal User me
    ) {
        loadCompany(id, me);
        var file = companyFiles.findByIdAndCompanyIdAndOwnerCompanyId(fileId, id, me.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        fileStorage.deleteQuietly(file.getS3ObjectKey());
        companyFiles.delete(file);
    }

    private ClientCompany loadCompany(Long id, User me) {
        return companies.findByIdAndOwnerCompanyId(id, me.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    private static CompanyResponse toResponse(ClientCompany c) {
        return new CompanyResponse(
                c.getId(),
                c.getName(),
                c.getAddress(),
                c.getPostalCode(),
                c.getCity(),
                c.getVatId(),
                c.getIban(),
                c.getEmail(),
                c.getTelephone(),
                c.isBatchPaymentEnabled(),
                c.isActive(),
                c.getCreatedAt(),
                c.getUpdatedAt()
        );
    }

    private static void apply(ClientCompany row, CompanyRequest req) {
        if (req == null || req.name() == null || req.name().trim().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Company name is required.");
        }
        row.setName(req.name().trim());
        row.setAddress(normalize(req.address()));
        row.setPostalCode(normalize(req.postalCode()));
        row.setCity(normalize(req.city()));
        row.setVatId(normalize(req.vatId()));
        row.setIban(normalize(req.iban()));
        row.setEmail(normalize(req.email()));
        row.setTelephone(normalize(req.telephone()));
        if (req.batchPaymentEnabled() != null) {
            row.setBatchPaymentEnabled(req.batchPaymentEnabled());
        } else if (row.getId() == null) {
            row.setBatchPaymentEnabled(false);
        }
    }

    private static String normalize(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
