package com.example.app.client;

import com.example.app.customfield.CustomFieldAppliesTo;
import com.example.app.customfield.CustomFieldDefinition;
import com.example.app.customfield.CustomFieldDefinitionRepository;
import com.example.app.customfield.CustomFieldType;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Fast, deterministic id paging for the Clients screen.
 *
 * The page query intentionally returns only ids. Controllers then hydrate the 10-25 visible
 * entities with their normal JPA graphs and bulk custom-field/removal-status data. This avoids
 * paginating a query that fetch-joins to-many relationships while keeping the existing response
 * DTOs unchanged.
 */
@Service
public class ClientDirectoryPageQueryService {
    public record IdPage(List<Long> ids, long totalElements, int page, int size, int totalPages) {}

    private final NamedParameterJdbcTemplate jdbc;
    private final CustomFieldDefinitionRepository customFieldDefinitions;

    public ClientDirectoryPageQueryService(
            NamedParameterJdbcTemplate jdbc,
            CustomFieldDefinitionRepository customFieldDefinitions
    ) {
        this.jdbc = jdbc;
        this.customFieldDefinitions = customFieldDefinitions;
    }

    @Transactional(readOnly = true)
    public IdPage clientIds(
            Long companyId,
            Long currentUserId,
            boolean admin,
            Long locationId,
            Boolean active,
            String search,
            String ownerFilter,
            String sortField,
            String sortDir,
            int requestedPage,
            int requestedSize
    ) {
        MapSqlParameterSource params = baseParams(companyId);
        StringBuilder where = new StringBuilder("""
                from clients c
                where c.company_id = :companyId
                """);
        appendActiveFilter(where, params, "c.active", active);
        if (locationId != null) {
            params.addValue("locationId", locationId);
            where.append("""
                    and (
                        not exists (select 1 from client_assigned_locations cal0 where cal0.client_id = c.id)
                        or exists (
                            select 1 from client_assigned_locations cal
                            where cal.client_id = c.id and cal.location_id = :locationId
                        )
                    )
                    """);
        }

        if (!admin) {
            params.addValue("visibleUserId", currentUserId);
            where.append("""
                    and (
                        c.assigned_to_id = :visibleUserId
                        or exists (
                            select 1 from client_assigned_users cau_visible
                            where cau_visible.client_id = c.id and cau_visible.user_id = :visibleUserId
                        )
                    )
                    """);
        } else {
            OwnerFilter parsedOwner = parseOwnerFilter(ownerFilter);
            if (parsedOwner.unassigned()) {
                where.append("""
                        and c.assigned_to_id is null
                        and not exists (select 1 from client_assigned_users cau_owner where cau_owner.client_id = c.id)
                        """);
            } else if (parsedOwner.ownerId() != null) {
                params.addValue("ownerId", parsedOwner.ownerId());
                where.append("""
                        and (
                            c.assigned_to_id = :ownerId
                            or exists (
                                select 1 from client_assigned_users cau_owner
                                where cau_owner.client_id = c.id and cau_owner.user_id = :ownerId
                            )
                        )
                        """);
            }
        }

        appendClientSearch(where, params, search);
        String orderBy = clientOrderBy(companyId, sortField, sortDir, params);
        return pageIds("select c.id ", where.toString(), orderBy, params, requestedPage, requestedSize);
    }

    @Transactional(readOnly = true)
    public IdPage companyIds(
            Long companyId,
            Long locationId,
            Boolean active,
            String search,
            String sortField,
            String sortDir,
            int requestedPage,
            int requestedSize
    ) {
        MapSqlParameterSource params = baseParams(companyId);
        StringBuilder where = new StringBuilder("""
                from client_companies cc
                where cc.owner_company_id = :companyId
                """);
        appendActiveFilter(where, params, "cc.active", active);
        if (locationId != null) {
            params.addValue("locationId", locationId);
            where.append("""
                    and (
                        not exists (
                            select 1 from client_company_assigned_locations ccal0
                            where ccal0.client_company_id = cc.id
                        )
                        or exists (
                            select 1 from client_company_assigned_locations ccal
                            where ccal.client_company_id = cc.id and ccal.location_id = :locationId
                        )
                    )
                    """);
        }
        appendCompanySearch(where, params, search);
        String orderBy = companyOrderBy(companyId, sortField, sortDir, params);
        return pageIds("select cc.id ", where.toString(), orderBy, params, requestedPage, requestedSize);
    }

