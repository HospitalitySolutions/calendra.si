package com.example.app.ai;

import com.example.app.client.Client;
import com.example.app.client.ClientRepository;
import com.example.app.security.SecurityUtils;
import com.example.app.user.Role;
import com.example.app.session.BookableSlot;
import com.example.app.session.BookableSlotRepository;
import com.example.app.session.SessionBooking;
import com.example.app.session.SessionBookingController;
import com.example.app.session.SessionBookingCreationService;
import com.example.app.session.SessionBookingRepository;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.example.app.user.User;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.text.Normalizer;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZonedDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.server.ResponseStatusException;

@Service
public class VoiceBookingService {
    private static final DateTimeFormatter ISO_LOCAL = DateTimeFormatter.ISO_LOCAL_DATE_TIME;
    private static final Locale SLOVENIAN_LOCALE = Locale.forLanguageTag("sl-SI");

    private final OpenAiConfig openAiConfig;
    private final ClientRepository clientRepository;
    private final BookableSlotRepository bookableSlotRepository;
    private final SessionBookingRepository bookingRepository;
    private final SessionBookingCreationService bookingCreationService;
    private final AppSettingRepository settings;
    private final RestTemplate restTemplate = new RestTemplate();
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${app.reminders.timezone:Europe/Ljubljana}")
    private String remindersTimezone;

    public VoiceBookingService(
            OpenAiConfig openAiConfig,
            ClientRepository clientRepository,
            BookableSlotRepository bookableSlotRepository,
            SessionBookingRepository bookingRepository,
            SessionBookingCreationService bookingCreationService,
            AppSettingRepository settings) {
        this.openAiConfig = openAiConfig;
        this.clientRepository = clientRepository;
        this.bookableSlotRepository = bookableSlotRepository;
        this.bookingRepository = bookingRepository;
        this.bookingCreationService = bookingCreationService;
        this.settings = settings;
    }

    public record VoiceActionResponse(
            String action,
            String message,
            SessionBookingController.BookingResponse booking,
            Long bookingId,
            Long clientId,
            String clientName,
            LocalDateTime startTime,
            LocalDateTime endTime,
            boolean confirmationRequired
    ) {}

    @Transactional
    public VoiceActionResponse handleTranscript(String transcript, User me, boolean confirmCancellation) {
        if (!openAiConfig.isConfigured()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "OpenAI ni konfiguriran.");
        }
        if (transcript == null || transcript.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Besedilo je prazno.");
        }

        ZoneId zone = ZoneId.of(remindersTimezone);
        String todayIso = LocalDate.now(zone).toString();
        Long companyId = me.getCompany().getId();
        List<Client> visibleClients = SecurityUtils.isAdmin(me)
                ? clientRepository.findAllByCompanyId(companyId)
                : clientRepository.findByAssignedToIdAndCompanyId(me.getId(), companyId);
        visibleClients = visibleClients.stream().filter(c -> !c.isAnonymized()).toList();

