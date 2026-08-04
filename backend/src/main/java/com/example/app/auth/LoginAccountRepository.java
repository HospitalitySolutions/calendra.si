package com.example.app.auth;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LoginAccountRepository extends JpaRepository<LoginAccount, Long> {
    List<LoginAccount> findAllByEmailIgnoreCaseOrderByIdAsc(String email);
    Optional<LoginAccount> findFirstByEmailIgnoreCaseOrderByIdAsc(String email);
}
