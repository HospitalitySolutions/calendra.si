import { useEffect, useState } from 'react'

export type AuthLocale = 'sl' | 'en' | 'sr'

type LocaleOption = {
  code: AuthLocale
  label: string
  nativeLabel: string
  flag: string
}

const STORAGE_KEY = 'calendra.customer.auth.locale.v2'

export const AUTH_LOCALE_OPTIONS: LocaleOption[] = [
  { code: 'sl', label: 'Slovenian', nativeLabel: 'Slovenščina', flag: '🇸🇮' },
  { code: 'en', label: 'English', nativeLabel: 'English', flag: '🇬🇧' },
  { code: 'sr', label: 'Serbian', nativeLabel: 'Srpski', flag: '🇷🇸' },
]

export function isAuthLocale(value: string | null | undefined): value is AuthLocale {
  return value === 'sl' || value === 'en' || value === 'sr'
}

function detectInitialLocale(): AuthLocale {
  if (typeof window !== 'undefined') {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (isAuthLocale(stored)) return stored
  }
  return 'sl'
}

export function useAuthLocale() {
  const [locale, setLocale] = useState<AuthLocale>(detectInitialLocale)

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(STORAGE_KEY, locale)
  }, [locale])

  return { locale, setLocale, localeOptions: AUTH_LOCALE_OPTIONS }
}

export function getLocaleOption(locale: AuthLocale) {
  return AUTH_LOCALE_OPTIONS.find(option => option.code === locale) || AUTH_LOCALE_OPTIONS[0]
}

