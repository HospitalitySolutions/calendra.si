package com.example.app.fiscal;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.Signature;
import java.security.cert.X509Certificate;
import java.util.Enumeration;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.stereotype.Service;

@Service
public class FiscalSignatureService {
    private static final ObjectMapper JSON = new ObjectMapper();
    private final FiscalCertificateRepository certificates;

    public FiscalSignatureService(FiscalCertificateRepository certificates) {
        this.certificates = certificates;
    }

    public String signPayload(Long companyId, FiscalSettings settings, Object payload) {
        if (settings.certificatePassword().isBlank()) {
            throw new IllegalStateException("Fiscal certificate settings are incomplete.");
        }
        try {
            byte[] payloadBytes = JSON.writeValueAsBytes(payload);
            var cert = certificates.findByCompanyId(companyId)
                    .orElseThrow(() -> new IllegalStateException("Fiscal certificate is not uploaded."));
            KeyStore ks = KeyStore.getInstance("PKCS12");
            ks.load(new java.io.ByteArrayInputStream(cert.getCertificateData()), settings.certificatePassword().toCharArray());
            String alias = firstKeyAlias(ks);
            if (alias == null) {
                throw new IllegalStateException("No private key entry found in uploaded certificate.");
            }
            var key = ks.getKey(alias, settings.certificatePassword().toCharArray());
            if (!(key instanceof PrivateKey privateKey)) {
                throw new IllegalStateException("Configured key alias does not point to a private key.");
            }
            Signature signature = Signature.getInstance("SHA256withRSA");
            signature.initSign(privateKey);
            signature.update(payloadBytes);
            return Base64.getEncoder().encodeToString(signature.sign());
        } catch (Exception e) {
            throw new IllegalStateException("Unable to sign fiscal payload.", e);
        }
    }

    public String createJwsToken(Long companyId, FiscalSettings settings, Object payload) {
        if (settings.certificatePassword().isBlank()) {
            throw new IllegalStateException("Fiscal certificate settings are incomplete.");
        }
        try {
            var cert = certificates.findByCompanyId(companyId)
                    .orElseThrow(() -> new IllegalStateException("Fiscal certificate is not uploaded."));
            KeyStore ks = KeyStore.getInstance("PKCS12");
            ks.load(new java.io.ByteArrayInputStream(cert.getCertificateData()), settings.certificatePassword().toCharArray());
            String alias = firstKeyAlias(ks);
            if (alias == null) {
                throw new IllegalStateException("No private key entry found in uploaded certificate.");
            }
            var key = ks.getKey(alias, settings.certificatePassword().toCharArray());
            if (!(key instanceof PrivateKey privateKey)) {
                throw new IllegalStateException("Configured key alias does not point to a private key.");
            }
            if (!(ks.getCertificate(alias) instanceof X509Certificate x509)) {
                throw new IllegalStateException("Uploaded certificate is not an X509 certificate.");
            }

            Map<String, Object> jwsHeader = new LinkedHashMap<>();
            jwsHeader.put("alg", "RS256");
            jwsHeader.put("subject_name", x509.getSubjectX500Principal().getName("RFC2253"));
            jwsHeader.put("issuer_name", x509.getIssuerX500Principal().getName("RFC2253"));
            jwsHeader.put("cty", "application/json");
            jwsHeader.put("typ", "JOSE");
            jwsHeader.put("serial", x509.getSerialNumber());

            String headerPart = Base64.getUrlEncoder().withoutPadding()
                    .encodeToString(JSON.writeValueAsBytes(jwsHeader));
            String payloadPart = Base64.getUrlEncoder().withoutPadding()
                    .encodeToString(JSON.writeValueAsBytes(payload));
            String signingInput = headerPart + "." + payloadPart;

            Signature signature = Signature.getInstance("SHA256withRSA");
            signature.initSign(privateKey);
            signature.update(signingInput.getBytes(StandardCharsets.UTF_8));
            String signaturePart = Base64.getUrlEncoder().withoutPadding().encodeToString(signature.sign());
            return signingInput + "." + signaturePart;
        } catch (Exception e) {
            throw new IllegalStateException("Unable to create fiscal JWS token.", e);
        }
    }

    private String firstKeyAlias(KeyStore ks) throws Exception {
        Enumeration<String> aliases = ks.aliases();
        while (aliases.hasMoreElements()) {
            String alias = aliases.nextElement();
            if (ks.isKeyEntry(alias)) {
                return alias;
            }
        }
        return null;
    }

    public String computeZoi(String signatureBase64) {
        try {
            // FURS ProtectedID/ZOI must be 32-char MD5 hex (not SHA-256).
            var digest = java.security.MessageDigest.getInstance("MD5");
            byte[] hashed = digest.digest(signatureBase64.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : hashed) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (Exception e) {
            throw new IllegalStateException("Unable to compute ZOI hash.", e);
        }
    }
}
