package com.example.app.mfa;

import com.example.app.user.User;
import com.example.app.user.UserRepository;
import com.yubico.webauthn.CredentialRepository;
import com.yubico.webauthn.RegisteredCredential;
import com.yubico.webauthn.data.ByteArray;
import com.yubico.webauthn.data.PublicKeyCredentialDescriptor;
import com.yubico.webauthn.data.exception.Base64UrlException;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

@Component
public class WebAuthnUserCredentialRepository implements CredentialRepository {

    private final WebAuthnCredentialRepository credentialRepository;
    private final UserRepository userRepository;

    public WebAuthnUserCredentialRepository(WebAuthnCredentialRepository credentialRepository, UserRepository userRepository) {
        this.credentialRepository = credentialRepository;
        this.userRepository = userRepository;
    }

    @Override
    public Set<PublicKeyCredentialDescriptor> getCredentialIdsForUsername(String username) {
        return findUserByWebAuthnUsername(username)
                .map(user -> credentialRepository.findAllByUserOrderByCreatedAtAsc(user).stream()
                        .map(credential -> PublicKeyCredentialDescriptor.builder()
                                .id(byteArrayFromBase64Url(credential.getCredentialId(), "Invalid stored credential id"))
                                .build())
                        .collect(Collectors.toSet()))
                .orElseGet(Set::of);
    }

    @Override
    public Optional<ByteArray> getUserHandleForUsername(String username) {
        return findUserByWebAuthnUsername(username)
                .map(User::getWebauthnUserHandle)
                .filter(value -> value != null && !value.isBlank())
                .map(this::safeByteArrayFromBase64Url);
    }

    private ByteArray safeByteArrayFromBase64Url(String value) {
        return byteArrayFromBase64Url(value, "Invalid WebAuthn user handle");
    }

    private static ByteArray byteArrayFromBase64Url(String value, String message) {
        try {
            return ByteArray.fromBase64Url(value);
        } catch (Base64UrlException e) {
            throw new IllegalArgumentException(message, e);
        }
    }

    @Override
    public Optional<String> getUsernameForUserHandle(ByteArray userHandle) {
        return userRepository.findByWebauthnUserHandle(userHandle.getBase64Url())
                .map(this::webAuthnUsername);
    }

    @Override
    public Optional<RegisteredCredential> lookup(ByteArray credentialId, ByteArray userHandle) {
        return credentialRepository.findAllByCredentialId(credentialId.getBase64Url()).stream()
                .filter(credential -> credential.getUser().getWebauthnUserHandle() != null)
                .filter(credential -> credential.getUser().getWebauthnUserHandle().equals(userHandle.getBase64Url()))
                .findFirst()
                .map(this::toRegisteredCredential);
    }

    @Override
    public Set<RegisteredCredential> lookupAll(ByteArray credentialId) {
        return credentialRepository.findAllByCredentialId(credentialId.getBase64Url()).stream()
                .map(this::toRegisteredCredential)
                .collect(Collectors.toSet());
    }

    public String webAuthnUsername(User user) {
        return "user-" + user.getId();
    }

    private Optional<User> findUserByWebAuthnUsername(String username) {
        if (username == null || !username.startsWith("user-")) {
            return Optional.empty();
        }
        try {
            long userId = Long.parseLong(username.substring(5));
            return userRepository.findById(userId);
        } catch (NumberFormatException ex) {
            return Optional.empty();
        }
    }

    private RegisteredCredential toRegisteredCredential(WebAuthnCredential credential) {
        return RegisteredCredential.builder()
                .credentialId(byteArrayFromBase64Url(credential.getCredentialId(), "Invalid stored credential id"))
                .userHandle(byteArrayFromBase64Url(credential.getUser().getWebauthnUserHandle(), "Invalid WebAuthn user handle"))
                .publicKeyCose(ByteArray.fromBase64(credential.getPublicKeyCose()))
                .signatureCount(credential.getSignatureCount())
                .backupEligible(credential.getBackupEligible())
                .backupState(credential.getBackupState())
                .build();
    }
}
