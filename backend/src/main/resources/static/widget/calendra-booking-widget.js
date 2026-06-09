(function () {
  const DEFAULTS = {
    baseUrl: 'https://app.calendra.si',
    tenant: '',
    locale: 'en',
    primaryColor: '',
    accentColor: '',
    mode: 'inline',
    mountSelector: null,
  };

  const TRANSLATIONS = {
    en: {
      badge: 'Calendra booking',
      title: 'Book your session',
      subtitle: 'Choose the service that best fits your needs.',
      dateTitle: 'Choose date and time',
      dateSubtitle: 'Choose a date and an available time that works best for you.',
      detailsTitle: 'Payment & review',
      detailsSubtitle: 'Review your details and complete your booking.',
      serviceHelp: 'Choose a service that best fits your needs. You will choose the date and time in the next step.',
      selectedService: 'Selected service',
      chooseConsultantOptional: 'Choose employee (optional)',
      chooseConsultantRequired: 'Choose employee',
      availableDate: 'Available date',
      unavailableDate: 'Unavailable',
      secureData: 'Your data is safe and protected.',
      poweredBy: 'Powered by Calendra',
      agreePrefix: 'I agree to',
      terms: 'Terms',
      privacy: 'Privacy Policy',
      agreeSuffix: 'and confirm that the entered data is correct.',
      paymentMethodApplePay: 'Apple Pay',
      paymentMethodApplePaySubtitle: 'Fast and secure payment with Apple Pay.',
      paymentMethodGooglePay: 'Google Pay',
      paymentMethodGooglePaySubtitle: 'Fast and secure payment with Google Pay.',
      loading: 'Loading booking widget…',
      loadingAvailability: 'Loading available times…',
      confirmed: 'Booking confirmed.',
      confirmationSent: 'Confirmation sent to',
      sectionService: 'Choose service',
      sectionConsultant: 'Choose employee',
      sectionDateTime: 'Choose date and time',
      sectionGuest: 'Payment & review',
      sectionGuestReviewOnly: 'Review booking',
      stepService: 'Service',
      stepConsultant: 'Employee',
      stepDateTime: 'Date & time',
      stepGuest: 'Payment & review',
      stepGuestReviewOnly: 'Review',
      payAtVenueNote: 'No online payment for this booking. You will pay at the venue according to the provider’s rules.',
      paymentMethodTitle: 'Payment method',
      paymentMethodCard: 'Online card payment',
      paymentMethodCardSubtitle: 'Pay securely with a credit or debit card.',
      paymentMethodBank: 'Bank transfer',
      paymentMethodBankSubtitle: 'Reserve now, pay via bank transfer with QR code.',
      paymentMethodPaypal: 'PayPal',
      paymentMethodPaypalSubtitle: 'Redirect to PayPal to approve the payment.',
      paymentMethodGiftCard: 'Gift card',
      paymentMethodGiftCardSubtitle: 'Use available gift card balance.',
      paymentMethodsNone: 'No online payment methods are available for this tenant.',
      summaryPayment: 'Payment',
      summaryFullPayment: 'Online payment',
      summaryPayAtVenue: 'Pay at venue',
      summaryDeposit: 'Deposit',
      summaryDueNow: 'Due today',
      summaryRemaining: 'Remaining at venue',
      depositPaymentNote: 'A deposit is charged now; the remainder is paid at the venue.',
      bankTransferTitle: 'Bank transfer instructions',
      bankTransferAmount: 'Amount',
      bankTransferReference: 'Reference',
      paypalRedirecting: 'Redirecting to PayPal…',
      payment: 'payment method',
      summaryTitle: 'Booking summary',
      summaryEmpty: 'Choose a service to begin.',
      summaryPrivacyTitle: 'Your booking is private and secure.',
      summaryPrivacyText: 'You can reschedule up to 24 hours before the appointment.',
      labelDate: 'Date',
      labelSlots: 'Available slots',
      labelTime: 'Time',
      labelFirstName: 'First name',
      labelLastName: 'Last name',
      labelEmail: 'Email',
      labelPhone: 'Phone',
      labelCompanyName: 'Company name (optional)',
      sectionEnterDetails: 'Enter your details',
      firstNamePlaceholder: 'First name',
      lastNamePlaceholder: 'Last name',
      emailPlaceholder: 'name@example.com',
      phonePlaceholder: 'Phone number',
      companyNamePlaceholder: 'Enter company name',
      summaryService: 'Service',
      summaryDateTime: 'Date',
      summaryTime: 'Time',
      summaryDuration: 'Duration',
      summaryEmployee: 'Employee',
      summaryConsultant: 'Employee',
      summaryTotal: 'Total',
      summaryPrice: 'Price',
      consultantRequiredHint: 'Choose a consultant to see available slots.',
      noSlots: 'No available slots for this date.',
      verificationRequired: 'Please complete the verification challenge.',
      noConsultants: 'No consultants available for this service.',
      chooseTime: 'Choose a time',
      refreshAvailability: 'Refresh availability',
      refreshSlots: 'Refresh slots',
      submit: 'Confirm booking',
      submitting: 'Booking…',
      continue: 'Continue',
      back: 'Back',
      bookAnother: 'Book another session',
      selectPlaceholder: 'Choose',
      completePrefix: 'Please complete:',
      chooseTimeError: 'Please choose a time.',
      failedToLoad: 'Failed to load booking widget.',
      failedToLoadAvailability: 'Failed to load availability.',
      failedToLoadConsultants: 'Failed to load consultants.',
      bookingFailed: 'Booking failed.',
      service: 'service',
      consultant: 'consultant',
      date: 'date',
      time: 'time',
      firstName: 'first name',
      lastName: 'last name',
      email: 'email',
      phone: 'phone',
      sessionFallback: 'Session',
      selected: 'Selected',
      monthPrev: 'Previous month',
      monthNext: 'Next month',
      weekdayShort: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'],
      durationSuffix: 'min',
      optionalConsultant: 'Assigned automatically',
      groupSessionsTitle: 'Open group sessions',
      groupSessionsSubtitle: 'Choose one of the existing group booking time slots for this service.',
      groupSessionAvailable: 'Open session',
      groupSessionSpotsLeft: 'spots left',
      groupSessionBooked: 'booked',
      groupSessionNoOptions: 'No open group sessions for this date.',
      groupSessionSelectionHint: 'Group bookings use the consultant already assigned to the selected group session, or a consultant can be assigned later.',
    },
    sl: {
      badge: 'Naročanje',
      title: 'Rezervirajte termin',
      subtitle: 'Izberite storitev, ki najbolj ustreza vašim potrebam.',
      dateTitle: 'Izberite datum in uro',
      dateSubtitle: 'Izberite datum in razpoložljiv termin, ki vam najbolj ustreza.',
      detailsTitle: 'Plačilo in pregled',
      detailsSubtitle: 'Preverite svoje podatke in dokončajte rezervacijo.',
      serviceHelp: 'Izberite storitev, ki najbolje ustreza vašim potrebam. Na naslednjem koraku boste izbrali datum in uro.',
      selectedService: 'Izbrana storitev',
      chooseConsultantOptional: 'Izberite svetovalca (neobvezno)',
      chooseConsultantRequired: 'Izberite svetovalca',
      availableDate: 'Razpoložljiv datum',
      unavailableDate: 'Ni na voljo',
      secureData: 'Vaši podatki so varni in zaščiteni.',
      poweredBy: 'Powered by Calendra',
      agreePrefix: 'Strinjam se s',
      terms: 'Splošnimi pogoji',
      privacy: 'Politiko zasebnosti',
      agreeSuffix: 'ter potrjujem, da so vneseni podatki pravilni.',
      paymentMethodApplePay: 'Apple Pay',
      paymentMethodApplePaySubtitle: 'Hitro in varno plačilo z Apple Pay.',
      paymentMethodGooglePay: 'Google Pay',
      paymentMethodGooglePaySubtitle: 'Hitro in varno plačilo z Google Pay.',
      loading: 'Nalagam booking widget…',
      loadingAvailability: 'Nalagam razpoložljive termine…',
      confirmed: 'Rezervacija potrjena.',
      confirmationSent: 'Potrditev poslana na',
      sectionService: 'Izberite storitev',
      sectionConsultant: 'Izberite zaposlenega',
      sectionDateTime: 'Izberite datum in uro',
      sectionGuest: 'Plačilo in pregled',
      sectionGuestReviewOnly: 'Pregled rezervacije',
      stepService: 'Storitev',
      stepConsultant: 'Zaposleni',
      stepDateTime: 'Datum in ura',
      stepGuest: 'Plačilo in pregled',
      stepGuestReviewOnly: 'Pregled',
      payAtVenueNote: 'Za to rezervacijo ni spletnega plačila. Plačilo poteka na lokaciji po pravilih ponudnika.',
      paymentMethodTitle: 'Način plačila',
      paymentMethodCard: 'Spletno plačilo s kartico',
      paymentMethodCardSubtitle: 'Plačajte varno s kreditno ali debetno kartico.',
      paymentMethodBank: 'Bančno nakazilo',
      paymentMethodBankSubtitle: 'Rezervirajte zdaj, plačajte prek bančnega nakazila s QR kodo.',
      paymentMethodPaypal: 'PayPal',
      paymentMethodPaypalSubtitle: 'Preusmeritev na PayPal za potrditev plačila.',
      paymentMethodGiftCard: 'Darilni bon',
      paymentMethodGiftCardSubtitle: 'Uporabite razpoložljivo dobroimetje darilnega bona.',
      paymentMethodsNone: 'Za to tenancy ni na voljo spletnih načinov plačila.',
      summaryPayment: 'Plačilo',
      summaryFullPayment: 'Spletno plačilo',
      summaryPayAtVenue: 'Plačilo na lokaciji',
      summaryDeposit: 'Delno plačilo',
      summaryDueNow: 'Plačilo danes',
      summaryRemaining: 'Preostanek na lokaciji',
      depositPaymentNote: 'Ob rezervaciji se zaračuna delno plačilo; preostanek se poravna na lokaciji.',
      bankTransferTitle: 'Navodila za bančno nakazilo',
      bankTransferAmount: 'Znesek',
      bankTransferReference: 'Sklic',
      paypalRedirecting: 'Preusmerjanje na PayPal…',
      payment: 'način plačila',
      summaryTitle: 'Povzetek rezervacije',
      summaryEmpty: 'Za začetek izberite storitev.',
      summaryPrivacyTitle: 'Vaša rezervacija je zasebna in varna.',
      summaryPrivacyText: 'Termin lahko prestavite do 24 ur pred rezervacijo.',
      labelDate: 'Datum',
      labelSlots: 'Razpoložljivi termini',
      labelTime: 'Ura',
      labelFirstName: 'Ime',
      labelLastName: 'Priimek',
      labelEmail: 'E-pošta',
      labelPhone: 'Telefon',
      labelCompanyName: 'Naziv podjetja (neobvezno)',
      sectionEnterDetails: 'Vnesite podatke',
      firstNamePlaceholder: 'Ime',
      lastNamePlaceholder: 'Priimek',
      emailPlaceholder: 'npr. ime@email.si',
      phonePlaceholder: 'Vpišite telefonsko številko',
      companyNamePlaceholder: 'Vpišite naziv podjetja',
      summaryService: 'Storitev',
      summaryDateTime: 'Datum',
      summaryTime: 'Ura',
      summaryDuration: 'Trajanje',
      summaryEmployee: 'Zaposleni',
      summaryConsultant: 'Svetovalec',
      summaryTotal: 'Skupaj',
      summaryPrice: 'Cena',
      consultantRequiredHint: 'Najprej izberite svetovalca za prikaz prostih terminov.',
      noSlots: 'Za izbrani datum ni prostih terminov.',
      verificationRequired: 'Izpolnite varnostni preveritveni izziv.',
      noConsultants: 'Za to storitev ni razpoložljivih svetovalcev.',
      chooseTime: 'Izberite uro',
      refreshAvailability: 'Osveži razpoložljivost',
      refreshSlots: 'Osveži termine',
      submit: 'Potrdi rezervacijo',
      submitting: 'Rezerviram…',
      continue: 'Naprej',
      back: 'Nazaj',
      bookAnother: 'Rezerviraj nov termin',
      selectPlaceholder: 'Izberite',
      completePrefix: 'Izpolnite:',
      chooseTimeError: 'Izberite uro.',
      failedToLoad: 'Widgeta ni bilo mogoče naložiti.',
      failedToLoadAvailability: 'Razpoložljivosti ni bilo mogoče naložiti.',
      failedToLoadConsultants: 'Svetovalcev ni bilo mogoče naložiti.',
      bookingFailed: 'Rezervacija ni uspela.',
      service: 'storitev',
      consultant: 'svetovalec',
      date: 'datum',
      time: 'ura',
      firstName: 'ime',
      lastName: 'priimek',
      email: 'e-pošta',
      phone: 'telefon',
      sessionFallback: 'Termin',
      selected: 'Izbrano',
      monthPrev: 'Prejšnji mesec',
      monthNext: 'Naslednji mesec',
      weekdayShort: ['Po', 'To', 'Sr', 'Če', 'Pe', 'So', 'Ne'],
      durationSuffix: 'min',
      optionalConsultant: 'Dodeli se samodejno',
      groupSessionsTitle: 'Odprte skupinske ure',
      groupSessionsSubtitle: 'Izberite enega od obstoječih skupinskih terminov za to storitev.',
      groupSessionAvailable: 'Odprta ura',
      groupSessionSpotsLeft: 'prostih mest',
      groupSessionBooked: 'prijavljenih',
      groupSessionNoOptions: 'Za ta datum ni odprtih skupinskih ur.',
      groupSessionSelectionHint: 'Za skupinske rezervacije se uporabi že dodeljeni svetovalec izbranega skupinskega termina, lahko pa se svetovalec določi tudi pozneje.',
    },
  };

  const escapeHtml = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  const parseOptionalNumber = (value) => {
    if (value == null || value === '' || value === 'null' || value === 'undefined') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const parseIsoDate = (value) => {
    if (!value || typeof value !== 'string') return null;
    const [year, month, day] = value.split('-').map(Number);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
    return new Date(year, month - 1, day);
  };

  const formatIsoDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const firstOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);

  const addMonths = (date, offset) => new Date(date.getFullYear(), date.getMonth() + offset, 1);

  const sameMonth = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();

  class CalendraBookingWidget extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this.state = {
        loading: true,
        saving: false,
        loadingAvailability: false,
        error: '',
        config: null,
        services: [],
        consultants: [],
        selectedServiceId: null,
        selectedConsultantId: null,
        selectedDate: '',
        calendarMonth: '',
        slots: [],
        groupSessions: [],
        selectedSlot: null,
        selectedGroupSession: null,
        manualTime: '',
        activeStep: 'service',
        form: { firstName: '', lastName: '', email: '', phone: '', companyName: '' },
        bookingSuccess: null,
        turnstileToken: '',
        turnstileWidgetId: null,
        turnstileRenderedSiteKey: null,
        paymentMethod: null,
        paymentMethodVariant: '',
        termsAccepted: true,
        paymentResult: null,
      };
      this.options = { ...DEFAULTS };
      this.resizeObserver = null;
      this.handleWindowResize = null;
      this.turnstileRenderScheduled = false;
      this.turnstileRendering = false;
      this.ensureTurnstileScript = this.ensureTurnstileScript.bind(this);
    }

    static get observedAttributes() {
      return ['tenant', 'base-url', 'locale', 'primary-color', 'accent-color'];
    }

    connectedCallback() {
      this.readOptions();
      this.observeLayout();
      this.render();
      this.bootstrap().catch((error) => {
        this.setState({
          loading: false,
          error: this.normalizeError(error, this.text().failedToLoad),
        });
      });
    }

    disconnectedCallback() {
      if (this.resizeObserver) {
        this.resizeObserver.disconnect();
        this.resizeObserver = null;
      }
      if (this.handleWindowResize) {
        window.removeEventListener('resize', this.handleWindowResize);
        this.handleWindowResize = null;
      }
    }

    attributeChangedCallback() {
      this.readOptions();
      this.render();
    }

    text() {
      const locale = String(this.options?.locale || DEFAULTS.locale || 'en').toLowerCase();
      return locale.startsWith('sl') ? TRANSLATIONS.sl : TRANSLATIONS.en;
    }

    shouldRenderTurnstile() {
      return Boolean(
        this.state?.activeStep === 'details' &&
        this.state?.config?.turnstileEnabled &&
        this.state?.config?.turnstileSiteKey
      );
    }

    observeLayout() {
      const update = () => {
        const width = this.getBoundingClientRect().width || this.clientWidth || window.innerWidth || 0;
        this.applyLayoutMode(width);
      };

      update();

      if (typeof ResizeObserver !== 'undefined') {
        this.resizeObserver = new ResizeObserver((entries) => {
          const entry = entries[0];
          const width = entry?.contentRect?.width || this.getBoundingClientRect().width || this.clientWidth || window.innerWidth || 0;
          this.applyLayoutMode(width);
        });
        this.resizeObserver.observe(this);
        return;
      }

      this.handleWindowResize = update;
      window.addEventListener('resize', this.handleWindowResize);
    }

    applyLayoutMode(width) {
      const next = width <= 480
        ? 'micro'
        : width <= 680
          ? 'narrow'
          : width <= 960
            ? 'compact'
            : 'wide';

      if (this.getAttribute('data-layout') !== next) {
        this.setAttribute('data-layout', next);
      }
    }

    readOptions() {
      this.options = {
        ...DEFAULTS,
        tenant: this.getAttribute('tenant') || this.dataset.tenant || DEFAULTS.tenant,
        baseUrl: this.getAttribute('base-url') || this.dataset.baseUrl || DEFAULTS.baseUrl,
        locale: this.getAttribute('locale') || this.dataset.locale || DEFAULTS.locale,
        primaryColor: this.getAttribute('primary-color') || this.dataset.primaryColor || DEFAULTS.primaryColor,
        accentColor: this.getAttribute('accent-color') || this.dataset.accentColor || DEFAULTS.accentColor,
      };

      const computed = getComputedStyle(this);
      const inheritedPrimary = computed.getPropertyValue('--calendra-primary').trim()
        || computed.getPropertyValue('--brand-primary').trim()
        || computed.getPropertyValue('--primary-color').trim()
        || computed.color.trim();
      const inheritedAccent = computed.getPropertyValue('--calendra-accent').trim()
        || computed.getPropertyValue('--brand-accent').trim()
        || computed.getPropertyValue('--accent-color').trim()
        || inheritedPrimary;

      this.options.primaryColor = this.options.primaryColor || inheritedPrimary || '#1672f3';
      this.options.accentColor = this.options.accentColor || inheritedAccent || this.options.primaryColor || '#f9941f';
    }

    async bootstrap() {
      if (!this.options.tenant) {
        throw new Error('Missing tenant code. Set the tenant attribute on <calendra-booking-widget>.');
      }

      const [config, services] = await Promise.all([
        this.fetchJson(`/api/public/widget/${encodeURIComponent(this.options.tenant)}/config`),
        this.fetchJson(`/api/public/widget/${encodeURIComponent(this.options.tenant)}/services`),
      ]);

      const selectedServiceId = services.length ? services[0].id : null;
      const selectedDate = this.todayInWidgetTimezone();

      const defaultPaymentMethod = this.defaultPaymentMethod(config);

      this.setState({
        loading: false,
        config,
        services,
        selectedServiceId,
        selectedDate,
        calendarMonth: this.monthKeyForDate(selectedDate),
        paymentMethod: defaultPaymentMethod,
        paymentMethodVariant: defaultPaymentMethod ? defaultPaymentMethod.toLowerCase() : '',
        activeStep: 'service',
      });

      await this.loadConsultantsAndAvailability();
      if (this.state.config?.turnstileEnabled && this.state.config?.turnstileSiteKey) {
        await this.ensureTurnstileScript();
      }
    }

    todayInWidgetTimezone() {
      const now = new Date();
      return formatIsoDate(now);
    }

    monthKeyForDate(value) {
      const date = parseIsoDate(value) || new Date();
      return formatIsoDate(firstOfMonth(date));
    }

    stepDefinitions() {
      const t = this.text();
      return [
        { id: 'service', label: t.stepService },
        { id: 'datetime', label: t.stepDateTime },
        { id: 'details', label: this.requiresOnlinePaymentChoice() ? t.stepGuest : t.stepGuestReviewOnly },
      ];
    }

    defaultPaymentMethod(config = this.state.config) {
      const allowed = config?.allowedPaymentMethods || this.allowedPaymentMethods();
      if (allowed?.card) return 'CARD';
      if (allowed?.bankTransfer) return 'BANK_TRANSFER';
      if (allowed?.paypal) return 'PAYPAL';
      if (allowed?.giftCard) return 'GIFT_CARD';
      return null;
    }

    activeStepHeadline() {
      const t = this.text();
      if (this.state.bookingSuccess) return t.confirmed;
      if (this.state.activeStep === 'datetime') return t.dateTitle || t.sectionDateTime;
      if (this.state.activeStep === 'details') return this.requiresOnlinePaymentChoice() ? (t.detailsTitle || t.sectionGuest) : t.sectionGuestReviewOnly;
      return t.title;
    }

    activeStepSubtitle() {
      const t = this.text();
      if (this.state.bookingSuccess) return t.confirmationSent;
      if (this.state.activeStep === 'datetime') return t.dateSubtitle || t.subtitle;
      if (this.state.activeStep === 'details') return t.detailsSubtitle || t.summaryPrivacyText;
      return t.subtitle;
    }

    calendraLogoMarkup() {
      return `
        <span class="calendra-mark" aria-hidden="true">
          <svg viewBox="0 0 36 30" xmlns="http://www.w3.org/2000/svg" focusable="false">
            <rect x="6" y="4" width="24" height="21" rx="7" fill="#0f6bff" opacity=".12"/>
            <path d="M25 6.5h-9.4c-5.1 0-9.3 4.1-9.3 9.2s4.2 9.2 9.3 9.2h9.4" fill="none" stroke="#f28c18" stroke-width="5" stroke-linecap="round"/>
            <path d="M15.7 6.5H25c5.1 0 9.3 4.1 9.3 9.2" fill="none" stroke="#1284ff" stroke-width="5" stroke-linecap="round"/>
            <path d="M13 2.5v5M23 2.5v5" stroke="#1284ff" stroke-width="3" stroke-linecap="round"/>
          </svg>
        </span>`;
    }

    uiIcon(name) {
      const icons = {
        calendar: '<svg class="line-icon" viewBox="0 0 24 24"><path d="M7 3v3M17 3v3M4 9h16M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/></svg>',
        group: '<svg class="line-icon" viewBox="0 0 24 24"><path d="M16 11a4 4 0 1 0-8 0M3 20a7 7 0 0 1 18 0M18 11.5a3 3 0 0 1 4 2.8M6 11.5a3 3 0 0 0-4 2.8"/></svg>',
        phone: '<svg class="line-icon" viewBox="0 0 24 24"><path d="M6.6 4.5 9 3l3 5-2 1.5a10 10 0 0 0 4.5 4.5L16 12l5 3-1.5 2.4a3 3 0 0 1-3.1 1.4C10.2 17.5 6.5 13.8 5.2 7.6a3 3 0 0 1 1.4-3.1z"/></svg>',
        screen: '<svg class="line-icon" viewBox="0 0 24 24"><path d="M4 5h16v11H4zM9 20h6M12 16v4"/></svg>',
        card: '<svg class="line-icon" viewBox="0 0 24 24"><path d="M3 7h18v10H3zM3 10h18M7 15h4"/></svg>',
        clock: '<svg class="line-icon" viewBox="0 0 24 24"><path d="M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/></svg>',
        tag: '<svg class="line-icon" viewBox="0 0 24 24"><path d="M20 13 13 20 4 11V4h7l9 9zM8 8h.01"/></svg>',
        user: '<svg class="line-icon" viewBox="0 0 24 24"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0"/></svg>',
        shield: '<svg class="line-icon" viewBox="0 0 24 24"><path d="M12 3 5 6v5c0 4.5 2.8 8.5 7 10 4.2-1.5 7-5.5 7-10V6l-7-3zM9 12l2 2 4-5"/></svg>',
        check: '<svg class="line-icon" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>',
        arrowRight: '<svg class="line-icon" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
        arrowLeft: '<svg class="line-icon" viewBox="0 0 24 24"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>',
      };
      return icons[name] || icons.calendar;
    }

    serviceIconMarkup(item, index = 0) {
      const text = `${item?.name || ''} ${item?.description || ''}`.toLowerCase();
      let icon = 'calendar';
      if (/group|skup|delavnica|class|razred|team/.test(text)) icon = 'group';
      else if (/phone|telef|call|klic/.test(text)) icon = 'phone';
      else if (/online|splet|video|zoom|meet/.test(text)) icon = 'screen';
      else if (index % 4 === 1) icon = 'group';
      else if (index % 4 === 2) icon = 'phone';
      else if (index % 4 === 3) icon = 'screen';
      return `<span class="service-icon service-icon--${icon}">${this.uiIcon(icon)}</span>`;
    }

    consultantAvatarMarkup(item) {
      return `<span class="consultant-avatar">${escapeHtml(this.initials(item?.name))}</span>`;
    }


    shouldShowConsultantStep() {
      if (this.currentServiceSupportsGroupSessions()) return false;
      // Tenant-level override: when the "Employee selection step" setting is ON in
      // Configuration -> Guest app, always show the employee step; when OFF, never show it.
      return Boolean(this.state.config?.employeeSelectionStep);
    }

    ensureValidActiveStep(nextState) {
      const steps = this.stepDefinitions();
      const activeStep = nextState?.activeStep || this.state.activeStep;
      if (steps.some((step) => step.id === activeStep)) return activeStep;
      return steps[0]?.id || 'service';
    }

    activeStepIndex() {
      const steps = this.stepDefinitions();
      return Math.max(0, steps.findIndex((step) => step.id === this.state.activeStep));
    }

    goToNextStep() {
      const steps = this.stepDefinitions();
      const index = this.activeStepIndex();
      const next = steps[index + 1];
      if (!next) return;

      this.setState({ activeStep: next.id, error: '' });

      if (next.id === 'details') {
        this.scheduleTurnstileMount();
      }
    }

    goToPreviousStep() {
      const steps = this.stepDefinitions();
      const index = this.activeStepIndex();
      const previous = steps[index - 1];
      if (!previous) return;

      if (this.state.activeStep === 'details') {
        this.resetTurnstile();
      }

      this.setState({ activeStep: previous.id, error: '' });
    }

    async fetchJson(path, options) {
      const response = await fetch(`${this.options.baseUrl}${path}`, {
        method: options?.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(options?.headers || {}),
        },
        body: options?.body ? JSON.stringify(options.body) : undefined,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.message || `Request failed with status ${response.status}`);
      }
      return data;
    }

    async loadConsultantsAndAvailability() {
      await this.loadConsultants();
      await this.loadAvailability();
    }

    async loadConsultants() {
      if (!this.state.selectedServiceId) {
        this.setState({ consultants: [], selectedConsultantId: null, slots: [], groupSessions: [], selectedSlot: null, selectedGroupSession: null, activeStep: 'service' });
        return;
      }

      if (this.currentServiceSupportsGroupSessions()) {
        const nextActiveStep = this.state.activeStep === 'consultant' ? 'datetime' : this.state.activeStep;
        this.setState({
          consultants: [],
          selectedConsultantId: null,
          selectedSlot: null,
          selectedGroupSession: null,
          groupSessions: [],
          manualTime: '',
          error: '',
          activeStep: nextActiveStep,
        });
        return;
      }

      try {
        const consultants = await this.fetchJson(
          `/api/public/widget/${encodeURIComponent(this.options.tenant)}/consultants?typeId=${encodeURIComponent(this.state.selectedServiceId)}`
        );
        const existingSelectionStillValid = consultants.some((consultant) => consultant.id === this.state.selectedConsultantId);
        // Don't auto-pick when the tenant-level step is ON: the user must actively confirm an employee.
        const selectedConsultantId = !this.shouldShowConsultantStep() && consultants.length === 1
          ? consultants[0].id
          : existingSelectionStillValid
            ? this.state.selectedConsultantId
            : null;

        const nextActiveStep = this.state.activeStep === 'consultant' && !this.shouldShowConsultantStep()
          ? 'datetime'
          : this.state.activeStep;

        this.setState({
          consultants,
          selectedConsultantId,
          selectedSlot: null,
          selectedGroupSession: null,
          groupSessions: [],
          manualTime: '',
          error: '',
          activeStep: nextActiveStep,
        });
      } catch (error) {
        this.setState({
          consultants: [],
          selectedConsultantId: null,
          slots: [],
          groupSessions: [],
          selectedSlot: null,
          selectedGroupSession: null,
          manualTime: '',
          error: this.normalizeError(error, this.text().failedToLoadConsultants),
        });
      }
    }

    async loadAvailability() {
      const { selectedServiceId, selectedDate, consultants, selectedConsultantId, config } = this.state;
      if (!selectedServiceId || !selectedDate) return;

      const supportsGroupSessions = this.currentServiceSupportsGroupSessions();
      // When the employee-selection step is on we wait for the user to pick a consultant
      // before loading slots; without the step we show merged slots for all consultants.
      const consultantRequiredForRegularSlots = !supportsGroupSessions
        && this.shouldShowConsultantStep()
        && config?.availabilityEnabled
        && !selectedConsultantId;

      if (!config?.availabilityEnabled && !supportsGroupSessions) {
        this.setState({ slots: [], groupSessions: [], selectedSlot: null, selectedGroupSession: null, loadingAvailability: false, error: '' });
        return;
      }

      this.setState({ error: '', slots: [], groupSessions: [], selectedSlot: null, selectedGroupSession: null, loadingAvailability: true });
      try {
        const params = new URLSearchParams({
          typeId: String(selectedServiceId),
          date: selectedDate,
        });
        if (selectedConsultantId != null) {
          params.set('consultantId', String(selectedConsultantId));
        }
        const data = await this.fetchJson(`/api/public/widget/${encodeURIComponent(this.options.tenant)}/availability?${params.toString()}`);
        this.setState({
          slots: supportsGroupSessions ? [] : (consultantRequiredForRegularSlots ? [] : (data.slots || [])),
          groupSessions: data.groupSessions || [],
          loadingAvailability: false,
        });
      } catch (error) {
        this.setState({ loadingAvailability: false, error: this.normalizeError(error, this.text().failedToLoadAvailability) });
      }
    }

    setState(patch) {
      const previousSiteKey = this.state?.config?.turnstileSiteKey || null;
      const previousActiveStep = this.state?.activeStep;

      this.state = { ...this.state, ...patch };
      this.state.activeStep = this.ensureValidActiveStep(this.state);

      const nextSiteKey = this.state?.config?.turnstileSiteKey || null;
      if ((previousSiteKey && previousSiteKey !== nextSiteKey) || (previousActiveStep === 'details' && this.state.activeStep !== 'details')) {
        this.resetTurnstile();
      }

      this.render();
    }

    normalizeError(error, fallback) {
      return error instanceof Error ? error.message : fallback;
    }

    updateForm(field, value) {
      this.state.form = { ...this.state.form, [field]: value };
    }

    currentService() {
      return this.state.services.find((item) => item.id === this.state.selectedServiceId) || null;
    }

    currentConsultant() {
      return this.state.consultants.find((item) => item.id === this.state.selectedConsultantId) || null;
    }

    currentSummaryConsultant() {
      if (this.state.selectedGroupSession?.consultantName) {
        return {
          name: this.state.selectedGroupSession.consultantName,
        };
      }
      return this.currentConsultant();
    }

    currentServiceSupportsGroupSessions() {
      const maxParticipants = this.currentService()?.maxParticipantsPerSession;
      return maxParticipants != null && maxParticipants !== '';
    }

    consultantSelectionOptional() {
      return this.currentServiceSupportsGroupSessions();
    }

    selectedTimeLabel() {
      if (this.state.selectedGroupSession) {
        return this.state.selectedGroupSession.label || '';
      }
      if (this.state.config?.availabilityEnabled) {
        return this.state.selectedSlot?.label || '';
      }
      return this.state.manualTime || '';
    }

    isStepComplete(stepId) {
      const { form } = this.state;
      if (stepId === 'service') return Boolean(this.state.selectedServiceId);
      if (stepId === 'consultant') return !this.shouldShowConsultantStep() || this.consultantSelectionOptional() || Boolean(this.state.selectedConsultantId);
      if (stepId === 'datetime') {
        if (!this.state.selectedDate) return false;
        if (this.shouldShowConsultantStep() && !this.consultantSelectionOptional() && !this.state.selectedConsultantId) return false;
        if (this.state.selectedGroupSession) return true;
        return this.state.config?.availabilityEnabled ? Boolean(this.state.selectedSlot) : Boolean(this.state.manualTime);
      }
      if (stepId === 'details') {
        const hasGuestDetails = Boolean(form.firstName.trim() && form.lastName.trim() && form.email.trim() && form.phone.trim());
        const hasPayment =
          !this.requiresOnlinePaymentChoice()
          || (Boolean(this.state.paymentMethod) && this.isPaymentMethodAvailable(this.state.paymentMethod));
        return hasGuestDetails && hasPayment && this.state.termsAccepted !== false;
      }
      return false;
    }

    allowedPaymentMethods() {
      return this.state.config?.allowedPaymentMethods || { card: false, bankTransfer: false, paypal: false, giftCard: false };
    }

    /** When false, widget books with PAY_AT_VENUE (session widget only; backend enforces). */
    requiresOnlinePaymentChoice() {
      return this.state.config?.requireOnlinePayment !== false;
    }

    paymentRequirement() {
      const raw = String(this.state.config?.paymentRequirement || (this.requiresOnlinePaymentChoice() ? 'full' : 'none')).toLowerCase();
      if (raw === 'deposit' || raw === 'none') return raw;
      return 'full';
    }

    depositPercent() {
      const raw = Number(this.state.config?.depositPercent ?? 20);
      if (!Number.isFinite(raw)) return 20;
      return Math.max(1, Math.min(100, Math.round(raw)));
    }

    parsePriceLabel(priceLabel) {
      const raw = String(priceLabel || '').trim();
      if (!raw) return null;
      const match = raw.match(/-?\d+(?:[,.]\d+)?/);
      if (!match) return null;
      const value = Number(match[0].replace(',', '.'));
      if (!Number.isFinite(value)) return null;
      const start = match.index || 0;
      return {
        value,
        prefix: raw.slice(0, start).trim(),
        suffix: raw.slice(start + match[0].length).trim(),
        decimals: /[,.]\d/.test(match[0]) ? 2 : 0,
      };
    }

    formatMoneyAmount(amount, priceInfo) {
      const normalized = Math.max(0, Number(amount) || 0);
      const decimals = priceInfo?.decimals ?? (Math.round(normalized) === normalized ? 0 : 2);
      const locale = this.locale() === 'sl' ? 'sl-SI' : 'en-US';
      const formatted = new Intl.NumberFormat(locale, { minimumFractionDigits: decimals, maximumFractionDigits: 2 }).format(normalized);
      if (priceInfo?.prefix) return `${priceInfo.prefix}${formatted}`;
      if (priceInfo?.suffix) return `${formatted} ${priceInfo.suffix}`;
      return formatted;
    }

    detailsPaymentSummaryMarkup(service) {
      if (this.state.activeStep !== 'details' || !service) return '';
      const t = this.text();
      const paymentRow = (label, value, strong = false) => value ? `
        <div class="summary-row summary-row--payment">
          <span class="summary-row-icon">${this.uiIcon('card')}</span>
          <span class="summary-row-label">${escapeHtml(label)}</span>
          ${strong ? `<strong class="summary-row-value">${escapeHtml(value)}</strong>` : `<span class="summary-row-value">${escapeHtml(value)}</span>`}
        </div>
      ` : '';
      const requirement = this.paymentRequirement();
      if (!this.requiresOnlinePaymentChoice() || requirement === 'none') {
        return `
          <div class="summary-divider" aria-hidden="true"></div>
          ${paymentRow(t.summaryPayment, t.summaryPayAtVenue, true)}
        `;
      }
      if (requirement !== 'deposit') {
        return `
          <div class="summary-divider" aria-hidden="true"></div>
          ${paymentRow(t.summaryPayment, t.summaryFullPayment, true)}
        `;
      }
      const priceInfo = this.parsePriceLabel(service.priceLabel);
      const depositLabel = priceInfo
        ? this.formatMoneyAmount(priceInfo.value * this.depositPercent() / 100, priceInfo)
        : `${this.depositPercent()}%`;
      const remainingLabel = priceInfo
        ? this.formatMoneyAmount(priceInfo.value - (priceInfo.value * this.depositPercent() / 100), priceInfo)
        : '';
      return `
        <div class="summary-divider" aria-hidden="true"></div>
        ${paymentRow(t.summaryPayment, t.summaryDeposit, true)}
        ${paymentRow(t.summaryDueNow, depositLabel, true)}
        ${remainingLabel ? paymentRow(t.summaryRemaining, remainingLabel, true) : ''}
        <p class="summary-payment-note">${escapeHtml(t.depositPaymentNote)}</p>
      `;
    }

    isPaymentMethodAvailable(method) {
      const allowed = this.allowedPaymentMethods();
      if (method === 'CARD') return Boolean(allowed.card);
      if (method === 'BANK_TRANSFER') return Boolean(allowed.bankTransfer);
      if (method === 'PAYPAL') return Boolean(allowed.paypal);
      if (method === 'GIFT_CARD') return Boolean(allowed.giftCard);
      return false;
    }

    // Inline brand logos for the payment method picker. Kept inline so the widget
    // doesn't incur extra network requests and no third-party assets are pulled in.
    paymentMethodLogos(type) {
      if (type === 'CARD') {
        return `
          <span class="pm-logo-row">
            <svg class="pm-logo pm-logo-visa" viewBox="0 0 48 18" xmlns="http://www.w3.org/2000/svg" aria-label="Visa">
              <path fill="#1A1F71" d="M20.4 17.2h-3.9L19 .8h3.9l-2.5 16.4zM33.7 1.2C32.9.9 31.7.5 30.1.5c-4.1 0-7 2.2-7 5.3 0 2.3 2.1 3.6 3.7 4.4 1.6.8 2.2 1.3 2.2 2 0 1.1-1.3 1.6-2.5 1.6-1.7 0-2.6-.3-3.9-.9l-.5-.3-.6 3.5c1 .5 2.8.8 4.7.9 4.4 0 7.2-2.2 7.3-5.5 0-1.8-1.1-3.2-3.5-4.3-1.5-.7-2.4-1.2-2.4-1.9 0-.6.7-1.3 2.3-1.3 1.3 0 2.3.3 3 .6l.4.2.6-3.4zM39 11.5c.3-.8 1.6-4.3 1.6-4.3 0 .1.3-.9.5-1.4l.3 1.3s.8 3.8.9 4.4H39zm4.9-10.7h-3c-.9 0-1.6.3-2.1 1.3l-5.8 15.1h4.1s.7-1.9.8-2.3h5c.1.5.4 2.3.4 2.3h3.6L43.9.8zM13.8.8l-3.8 11.2-.4-2.1C8.9 7.4 6.6 4.7 4 3.4l3.5 13.8h4.4L18.2.8h-4.4z"/>
              <path fill="#F9A51A" d="M6.3.8H.2L.1 1.2c4.8 1.2 8 4.2 9.4 7.7L7.9 2.1C7.7 1.1 7 .8 6.3.8z"/>
            </svg>
            <svg class="pm-logo pm-logo-mc" viewBox="0 0 36 22" xmlns="http://www.w3.org/2000/svg" aria-label="Mastercard">
              <circle cx="13" cy="11" r="9" fill="#EB001B"/>
              <circle cx="23" cy="11" r="9" fill="#F79E1B"/>
              <path fill="#FF5F00" d="M18 4.2a9 9 0 0 0 0 13.6 9 9 0 0 0 0-13.6z"/>
            </svg>
          </span>
        `;
      }
      if (type === 'BANK_TRANSFER') {
        return `
          <svg class="pm-logo pm-logo-qr" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-label="QR code">
            <path fill="currentColor" d="M3 3h10v10H3V3zm2 2v6h6V5H5zm2 2h2v2H7V7zm12-4h10v10H19V3zm2 2v6h6V5h-6zm2 2h2v2h-2V7zM3 19h10v10H3V19zm2 2v6h6v-6H5zm2 2h2v2H7v-2zm10-4h2v2h-2v-2zm4 0h2v2h-2v-2zm4 0h2v4h-4v-2h2v-2zm-8 4h2v2h2v2h-4v-4zm8 0h2v2h-2v-2zm-4 4h2v2h-2v-2zm4 0h4v2h-4v-2z"/>
          </svg>
        `;
      }
      if (type === 'GIFT_CARD') {
        return '<span class="pm-logo pm-logo-gift" aria-label="Gift card">🎁</span>';
      }
      if (type === 'PAYPAL') {
        return `
          <svg class="pm-logo pm-logo-paypal" viewBox="0 0 60 18" xmlns="http://www.w3.org/2000/svg" aria-label="PayPal">
            <path fill="#003087" d="M7.5 1.8H3.1c-.3 0-.6.2-.6.5L.7 13.9c0 .2.1.4.3.4h2.1c.3 0 .6-.2.6-.5l.5-3.1c0-.3.3-.5.6-.5h1.4c2.9 0 4.6-1.4 5-4.2.2-1.2 0-2.2-.6-2.9-.7-.8-1.9-1.3-3.1-1.3zm.5 4.2c-.2 1.5-1.4 1.5-2.5 1.5h-.6L5.4 4h.7c.8 0 1.5 0 1.9.5.2.2.3.6.2 1.5z"/>
            <path fill="#003087" d="M22.5 5.9h-2.1c-.2 0-.3.1-.3.3l-.1.6-.1-.2c-.4-.6-1.4-.8-2.4-.8-2.3 0-4.3 1.7-4.7 4.2-.2 1.2.1 2.4.8 3.2.6.8 1.6 1.1 2.7 1.1 1.9 0 2.9-1.2 2.9-1.2l-.1.6c0 .2.1.4.3.4h1.9c.3 0 .6-.2.6-.5l1.1-7.3c.1-.2-.1-.4-.5-.4zm-2.9 4.1c-.2 1.2-1.1 2-2.3 2-.6 0-1.1-.2-1.4-.5-.3-.4-.4-.9-.3-1.5.2-1.2 1.1-2 2.3-2 .6 0 1.1.2 1.4.5.3.4.4.9.3 1.5z"/>
            <path fill="#003087" d="M33.5 5.9h-2.1c-.2 0-.4.1-.5.3L28 10.4 26.8 6.3c-.1-.3-.3-.4-.6-.4h-2.1c-.2 0-.4.2-.3.5l2.3 6.8-2.2 3.1c-.2.2 0 .6.3.6h2.1c.2 0 .4-.1.5-.3l7.1-10.1c.2-.3 0-.6-.4-.6z"/>
            <path fill="#009CDE" d="M40.5 1.8h-4.4c-.3 0-.6.2-.6.5l-1.8 11.6c0 .2.1.4.3.4H36c.2 0 .4-.2.4-.4l.5-3.3c0-.3.3-.5.6-.5h1.4c2.9 0 4.6-1.4 5-4.2.2-1.2 0-2.2-.6-2.9-.6-.7-1.9-1.2-3.1-1.2zm.5 4.2c-.2 1.5-1.4 1.5-2.5 1.5h-.6L38.4 4h.7c.8 0 1.5 0 1.9.5.2.2.2.6.1 1.5z"/>
            <path fill="#009CDE" d="M55.5 5.9h-2.1c-.2 0-.3.1-.3.3l-.1.6-.1-.2c-.4-.6-1.4-.8-2.4-.8-2.3 0-4.3 1.7-4.7 4.2-.2 1.2.1 2.4.8 3.2.6.8 1.6 1.1 2.7 1.1 1.9 0 2.9-1.2 2.9-1.2l-.1.6c0 .2.1.4.3.4h1.9c.3 0 .6-.2.6-.5l1.1-7.3c.1-.2-.1-.4-.5-.4zm-2.9 4.1c-.2 1.2-1.1 2-2.3 2-.6 0-1.1-.2-1.4-.5-.3-.4-.4-.9-.3-1.5.2-1.2 1.1-2 2.3-2 .6 0 1.1.2 1.4.5.3.4.4.9.3 1.5z"/>
            <path fill="#009CDE" d="M58 2.1l-1.8 11.8c0 .2.1.4.3.4h1.8c.3 0 .6-.2.6-.5l1.8-11.6c0-.2-.1-.4-.3-.4h-2c-.2 0-.4.2-.4.3z"/>
          </svg>
        `;
      }
      return '';
    }

    initials(name) {
      const safe = String(name || '').trim();
      if (!safe) return '•';
      return safe.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('');
    }

    validateCurrentStep() {
      const t = this.text();
      const missing = [];

      if (this.state.activeStep === 'service' && !this.state.selectedServiceId) missing.push(t.service);
      if (this.state.activeStep === 'consultant' && this.shouldShowConsultantStep() && !this.consultantSelectionOptional() && !this.state.selectedConsultantId) missing.push(t.consultant);

      if (this.state.activeStep === 'datetime') {
        if (!this.state.selectedDate) missing.push(t.date);
        if (this.shouldShowConsultantStep() && !this.consultantSelectionOptional() && !this.state.selectedConsultantId) missing.push(t.consultant);
        if (!this.state.selectedGroupSession) {
          if (this.state.config?.availabilityEnabled && !this.state.selectedSlot) missing.push(t.time);
          if (!this.state.config?.availabilityEnabled && !this.state.manualTime) missing.push(t.time);
        }
      }

      if (this.state.activeStep === 'details') {
        if (!this.state.form.firstName.trim()) missing.push(t.firstName);
        if (!this.state.form.lastName.trim()) missing.push(t.lastName);
        if (!this.state.form.email.trim()) missing.push(t.email);
        if (!this.state.form.phone.trim()) missing.push(t.phone);
        if (
          this.requiresOnlinePaymentChoice()
          && (!this.state.paymentMethod || !this.isPaymentMethodAvailable(this.state.paymentMethod))
        ) {
          missing.push(t.payment);
        }

        if (this.state.termsAccepted === false) {
          missing.push(t.terms);
        }

        if (this.state.config?.turnstileEnabled && !this.state.turnstileToken) {
          missing.push(t.verificationRequired);
        }
      }

      if (missing.length) {
        this.setState({ error: `${t.completePrefix} ${missing.join(', ')}.` });
        return false;
      }

      this.setState({ error: '' });
      return true;
    }

    async ensureTurnstileScript() {
      if (window.turnstile) return window.turnstile;

      if (window.__calendraTurnstilePromise) {
        return window.__calendraTurnstilePromise;
      }

      window.__calendraTurnstilePromise = new Promise((resolve, reject) => {
        const existing = document.querySelector('script[data-calendra-turnstile]');
        if (existing) {
          const waitForTurnstile = () => {
            if (window.turnstile) resolve(window.turnstile);
            else setTimeout(waitForTurnstile, 50);
          };
          waitForTurnstile();
          return;
        }

        const script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.defer = true;
        script.dataset.calendraTurnstile = 'true';

        script.onload = () => {
          const waitForTurnstile = () => {
            if (window.turnstile) resolve(window.turnstile);
            else setTimeout(waitForTurnstile, 50);
          };
          waitForTurnstile();
        };

        script.onerror = () => reject(new Error('Failed to load Cloudflare Turnstile script.'));
        document.head.appendChild(script);
      });

      return window.__calendraTurnstilePromise;
    }

    ensureLightDomTurnstileHost() {
      let host = this.querySelector('[slot="turnstile-slot"]');
      if (!host) {
        host = document.createElement('div');
        host.setAttribute('slot', 'turnstile-slot');
        host.className = 'calendra-turnstile-light-dom-host';
        this.appendChild(host);
      }

      host.style.display = 'block';
      host.style.width = '100%';
      host.style.minHeight = '65px';
      host.style.overflow = 'hidden';

      return host;
    }

    removeLightDomTurnstileHost() {
      const host = this.querySelector('[slot="turnstile-slot"]');
      if (host) host.remove();
    }

    resetTurnstile() {
      this.turnstileRenderScheduled = false;
      this.turnstileRendering = false;

      if (this.state.turnstileWidgetId != null && window.turnstile) {
        try {
          window.turnstile.remove(this.state.turnstileWidgetId);
        } catch (_) {}
      }

      const host = this.querySelector('[slot="turnstile-slot"]');
      if (host) host.innerHTML = '';

      this.state.turnstileWidgetId = null;
      this.state.turnstileToken = '';
      this.state.turnstileRenderedSiteKey = null;
    }

    scheduleTurnstileMount() {
      if (!this.shouldRenderTurnstile()) return;
      if (this.state.turnstileWidgetId != null) return;
      if (this.turnstileRenderScheduled || this.turnstileRendering) return;

      this.turnstileRenderScheduled = true;
      requestAnimationFrame(() => {
        this.turnstileRenderScheduled = false;
        this.mountTurnstileOnce();
      });
    }

    async mountTurnstileOnce() {
      if (!this.shouldRenderTurnstile()) return;
      if (this.state.turnstileWidgetId != null) return;
      if (this.turnstileRendering) return;

      this.turnstileRendering = true;
      try {
        await this.renderTurnstileWidget();
      } catch (error) {
        console.error('Turnstile render failed', error);
        this.setState({
          turnstileToken: '',
          error: this.normalizeError(error, 'Verification widget failed to load.'),
        });
      } finally {
        this.turnstileRendering = false;
      }
    }

    async renderTurnstileWidget() {
      if (!this.shouldRenderTurnstile()) {
        this.resetTurnstile();
        this.removeLightDomTurnstileHost();
        return;
      }

      if (this.state.turnstileWidgetId != null) return;

      const config = this.state.config;
      const host = this.ensureLightDomTurnstileHost();
      if (!host) throw new Error('Turnstile light DOM host could not be created.');

      await this.ensureTurnstileScript();
      if (!window.turnstile) throw new Error('Cloudflare Turnstile script loaded, but window.turnstile is unavailable.');

      host.innerHTML = '';

      const widgetId = window.turnstile.render(host, {
        sitekey: config.turnstileSiteKey,
        theme: 'auto',
        appearance: 'always',
        callback: (token) => {
          this.setState({
            turnstileToken: token || '',
            error: '',
          });
        },
        'expired-callback': () => {
          console.warn('Turnstile token expired');
          this.resetTurnstile();
          this.setState({ turnstileToken: '', error: 'Verification expired. Please complete it again.' });
          this.scheduleTurnstileMount();
        },
        'error-callback': (code) => {
          console.error('Turnstile error', code);
          this.resetTurnstile();
          this.setState({ turnstileToken: '', error: `Verification widget error: ${code || 'unknown'}` });
          this.scheduleTurnstileMount();
        },
      });

      this.state.turnstileWidgetId = widgetId;
      this.state.turnstileRenderedSiteKey = config.turnstileSiteKey;
    }

    async submitBooking() {
      if (!this.validateCurrentStep()) return;

      const { selectedServiceId, selectedDate, selectedSlot, selectedConsultantId, form, config, paymentMethod } = this.state;
      const effectivePaymentMethod = this.requiresOnlinePaymentChoice() ? paymentMethod : 'PAY_AT_VENUE';
      const t = this.text();

      // Slot is required — the full flow is only intended for slot-based availability.
      if (!config?.availabilityEnabled || !selectedSlot) {
        this.setState({ error: `${t.completePrefix} ${t.time}.`, activeStep: 'datetime' });
        return;
      }
      if (!selectedDate) {
        this.setState({ error: `${t.completePrefix} ${t.date}.`, activeStep: 'datetime' });
        return;
      }

      this.setState({ saving: true, error: '' });

      try {
        const tenant = encodeURIComponent(this.options.tenant);

        // Step A: exchange first/last/email/phone + Turnstile token for a short-lived guest JWT.
        const session = await this.fetchJson(`/api/public/widget/${tenant}/guest-session`, {
          method: 'POST',
          body: {
            firstName: form.firstName.trim(),
            lastName: form.lastName.trim(),
            email: form.email.trim(),
            phone: form.phone.trim(),
            companyName: form.companyName?.trim() || null,
            turnstileToken: this.state.turnstileToken || null,
          },
        });

        if (!session?.token) {
          throw new Error(t.bookingFailed || 'Booking failed.');
        }

        const authHeaders = { Authorization: `Bearer ${session.token}` };

        // Step B: create the order. The consultant is encoded into the slotId by the backend.
        // We still include selectedConsultantId when the employee step is used so the slot can be
        // resolved unambiguously for single-consultant tenants.
        const slotId = selectedSlot.slotId || selectedSlot.id;
        if (!slotId) {
          throw new Error('Slot identifier missing.');
        }

        const productId = `session-${selectedServiceId}`;

        const createResponse = await this.fetchJson(`/api/public/widget/${tenant}/orders`, {
          method: 'POST',
          headers: authHeaders,
          body: {
            companyId: session.companyId || '',
            productId,
            slotId,
            paymentMethodType: effectivePaymentMethod,
          },
        });

        const orderId = createResponse?.order?.orderId;
        if (!orderId) {
          throw new Error(t.bookingFailed || 'Booking failed.');
        }

        // Step C: checkout according to the selected payment method.
        const checkout = await this.fetchJson(`/api/public/widget/${tenant}/orders/${encodeURIComponent(orderId)}/checkout`, {
          method: 'POST',
          headers: {
            ...authHeaders,
            'Idempotency-Key': (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : String(Date.now()) + '-' + Math.random().toString(36).slice(2)),
          },
          body: { paymentMethodType: effectivePaymentMethod },
        });

        // PayPal: redirect the user to the PayPal approval URL (returned as `checkoutUrl`).
        if (effectivePaymentMethod === 'PAYPAL' && checkout?.checkoutUrl) {
          this.setState({ saving: false, paymentResult: { type: 'PAYPAL', approveUrl: checkout.checkoutUrl } });
          window.location.href = checkout.checkoutUrl;
          return;
        }

        this.setState({
          saving: false,
          bookingSuccess: {
            id: orderId,
            serviceName: this.currentService()?.name,
            startsAtLabel: selectedSlot.label,
            startTime: selectedSlot.startTime,
            email: form.email.trim(),
          },
          paymentResult: checkout ? { type: effectivePaymentMethod, ...checkout } : null,
          selectedSlot: null,
          selectedGroupSession: null,
        });
      } catch (error) {
        this.setState({ saving: false, error: this.normalizeError(error, t.bookingFailed) });
      }
    }

    resetForAnotherBooking() {
      this.resetTurnstile();

      const selectedDate = this.todayInWidgetTimezone();
      const defaultPaymentMethod = this.defaultPaymentMethod();
      this.setState({
        bookingSuccess: null,
        error: '',
        saving: false,
        selectedDate,
        calendarMonth: this.monthKeyForDate(selectedDate),
        selectedSlot: null,
        selectedGroupSession: null,
        groupSessions: [],
        manualTime: '',
        form: { firstName: '', lastName: '', email: '', phone: '', companyName: '' },
        paymentMethod: defaultPaymentMethod,
        paymentMethodVariant: defaultPaymentMethod ? defaultPaymentMethod.toLowerCase() : '',
        termsAccepted: true,
        paymentResult: null,
        activeStep: 'datetime',
      });

      void this.loadAvailability();
    }

    monthLabel() {
      const monthDate = parseIsoDate(this.state.calendarMonth) || new Date();
      const locale = String(this.options?.locale || DEFAULTS.locale || 'en').toLowerCase().startsWith('sl')
        ? 'sl-SI'
        : 'en-US';
      return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(monthDate);
    }

    displaySelectedDate() {
      const date = parseIsoDate(this.state.selectedDate);
      if (!date) return '';
      const locale = String(this.options?.locale || DEFAULTS.locale || 'en').toLowerCase().startsWith('sl')
        ? 'sl-SI'
        : 'en-US';
      return new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date);
    }

    buildCalendarCells() {
      const monthDate = parseIsoDate(this.state.calendarMonth) || firstOfMonth(new Date());
      const monthStart = firstOfMonth(monthDate);
      const nextMonthStart = addMonths(monthStart, 1);
      const totalDays = Math.round((nextMonthStart - monthStart) / 86400000);
      const lead = (monthStart.getDay() + 6) % 7;
      const totalCells = Math.ceil((lead + totalDays) / 7) * 7;
      const today = parseIsoDate(this.todayInWidgetTimezone()) || new Date();
      const selectedDate = this.state.selectedDate;
      const cells = [];

      for (let index = 0; index < totalCells; index += 1) {
        const dayOffset = index - lead;
        const cellDate = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1 + dayOffset);
        const iso = formatIsoDate(cellDate);
        const inMonth = sameMonth(cellDate, monthStart);
        const disabled = iso < formatIsoDate(today);
        cells.push({
          iso,
          day: cellDate.getDate(),
          inMonth,
          disabled,
          selected: selectedDate === iso,
          today: iso === formatIsoDate(today),
        });
      }

      return cells;
    }

    calendarMarkup() {
      const t = this.text();
      const todayMonth = this.monthKeyForDate(this.todayInWidgetTimezone());
      const prevDisabled = this.state.calendarMonth <= todayMonth;
      const cells = this.buildCalendarCells();

      return `
        <div class="calendar-card">
          <div class="calendar-header">
            <button type="button" class="calendar-nav" data-action="month-prev" ${prevDisabled ? 'disabled' : ''} aria-label="${escapeHtml(t.monthPrev)}">‹</button>
            <div class="calendar-title">${escapeHtml(this.monthLabel())}</div>
            <button type="button" class="calendar-nav" data-action="month-next" aria-label="${escapeHtml(t.monthNext)}">›</button>
          </div>
          <div class="calendar-weekdays">
            ${t.weekdayShort.map((item) => `<span>${escapeHtml(item)}</span>`).join('')}
          </div>
          <div class="calendar-grid">
            ${cells.map((cell) => {
              const isAvailable = !cell.disabled && cell.inMonth;
              return `
                <button
                  type="button"
                  class="calendar-cell ${cell.inMonth ? '' : 'is-outside'} ${cell.disabled ? 'is-unavailable' : ''} ${cell.selected ? 'is-selected' : ''} ${cell.today ? 'is-today' : ''}"
                  data-action="calendar-date"
                  data-date="${escapeHtml(cell.iso)}"
                  ${cell.disabled ? 'disabled' : ''}
                >
                  <span>${escapeHtml(cell.day)}</span>
                  ${isAvailable ? '<i aria-hidden="true"></i>' : ''}
                </button>
              `;
            }).join('')}
          </div>
          <div class="calendar-legend">
            <span><i class="legend-dot legend-dot--available"></i>${escapeHtml(t.availableDate)}</span>
            <span><i class="legend-dot legend-dot--unavailable"></i>${escapeHtml(t.unavailableDate)}</span>
          </div>
        </div>
      `;
    }

    summaryMarkup() {
      const t = this.text();
      const service = this.currentService();
      const consultant = this.currentSummaryConsultant();
      const selectedTime = this.selectedTimeLabel();
      const dateLabel = this.displaySelectedDate();
      const durationMinutes = service?.durationMinutes || this.state.config?.sessionLengthMinutes || 60;
      const consultantName = consultant?.name || this.state.selectedSlot?.consultantName || '';

      if (!service && !dateLabel && !selectedTime && !consultantName) {
        return `
          <aside class="summary-card ${this.state.activeStep === 'details' ? 'summary-card--final' : ''}">
            <div class="summary-heading">${escapeHtml(t.summaryTitle)}</div>
            <div class="empty empty--compact">${escapeHtml(t.summaryEmpty)}</div>
          </aside>
        `;
      }

      const row = (icon, label, value) => value ? `
        <div class="summary-row">
          <span class="summary-row-icon">${this.uiIcon(icon)}</span>
          <span class="summary-row-label">${escapeHtml(label)}</span>
          <strong class="summary-row-value">${escapeHtml(value)}</strong>
        </div>
      ` : '';

      return `
        <aside class="summary-card ${this.state.activeStep === 'details' ? 'summary-card--final' : ''}">
          <div class="summary-heading">${escapeHtml(t.summaryTitle)}</div>
          <div class="summary-rows">
            ${row('user', t.summaryService, service?.name || '')}
            ${row('calendar', t.summaryDateTime, dateLabel)}
            ${row('clock', t.summaryTime || t.labelTime, selectedTime)}
            ${row('clock', t.summaryDuration, service ? `${durationMinutes} ${t.durationSuffix}` : '')}
            ${row('tag', t.summaryPrice, service?.priceLabel || '')}
            ${row('user', t.summaryConsultant || t.summaryEmployee, consultantName)}
          </div>
          ${service?.priceLabel ? `
            <div class="summary-divider" aria-hidden="true"></div>
            <div class="summary-total-row">
              <span>${escapeHtml(t.summaryTotal || t.summaryPrice)}</span>
              <strong>${escapeHtml(service.priceLabel)}</strong>
            </div>
          ` : ''}
          ${this.detailsPaymentSummaryMarkup(service)}
        </aside>
      `;
    }

    privacyNoteMarkup() {
      const t = this.text();
      return `
        <aside class="summary-card summary-card--privacy">
          <div class="summary-heading">${escapeHtml(t.summaryTitle)}</div>
          <div class="summary-note">
            <div class="summary-note-icon">
              <svg viewBox="0 0 20 20" width="12" height="12"><path d="M4 10.5 8 14l8-8.5" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </div>
            <div>
              <strong>${escapeHtml(t.summaryPrivacyTitle)}</strong>
              <p>${escapeHtml(t.summaryPrivacyText)}</p>
            </div>
          </div>
        </aside>
      `;
    }

    renderProgress() {
      const steps = this.stepDefinitions();
      const activeIndex = this.activeStepIndex();
      return `
        <div class="progress" role="list">
          ${steps.map((step, index) => {
            const isDone = index < activeIndex || (index === activeIndex && this.state.bookingSuccess);
            const isActive = index === activeIndex && !this.state.bookingSuccess;
            return `
              <div class="progress-item ${isDone ? 'is-done' : ''} ${isActive ? 'is-active' : ''}" role="listitem">
                <span class="progress-dot">${isDone ? this.uiIcon('check') : index + 1}</span>
                <span class="progress-label">${escapeHtml(step.label)}</span>
              </div>
            `;
          }).join('<div class="progress-sep"></div>')}
        </div>
      `;
    }

    renderStepContent() {
      const t = this.text();
      const service = this.currentService();
      const showConsultantPicker = this.shouldShowConsultantStep();

      if (this.state.bookingSuccess) {
        const bt = this.state.paymentResult?.type === 'BANK_TRANSFER' ? this.state.paymentResult.bankTransfer : null;
        return `
          <div class="success-screen">
            <div class="success-icon">${this.uiIcon('check')}</div>
            <div class="success-title">${escapeHtml(t.confirmed)}</div>
            <p class="success-copy">
              ${escapeHtml(this.state.bookingSuccess.serviceName || service?.name || t.sessionFallback)} · ${escapeHtml(this.state.bookingSuccess.startsAtLabel || this.state.bookingSuccess.startTime || '')}
            </p>
            <p class="success-copy">${escapeHtml(t.confirmationSent)} ${escapeHtml(this.state.bookingSuccess.email || this.state.form.email)}.</p>
            ${bt ? `
              <div class="bank-transfer-box">
                <div class="bank-transfer-title">${escapeHtml(t.bankTransferTitle)}</div>
                <div class="bank-transfer-row"><span>${escapeHtml(t.bankTransferAmount)}:</span> <strong>${escapeHtml(String(bt.amount))} ${escapeHtml(bt.currency || '')}</strong></div>
                <div class="bank-transfer-row"><span>${escapeHtml(t.bankTransferReference)}:</span> <strong>${escapeHtml(bt.referenceCode || '')}</strong></div>
                ${bt.instructions ? `<p class="bank-transfer-instructions">${escapeHtml(bt.instructions)}</p>` : ''}
              </div>
            ` : ''}
            <button class="primary" type="button" data-action="restart">${escapeHtml(t.bookAnother)}</button>
          </div>
        `;
      }

      if (this.state.activeStep === 'service') {
        return `
          <section class="panel-section panel-section--service">
            <div class="section-copy">
              <h3>${escapeHtml(t.sectionService)}</h3>
              <p>${escapeHtml(t.serviceHelp || t.subtitle)}</p>
            </div>
            <div class="service-grid">
              ${this.state.services.map((item, index) => `
                <button class="service-card ${this.state.selectedServiceId === item.id ? 'is-active' : ''}" type="button" data-action="service" data-id="${item.id}">
                  ${this.serviceIconMarkup(item, index)}
                  <span class="service-card-main">
                    <span class="service-card-title">${escapeHtml(item.name)}</span>
                    ${item.description ? `<span class="service-card-body">${escapeHtml(item.description)}</span>` : ''}
                    <span class="service-card-meta">
                      <span>${this.uiIcon('clock')}${escapeHtml(String(item.durationMinutes || this.state.config?.sessionLengthMinutes || 60))} ${escapeHtml(t.durationSuffix)}</span>
                      ${item.priceLabel ? `<b>·</b><strong>${escapeHtml(item.priceLabel)}</strong>` : ''}
                    </span>
                  </span>
                  <span class="service-card-check">${this.uiIcon('check')}</span>
                </button>
              `).join('')}
            </div>
            <div class="panel-actions panel-actions--footer">
              <div class="trust-note">${this.uiIcon('shield')}<span>${escapeHtml(t.secureData)}</span></div>
              <button class="primary" type="button" data-action="next" ${!service ? 'disabled' : ''}>${escapeHtml(t.continue)} ${this.uiIcon('arrowRight')}</button>
            </div>
          </section>
        `;
      }

      if (this.state.activeStep === 'datetime') {
        const consultantCards = showConsultantPicker && !this.currentServiceSupportsGroupSessions() ? `
          <div class="consultants-block">
            <div class="block-title">${escapeHtml(this.consultantSelectionOptional() ? t.chooseConsultantOptional : t.chooseConsultantRequired)}</div>
            <div class="consultant-row">
              ${this.state.consultants.length ? this.state.consultants.map((item) => `
                <button class="consultant-pill ${this.state.selectedConsultantId === item.id ? 'is-active' : ''}" type="button" data-action="consultant" data-id="${item.id}">
                  <span class="radio-dot"></span>
                  ${this.consultantAvatarMarkup(item)}
                  <span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(t.stepConsultant)}</small></span>
                </button>
              `).join('') : `<div class="empty">${escapeHtml(t.noConsultants)}</div>`}
            </div>
          </div>
        ` : '';

        const groupSessionsMarkup = `
          <div class="times-card times-card--clean">
            <div class="block-title">${escapeHtml(t.groupSessionsTitle)}</div>
            <p class="block-subtitle">${escapeHtml(t.groupSessionsSubtitle)}</p>
            ${this.state.loadingAvailability
              ? `<div class="loading-inline">${escapeHtml(t.loadingAvailability)}</div>`
              : this.state.groupSessions.length
                ? `<div class="slot-grid">${this.state.groupSessions.map((session) => `
                    <button
                      class="slot-chip ${this.state.selectedGroupSession?.id === session.id ? 'is-active' : ''}"
                      type="button"
                      data-action="group-session"
                      data-id="${session.id}"
                      data-start="${escapeHtml(session.startTime)}"
                      data-end="${escapeHtml(session.endTime)}"
                      data-label="${escapeHtml(session.label)}"
                      data-consultant-id="${session.consultantId == null ? '' : session.consultantId}"
                      data-consultant-name="${escapeHtml(session.consultantName || '')}"
                      data-remaining-spots="${session.remainingSpots == null ? '' : session.remainingSpots}"
                      data-booked-participants="${session.bookedParticipants == null ? '' : session.bookedParticipants}"
                    >
                      <span>${escapeHtml(session.label)}</span>
                      ${session.remainingSpots != null ? `<small>${escapeHtml(String(session.remainingSpots))} ${escapeHtml(t.groupSessionSpotsLeft)}</small>` : ''}
                    </button>
                  `).join('')}</div>`
                : `<div class="empty">${escapeHtml(t.groupSessionNoOptions)}</div>`}
          </div>
        `;

        const slotsMarkup = `
          <div class="times-card times-card--clean">
            <div class="times-head">
              <div>
                <div class="block-title">${escapeHtml(t.chooseTime)}</div>
                <p class="block-subtitle">${escapeHtml(this.displaySelectedDate())}</p>
              </div>
              <button class="text-link" type="button" data-action="refresh">${escapeHtml(this.state.config?.availabilityEnabled ? t.refreshAvailability : t.refreshSlots)}</button>
            </div>
            ${this.state.config?.availabilityEnabled ? `
              ${showConsultantPicker && !this.state.selectedConsultantId
                ? `<div class="empty">${escapeHtml(t.consultantRequiredHint)}</div>`
                : this.state.loadingAvailability
                  ? `<div class="loading-inline">${escapeHtml(t.loadingAvailability)}</div>`
                  : this.state.slots.length
                    ? `<div class="slot-grid">${this.state.slots.map((slot) => `
                        <button
                          class="slot-chip ${this.state.selectedSlot?.startTime === slot.startTime && this.state.selectedSlot?.consultantId === slot.consultantId ? 'is-active' : ''}"
                          type="button"
                          data-action="slot"
                          data-slot-id="${escapeHtml(slot.slotId || '')}"
                          data-start="${escapeHtml(slot.startTime)}"
                          data-end="${escapeHtml(slot.endTime || '')}"
                          data-label="${escapeHtml(slot.label)}"
                          data-consultant-id="${slot.consultantId == null ? '' : slot.consultantId}"
                          data-consultant-name="${escapeHtml(slot.consultantName || '')}"
                        >
                          <span>${escapeHtml(slot.label)}</span>
                          ${((!showConsultantPicker || !this.state.selectedConsultantId) && slot.consultantName) ? `<small>${escapeHtml(slot.consultantName)}</small>` : ''}
                        </button>
                      `).join('')}</div>`
                    : `<div class="empty">${escapeHtml(t.noSlots)}</div>`}
            ` : `
              <div class="manual-time-wrap">
                <select id="manual-time">
                  <option value="">${escapeHtml(t.chooseTime)}</option>
                  ${this.manualTimeOptions(this.state.config).map((time) => `<option value="${time}" ${this.state.manualTime === time ? 'selected' : ''}>${time}</option>`).join('')}
                </select>
              </div>
            `}
          </div>
        `;

        return `
          <section class="panel-section panel-section--datetime">
            <div class="datetime-layout">
              <div class="datetime-calendar-col">
                ${this.calendarMarkup()}
              </div>
              <div class="datetime-side-col">
                <div class="selected-service-card">
                  ${this.serviceIconMarkup(service, 0)}
                  <span>
                    <small>${escapeHtml(t.selectedService)}</small>
                    <strong>${escapeHtml(service?.name || '')}</strong>
                    <em>${this.uiIcon('clock')}${escapeHtml(String(service?.durationMinutes || this.state.config?.sessionLengthMinutes || 60))} ${escapeHtml(t.durationSuffix)}${service?.priceLabel ? ` · ${escapeHtml(service.priceLabel)}` : ''}</em>
                  </span>
                </div>
                ${consultantCards}
                ${this.currentServiceSupportsGroupSessions() ? groupSessionsMarkup : slotsMarkup}
              </div>
            </div>
            <div class="panel-actions panel-actions--footer">
              <div class="trust-note">${this.uiIcon('shield')}<span>${escapeHtml(t.secureData)}</span></div>
              <div class="action-pair">
                <button class="secondary" type="button" data-action="back">${this.uiIcon('arrowLeft')} ${escapeHtml(t.back)}</button>
                <button class="primary" type="button" data-action="next" ${!this.isStepComplete('datetime') ? 'disabled' : ''}>${escapeHtml(t.continue)} ${this.uiIcon('arrowRight')}</button>
              </div>
            </div>
          </section>
        `;
      }

      const allowed = this.allowedPaymentMethods();
      const skipOnlinePayment = !this.requiresOnlinePaymentChoice();
      const hasAnyPaymentMethod = Boolean(allowed.giftCard || allowed.card || allowed.bankTransfer || allowed.paypal);
      const cardVariant = (variant, title, subtitle, iconMarkup) => `
        <button
          class="payment-tile ${this.state.paymentMethod === 'CARD' && this.state.paymentMethodVariant === variant ? 'is-active' : ''}"
          type="button"
          data-action="payment-method"
          data-method="CARD"
          data-variant="${escapeHtml(variant)}"
          ${allowed.card ? '' : 'disabled'}
        >
          <span class="payment-tile-icon">${iconMarkup}</span>
          <span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(subtitle)}</small></span>
          <i class="payment-check">${this.uiIcon('check')}</i>
        </button>
      `;
      const methodTile = (type, title, subtitle, iconMarkup) => `
        <button
          class="payment-tile ${this.state.paymentMethod === type ? 'is-active' : ''}"
          type="button"
          data-action="payment-method"
          data-method="${type}"
          data-variant="${type.toLowerCase()}"
          ${this.isPaymentMethodAvailable(type) ? '' : 'disabled'}
        >
          <span class="payment-tile-icon">${iconMarkup}</span>
          <span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(subtitle)}</small></span>
          <i class="payment-check">${this.uiIcon('check')}</i>
        </button>
      `;

      return `
        <section class="panel-section panel-section--details">
          <div class="checkout-layout">
            <div class="checkout-main">
              <div class="section-copy section-copy--compact">
                <h3>${escapeHtml(t.sectionEnterDetails)}</h3>
              </div>
              <div class="details-grid details-grid--preview">
                <label><span>${escapeHtml(t.labelFirstName)}</span><input id="first-name" type="text" value="${escapeHtml(this.state.form.firstName)}" placeholder="${escapeHtml(t.firstNamePlaceholder)}" /></label>
                <label><span>${escapeHtml(t.labelLastName)}</span><input id="last-name" type="text" value="${escapeHtml(this.state.form.lastName)}" placeholder="${escapeHtml(t.lastNamePlaceholder)}" /></label>
                <label><span>${escapeHtml(t.labelEmail)}</span><input id="email" type="email" value="${escapeHtml(this.state.form.email)}" placeholder="${escapeHtml(t.emailPlaceholder)}" /></label>
                <label><span>${escapeHtml(t.labelPhone)}</span><input id="phone" type="tel" value="${escapeHtml(this.state.form.phone)}" placeholder="${escapeHtml(t.phonePlaceholder)}" /></label>
              </div>

              <div class="payment-block">
                <div class="block-title">${escapeHtml(t.paymentMethodTitle)}</div>
                ${skipOnlinePayment ? `
                  <p class="empty empty--left">${escapeHtml(t.payAtVenueNote)}</p>
                ` : hasAnyPaymentMethod ? `
                  <div class="payment-grid">
                    ${allowed.card ? methodTile('CARD', t.paymentMethodCard, t.paymentMethodCardSubtitle, this.uiIcon('card')) : ''}
                    ${allowed.bankTransfer ? methodTile('BANK_TRANSFER', t.paymentMethodBank, t.paymentMethodBankSubtitle, this.paymentMethodLogos('BANK_TRANSFER')) : ''}
                    ${allowed.paypal ? methodTile('PAYPAL', t.paymentMethodPaypal, t.paymentMethodPaypalSubtitle, this.paymentMethodLogos('PAYPAL')) : ''}
                    ${allowed.giftCard ? methodTile('GIFT_CARD', t.paymentMethodGiftCard, t.paymentMethodGiftCardSubtitle, this.paymentMethodLogos('GIFT_CARD')) : ''}
                  </div>
                ` : `<div class="empty">${escapeHtml(t.paymentMethodsNone)}</div>`}
                ${this.paymentRequirement() === 'deposit' && !skipOnlinePayment ? `<p class="summary-payment-note summary-payment-note--checkout">${escapeHtml(t.depositPaymentNote)}</p>` : ''}
                ${this.shouldRenderTurnstile() ? `<div class="turnstile-wrap turnstile-wrap--under-payments"><slot name="turnstile-slot"></slot></div>` : ''}
              </div>

              <label class="terms-row">
                <input id="terms-accepted" type="checkbox" ${this.state.termsAccepted !== false ? 'checked' : ''} />
                <span>${escapeHtml(t.agreePrefix)} <a>${escapeHtml(t.terms)}</a> ${String(this.options?.locale || '').toLowerCase().startsWith('sl') ? 'in' : 'and'} <a>${escapeHtml(t.privacy)}</a> ${escapeHtml(t.agreeSuffix)}</span>
              </label>
            </div>
            <div class="checkout-summary-col">
              ${this.summaryMarkup()}
            </div>
          </div>
          <div class="panel-actions panel-actions--footer panel-actions--details">
            <button class="secondary" type="button" data-action="back">${this.uiIcon('arrowLeft')} ${escapeHtml(t.back)}</button>
            <button class="primary" type="button" data-action="submit" ${!this.isStepComplete('details') || this.state.saving ? 'disabled' : ''}>${escapeHtml(this.state.saving ? t.submitting : t.submit)} ${this.uiIcon('arrowRight')}</button>
          </div>
        </section>
      `;
    }

    styles() {
      return `
        :host {
          --calendra-primary: ${this.options.primaryColor || '#0f6bff'};
          --calendra-accent: ${this.options.accentColor || '#f28c18'};
          --calendra-page: #f8fafc;
          --calendra-surface: #ffffff;
          --calendra-soft: #f6f9ff;
          --calendra-blue-soft: rgba(15, 107, 255, .09);
          --calendra-text: #07122f;
          --calendra-muted: #66738d;
          --calendra-border: #dfe6f1;
          --calendra-border-strong: #cfd8e6;
          --calendra-shadow: 0 28px 70px rgba(15, 23, 42, .10);
          --calendra-card-shadow: 0 14px 34px rgba(15, 23, 42, .055);
          display: block;
          width: 100%;
          color: var(--calendra-text);
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }
        * { box-sizing: border-box; }
        button, input, select { font: inherit; }
        svg { width: 1em; height: 1em; display: inline-block; vertical-align: -0.15em; }
        .line-icon path { fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
        .widget { width: 100%; }
        .shell { width: 100%; display: grid; gap: 20px; }
        .panel {
          width: 100%;
          background: rgba(255,255,255,.97);
          border: 1px solid var(--calendra-border);
          border-radius: 28px;
          box-shadow: var(--calendra-shadow);
          padding: clamp(28px, 4vw, 52px);
          overflow: hidden;
        }
        .headline { margin: 28px 0 26px; max-width: 760px; }
        .headline h2 {
          margin: 0;
          font-size: clamp(38px, 4.4vw, 62px);
          line-height: .98;
          letter-spacing: -0.055em;
          font-weight: 900;
          color: #07122f;
        }
        .headline p { margin: 14px 0 0; color: var(--calendra-muted); font-size: clamp(16px, 1.4vw, 20px); line-height: 1.5; }
        .progress {
          display: grid;
          grid-template-columns: auto minmax(48px,1fr) auto minmax(48px,1fr) auto;
          align-items: center;
          gap: clamp(12px, 2vw, 28px);
          width: 100%;
        }
        .progress-item { display: inline-flex; align-items: center; gap: 14px; min-width: max-content; color: #7a8498; font-weight: 750; }
        .progress-dot {
          width: 44px; height: 44px; border-radius: 999px;
          display: inline-grid; place-items: center;
          background: #f8fafc; border: 1px solid var(--calendra-border);
          color: #0f172a; font-weight: 850; font-size: 16px;
          box-shadow: inset 0 0 0 1px rgba(255,255,255,.7);
        }
        .progress-dot svg { width: 18px; height: 18px; }
        .progress-item.is-active { color: #0d1b3d; }
        .progress-item.is-active .progress-dot,
        .progress-item.is-done .progress-dot { background: var(--calendra-primary); color: #fff; border-color: var(--calendra-primary); box-shadow: 0 12px 22px rgba(15,107,255,.18); }
        .progress-sep { height: 2px; border-radius: 999px; background: #e7edf5; }
        .progress-item.is-done + .progress-sep { background: var(--calendra-primary); }
        .section-copy { display: grid; gap: 8px; margin-bottom: 4px; }
        .section-copy h3, .block-title { margin: 0; font-size: 22px; line-height: 1.2; font-weight: 850; color: var(--calendra-text); }
        .section-copy p, .block-subtitle { margin: 0; color: var(--calendra-muted); line-height: 1.55; font-size: 15px; }
        .panel-section { display: grid; gap: 24px; }
        .service-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 22px; }
        .service-card {
          position: relative;
          min-height: 134px;
          width: 100%;
          display: grid;
          grid-template-columns: 78px minmax(0,1fr) 32px;
          gap: 22px;
          align-items: center;
          text-align: left;
          background: #fff;
          color: inherit;
          border: 1px solid var(--calendra-border);
          border-radius: 18px;
          padding: 22px 24px;
          cursor: pointer;
          box-shadow: 0 4px 15px rgba(15, 23, 42, .035);
          transition: transform .15s ease, border-color .15s ease, box-shadow .15s ease;
        }
        .service-card:hover, .consultant-pill:hover, .slot-chip:hover, .payment-tile:hover, .calendar-cell:hover:not(:disabled) { transform: translateY(-1px); border-color: rgba(15,107,255,.45); box-shadow: var(--calendra-card-shadow); }
        .service-card.is-active, .consultant-pill.is-active, .slot-chip.is-active, .payment-tile.is-active {
          border-color: var(--calendra-primary);
          box-shadow: 0 0 0 3px rgba(15,107,255,.10), var(--calendra-card-shadow);
        }
        .service-icon {
          width: 66px; height: 66px; border-radius: 18px; display: grid; place-items: center;
          background: var(--calendra-blue-soft); color: var(--calendra-primary); font-size: 34px;
        }
        .service-icon svg { width: 34px; height: 34px; }
        .service-card-main { min-width: 0; display: grid; gap: 8px; }
        .service-card-title { font-size: 19px; font-weight: 880; letter-spacing: -.02em; }
        .service-card-body { color: var(--calendra-muted); font-size: 14px; line-height: 1.45; }
        .service-card-meta { display: inline-flex; align-items: center; gap: 12px; color: #6f7b91; font-size: 15px; }
        .service-card-meta span { display: inline-flex; align-items: center; gap: 8px; }
        .service-card-meta strong { color: var(--calendra-primary); font-weight: 850; }
        .service-card-check {
          width: 32px; height: 32px; border-radius: 999px; display: inline-grid; place-items: center;
          background: var(--calendra-primary); color: #fff; opacity: 0; transform: scale(.85); transition: opacity .15s ease, transform .15s ease;
        }
        .service-card.is-active .service-card-check { opacity: 1; transform: scale(1); }
        .service-card-check svg { width: 17px; height: 17px; }
        .datetime-layout { display: grid; grid-template-columns: minmax(360px, .92fr) minmax(460px, 1.08fr); gap: clamp(26px, 4vw, 52px); align-items: start; }
        .datetime-calendar-col, .datetime-side-col { min-width: 0; display: grid; gap: 20px; }
        .calendar-card, .times-card, .summary-card, .selected-service-card {
          background: #fff;
          border: 1px solid var(--calendra-border);
          border-radius: 18px;
          box-shadow: var(--calendra-card-shadow);
        }
        .calendar-card { padding: 22px; }
        .calendar-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
        .calendar-title { text-transform: capitalize; font-size: 20px; font-weight: 850; letter-spacing: -.02em; }
        .calendar-nav {
          width: 46px; height: 46px; border: 1px solid var(--calendra-border); background: #fff; border-radius: 12px; cursor: pointer; color: #11213e; font-size: 26px; line-height: 1;
        }
        .calendar-nav:disabled { opacity: .42; cursor: default; }
        .calendar-weekdays, .calendar-grid { display: grid; grid-template-columns: repeat(7, minmax(0,1fr)); text-align: center; }
        .calendar-weekdays { color: #7a8498; font-size: 13px; font-weight: 750; text-transform: uppercase; margin-bottom: 12px; }
        .calendar-grid { gap: 8px; }
        .calendar-cell {
          position: relative;
          height: 50px;
          border: 1px solid transparent;
          border-radius: 999px;
          background: transparent;
          color: #6f7b91;
          cursor: pointer;
          font-weight: 700;
          display: inline-grid;
          place-items: center;
        }
        .calendar-cell span { position: relative; z-index: 1; }
        .calendar-cell i { position: absolute; bottom: 8px; left: 50%; width: 5px; height: 5px; border-radius: 999px; background: var(--calendra-primary); transform: translateX(-50%); }
        .calendar-cell:not(.is-unavailable):not(.is-outside) { background: rgba(15,107,255,.08); color: var(--calendra-primary); }
        .calendar-cell.is-selected { background: var(--calendra-primary) !important; color: #fff; box-shadow: 0 13px 24px rgba(15,107,255,.22); }
        .calendar-cell.is-selected i { background: #fff; }
        .calendar-cell.is-outside { color: #b4bdcc; background: transparent; }
        .calendar-cell.is-unavailable { color: #9099aa; cursor: default; }
        .calendar-legend { display: flex; gap: 28px; align-items: center; padding: 18px 4px 0; color: #7a8498; font-size: 14px; }
        .calendar-legend span { display: inline-flex; align-items: center; gap: 8px; }
        .legend-dot { width: 12px; height: 12px; border-radius: 999px; display: inline-block; }
        .legend-dot--available { background: rgba(15,107,255,.14); border: 1px solid rgba(15,107,255,.20); }
        .legend-dot--unavailable { background: #e5e7eb; }
        .selected-service-card { display: grid; grid-template-columns: 64px 1fr; gap: 18px; align-items: center; padding: 20px; }
        .selected-service-card .service-icon { width: 58px; height: 58px; font-size: 28px; }
        .selected-service-card span:not(.service-icon) { display: grid; gap: 5px; }
        .selected-service-card small, .summary-row-label { color: #748099; font-size: 14px; }
        .selected-service-card strong { font-size: 17px; font-weight: 850; }
        .selected-service-card em { display: inline-flex; align-items: center; gap: 7px; color: #536079; font-style: normal; font-weight: 650; }
        .consultants-block { display: grid; gap: 12px; }
        .consultant-row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
        .consultant-pill {
          min-height: 78px;
          background: #fff;
          border: 1px solid var(--calendra-border);
          border-radius: 13px;
          padding: 12px 14px;
          display: grid;
          grid-template-columns: 18px 42px minmax(0,1fr);
          align-items: center;
          gap: 12px;
          text-align: left;
          cursor: pointer;
          color: inherit;
        }
        .radio-dot { width: 16px; height: 16px; border-radius: 999px; border: 1.5px solid #9aa6bb; display: inline-block; }
        .consultant-pill.is-active .radio-dot { border: 5px solid var(--calendra-primary); }
        .consultant-avatar { width: 42px; height: 42px; border-radius: 999px; display: grid; place-items: center; background: linear-gradient(135deg, #eaf2ff, #f8fbff); color: var(--calendra-primary); font-weight: 900; }
        .consultant-pill strong { display: block; font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .consultant-pill small { display: block; color: var(--calendra-muted); margin-top: 3px; }
        .times-card { padding: 0; border: 0; box-shadow: none; background: transparent; display: grid; gap: 13px; }
        .times-head { display: flex; justify-content: space-between; gap: 16px; align-items: start; }
        .text-link { border: 0; background: transparent; color: var(--calendra-primary); font-size: 13px; font-weight: 800; cursor: pointer; padding: 2px 0; }
        .slot-grid { display: grid; grid-template-columns: repeat(5, minmax(84px, 1fr)); gap: 12px 16px; }
        .slot-chip {
          min-height: 44px;
          border-radius: 9px;
          border: 1.5px solid rgba(15,107,255,.55);
          background: #fff;
          color: var(--calendra-primary);
          cursor: pointer;
          display: grid;
          place-items: center;
          gap: 2px;
          padding: 8px 10px;
          font-weight: 850;
        }
        .slot-chip small { color: #6f7b91; font-weight: 650; font-size: 11px; }
        .slot-chip.is-active { background: var(--calendra-primary); color: #fff; border-color: var(--calendra-primary); }
        .slot-chip.is-active small { color: rgba(255,255,255,.8); }
        .manual-time-wrap select { width: 100%; min-height: 50px; border-radius: 13px; border: 1px solid var(--calendra-border); padding: 0 14px; background: #fff; }
        .checkout-layout { display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(360px, .72fr); gap: clamp(30px, 5vw, 72px); align-items: start; }
        .checkout-main { display: grid; gap: 24px; min-width: 0; }
        .details-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 18px; }
        .details-grid label { display: grid; gap: 8px; min-width: 0; }
        .details-grid label span { color: #6b778d; font-size: 13px; font-weight: 700; }
        .details-grid input {
          width: 100%; min-height: 64px; border-radius: 10px; border: 1px solid var(--calendra-border); background: #fff;
          padding: 15px 18px; color: var(--calendra-text); font-weight: 650; outline: none;
        }
        .details-grid input:focus { border-color: var(--calendra-primary); box-shadow: 0 0 0 3px rgba(15,107,255,.10); }
        .payment-block { display: grid; gap: 16px; }
        .payment-grid { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 16px; }
        .payment-tile {
          min-height: 116px;
          position: relative;
          border-radius: 13px;
          border: 1px solid var(--calendra-border);
          background: #fff;
          color: inherit;
          padding: 18px;
          text-align: left;
          display: grid;
          grid-template-columns: 40px 1fr;
          gap: 16px;
          cursor: pointer;
        }
        .payment-tile-icon { width: 38px; height: 38px; display: grid; place-items: center; border-radius: 10px; background: rgba(15,107,255,.09); color: var(--calendra-primary); font-size: 24px; }
        .payment-tile strong { display: block; font-size: 17px; }
        .payment-tile small { display: block; margin-top: 8px; color: var(--calendra-muted); line-height: 1.35; }
        .payment-check { position: absolute; right: 14px; top: 14px; width: 22px; height: 22px; border-radius: 999px; display: grid; place-items: center; background: var(--calendra-primary); color: #fff; opacity: 0; }
        .payment-tile.is-active .payment-check { opacity: 1; }
        .apple-pay-mark { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 30px; line-height: 1; color: #000; }
        .google-pay-mark { font-weight: 950; color: #4285f4; font-size: 24px; }
        .terms-row { display: flex; align-items: flex-start; gap: 12px; color: #657188; line-height: 1.55; font-size: 15px; }
        .terms-row input { width: 20px; height: 20px; margin-top: 2px; accent-color: var(--calendra-primary); flex: 0 0 auto; }
        .terms-row a { color: var(--calendra-primary); font-weight: 750; text-decoration: none; }
        .summary-card { padding: 26px; position: sticky; top: 18px; }
        .summary-heading { font-size: 22px; line-height: 1.15; font-weight: 900; letter-spacing: -.025em; margin-bottom: 20px; }
        .summary-rows { display: grid; gap: 16px; }
        .summary-row { display: grid; grid-template-columns: 44px 86px minmax(0,1fr); gap: 12px; align-items: center; }
        .summary-row-icon { width: 38px; height: 38px; border-radius: 10px; display: grid; place-items: center; background: rgba(15,107,255,.09); color: var(--calendra-primary); font-size: 22px; }
        .summary-row-value { min-width: 0; font-size: 16px; font-weight: 850; color: var(--calendra-text); }
        .summary-divider { height: 1px; background: var(--calendra-border); margin: 18px 0; }
        .summary-total-row { display: flex; align-items: center; justify-content: space-between; font-size: 18px; font-weight: 850; }
        .summary-total-row strong { color: var(--calendra-primary); font-size: 22px; }
        .summary-row--payment .summary-row-icon { color: var(--calendra-primary); }
        .summary-payment-note { margin: 10px 0 0; color: var(--calendra-muted); font-size: 13px; line-height: 1.45; }
        .summary-payment-note--checkout { margin: 12px 4px 0; }
        .trust-note { display: inline-flex; align-items: center; gap: 10px; color: #657188; font-size: 15px; }
        .trust-note svg { width: 22px; height: 22px; color: #657188; }
        .panel-actions { display: flex; align-items: center; justify-content: space-between; gap: 20px; }
        .panel-actions--footer { border-top: 1px solid var(--calendra-border); padding-top: 22px; margin-top: 2px; }
        .action-pair { display: inline-flex; gap: 18px; align-items: center; }
        .primary, .secondary {
          min-height: 58px;
          border-radius: 16px;
          padding: 0 30px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          font-weight: 850;
          cursor: pointer;
          border: 1px solid transparent;
          transition: transform .15s ease, box-shadow .15s ease, opacity .15s ease;
        }
        .primary { background: var(--calendra-primary); color: #fff; box-shadow: 0 14px 26px rgba(15,107,255,.22); }
        .secondary { background: #fff; color: var(--calendra-text); border-color: var(--calendra-border); }
        .primary:hover:not(:disabled), .secondary:hover:not(:disabled) { transform: translateY(-1px); }
        .primary:disabled, .secondary:disabled { opacity: .48; cursor: not-allowed; box-shadow: none; }
        .primary svg, .secondary svg { width: 21px; height: 21px; }
        .error { padding: 14px 16px; border-radius: 14px; background: rgba(239,68,68,.09); color: #b42318; border: 1px solid rgba(239,68,68,.15); margin-bottom: 18px; }
        .empty, .loading, .loading-inline { padding: 18px; color: var(--calendra-muted); border: 1px dashed var(--calendra-border); border-radius: 14px; background: #fbfdff; text-align: center; }
        .empty--left { text-align: left; }
        .success-screen { min-height: 420px; display: grid; place-items: center; text-align: center; gap: 14px; padding: 30px; }
        .success-icon { width: 74px; height: 74px; border-radius: 999px; display: grid; place-items: center; background: rgba(34,197,94,.12); color: #15803d; font-size: 34px; }
        .success-title { font-size: 30px; font-weight: 900; }
        .success-copy { margin: 0; color: var(--calendra-muted); line-height: 1.6; }
        .bank-transfer-box { margin-top: 14px; text-align: left; padding: 16px; border-radius: 14px; border: 1px solid var(--calendra-border); background: #fbfdff; display: grid; gap: 6px; }
        .bank-transfer-title { font-weight: 850; color: var(--calendra-text); margin-bottom: 4px; }
        .bank-transfer-row { color: var(--calendra-text); font-size: 14px; }
        .bank-transfer-row span { color: var(--calendra-muted); margin-right: 6px; }
        .bank-transfer-instructions { margin: 6px 0 0; color: var(--calendra-muted); font-size: 13px; }
        .turnstile-wrap--under-payments { min-height: 70px; display: grid; justify-items: start; }
        .powered-by { display: flex; justify-content: center; align-items: center; gap: 12px; color: #718096; font-size: 14px; font-weight: 650; padding: 8px 0 0; }
        .calendra-brand { display: inline-flex; align-items: center; gap: 5px; color: var(--calendra-primary); font-weight: 800; }
        .calendra-mark { display: inline-flex; width: 27px; height: 23px; }
        .calendra-mark svg { width: 100%; height: 100%; }
        .calendra-mark svg path { fill: none; }
        :host([data-layout="compact"]) .datetime-layout,
        :host([data-layout="narrow"]) .datetime-layout,
        :host([data-layout="micro"]) .datetime-layout,
        :host([data-layout="compact"]) .checkout-layout,
        :host([data-layout="narrow"]) .checkout-layout,
        :host([data-layout="micro"]) .checkout-layout { grid-template-columns: 1fr; }
        :host([data-layout="compact"]) .service-grid,
        :host([data-layout="narrow"]) .service-grid,
        :host([data-layout="micro"]) .service-grid { grid-template-columns: 1fr; }
        :host([data-layout="compact"]) .slot-grid { grid-template-columns: repeat(4, minmax(0,1fr)); }
        :host([data-layout="narrow"]) .slot-grid { grid-template-columns: repeat(3, minmax(0,1fr)); }
        :host([data-layout="micro"]) .slot-grid { grid-template-columns: repeat(2, minmax(0,1fr)); }
        :host([data-layout="compact"]) .consultant-row,
        :host([data-layout="narrow"]) .consultant-row { grid-template-columns: repeat(2, minmax(0,1fr)); }
        :host([data-layout="micro"]) .consultant-row { grid-template-columns: 1fr; }
        :host([data-layout="compact"]) .payment-grid,
        :host([data-layout="narrow"]) .payment-grid,
        :host([data-layout="micro"]) .payment-grid { grid-template-columns: 1fr; }
        :host([data-layout="narrow"]) .details-grid,
        :host([data-layout="micro"]) .details-grid { grid-template-columns: 1fr; }
        :host([data-layout="narrow"]) .panel,
        :host([data-layout="micro"]) .panel { padding: 22px; border-radius: 22px; }
        :host([data-layout="narrow"]) .progress { grid-template-columns: 1fr; gap: 8px; }
        :host([data-layout="narrow"]) .progress-sep,
        :host([data-layout="micro"]) .progress-sep { display: none; }
        :host([data-layout="narrow"]) .progress-item,
        :host([data-layout="micro"]) .progress-item { padding: 10px 12px; border: 1px solid var(--calendra-border); border-radius: 14px; background: #fff; }
        :host([data-layout="micro"]) .progress { grid-template-columns: 1fr; gap: 8px; }
        :host([data-layout="micro"]) .headline h2 { font-size: 34px; }
        :host([data-layout="micro"]) .service-card { grid-template-columns: 54px 1fr 28px; gap: 14px; padding: 18px; }
        :host([data-layout="micro"]) .service-icon { width: 52px; height: 52px; font-size: 26px; }
        :host([data-layout="micro"]) .calendar-card { padding: 16px; }
        :host([data-layout="micro"]) .calendar-grid { gap: 5px; }
        :host([data-layout="micro"]) .calendar-cell { height: 42px; }
        :host([data-layout="narrow"]) .panel-actions,
        :host([data-layout="micro"]) .panel-actions { align-items: stretch; flex-direction: column; }
        :host([data-layout="narrow"]) .action-pair,
        :host([data-layout="micro"]) .action-pair { width: 100%; display: grid; grid-template-columns: 1fr; }
        :host([data-layout="narrow"]) .primary,
        :host([data-layout="narrow"]) .secondary,
        :host([data-layout="micro"]) .primary,
        :host([data-layout="micro"]) .secondary { width: 100%; }
      `;
    }

    render() {
      const t = this.text();
      this.shadowRoot.innerHTML = `
        <style>${this.styles()}</style>
        <div class="widget">
          <div class="shell">
            <div class="panel">
              ${this.renderProgress()}
              <div class="headline">
                <h2>${escapeHtml(this.activeStepHeadline())}</h2>
                <p>${escapeHtml(this.activeStepSubtitle())}</p>
              </div>
              ${this.state.loading ? `<div class="loading">${escapeHtml(t.loading)}</div>` : ''}
              ${!this.state.loading && this.state.error ? `<div class="error">${escapeHtml(this.state.error)}</div>` : ''}
              ${!this.state.loading && this.state.config ? this.renderStepContent() : ''}
            </div>
            <div class="powered-by">
              <span class="calendra-brand">${this.calendraLogoMarkup()}<span>calendra</span></span>
              <span>${escapeHtml(t.poweredBy)}</span>
            </div>
          </div>
        </div>
      `;

      this.bindEvents();

      if (this.shouldRenderTurnstile()) {
        this.scheduleTurnstileMount();
      } else {
        this.resetTurnstile();
        this.removeLightDomTurnstileHost();
      }
    }

    manualTimeOptions(config) {
      const start = config?.workingHoursStart || '08:00';
      const end = config?.workingHoursEnd || '18:00';
      const items = [];
      let [hour, minute] = start.split(':').map(Number);
      const [endHour, endMinute] = end.split(':').map(Number);
      while (hour < endHour || (hour === endHour && minute <= endMinute)) {
        items.push(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
        minute += 30;
        if (minute >= 60) {
          hour += 1;
          minute -= 60;
        }
      }
      return items;
    }

    bindEvents() {
      this.shadowRoot.querySelectorAll('[data-action="service"]').forEach((button) => {
        button.addEventListener('click', async () => {
          this.resetTurnstile();

          this.setState({
            selectedServiceId: Number(button.dataset.id),
            bookingSuccess: null,
            error: '',
            selectedSlot: null,
            selectedGroupSession: null,
            groupSessions: [],
            manualTime: '',
          });
          await this.loadConsultantsAndAvailability();
          if (this.state.config?.turnstileEnabled && this.state.config?.turnstileSiteKey) {
            await this.ensureTurnstileScript();
          }
        });
      });

      this.shadowRoot.querySelectorAll('[data-action="consultant"]').forEach((button) => {
        button.addEventListener('click', async () => {
          this.resetTurnstile();

          this.setState({
            selectedConsultantId: Number(button.dataset.id),
            bookingSuccess: null,
            error: '',
            selectedSlot: null,
            selectedGroupSession: null,
            manualTime: '',
          });
          await this.loadAvailability();
        });
      });

      this.shadowRoot.querySelectorAll('[data-action="calendar-date"]').forEach((button) => {
        button.addEventListener('click', async () => {
          this.resetTurnstile();

          this.setState({
            selectedDate: button.dataset.date,
            calendarMonth: this.monthKeyForDate(button.dataset.date),
            selectedSlot: null,
            selectedGroupSession: null,
            manualTime: '',
            bookingSuccess: null,
            error: '',
          });
          await this.loadAvailability();
        });
      });

      this.shadowRoot.querySelectorAll('[data-action="month-prev"]').forEach((button) => {
        button.addEventListener('click', () => {
          const current = parseIsoDate(this.state.calendarMonth) || firstOfMonth(new Date());
          const previous = addMonths(current, -1);
          const minMonth = parseIsoDate(this.monthKeyForDate(this.todayInWidgetTimezone())) || firstOfMonth(new Date());
          if (previous < minMonth) return;
          this.setState({ calendarMonth: formatIsoDate(previous) });
        });
      });

      this.shadowRoot.querySelectorAll('[data-action="month-next"]').forEach((button) => {
        button.addEventListener('click', () => {
          const current = parseIsoDate(this.state.calendarMonth) || firstOfMonth(new Date());
          this.setState({ calendarMonth: formatIsoDate(addMonths(current, 1)) });
        });
      });

      this.shadowRoot.querySelectorAll('[data-action="slot"]').forEach((button) => {
        button.addEventListener('click', () => {
          this.setState({
            selectedSlot: {
              slotId: button.dataset.slotId || '',
              startTime: button.dataset.start,
              endTime: button.dataset.end || '',
              consultantId: parseOptionalNumber(button.dataset.consultantId),
              consultantName: button.dataset.consultantName || '',
              label: button.dataset.label || button.textContent.trim(),
            },
            selectedGroupSession: null,
            error: '',
          });
        });
      });

      this.shadowRoot.querySelectorAll('[data-action="group-session"]').forEach((button) => {
        button.addEventListener('click', () => {
          this.setState({
            selectedGroupSession: {
              id: parseOptionalNumber(button.dataset.id),
              startTime: button.dataset.start,
              endTime: button.dataset.end,
              consultantId: parseOptionalNumber(button.dataset.consultantId),
              consultantName: button.dataset.consultantName || '',
              label: button.dataset.label || button.textContent.trim(),
              remainingSpots: parseOptionalNumber(button.dataset.remainingSpots),
              bookedParticipants: parseOptionalNumber(button.dataset.bookedParticipants),
            },
            selectedSlot: null,
            error: '',
          });
        });
      });

      const manualTime = this.shadowRoot.getElementById('manual-time');
      if (manualTime) {
        manualTime.addEventListener('change', (event) => {
          this.setState({ manualTime: event.target.value, error: '' });
        });
      }

      ['first-name', 'last-name', 'email', 'phone', 'company-name'].forEach((id) => {
        const input = this.shadowRoot.getElementById(id);
        if (!input) return;
        input.addEventListener('input', (event) => {
          const fieldMap = { 'first-name': 'firstName', 'last-name': 'lastName', email: 'email', phone: 'phone', 'company-name': 'companyName' };
          this.updateForm(fieldMap[id], event.target.value);
          const submit = this.shadowRoot.querySelector('[data-action="submit"]');
          if (submit) submit.disabled = !this.isStepComplete('details') || this.state.saving;
        });
      });

      const termsAccepted = this.shadowRoot.getElementById('terms-accepted');
      if (termsAccepted) {
        termsAccepted.addEventListener('change', (event) => {
          this.state.termsAccepted = Boolean(event.target.checked);
          const submit = this.shadowRoot.querySelector('[data-action="submit"]');
          if (submit) submit.disabled = !this.isStepComplete('details') || this.state.saving;
        });
      }

      const next = this.shadowRoot.querySelector('[data-action="next"]');
      if (next) {
        next.addEventListener('click', () => {
          if (!this.validateCurrentStep()) return;
          this.goToNextStep();
        });
      }

      this.shadowRoot.querySelectorAll('[data-action="back"]').forEach((button) => {
        button.addEventListener('click', () => this.goToPreviousStep());
      });

      this.shadowRoot.querySelectorAll('[data-action="refresh"]').forEach((button) => {
        button.addEventListener('click', () => {
          if (this.state.config?.availabilityEnabled) {
            void this.loadAvailability();
          }
        });
      });

      this.shadowRoot.querySelectorAll('[data-action="submit"]').forEach((button) => {
        button.addEventListener('click', () => this.submitBooking());
      });

      this.shadowRoot.querySelectorAll('[data-action="payment-method"]').forEach((button) => {
        button.addEventListener('click', () => {
          const method = button.dataset.method;
          if (!method || !this.isPaymentMethodAvailable(method)) return;
          this.setState({ paymentMethod: method, paymentMethodVariant: button.dataset.variant || method.toLowerCase(), error: '' });
        });
      });

      const restart = this.shadowRoot.querySelector('[data-action="restart"]');
      if (restart) restart.addEventListener('click', () => this.resetForAnotherBooking());
    }
  }

  if (!customElements.get('calendra-booking-widget')) {
    customElements.define('calendra-booking-widget', CalendraBookingWidget);
  }

  window.CalendraBookingWidget = {
    mount(selector, options) {
      const el = document.querySelector(selector);
      if (!el) throw new Error(`Mount target not found: ${selector}`);
      const widget = document.createElement('calendra-booking-widget');
      Object.entries(options || {}).forEach(([key, value]) => {
        if (value == null) return;
        widget.setAttribute(key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`), String(value));
      });
      el.innerHTML = '';
      el.appendChild(widget);
      return widget;
    },
  };
})();