        String transcriptText = transcript.trim();
        JsonNode parsed = callOpenAiForJson(transcriptText, todayIso, zone.getId(), visibleClients);
        ParsedVoiceFields fields = extractVoiceFields(parsed);
        boolean cancelIntent = isCancelIntent(fields.intent(), transcriptText);
        if ((!cancelIntent && !fields.completeForBook()) || (cancelIntent && !fields.completeForCancel())) {
            parsed = callOpenAiRepairJson(transcriptText, todayIso, zone.getId(), parsed, visibleClients);
            fields = extractVoiceFields(parsed);
            cancelIntent = isCancelIntent(fields.intent(), transcriptText);
        }
        if ((!cancelIntent && !fields.completeForBook()) || (cancelIntent && !fields.completeForCancel())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Iz povedanega ni bilo mogoče razbrati dovolj podatkov. Poskusite npr.: "
                            + "»Rezerviraj Tino Jekler ob štirinajstih 28. marca«, "
                            + "»Prekliči termin za Tino Jekler 28. marca« ali »Prekliči termin 28. marca«.");
        }

        String dateStr = fields.dateIso();
        String timeStr = fields.timeStr();

        LocalDate sessionDate;
        try {
            sessionDate = LocalDate.parse(dateStr);
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Neveljaven datum.");
        }

        LocalTime sessionTime = null;
        if (timeStr != null && !timeStr.isBlank()) {
            try {
                String t = timeStr.trim();
                if (t.length() == 5 && t.charAt(2) == ':') {
                    t = t + ":00";
                }
                sessionTime = LocalTime.parse(t);
            } catch (Exception e) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Neveljaven čas.");
            }
        }

        if (cancelIntent) {
            Long cancelClientId = null;
            String fn = fields.firstName();
            String ln = fields.lastName();
            if (fn != null && !fn.isBlank() && ln != null && !ln.isBlank()) {
                cancelClientId = resolveClientId(fn, ln, me, false);
            }
            return cancelFromVoice(me, sessionDate, sessionTime, cancelClientId, confirmCancellation);
        }

        long clientId = resolveClientId(fields.firstName(), fields.lastName(), me, false);
        enforceClientNameUppercase(clientId);
        if (sessionTime == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Za rezervacijo povejte tudi uro, npr. »ob 14:00«.");
        }

        int durationMinutes = defaultSessionLengthMinutes(companyId);
        if (parsed.has("durationMinutes") && !parsed.get("durationMinutes").isNull()) {
            int d = parsed.get("durationMinutes").asInt(0);
            if (d > 0 && d <= 24 * 60) {
                durationMinutes = d;
            }
        }

        LocalDateTime start = LocalDateTime.of(sessionDate, sessionTime);
        if (start.isBefore(LocalDateTime.now(zone))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Ta datum in ura sta že v preteklosti.");
        }
        LocalDateTime end = start.plusMinutes(durationMinutes);

        String startTime = start.format(ISO_LOCAL);
        String endTime = end.format(ISO_LOCAL);

        Long consultantId = SecurityUtils.isAdmin(me) ? me.getId() : null;
        var req = new SessionBookingController.BookingRequest(
                clientId,
                consultantId,
                startTime,
                endTime,
                null,
                null,
                "",
                null,
                false,
                null,
                null);

        long consultantForSlot = me.getId();
        if (isBookableEnabled(companyId) && !coversBookableSlot(companyId, consultantForSlot, start, end)) {
            throw new VoiceBookingFallbackException(
                    HttpStatus.BAD_REQUEST,
                    "Ta termin ni v razpoložljivem času (glede na nastavljeno zasedljivost).",
                    startTime,
                    endTime,
                    clientId,
                    VoiceBookingFallbackException.Reason.NOT_BOOKABLE);
        }

        try {
            var created = bookingCreationService.create(req, me);
            return new VoiceActionResponse(
                    "booked",
                    "Termin je uspešno rezerviran.",
                    created,
                    created.id(),
                    clientId,
                    created.client() != null
                            ? displayClientName(created.client().firstName(), created.client().lastName())
                            : null,
                    created.startTime(),
                    created.endTime(),
                    false);
        } catch (ResponseStatusException e) {
            if (HttpStatus.CONFLICT.equals(e.getStatusCode())) {
                throw new VoiceBookingFallbackException(
                        HttpStatus.CONFLICT,
                        "Ta termin je že zaseden ali se prekriva z drugim.",
                        startTime,
                        endTime,
                        clientId,
                        VoiceBookingFallbackException.Reason.CONFLICT);
            }
            throw e;
        }
    }

    private VoiceActionResponse cancelFromVoice(User me, LocalDate date, LocalTime time, Long clientId, boolean confirmCancellation) {
        Long companyId = me.getCompany().getId();
        List<SessionBooking> source = SecurityUtils.isAdmin(me)
                ? bookingRepository.findAllByCompanyId(companyId)
                : bookingRepository.findByConsultantIdAndCompanyId(me.getId(), companyId);

        List<SessionBooking> sameDate = source.stream()
                .filter(b -> b.getStartTime() != null && b.getStartTime().toLocalDate().equals(date))
                .filter(b -> clientId == null || (b.getClient() != null && b.getClient().getId().equals(clientId)))
                .toList();

        if (sameDate.isEmpty()) {
            if (clientId == null) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Na ta datum ni najdenega termina za preklic.");
            }
            throw new ResponseStatusException(HttpStatus.NOT_FOUND,
                    "Za to stranko na ta datum ni najdenega termina za preklic.");
        }

        SessionBooking target = null;
        if (time != null) {
            for (SessionBooking b : sameDate) {
                if (b.getStartTime().toLocalTime().equals(time)) {
                    target = b;
                    break;
                }
            }
        }

        if (target == null && sameDate.size() == 1) {
            target = sameDate.getFirst();
        }
        if (target == null) {
            if (clientId == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Na ta datum je več terminov različnih strank. Povejte tudi ime stranke ali točno uro.");
            }
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Za ta datum je več terminov te stranke. Povejte tudi točno uro termina za preklic.");
        }

        if (!SecurityUtils.isAdmin(me)
                && (target.getConsultant() == null || !target.getConsultant().getId().equals(me.getId()))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Lahko prekličete le svoje termine.");
        }

        Long targetClientId = target.getClient() != null ? target.getClient().getId() : null;
        String targetClientName = target.getClient() != null
                ? displayClientName(target.getClient().getFirstName(), target.getClient().getLastName())
                : null;

        if (!confirmCancellation) {
            return new VoiceActionResponse(
                    "cancel_review",
                    "Potrdite preklic termina.",
                    null,
                    target.getId(),
                    targetClientId,
                    targetClientName,
                    target.getStartTime(),
                    target.getEndTime(),
                    true);
        }

        bookingRepository.delete(target);
        return new VoiceActionResponse(
                "cancelled",
                "Termin je uspešno preklican.",
                null,
                target.getId(),
                targetClientId,
                targetClientName,
                target.getStartTime(),
                target.getEndTime(),
                false);
    }

    private boolean isCancelIntent(String rawIntent, String transcript) {
        String t = normalize(transcript).replaceAll("[^\\p{L}\\p{Nd}\\s]", " ");
        boolean transcriptSaysCancel = t.contains("prekli") || t.contains("odjavi") || t.contains("odpov")
                || t.contains("odpokl") || t.contains("zbri") || t.contains("izbri")
                || t.contains("storn") || t.contains("cancel") || t.contains("delete");
        if (transcriptSaysCancel) {
            return true;
        }

        if (rawIntent != null) {
            String v = rawIntent.trim().toLowerCase(Locale.ROOT);
            if ("cancel".equals(v) || "delete".equals(v) || "preklic".equals(v)
                    || v.contains("cancel") || v.contains("delete") || v.contains("preklic")
                    || v.contains("odpovej") || v.contains("odjavi") || v.contains("odpove")) {
                return true;
            }
            if ("book".equals(v) || "create".equals(v) || "rezerviraj".equals(v)) {
                return false;
            }
        }
        return false;
    }

    private long resolveClientId(String fn, String ln, User me, boolean allowCreateIfMissing) {
        Long companyId = me.getCompany().getId();
        List<Client> visible = SecurityUtils.isAdmin(me)
                ? clientRepository.findAllByCompanyId(companyId)
                : clientRepository.findByAssignedToIdAndCompanyId(me.getId(), companyId);
        visible = visible.stream().filter(c -> !c.isAnonymized()).toList();
        String nfn = normalize(fn);
        String nln = normalize(ln);
        List<Client> matches = new ArrayList<>();
        for (Client c : visible) {
            if (normalize(c.getFirstName()).equals(nfn) && normalize(c.getLastName()).equals(nln)) {
                matches.add(c);
            }
        }
        if (matches.isEmpty()) {
            Client fuzzy = findFuzzyClientMatch(visible, nfn, nln);
            if (fuzzy != null) {
                return fuzzy.getId();
            }
            if (allowCreateIfMissing) {
                return createClientForVoice(fn, ln, me).getId();
            }
            throw new ResponseStatusException(HttpStatus.NOT_FOUND,
                    "Stranka s tem imenom ni bila najdena. Odprite ročno rezervacijo in najprej potrdite ali ustvarite stranko.");
        }
        if (matches.size() > 1) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Več strank se ujema s tem imenom; izberite bolj natančno.");
        }
        return matches.getFirst().getId();
    }

    private Client findFuzzyClientMatch(List<Client> visible, String nfn, String nln) {
        if (nfn == null || nln == null || nfn.isBlank() || nln.isBlank()) {
            return null;
        }
        Client best = null;
        int bestScore = Integer.MAX_VALUE;
        int secondBestScore = Integer.MAX_VALUE;

        for (Client c : visible) {
            String cfn = normalize(c.getFirstName());
            String cln = normalize(c.getLastName());
            if (cfn.isBlank() || cln.isBlank()) {
                continue;
            }
            int df = levenshteinDistance(nfn, cfn);
            int dl = levenshteinDistance(nln, cln);
            int score = df + dl;

            // Safe fuzzy window: keep this strict to avoid wrong client matches.
            if (df > 2 || dl > 2 || score > 3) {
                continue;
            }

            if (score < bestScore) {
                secondBestScore = bestScore;
                bestScore = score;
                best = c;
            } else if (score < secondBestScore) {
                secondBestScore = score;
            }
        }

        if (best == null) {
            return null;
        }
        // Ambiguous fuzzy match: require manual clarification.
        if (secondBestScore == bestScore) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Ime stranke ni dovolj jasno (več podobnih ujemanj). Izgovorite ime in priimek bolj natančno.");
        }
        return best;
    }

    private static int levenshteinDistance(String a, String b) {
        if (a.equals(b)) {
            return 0;
        }
        int n = a.length();
        int m = b.length();
        if (n == 0) return m;
        if (m == 0) return n;

        int[] prev = new int[m + 1];
        int[] curr = new int[m + 1];
        for (int j = 0; j <= m; j++) {
            prev[j] = j;
        }
        for (int i = 1; i <= n; i++) {
            curr[0] = i;
            char ca = a.charAt(i - 1);
            for (int j = 1; j <= m; j++) {
                int cost = (ca == b.charAt(j - 1)) ? 0 : 1;
                curr[j] = Math.min(
                        Math.min(curr[j - 1] + 1, prev[j] + 1),
                        prev[j - 1] + cost
                );
            }
            int[] tmp = prev;
            prev = curr;
            curr = tmp;
        }
        return prev[m];
    }

    private boolean isBookableEnabled(Long companyId) {
        return settings.findByCompanyIdAndKey(companyId, SettingKey.BOOKABLE_ENABLED)
                .map(s -> !"false".equalsIgnoreCase(s.getValue().trim()))
                .orElse(true);
    }

    /**
     * True if the session interval lies fully inside at least one bookable slot for the consultant (same rules as calendar “availability” chunks).
     */
    private boolean coversBookableSlot(Long companyId, Long consultantId, LocalDateTime start, LocalDateTime end) {
        if (!start.toLocalDate().equals(end.toLocalDate())) {
            return false;
        }
        LocalDate sessionDate = start.toLocalDate();
        DayOfWeek dow = start.getDayOfWeek();
        LocalTime startT = start.toLocalTime();
        LocalTime endT = end.toLocalTime();
        List<BookableSlot> slots = bookableSlotRepository.findByConsultantIdAndCompanyId(consultantId, companyId);
        for (BookableSlot slot : slots) {
            if (slot.getDayOfWeek() != dow) {
                continue;
            }
            if (!slot.isIndefinite()) {
                if (slot.getStartDate() != null && sessionDate.isBefore(slot.getStartDate())) {
                    continue;
                }
                if (slot.getEndDate() != null && sessionDate.isAfter(slot.getEndDate())) {
                    continue;
                }
            }
            if (!slot.getStartTime().isAfter(startT) && !slot.getEndTime().isBefore(endT)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Creates a client assigned to the current user, same rules as manual client creation for consultants.
     * Admin users must be marked as consultants to create clients via voice.
     */
    private Client createClientForVoice(String firstName, String lastName, User me) {
        if (SecurityUtils.isAdmin(me) && !me.isConsultant() && me.getRole() != Role.CONSULTANT) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Glasovno rezerviranje ne more ustvariti nove stranke, ker vaš račun ni označen kot osebje. Stranko dodajte ročno ali uporabite račun svetovalca.");
        }
        var c = new Client();
        c.setCompany(me.getCompany());
        c.setFirstName(toUpperName(firstName));
        c.setLastName(toUpperName(lastName));
        c.setEmail(null);
        c.setPhone(null);
        c.setAssignedTo(me);
        return clientRepository.save(c);
    }

    private void enforceClientNameUppercase(Long clientId) {
        if (clientId == null) {
            return;
        }
        clientRepository.findById(clientId).ifPresent(client -> {
            String upFn = toUpperName(client.getFirstName());
            String upLn = toUpperName(client.getLastName());
            boolean changed = false;
            if (!upFn.equals(client.getFirstName())) {
                client.setFirstName(upFn);
                changed = true;
            }
            if (!upLn.equals(client.getLastName())) {
                client.setLastName(upLn);
                changed = true;
            }
            if (changed) {
                clientRepository.save(client);
            }
        });
    }

    private static String toUpperName(String s) {
        if (s == null) {
            return "";
        }
        return s.trim().toUpperCase(SLOVENIAN_LOCALE);
    }

    private static String displayClientName(String firstName, String lastName) {
        String fn = firstName == null ? "" : firstName.trim();
        String ln = lastName == null ? "" : lastName.trim();
        String full = (fn + " " + ln).trim();
        return full.isBlank() ? null : full;
    }

    private int defaultSessionLengthMinutes(Long companyId) {
        return settings.findByCompanyIdAndKey(companyId, SettingKey.SESSION_LENGTH_MINUTES)
                .map(s -> {
                    try {
                        int v = Integer.parseInt(s.getValue().trim());
                        return v > 0 ? v : 60;
                    } catch (NumberFormatException e) {
                        return 60;
                    }
                })
                .orElse(60);
    }

    private static String normalize(String s) {
        if (s == null) {
            return "";
        }
        String lower = s.trim().toLowerCase(Locale.ROOT);
        String folded = Normalizer.normalize(lower, Normalizer.Form.NFD).replaceAll("\\p{M}+", "");
        return folded.replaceAll("[^\\p{L}\\p{Nd}\\s]", "").replaceAll("\\s+", " ").trim();
    }

    private record ParsedVoiceFields(String intent, String firstName, String lastName, String dateIso, String timeStr) {
        boolean completeForBook() {
            return firstName != null && lastName != null && dateIso != null;
        }

        boolean completeForCancel() {
            return dateIso != null;
        }
    }

    /**
     * Maps many possible JSON shapes from the model into first/last name, YYYY-MM-DD, and HH:mm (or HH:mm:ss).
     */
    private ParsedVoiceFields extractVoiceFields(JsonNode parsed) {
        if (parsed == null || parsed.isNull()) {
            return new ParsedVoiceFields(null, null, null, null, null);
        }
        String intent = textOrNullAny(parsed, "intent", "action", "operation");
        String fn = textOrNullAny(parsed, "clientFirstName", "firstName", "givenName");
        String ln = textOrNullAny(parsed, "clientLastName", "lastName", "familyName", "surname");
        if (fn == null || ln == null) {
            String full = textOrNullAny(parsed, "clientName", "fullName", "name", "patientName", "client");
            if (full != null) {
                String t = full.trim().replaceAll("\\s+", " ");
                int last = t.lastIndexOf(' ');
                if (last > 0) {
                    if (fn == null) {
                        fn = t.substring(0, last).trim();
                    }
                    if (ln == null) {
                        ln = t.substring(last + 1).trim();
                    }
                }
            }
        }
        String dateStr = textOrNullAny(parsed, "date", "sessionDate", "appointmentDate", "day");
        String timeStr = textOrNullAny(parsed, "time", "startTime", "sessionTime", "appointmentTime", "clock");

        String dt = textOrNullAny(parsed, "startDateTime", "datetime", "localDateTime", "iso", "at");
        if (dt != null && (dateStr == null || timeStr == null)) {
            LocalDateTime ldt = parseLenientDateTime(dt);
            if (ldt != null) {
                if (dateStr == null) {
                    dateStr = ldt.toLocalDate().toString();
                }
                if (timeStr == null) {
                    timeStr = String.format("%02d:%02d", ldt.getHour(), ldt.getMinute());
                }
            }
        }

        if (dateStr != null) {
            dateStr = normalizeDateToIso(dateStr);
        }
        if (timeStr != null) {
            timeStr = normalizeTimeToHhMm(timeStr);
        }

        return new ParsedVoiceFields(intent, fn, ln, dateStr, timeStr);
    }

    private static String textOrNullAny(JsonNode node, String... fields) {
        for (String field : fields) {
            if (node != null && node.has(field) && !node.get(field).isNull()) {
                String v = node.get(field).asText();
                if (v != null && !v.isBlank()) {
                    return v.trim();
                }
            }
        }
        return null;
    }

    private static LocalDateTime parseLenientDateTime(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        String s = raw.trim();
        try {
            return LocalDateTime.parse(s, DateTimeFormatter.ISO_LOCAL_DATE_TIME);
        } catch (DateTimeParseException e1) {
            try {
                return OffsetDateTime.parse(s).toLocalDateTime();
            } catch (DateTimeParseException e2) {
                try {
                    return ZonedDateTime.parse(s).toLocalDateTime();
                } catch (DateTimeParseException e3) {
                    return null;
                }
            }
        }
    }

    /** Accept YYYY-MM-DD or trim; reject invalid. */
    private static String normalizeDateToIso(String dateStr) {
        if (dateStr == null) {
            return null;
        }
        String s = dateStr.trim();
        if (s.matches("\\d{4}-\\d{2}-\\d{2}")) {
            return s;
        }
        try {
            return LocalDate.parse(s).toString();
        } catch (DateTimeParseException e) {
            return null;
        }
    }

    /** Normalize to HH:mm:ss for {@link LocalTime#parse(CharSequence)}. */
    private static String normalizeTimeToHhMm(String timeStr) {
        if (timeStr == null) {
            return null;
        }
        String t = timeStr.trim();
        if (!t.matches("\\d{1,2}:\\d{2}(:\\d{2})?")) {
            return t;
        }
        try {
            String[] parts = t.split(":");
            int h = Integer.parseInt(parts[0]);
            int m = Integer.parseInt(parts[1]);
            int sec = parts.length > 2 ? Integer.parseInt(parts[2]) : 0;
            if (h < 0 || h > 23 || m < 0 || m > 59 || sec < 0 || sec > 59) {
                return t;
            }
            return String.format(Locale.ROOT, "%02d:%02d:%02d", h, m, sec);
        } catch (NumberFormatException e) {
            return t;
        }
    }

    private static String stripCodeFences(String content) {
        String s = content.strip();
        if (!s.startsWith("```")) {
            return s;
        }
        int firstNl = s.indexOf('\n');
        if (firstNl > 0) {
            s = s.substring(firstNl + 1);
        }
        if (s.endsWith("```")) {
            s = s.substring(0, s.length() - 3).strip();
        }
        return s;
    }

    private static String extractJsonObject(String s) {
        int start = s.indexOf('{');
        int end = s.lastIndexOf('}');
        if (start >= 0 && end > start) {
            return s.substring(start, end + 1);
        }
        return s;
    }

    private JsonNode parseModelJsonContent(String content) throws Exception {
        String stripped = stripCodeFences(content.trim());
        String json = extractJsonObject(stripped);
        return objectMapper.readTree(json);
    }

    private JsonNode callOpenAiRepairJson(String transcript, String todayIso, String zoneId, JsonNode partial, List<Client> knownClients) {
        String knownNamesPrompt = knownClientNamesPrompt(knownClients);
        String system = """
                Prejšnji JSON je bil nepopoln. Odgovori z enim samim JSON objektom, brez markdowna.
                Ključi:
                - intent (book ali cancel, obvezno)
                - clientFirstName, clientLastName (opcijsko za cancel, obvezno za book)
                - date (YYYY-MM-DD, obvezno)
                - time (24-urni HH:mm) je obvezen le za intent=book; za intent=cancel je lahko null ali prazen
                Izbirno: durationMinutes (število)

                Časovni pas: %s. Danes je: %s.
                Manjkajoče vrednosti dopolni iz slovenskega transkripta.
                Če uporabnik pri preklicu ne pove imena stranke, pusti clientFirstName in clientLastName prazna ali null.
                %s
                """.formatted(zoneId, todayIso, knownNamesPrompt);
        String userContent = "Uporabnik je rekel:\n" + transcript + "\n\nPrejšnji JSON (popravi):\n" + partial.toString();
        return postChatCompletion(system, userContent);
    }

    private JsonNode postChatCompletion(String system, String userContent) {
        try {
            String url = openAiConfig.getBaseUrl().replaceAll("/$", "") + "/chat/completions";
            var headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.setBearerAuth(openAiConfig.getApiKey());

            ObjectNode root = objectMapper.createObjectNode();
            root.put("model", openAiConfig.getModel());
            ObjectNode rf = objectMapper.createObjectNode();
            rf.put("type", "json_object");
            root.set("response_format", rf);
            ArrayNode messages = objectMapper.createArrayNode();
            ObjectNode sys = objectMapper.createObjectNode();
            sys.put("role", "system");
            sys.put("content", system);
            messages.add(sys);
            ObjectNode userMsg = objectMapper.createObjectNode();
            userMsg.put("role", "user");
            userMsg.put("content", userContent);
            messages.add(userMsg);
            root.set("messages", messages);

            String body = objectMapper.writeValueAsString(root);
            var entity = new HttpEntity<>(body, headers);
            var response = restTemplate.exchange(url, HttpMethod.POST, entity, String.class);
            String responseBody = response.getBody();
            if (responseBody == null || responseBody.isBlank()) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Prazen odgovor od OpenAI.");
            }
            JsonNode responseJson = objectMapper.readTree(responseBody);
            String content = responseJson.path("choices").path(0).path("message").path("content").asText();
            if (content == null || content.isBlank()) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Ni vsebine od OpenAI.");
            }
            return parseModelJsonContent(content);
        } catch (ResponseStatusException e) {
            throw e;
        } catch (HttpClientErrorException e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Zahteva OpenAI ni uspela: " + e.getStatusCode());
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Razčlenitev glasovne rezervacije ni uspela: " + e.getMessage());
        }
    }

    private JsonNode callOpenAiForJson(String transcript, String todayIso, String zoneId, List<Client> knownClients) {
        String knownNamesPrompt = knownClientNamesPrompt(knownClients);
        String system = """
                Iz slovenske izgovorjene ali napisane povedi izlušči podatke za rezervacijo ali preklic termina.
                Odgovori z enim samim JSON objektom, brez markdown okvirov. Uporabi točne ključe (angleška imena ključev):
                - intent (niz, obvezno) — "book" za rezervacijo ali "cancel" za preklic
                - clientFirstName (niz, za book obvezno, za cancel opcijsko) — ime stranke
                - clientLastName (niz, za book obvezno, za cancel opcijsko) — priimek stranke
                - date (niz, obvezno) — datum v obliki YYYY-MM-DD
                - time (niz, za book obvezno, za cancel opcijsko) — čas v 24-urnem zapisu HH:mm
                - durationMinutes (opcijsko število, trajanje v minutah)

                Pravila:
                - Časovni pas: %s. Današnji datum je %s.
                - Če leto ni povedano, izberi naslednji koledarski datum tega dne na ali po danes (v tem časovnem pasu).
                - Čas razumej iz slovenskih izrazov: »ob štirinajstih«, »ob 14.00«, »ob devetih zjutraj«, »dve popoldne«, »14:00« in jih pretvori v HH:mm.
                - Imeni loči ime in priimek (npr. »Tina Jekler« → clientFirstName Tina, clientLastName Jekler).
                - Za preklic prepoznaj izraze kot »prekliči«, »odjavi«, »zbriši termin«, »cancel« in nastavi intent na "cancel".
                - Za rezervacijo nastavi intent na "book".
                - Polji clientFirstName in clientLastName sta obvezni samo pri intent=book.
                - Pri intent=cancel lahko clientFirstName in clientLastName ostaneta prazni ali null, če uporabnik imena ne pove.
                - Polji intent in date morata biti vedno izpolnjeni; ne smeta biti null ali prazni.
                - Če je intent=book, mora biti izpolnjen tudi time.
                - Ne izmišljaj si imen strank. Če imena pri preklicu ni v povedi, ga ne dodajaj.
                %s
                """.formatted(zoneId, todayIso, knownNamesPrompt);

        return postChatCompletion(system, transcript);
    }

    private String knownClientNamesPrompt(List<Client> knownClients) {
        if (knownClients == null || knownClients.isEmpty()) {
            return "";
        }
        StringBuilder sb = new StringBuilder();
        sb.append("Poznane stranke (uporabi najbližje ime iz seznama, tudi če v prepisu manjkajo/so zamenjani strešice č/š/ž): ");
        int added = 0;
        for (Client c : knownClients) {
            if (c == null || c.getFirstName() == null || c.getLastName() == null) {
                continue;
            }
            String fn = c.getFirstName().trim();
            String ln = c.getLastName().trim();
            if (fn.isBlank() || ln.isBlank()) {
                continue;
            }
            if (added > 0) {
                sb.append("; ");
            }
            sb.append(fn).append(" ").append(ln);
            added++;
            if (added >= 200) {
                break;
            }
        }
        return added == 0 ? "" : sb.toString();
    }
}