    @Transactional(readOnly = true)
    public IdPage groupIds(
            Long companyId,
            Long locationId,
            Boolean active,
            String search,
            String sortField,
            String sortDir,
            int requestedPage,
            int requestedSize
    ) {
        MapSqlParameterSource params = baseParams(companyId);
        StringBuilder where = new StringBuilder("""
                from client_groups cg
                where cg.company_id = :companyId
                """);
        appendActiveFilter(where, params, "cg.active", active);
        if (locationId != null) {
            params.addValue("locationId", locationId);
            where.append("""
                    and (
                        not exists (
                            select 1 from client_group_assigned_locations cgal0
                            where cgal0.group_id = cg.id
                        )
                        or exists (
                            select 1 from client_group_assigned_locations cgal
                            where cgal.group_id = cg.id and cgal.location_id = :locationId
                        )
                    )
                    """);
        }
        appendGroupSearch(where, params, search);
        String orderBy = groupOrderBy(companyId, sortField, sortDir, params);
        return pageIds("select cg.id ", where.toString(), orderBy, params, requestedPage, requestedSize);
    }

    private IdPage pageIds(
            String selectIds,
            String fromWhere,
            String orderBy,
            MapSqlParameterSource params,
            int requestedPage,
            int requestedSize
    ) {
        int size = Math.max(1, Math.min(requestedSize <= 0 ? 10 : requestedSize, 100));
        long total = Objects.requireNonNullElse(
                jdbc.queryForObject("select count(*) " + fromWhere, params, Long.class),
                0L);
        int totalPages = total == 0 ? 0 : (int) Math.ceil(total / (double) size);
        int page = Math.max(0, requestedPage);
        if (totalPages > 0 && page >= totalPages) page = totalPages - 1;
        if (totalPages == 0) page = 0;

        params.addValue("limit", size);
        params.addValue("offset", page * size);
        List<Long> ids = jdbc.queryForList(
                selectIds + fromWhere + orderBy + " limit :limit offset :offset",
                params,
                Long.class);
        return new IdPage(ids, total, page, size, totalPages);
    }

    private static MapSqlParameterSource baseParams(Long companyId) {
        MapSqlParameterSource params = new MapSqlParameterSource();
        params.addValue("companyId", companyId);
        return params;
    }

    private static void appendActiveFilter(
            StringBuilder where,
            MapSqlParameterSource params,
            String column,
            Boolean active
    ) {
        if (active == null) return;
        params.addValue("active", active);
        where.append(" and ").append(column).append(" = :active\n");
    }

    private static void appendClientSearch(StringBuilder where, MapSqlParameterSource params, String search) {
        if (isBlank(search)) return;
        params.addValue("searchPattern", normalizeSearchPattern(search));
        where.append("""
                and (
                    lower(coalesce(c.first_name, '')) like :searchPattern
                    or lower(coalesce(c.last_name, '')) like :searchPattern
                    or lower(trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, ''))) like :searchPattern
                    or lower(coalesce(c.email, '')) like :searchPattern
                    or lower(coalesce(c.phone, '')) like :searchPattern
                    or exists (
                        select 1 from client_companies bc_search
                        where bc_search.id = c.billing_company_id
                          and lower(coalesce(bc_search.name, '')) like :searchPattern
                    )
                )
                """);
    }

    private static void appendCompanySearch(StringBuilder where, MapSqlParameterSource params, String search) {
        if (isBlank(search)) return;
        params.addValue("searchPattern", normalizeSearchPattern(search));
        where.append("""
                and (
                    lower(coalesce(cc.name, '')) like :searchPattern
                    or lower(coalesce(cc.address, '')) like :searchPattern
                    or lower(coalesce(cc.city, '')) like :searchPattern
                    or lower(coalesce(cc.vat_id, '')) like :searchPattern
                    or lower(coalesce(cc.email, '')) like :searchPattern
                    or lower(coalesce(cc.telephone, '')) like :searchPattern
                )
                """);
    }

