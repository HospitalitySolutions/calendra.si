package com.example.app.billing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.nullable;
import static org.mockito.Mockito.when;

import com.example.app.guest.model.GuestOrderRepository;
import com.example.app.session.SessionBookingRepository;
import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.example.app.user.User;
import java.math.BigDecimal;
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

    @Test
    void generate_bankTransferWithIncompleteCompanyData_skipsPaymentQrInsteadOfFailing() {
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
        settingValues.put(SettingKey.COMPANY_NAME, "Test d.o.o.");
        settingValues.put(SettingKey.COMPANY_ADDRESS, "Glavna ulica 1");
        settingValues.put(SettingKey.COMPANY_POSTAL_CODE, "2000");
        settingValues.put(SettingKey.COMPANY_CITY, "Maribor");
        settingValues.put(SettingKey.COMPANY_IBAN, "SI56191000000123456");

        service.generate(bankTransferBill(), COMPANY_ID, "sl");

        assertThat(capturedRequest().getPaymentQrPayload()).startsWith("UPNQR\n");
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
