package com.example.app.user;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface EmployeeAccessRoleRepository extends JpaRepository<EmployeeAccessRole, Long> {
    List<EmployeeAccessRole> findAllByCompanyIdAndArchivedFalseOrderByNameAsc(Long companyId);
    Optional<EmployeeAccessRole> findByIdAndCompanyIdAndArchivedFalse(Long id, Long companyId);
    Optional<EmployeeAccessRole> findFirstByCompanyIdAndArchivedFalseAndNameIgnoreCase(Long companyId, String name);
    boolean existsByCompanyIdAndArchivedFalseAndNameIgnoreCase(Long companyId, String name);
}
