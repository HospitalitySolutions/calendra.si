package com.example.app.billing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.nullable;
import static org.mockito.Mockito.when;

import com.example.app.billingissuer.InvoiceSeries;
import com.example.app.guest.model.GuestOrderRepository;
import com.example.app.location.Location;
import com.example.app.session.SessionBookingRepository;
import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.example.app.user.User;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.EnumMap;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class BillFolioPdfServicePaymentQrTest {
    private static final Long COMPANY_ID = 7L;

    @Mock private AppSettingRepository settings;
    @Mock private SessionBookingRepository sessionBookings;
    @Mock private GuestOrderRepository guestOrders;
    @Mock private FolioPdfService folioPdfService;

    private final UpnQrPayloadBuilder upnQrPayloadBuilder = new UpnQrPayloadBuilder();
    private final Map<SettingKey, String> settingValues = new EnumMap<>(SettingKey.class);
    private BillFolioPdfService service;

    @BeforeEach
    void setUp() {
        service = new BillFolioPdfService(
                settings,
                sessionBookings,
                guestOrders,
                folioPdfService,
                upnQrPayloadBuilder
        );
    }

    @Test
    void generate_bankTransferWithIncompleteCompanyData_skipsPaymentQrInsteadOfFailing() {
        stubGenerationDependencies();
        settingValues.put(SettingKey.COMPANY_NAME, "Test d.o.o.");
        settingValues.put(SettingKey.COMPANY_IBAN, "SI56191000000123456");

        service.generate(bankTransferBill(), COMPANY_ID, "sl");

        FolioPdfRequest request = capturedRequest();
        String paymentQrPayload = request.getPaymentQrPayload();
        assertThat(paymentQrPayload == null || paymentQrPayload.isBlank()).isTrue();
        assertThat(request.getToBePaidGross()).isEqualByComparingTo("61.00");
    }

    @Test
    void generate_bankTransferWithCompleteCompanyData_includesUpnPaymentQr() {
        stubGenerationDependencies();
        settingValues.put(SettingKey.COMPANY_NAME, "Test d.o.o.");
        settingValues.put(SettingKey.COMPANY_ADDRESS, "Glavna ulica 1");
        settingValues.put(SettingKey.COMPANY_POSTAL_CODE, "2000");
        settingValues.put(SettingKey.COMPANY_CITY, "Maribor");
        settingValues.put(SettingKey.COMPANY_IBAN, "SI56191000000123456");

        service.generate(bankTransferBill(), COMPANY_ID, "sl");

        assertThat(capturedRequest().getPaymentQrPayload()).startsWith("UPNQR\n");
    }

    @Test
    void generate_usesConfiguredLocalTimezoneAndPhysicalCompanyCity() {
        stubGenerationDependencies();
        settingValues.put(SettingKey.COMPANY_CITY, "Ljubljana");
        settingValues.put(SettingKey.COMPANY_PHYSICAL_CITY, "Maribor");
        Bill bill = bankTransferBill();
        bill.setCreatedAt(Instant.parse("2026-08-01T17:42:00Z"));

        service.generate(bill, COMPANY_ID, "sl");

        FolioPdfRequest request = capturedRequest();
        assertThat(request.getFolioDate()).isEqualTo("01.08.2026 19:42");
        assertThat(request.getIssueCity()).isEqualTo("Maribor");
    }

    @Test
    void generate_detectsDiscountFromFinalPaymentSplitWhenStoredLinesAreUndiscounted() {
        stubGenerationDependencies();
        Bill bill = bankTransferBill();
        bill.setTotalGross(new BigDecimal("157.60"));

        TransactionService transactionService = new TransactionService();
        transactionService.setDescription("Test");
        transactionService.setNetPrice(new BigDecimal("129.1803"));
        transactionService.setTaxRate(TaxRate.VAT_22);

        BillItem item = new BillItem();
        item.setBill(bill);
        item.setTransactionService(transactionService);
        item.setQuantity(1);
        item.setNetPrice(new BigDecimal("129.1803"));
        item.setGrossPrice(new BigDecimal("157.60"));
        bill.getItems().add(item);

        BillPayment payment = new BillPayment();
        payment.setBill(bill);
        payment.setPaymentMethod(bill.getPaymentMethod());
        payment.setAmountGross(new BigDecimal("145.60"));
        payment.setSortOrder(0);
        bill.getPaymentSplits().add(payment);

        service.generate(bill, COMPANY_ID, "sl");

        FolioPdfRequest request = capturedRequest();
        assertThat(request.getDiscountAmountGross()).isEqualByComparingTo("12.00");
        assertThat(request.getSubtotalBeforeDiscountGross()).isEqualByComparingTo("157.60");
        assertThat(request.getToBePaidGross()).isEqualByComparingTo("145.60");
    }

    @Test
    void generate_prefixesVisibleInvoiceNumberWithLocationPremiseAndDefaultDevice() {
        stubGenerationDependencies();
        Bill bill = bankTransferBill();
        Location location = new Location();
        location.setFiscalBusinessPremiseCode("MB");
        InvoiceSeries series = new InvoiceSeries();
        bill.setLocation(location);
        bill.setInvoiceSeries(series);

        service.generate(bill, COMPANY_ID, "sl");

        assertThat(capturedRequest().getFolioNumber()).isEqualTo("MB-1-RAC-2026-81");
    }

    @Test
    void displayInvoiceNumber_doesNotDuplicateAnExistingPrefix() {
        Bill bill = bankTransferBill();
        bill.setFiscalBusinessPremiseSnapshot("MB");
        bill.setFiscalDeviceIdSnapshot("1");
        bill.setBillNumber("MB-1-81");

        assertThat(BillFolioPdfService.displayInvoiceNumber(bill)).isEqualTo("MB-1-81");
    }

    private void stubGenerationDependencies() {
        when(settings.findByCompanyIdAndKey(eq(COMPANY_ID), any(SettingKey.class)))
                .thenAnswer(invocation -> setting(invocation.getArgument(1)));
        when(folioPdfService.generate(
                any(FolioPdfRequest.class),
                any(FolioLayoutConfig.class),
                nullable(byte[].class),
                nullable(byte[].class)
        ))
                .thenReturn(new byte[] { 1 });
    }

    private Optional<AppSetting> setting(SettingKey key) {
        String value = settingValues.get(key);
        if (value == null) return Optional.empty();
        AppSetting setting = new AppSetting();
        setting.setKey(key.name());
        setting.setValue(value);
        return Optional.of(setting);
    }

    private FolioPdfRequest capturedRequest() {
        ArgumentCaptor<FolioPdfRequest> captor = ArgumentCaptor.forClass(FolioPdfRequest.class);
        org.mockito.Mockito.verify(folioPdfService)
                .generate(
                        captor.capture(),
                        any(FolioLayoutConfig.class),
                        nullable(byte[].class),
                        nullable(byte[].class)
                );
        return captor.getValue();
    }

    private Bill bankTransferBill() {
        PaymentMethod paymentMethod = new PaymentMethod();
        paymentMethod.setName("Bančno nakazilo");
        paymentMethod.setPaymentType(PaymentType.BANK_TRANSFER);

        User consultant = new User();
        consultant.setFirstName("David");
        consultant.setLastName("Mirc");

        Bill bill = new Bill();
        bill.setId(81L);
        bill.setBillNumber("RAC-2026-81");
        bill.setOrderId("3DAV-50-81");
        bill.setIssueDate(LocalDate.of(2026, 7, 31));
        bill.setClientFirstNameSnapshot("Test");
        bill.setClientLastNameSnapshot("Asdsad");
        bill.setConsultant(consultant);
        bill.setPaymentMethod(paymentMethod);
        bill.setTotalNet(new BigDecimal("50.00"));
        bill.setTotalGross(new BigDecimal("61.00"));
        return bill;
    }
}
