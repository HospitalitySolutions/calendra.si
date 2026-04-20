package com.example.app.sms;

public interface SmsGateway {
    boolean isConfigured();

    SmsSendResult send(SmsSendRequest request);

    record SmsSendRequest(Long companyId, String msisdn, String text, String customId) {}

    record SmsSendResult(boolean success, Integer messageId, String customId, int parts, String error) {}
}