    private static void appendGroupSearch(StringBuilder where, MapSqlParameterSource params, String search) {
        if (isBlank(search)) return;
        params.addValue("searchPattern", normalizeSearchPattern(search));
        where.append("""
                and (
                    lower(coalesce(cg.name, '')) like :searchPattern
                    or lower(coalesce(cg.email, '')) like :searchPattern
                )
                """);
    }

    private String clientOrderBy(
            Long companyId,
            String sortField,
            String sortDir,
            MapSqlParameterSource params
    ) {
        Direction dir = Direction.parse(sortDir);
        if (isCustomSort(sortField)) {
            CustomFieldDefinition definition = customDefinition(companyId, CustomFieldAppliesTo.CLIENT, sortField);
            if (definition != null) {
                params.addValue("customSortFieldId", definition.getId());
                String value = customValueExpression("CLIENT", "c.id", definition.getFieldType());
                return nullableOrder(value, dir, "c.id");
            }
        }
        return switch (normalizeSortField(sortField)) {
            case "name" -> " order by lower(c.first_name) " + dir.sql + ", lower(c.last_name) " + dir.sql + ", c.id " + dir.sql;
            case "email" -> nullableOrder("lower(nullif(trim(c.email), ''))", dir, "c.id");
            case "phone" -> nullableOrder("lower(nullif(trim(c.phone), ''))", dir, "c.id");
            case "assignedowner" -> nullableOrder("""
                    coalesce(
                        (select min(lower(trim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, ''))))
                         from client_assigned_users cau_sort
                         join users u on u.id = cau_sort.user_id
                         where cau_sort.client_id = c.id),
                        (select lower(trim(coalesce(u2.first_name, '') || ' ' || coalesce(u2.last_name, '')))
                         from users u2 where u2.id = c.assigned_to_id)
                    )
                    """.trim(), dir, "c.id");
            case "status" -> " order by c.active " + dir.sql + ", c.id " + dir.sql;
            case "createdat" -> " order by c.created_at " + dir.sql + ", c.id " + dir.sql;
            default -> " order by lower(c.last_name) asc, lower(c.first_name) asc, c.id asc";
        };
    }

    private String companyOrderBy(
            Long companyId,
            String sortField,
            String sortDir,
            MapSqlParameterSource params
    ) {
        Direction dir = Direction.parse(sortDir);
        if (isCustomSort(sortField)) {
            CustomFieldDefinition definition = customDefinition(companyId, CustomFieldAppliesTo.COMPANY, sortField);
            if (definition != null) {
                params.addValue("customSortFieldId", definition.getId());
                String value = customValueExpression("COMPANY", "cc.id", definition.getFieldType());
                return nullableOrder(value, dir, "cc.id");
            }
        }
        return switch (normalizeSortField(sortField)) {
            case "name" -> " order by lower(cc.name) " + dir.sql + ", cc.id " + dir.sql;
            case "vatid" -> nullableOrder("lower(nullif(trim(cc.vat_id), ''))", dir, "cc.id");
            case "email" -> nullableOrder("lower(nullif(trim(cc.email), ''))", dir, "cc.id");
            case "telephone" -> nullableOrder("lower(nullif(trim(cc.telephone), ''))", dir, "cc.id");
            case "city" -> nullableOrder("lower(nullif(trim(cc.city), ''))", dir, "cc.id");
            case "status" -> " order by cc.active " + dir.sql + ", cc.id " + dir.sql;
            case "createdat" -> " order by cc.created_at " + dir.sql + ", cc.id " + dir.sql;
            default -> " order by lower(cc.name) asc, cc.id asc";
        };
    }

