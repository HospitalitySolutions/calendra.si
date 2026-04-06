package com.example.app.fiscal;

public record FiscalSettings(
        FiscalEnvironment environment,
        String taxNumber,
        String businessPremiseId,
        String deviceId,
        String softwareSupplierTaxNumber,
        String certificatePassword,
        String cadastralNumber,
        String buildingNumber,
        String buildingSectionNumber,
        String houseNumber,
        String houseNumberAdditional,
        String companyAddress,
        String companyPostalCode,
        String companyCity,
        String invoiceUrl,
        String premiseUrl
) {}
