package com.example.app.user;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.List;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByEmail(String email);
    Optional<User> findByEmailIgnoreCase(String email);
    List<User> findAllByEmailIgnoreCase(String email);
    List<User> findAllByEmailIgnoreCaseAndActiveTrue(String email);
    boolean existsByEmailIgnoreCase(String email);

    List<User> findAllByCompanyId(Long companyId);

    long countByCompanyId(Long companyId);
    long countByCompanyIdAndActiveTrue(Long companyId);
    long countByCompanyIdAndActiveTrueAndRole(Long companyId, Role role);
    Optional<User> findByIdAndCompanyId(Long id, Long companyId);
    Optional<User> findByIdAndCompanyIdAndActiveTrue(Long id, Long companyId);
    Optional<User> findFirstByCompanyIdAndActiveTrueAndRoleOrderByIdAsc(Long companyId, Role role);
    Optional<User> findFirstByCompanyIdAndActiveTrueOrderByIdAsc(Long companyId);
    Optional<User> findFirstByCompanyIdOrderByIdAsc(Long companyId);

    @Query("""
            select distinct u from User u
            left join fetch u.types
            where u.company.id = :companyId
              and u.active = true
              and (u.consultant = true or u.role = :consultantRole)
            """)
    List<User> findActiveBookableByCompanyId(
            @Param("companyId") Long companyId,
            @Param("consultantRole") Role consultantRole);

    boolean existsByCompanyIdAndEmailIgnoreCase(Long companyId, String email);
    Optional<User> findByEmailIgnoreCaseAndCompanyId(String email, Long companyId);
    Optional<User> findByWebauthnUserHandle(String webauthnUserHandle);
    java.util.List<User> findAllByRoleOrderByIdAsc(Role role);

    @Query("select distinct u.company.id from User u where lower(u.email) like lower(concat('%', :needle, '%'))")
    List<Long> findDistinctCompanyIdsByEmailContainingIgnoreCase(@Param("needle") String needle);
}