    private String groupOrderBy(
            Long companyId,
            String sortField,
            String sortDir,
            MapSqlParameterSource params
    ) {
        Direction dir = Direction.parse(sortDir);
        if (isCustomSort(sortField)) {
            CustomFieldDefinition definition = customDefinition(companyId, CustomFieldAppliesTo.GROUP, sortField);
            if (definition != null) {
                params.addValue("customSortFieldId", definition.getId());
                String value = customValueExpression("GROUP", "cg.id", definition.getFieldType());
                return nullableOrder(value, dir, "cg.id");
            }
        }
        return switch (normalizeSortField(sortField)) {
            case "name" -> " order by lower(cg.name) " + dir.sql + ", cg.id " + dir.sql;
            case "description" -> nullableOrder("lower(nullif(trim(cg.email), ''))", dir, "cg.id");
            case "members" -> " order by (select count(*) from client_group_members cgm_sort where cgm_sort.group_id = cg.id) "
                    + dir.sql + ", cg.id " + dir.sql;
            case "status" -> " order by cg.active " + dir.sql + ", cg.id " + dir.sql;
            case "createdat" -> " order by cg.created_at " + dir.sql + ", cg.id " + dir.sql;
            default -> " order by lower(cg.name) asc, cg.id asc";
        };
    }

    private CustomFieldDefinition customDefinition(
            Long companyId,
            CustomFieldAppliesTo appliesTo,
            String sortField
    ) {
        Long id = parseCustomFieldId(sortField);
        if (id == null) return null;
        return customFieldDefinitions.findByIdAndCompanyId(id, companyId)
                .filter(definition -> definition.isActive()
                        && definition.isShowInList()
                        && definition.getAppliesTo() == appliesTo)
                .orElse(null);
    }

    private static String customValueExpression(
            String entityType,
            String entityIdExpression,
            CustomFieldType fieldType
    ) {
        String raw = "(select nullif(trim(cfv_sort.value_text), '') from custom_field_values cfv_sort "
                + "where cfv_sort.company_id = :companyId "
                + "and cfv_sort.entity_type = '" + entityType + "' "
                + "and cfv_sort.entity_id = " + entityIdExpression + " "
                + "and cfv_sort.field_definition_id = :customSortFieldId limit 1)";
        if (fieldType == null) return "lower(" + raw + ")";
        return switch (fieldType) {
            case NUMBER -> "(" + raw + ")::numeric";
            case DATE -> "(" + raw + ")::date";
            case CHECKBOX -> "case lower(" + raw + ") when 'true' then 1 when '1' then 1 when 'yes' then 1 when 'da' then 1 when 'false' then 0 when '0' then 0 when 'no' then 0 when 'ne' then 0 else null end";
            default -> "lower(" + raw + ")";
        };
    }

    private static String nullableOrder(String expression, Direction dir, String stableIdExpression) {
        return " order by " + expression + " " + dir.sql + " nulls last, " + stableIdExpression + " " + dir.sql;
    }

    private static boolean isCustomSort(String value) {
        return value != null && value.toLowerCase(Locale.ROOT).startsWith("custom:");
    }

    private static Long parseCustomFieldId(String value) {
        if (!isCustomSort(value)) return null;
        try {
            long id = Long.parseLong(value.substring(value.indexOf(':') + 1));
            return id > 0 ? id : null;
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    private static String normalizeSortField(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }

    private static String normalizeSearchPattern(String search) {
        if (isBlank(search)) return null;
        return "%" + search.trim().toLowerCase(Locale.ROOT) + "%";
    }

    private static boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }

    private record OwnerFilter(Long ownerId, boolean unassigned) {
        static OwnerFilter all() { return new OwnerFilter(null, false); }
    }

    private static OwnerFilter parseOwnerFilter(String raw) {
        if (isBlank(raw) || "all".equalsIgnoreCase(raw)) return OwnerFilter.all();
        if ("unassigned".equalsIgnoreCase(raw)) return new OwnerFilter(null, true);
        try {
            long id = Long.parseLong(raw.trim());
            return id > 0 ? new OwnerFilter(id, false) : OwnerFilter.all();
        } catch (NumberFormatException ex) {
            return OwnerFilter.all();
        }
    }

    private enum Direction {
        ASC("asc"), DESC("desc");
        private final String sql;
        Direction(String sql) { this.sql = sql; }
        static Direction parse(String value) {
            return "desc".equalsIgnoreCase(value) ? DESC : ASC;
        }
    }
}
