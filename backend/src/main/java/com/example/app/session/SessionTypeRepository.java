package com.example.app.session;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface SessionTypeRepository extends JpaRepository<SessionType, Long> {

    @Query("SELECT DISTINCT t FROM SessionType t LEFT JOIN FETCH t.linkedServices ls LEFT JOIN FETCH ls.transactionService")
    List<SessionType> findAllWithLinkedServices();

    @Query("SELECT DISTINCT t FROM SessionType t LEFT JOIN FETCH t.linkedServices ls LEFT JOIN FETCH ls.transactionService " +
            "WHERE t.company.id = :companyId")
    List<SessionType> findAllWithLinkedServicesByCompanyId(@Param("companyId") Long companyId);
}
