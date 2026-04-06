package com.example.app.user;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.List;

public interface UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByEmail(String email);
    Optional<User> findByEmailIgnoreCase(String email);
    List<User> findAllByEmailIgnoreCase(String email);
    List<User> findAllByEmailIgnoreCaseAndActiveTrue(String email);
    boolean existsByEmailIgnoreCase(String email);

    List<User> findAllByCompanyId(Long companyId);

    long countByCompanyId(Long companyId);
    Optional<User> findByIdAndCompanyId(Long id, Long companyId);
    boolean existsByCompanyIdAndEmailIgnoreCase(Long companyId, String email);
    Optional<User> findByEmailIgnoreCaseAndCompanyId(String email, Long companyId);
    java.util.List<User> findAllByRoleOrderByIdAsc(Role role);
}