export const authCopy = {
  sl: {
    authVisualEyebrow: 'VAŠ ČAS. VAŠI PONUDNIKI.',
    authVisualTitleBefore: 'Vse rezervacije',
    authVisualTitleAccent: 'na enem mestu.',
    authVisualBody: 'Rezervirajte, spremljajte termine in upravljajte svoje pakete, članstva ter bone – hitro in enostavno.',
    footerBack: 'Nauči se Calendre',
    footerTerms: 'Pogoji uporabe',
    footerPrivacy: 'Zasebnost',
    loginTitle: 'Dobrodošli nazaj',
    loginSubtitle: 'Prijavite se in imejte vse svoje termine, pakete in sporočila na enem mestu.',
    emailLabel: 'E-pošta',
    emailPlaceholder: 'vas.email@primer.si',
    passwordLabel: 'Geslo',
    passwordPlaceholder: 'Vnesite geslo',
    forgotPassword: 'Pozabljeno geslo?',
    loginButton: 'Prijava',
    loggingIn: 'Prijavljam …',
    loginError: 'Prijava ni uspela. Preverite podatke in poskusite znova.',
    noAccount: 'Še nimate računa?',
    createFreeAccount: 'Ustvarite brezplačen račun',
    registerTitle: 'Ustvarite Calendra račun',
    registerSubtitle: 'Brezplačen račun za vaše rezervacije, pakete, članstva in bone.',
    registerFirstName: 'Ime',
    registerLastName: 'Priimek',
    registerPhone: 'Telefon',
    optional: 'neobvezno',
    passwordHelp: 'Naj vsebuje veliko in malo črko ter številko.',
    registerButton: 'Ustvari račun',
    creatingAccount: 'Ustvarjam …',
    registerLegalPrefix: 'Z ustvarjanjem računa se strinjate s',
    termsOfUse: 'pogoji uporabe',
    privacyPolicy: 'politiko zasebnosti',
    alreadyHaveAccount: 'Že imate račun?',
    signIn: 'Prijavite se',
    verifyEmailTitle: 'Preverite e-pošto',
    verifyEmailSubtitle: (email: string) => `Na ${email} smo poslali potrditveno kodo.`,
    confirmationCode: 'Potrditvena koda',
    confirmAndContinue: 'Potrdi in nadaljuj',
    verifying: 'Preverjam …',
    resendCode: 'Pošlji novo kodo',
    changeDetails: 'Spremeni podatke',
    resendCodeSuccess: 'Poslali smo vam novo potrditveno kodo.',
    registerError: 'Računa ni bilo mogoče ustvariti.',
    verifyCodeError: 'Koda ni veljavna ali je potekla.',
    resendCodeError: 'Kode ni bilo mogoče ponovno poslati.',
    forgotTitle: 'Pozabljeno geslo',
    forgotSubtitle: 'Vnesite e-pošto računa in poslali vam bomo potrditveno kodo.',
    sendCode: 'Pošlji kodo',
    requestFailed: 'Zahteve ni bilo mogoče poslati.',
    backToLogin: 'Nazaj na prijavo',
    enterCodeTitle: 'Vnesite potrditveno kodo',
    enterCodeSubtitle: (email: string) => `Kodo smo poslali na ${email}.`,
    continueButton: 'Nadaljuj',
    setNewPasswordTitle: 'Nastavite novo geslo',
    setNewPasswordSubtitle: 'Izberite varno geslo za svoj Calendra račun.',
    newPassword: 'Novo geslo',
    saveNewPassword: 'Shrani novo geslo',
    resetPasswordError: 'Gesla ni bilo mogoče spremeniti.',
    passwordChangedTitle: 'Geslo je spremenjeno',
    passwordChangedSubtitle: 'Sedaj se lahko prijavite z novim geslom.',
  },
  en: {
    authVisualEyebrow: 'YOUR TIME. YOUR PROVIDERS.',
    authVisualTitleBefore: 'All reservations',
    authVisualTitleAccent: 'in one place.',
    authVisualBody: 'Book, track appointments and manage your packages, memberships and vouchers – quickly and effortlessly.',
    footerBack: 'Learn about Calendra',
    footerTerms: 'Terms of use',
    footerPrivacy: 'Privacy',
    loginTitle: 'Welcome back',
    loginSubtitle: 'Sign in and keep all your appointments, packages and messages in one place.',
    emailLabel: 'Email',
    emailPlaceholder: 'your.email@example.com',
    passwordLabel: 'Password',
    passwordPlaceholder: 'Enter your password',
    forgotPassword: 'Forgot password?',
    loginButton: 'Sign in',
    loggingIn: 'Signing in …',
    loginError: 'Login failed. Please check your details and try again.',
    noAccount: `Don't have an account?`,
    createFreeAccount: 'Create a free account',
    registerTitle: 'Create your Calendra account',
    registerSubtitle: 'A free account for your bookings, packages, memberships and vouchers.',
    registerFirstName: 'First name',
    registerLastName: 'Last name',
    registerPhone: 'Phone',
    optional: 'optional',
    passwordHelp: 'Use at least one uppercase letter, one lowercase letter and one number.',
    registerButton: 'Create account',
    creatingAccount: 'Creating account …',
    registerLegalPrefix: 'By creating an account you agree to the',
    termsOfUse: 'terms of use',
    privacyPolicy: 'privacy policy',
    alreadyHaveAccount: 'Already have an account?',
    signIn: 'Sign in',
    verifyEmailTitle: 'Check your email',
    verifyEmailSubtitle: (email: string) => `We sent a verification code to ${email}.`,
    confirmationCode: 'Verification code',
    confirmAndContinue: 'Confirm and continue',
    verifying: 'Verifying …',
    resendCode: 'Send a new code',
    changeDetails: 'Change details',
    resendCodeSuccess: 'A new verification code has been sent.',
    registerError: 'We could not create your account.',
    verifyCodeError: 'The code is invalid or has expired.',
    resendCodeError: 'We could not resend the code.',
    forgotTitle: 'Forgot password',
    forgotSubtitle: 'Enter your account email and we will send you a verification code.',
    sendCode: 'Send code',
    requestFailed: 'We could not process your request.',
    backToLogin: 'Back to login',
    enterCodeTitle: 'Enter verification code',
    enterCodeSubtitle: (email: string) => `We sent a code to ${email}.`,
    continueButton: 'Continue',
    setNewPasswordTitle: 'Set a new password',
    setNewPasswordSubtitle: 'Choose a secure password for your Calendra account.',
    newPassword: 'New password',
    saveNewPassword: 'Save new password',
    resetPasswordError: 'We could not change your password.',
    passwordChangedTitle: 'Password updated',
    passwordChangedSubtitle: 'You can now sign in with your new password.',
  },
  sr: {
    authVisualEyebrow: 'VAŠE VREME. VAŠI PRUŽAOCI USLUGA.',
    authVisualTitleBefore: 'Sve rezervacije',
    authVisualTitleAccent: 'na jednom mestu.',
    authVisualBody: 'Rezervišite, pratite termine i upravljajte svojim paketima, članarinama i vaučerima – brzo i jednostavno.',
    footerBack: 'Saznajte više o Calendri',
    footerTerms: 'Uslovi korišćenja',
    footerPrivacy: 'Privatnost',
    loginTitle: 'Dobrodošli nazad',
    loginSubtitle: 'Prijavite se i držite sve svoje termine, pakete i poruke na jednom mestu.',
    emailLabel: 'E-pošta',
    emailPlaceholder: 'vas.email@primer.rs',
    passwordLabel: 'Lozinka',
    passwordPlaceholder: 'Unesite lozinku',
    forgotPassword: 'Zaboravljena lozinka?',
    loginButton: 'Prijava',
    loggingIn: 'Prijavljivanje …',
    loginError: 'Prijava nije uspela. Proverite podatke i pokušajte ponovo.',
    noAccount: 'Nemate nalog?',
    createFreeAccount: 'Napravite besplatan nalog',
    registerTitle: 'Napravite Calendra nalog',
    registerSubtitle: 'Besplatan nalog za vaše rezervacije, pakete, članarine i vaučere.',
    registerFirstName: 'Ime',
    registerLastName: 'Prezime',
    registerPhone: 'Telefon',
    optional: 'opciono',
    passwordHelp: 'Neka sadrži veliko i malo slovo, kao i broj.',
    registerButton: 'Napravi nalog',
    creatingAccount: 'Pravim nalog …',
    registerLegalPrefix: 'Kreiranjem naloga prihvatate',
    termsOfUse: 'uslove korišćenja',
    privacyPolicy: 'politiku privatnosti',
    alreadyHaveAccount: 'Već imate nalog?',
    signIn: 'Prijavite se',
    verifyEmailTitle: 'Proverite e-poštu',
    verifyEmailSubtitle: (email: string) => `Poslali smo verifikacioni kod na ${email}.`,
    confirmationCode: 'Verifikacioni kod',
    confirmAndContinue: 'Potvrdite i nastavite',
    verifying: 'Proveravam …',
    resendCode: 'Pošalji novi kod',
    changeDetails: 'Izmeni podatke',
    resendCodeSuccess: 'Poslali smo vam novi verifikacioni kod.',
    registerError: 'Nalog nije bilo moguće napraviti.',
    verifyCodeError: 'Kod nije ispravan ili je istekao.',
    resendCodeError: 'Kod nije bilo moguće ponovo poslati.',
    forgotTitle: 'Zaboravljena lozinka',
    forgotSubtitle: 'Unesite e-poštu naloga i poslaćemo vam verifikacioni kod.',
    sendCode: 'Pošalji kod',
    requestFailed: 'Zahtev nije bilo moguće poslati.',
    backToLogin: 'Nazad na prijavu',
    enterCodeTitle: 'Unesite verifikacioni kod',
    enterCodeSubtitle: (email: string) => `Poslali smo kod na ${email}.`,
    continueButton: 'Nastavi',
    setNewPasswordTitle: 'Postavite novu lozinku',
    setNewPasswordSubtitle: 'Izaberite sigurnu lozinku za svoj Calendra nalog.',
    newPassword: 'Nova lozinka',
    saveNewPassword: 'Sačuvaj novu lozinku',
    resetPasswordError: 'Lozinku nije bilo moguće promeniti.',
    passwordChangedTitle: 'Lozinka je promenjena',
    passwordChangedSubtitle: 'Sada se možete prijaviti novom lozinkom.',
  },
} as const
